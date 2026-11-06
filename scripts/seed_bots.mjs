// 시연용 가상 학생을 순위표에 채운다. 시간표는 실제 강의 자료로 편성하고 점수는 서버와 같은 함수로 매긴다.
// 기록마다 sample: true가 붙어 화면에 「시연용 가상 데이터」 표시가 뜬다. 다시 실행하면 가상 기록만 바뀐다.
// 실행: node --env-file=.env.local scripts/seed_bots.mjs   (시험 컬렉션은 LEAGUE_NAMESPACE=test_)
import { DATA } from '../public/data/courses.js';
import { DEFAULT_CONDITIONS } from '../public/lib/conditions.js';
import { defaultSelection, generatePlans, recommendedCourses } from '../public/lib/planner.js';
import { eligibilityProblems, scoreTimetable } from '../public/lib/score.js';
import { fixedTitle } from '../lib/verdict.js';
import { SAMPLE_PREFIX, getEntry, replaceSampleLines } from '../lib/store.js';
import { buildLeague } from '../lib/league.js';

// 청중이 등록하면 순위가 눈에 띄게 움직이도록 학과당 인원을 적게 둔다 (13:05 관리자 결정: 약 30명)
// 정보기술대학 학과는 2명: 청중 1명만 등록해도 3명이 되어 바로 순위에 든다
const IT_DEPTS = ['컴퓨터공학부', '정보통신공학과', '임베디드시스템공학과', '데이터과학과'];
const IT_EACH = 2;
const OTHER_DEPT_COUNT = 6;
const OTHER_EACH = [4, 4, 4, 3, 3, 3];
const WORDS = ['공강수집가', '8호관유령', '점심수호자', '금요일망명자', '1교시생존자', '도서관붙박이', '셔틀대기자', '학식탐험가',
  '과제노예', '중도출석왕', '팀플방랑자', '송도바람', '시험기간좀비', '야간전사', '복학생', '새내기'];

// 같은 결과가 다시 나오도록 고정 씨앗 난수를 쓴다
let seed = 20261106;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];

// 2학년 추천 전공이 충분한 학과 중에서 고른다. 관리자 시연 학과는 반드시 넣는다.
const majorRich = DATA.depts
  .map((dept) => ({ dept, count: recommendedCourses(DATA, { dept, year: 2 }).length }))
  .filter((d) => d.count >= 4)
  .sort((a, b) => b.count - a.count)
  .map((d) => d.dept);
const others = majorRich.filter((d) => !IT_DEPTS.includes(d)).slice(0, OTHER_DEPT_COUNT);
const quota = [...IT_DEPTS.map((d) => [d, IT_EACH]), ...others.map((d, i) => [d, OTHER_EACH[i]])];

function makeBot(dept) {
  const year = 1 + Math.floor(random() * 4);
  const profile = { dept, year, creditCap: 19 };
  const conditions = {
    ...DEFAULT_CONDITIONS,
    freeDays: random() < 0.5 ? [pick([0, 4, 4, 2])] : [],
    noFirst: random() < 0.5,
    minCredits: pick([12, 15, 15, 18]),
    maxCredits: 19,
  };
  const courses = defaultSelection(recommendedCourses(DATA, profile), conditions, pick([9, 12, 12, 15]));
  if (courses.length === 0) return null;
  const { plans } = generatePlans(DATA, profile, courses, conditions);
  const plan = plans[Math.floor(random() * Math.min(plans.length, 4))];
  if (!plan || eligibilityProblems(plan.sections, dept).length) return null;
  return { d: dept, s: plan.score.total, g: plan.score.grade, t: fixedTitle(plan.score.grade), sample: true };
}

const lines = {};
for (const [dept, count] of quota) {
  let made = 0;
  for (let tries = 0; made < count && tries < count * 20; tries++) {
    const bot = makeBot(dept);
    if (!bot) continue;
    const n = Object.keys(lines).length;
    lines[`${SAMPLE_PREFIX}${String(n).padStart(3, '0')}`] = { n: `${pick(WORDS)}${10 + Math.floor(random() * 90)}`, ...bot };
    made += 1;
  }
  if (made < count) console.log(`${dept}: ${made}/${count}명만 생성`);
}

// 점수 공식이 바뀌었을 때 실제 등록자도 저장된 분반으로 같은 공식에 맞춰 다시 채점한다(칭호·평론은 유지)
const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));
async function rescore(uid, line) {
  const entry = await getEntry(uid);
  if (!entry?.sectionIds) return null;
  const score = scoreTimetable(entry.sectionIds.map((id) => sectionById.get(id)).filter(Boolean));
  if (score.total === entry.score && score.items.length === entry.items?.length) return null;
  console.log(`실제 등록자 재채점: ${entry.nickname} ${entry.score} → ${score.total}`);
  return {
    line: { ...line, s: score.total, g: score.grade },
    entry: { ...entry, score: score.total, grade: score.grade, stamp: score.stamp, items: score.items },
  };
}

const summary = await replaceSampleLines(lines, rescore);
const league = buildLeague(summary);
console.log(`가상 ${league.sampleCount}명 · 전체 ${league.total}명 · 순위 학과 ${league.departments.filter((d) => d.rank).length}개`);
console.log(league.departments.map((d) => `${d.rank ?? '-'} ${d.dept} ${d.average} (${d.count}명)`).join('\n'));
