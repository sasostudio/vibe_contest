// 시간표 조합 탐색과 실패 진단. AI는 여기 관여하지 않는다.
import { DAY_NAMES, courseKey, sectionsConflict, totalCredits } from './timetable.js';
import { MAX_CREDITS, scoreTimetable } from './score.js';

const FIRST_PERIOD_END = 10 * 60;
const NIGHT_START = 18 * 60;
const MAX_BASES = 200;
const MAX_NODES = 40000;
const FILL_BASES = 12;
const PLAN_COUNT = 3;

const MAJOR_TYPES = ['전공기초', '전공핵심', '전공심화'];
const GENERAL_TYPES = new Set(['핵심교양', '심화교양', '기초교양']);

// 공지의 수강대상 줄임말 → 학과 이름에 들어 있는 글자
const TARGET_ALIAS = {
  정통: '정보통신', 국문: '국어국문', 영문: '영어영문', 일문: '일본', 독문: '독어독문', 불문: '불어불문',
  중국: '중어중국', 산경: '산업경영', 신방: '미디어', 정외: '정치외교',
};

export function targetAllows(course, dept) {
  if (!course.target) return true;
  return course.target.split(',').some((token) => dept.includes(TARGET_ALIAS[token] ?? token));
}

const gradeMatches = (course, year) => course.grade === '전학년' || course.grade === String(year);

// 분반을 과목 단위로 묶는다. 같은 과목번호도 학과가 다르면 다른 과목으로 본다.
export function groupCourses(sections) {
  const groups = new Map();
  for (const section of sections) {
    const key = courseKey(section);
    if (!groups.has(key)) {
      groups.set(key, { key, code: section.code, name: section.name, dept: section.dept, type: section.type, grade: section.grade, credits: section.credits, sections: [] });
    }
    groups.get(key).sections.push(section);
  }
  return [...groups.values()];
}

// 학과·학년 기준 추천 과목. 들은 과목 제외는 사용자가 화면에서 한다.
export function recommendedCourses(data, { dept, year }) {
  const own = data.courses.filter(
    (c) => c.dept === dept && MAJOR_TYPES.includes(c.type) && gradeMatches(c, year) && c.slots.length > 0 && c.name !== 'RISE',
  );
  return groupCourses(own).sort(
    (a, b) => MAJOR_TYPES.indexOf(a.type) - MAJOR_TYPES.indexOf(b.type) || a.name.localeCompare(b.name, 'ko'),
  );
}

// 처음 체크해 둘 과목. 조합이 가능한 범위에서 12학점까지만 담고 나머지는 교양 자리로 남긴다.
export function defaultSelection(courses, conditions, credits = 12) {
  const picked = [];
  for (const course of courses) {
    const sum = picked.reduce((total, c) => total + c.credits, 0);
    if (sum + course.credits > credits) continue;
    if (searchCombinations([...picked, course], conditions).length > 0) picked.push(course);
  }
  return picked;
}

export function searchCourses(data, query, limit = 30) {
  const text = query.trim().replace(/\s/g, '');
  if (!text) return [];
  const hits = data.courses.filter((c) => c.name.replace(/\s/g, '').includes(text));
  return groupCourses(hits).slice(0, limit);
}

export function sectionFits(section, conditions) {
  return section.slots.every(
    ([day, start]) =>
      !conditions.freeDays.includes(day) &&
      !(conditions.noFirst && start < FIRST_PERIOD_END) &&
      !(conditions.noNight && start >= NIGHT_START),
  );
}

function searchCombinations(courses, conditions) {
  const options = courses
    .map((c) => ({ course: c, sections: c.sections.filter((s) => sectionFits(s, conditions)) }))
    .sort((a, b) => a.sections.length - b.sections.length);
  if (options.some((o) => o.sections.length === 0)) return [];

  const results = [];
  let nodes = 0;
  const walk = (index, picked) => {
    if (results.length >= MAX_BASES || nodes++ > MAX_NODES) return;
    if (index === options.length) {
      results.push([...picked]);
      return;
    }
    for (const section of options[index].sections) {
      if (picked.some((p) => sectionsConflict(p, section))) continue;
      picked.push(section);
      walk(index + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return results;
}

function generalPool(data, { dept, year }, conditions) {
  const avoid = conditions.avoidKeywords;
  return data.courses.filter(
    (c) =>
      GENERAL_TYPES.has(c.type) &&
      c.slots.length > 0 &&
      gradeMatches(c, year) &&
      targetAllows(c, dept) &&
      sectionFits(c, conditions) &&
      !avoid.some((word) => c.name.includes(word)),
  );
}

// 희망 키워드 과목을 먼저 담고, 남은 학점은 점수가 가장 오르는 교양으로 채운다.
function fillWithGeneral(base, pool, conditions) {
  const plan = [...base];
  const canAdd = (c) =>
    !plan.some((p) => p.code === c.code || sectionsConflict(p, c)) &&
    totalCredits(plan) + c.credits <= Math.min(MAX_CREDITS, conditions.targetCredits + 1);

  for (const word of conditions.wantKeywords) {
    const wanted = pool.find((c) => c.name.includes(word) && canAdd(c));
    if (wanted) plan.push(wanted);
  }
  while (totalCredits(plan) < conditions.targetCredits) {
    let best = null;
    let bestScore = -1;
    for (const candidate of pool) {
      if (!canAdd(candidate)) continue;
      const score = scoreTimetable([...plan, candidate]).total;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    plan.push(best);
  }
  return plan;
}

const freeDayKey = (sections) =>
  [0, 1, 2, 3, 4].filter((d) => !sections.some((s) => s.slots.some((slot) => slot[0] === d))).join('');

function pickDistinct(ranked) {
  const chosen = [];
  const isDistinct = (plan) =>
    chosen.every((c) => {
      const shared = plan.sections.filter((s) => c.sections.some((x) => x.id === s.id)).length;
      return freeDayKey(c.sections) !== freeDayKey(plan.sections) || plan.sections.length - shared >= 2;
    });
  for (const plan of ranked) {
    if (chosen.length === PLAN_COUNT) break;
    if (isDistinct(plan)) chosen.push(plan);
  }
  for (const plan of ranked) {
    if (chosen.length === PLAN_COUNT) break;
    if (!chosen.includes(plan)) chosen.push(plan);
  }
  return chosen;
}

function buildPlans(data, profile, courses, conditions) {
  const bases = searchCombinations(courses, conditions);
  if (bases.length === 0) return [];
  const pool = generalPool(data, profile, conditions);
  const top = bases
    .map((sections) => ({ sections, total: scoreTimetable(sections).total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, FILL_BASES);
  const ranked = top
    .map(({ sections }) => {
      const filled = fillWithGeneral(sections, pool, conditions);
      return { sections: filled, score: scoreTimetable(filled) };
    })
    .sort((a, b) => b.score.total - a.score.total);
  return pickDistinct(ranked);
}

function conditionRelaxations(conditions) {
  const options = conditions.freeDays.map((day) => ({
    label: `${DAY_NAMES[day]}요일 공강 포기`,
    conditions: { ...conditions, freeDays: conditions.freeDays.filter((d) => d !== day) },
  }));
  // 요일을 하나씩 풀어서는 안 되는 경우가 있다 (예: 평일 전부 공강)
  if (conditions.freeDays.length > 1) options.push({ label: '공강 요일 모두 포기', conditions: { ...conditions, freeDays: [] } });
  if (conditions.noFirst) options.push({ label: '1교시 허용', conditions: { ...conditions, noFirst: false } });
  if (conditions.noNight) options.push({ label: '야간 수업 허용', conditions: { ...conditions, noNight: false } });
  return options;
}

// 왜 안 되는지와 무엇을 바꾸면 되는지를 코드로 특정한다.
export function diagnose(courses, conditions) {
  const causes = [];
  for (const course of courses) {
    if (!course.sections.some((s) => sectionFits(s, conditions))) {
      causes.push(`${course.name}의 모든 분반이 입력한 조건과 부딪힙니다.`);
    }
  }
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const blocked = courses[i].sections.every((a) => courses[j].sections.every((b) => sectionsConflict(a, b)));
      if (blocked) causes.push(`${courses[i].name}과(와) ${courses[j].name}은(는) 어느 분반을 골라도 시간이 겹칩니다.`);
    }
  }
  if (causes.length === 0) causes.push('개별 과목은 가능하지만 전체 조합에서 시간이 맞지 않습니다.');

  const fixes = [];
  for (const option of conditionRelaxations(conditions)) {
    if (searchCombinations(courses, option.conditions).length > 0) fixes.push({ kind: 'condition', label: option.label, conditions: option.conditions });
  }
  for (const course of courses) {
    const rest = courses.filter((c) => c !== course);
    if (searchCombinations(rest, conditions).length > 0) fixes.push({ kind: 'course', label: `${course.name} 빼기`, removeKey: course.key });
  }
  return { causes, fixes };
}

// 반환: { plans, diagnosis }. plans가 비어 있으면 diagnosis를 보여 준다.
export function generatePlans(data, profile, courses, conditions) {
  const credits = courses.reduce((sum, c) => sum + c.credits, 0);
  if (credits > profile.creditCap) {
    return {
      plans: [],
      diagnosis: { causes: [`담은 과목이 ${credits}학점으로 상한 ${profile.creditCap}학점을 넘습니다.`], fixes: [] },
    };
  }
  const limited = { ...conditions, targetCredits: Math.min(conditions.targetCredits, profile.creditCap) };
  const plans = buildPlans(data, profile, courses, limited);
  if (plans.length > 0) return { plans, diagnosis: null };
  return { plans: [], diagnosis: diagnose(courses, limited) };
}

// AI가 실패해도 비교가 되도록 숫자에서 바로 만드는 설명
export function planSummary(plan) {
  const { stats } = plan.score;
  const pros = [];
  const cons = [];
  if (stats.freeDays > 0) pros.push(`평일 공강 ${stats.freeDays}일`);
  if (stats.lunchDays === stats.classDays) pros.push('수업일 전부 점심시간 확보');
  if (stats.firstPeriodDays === 0) pros.push('1교시 없음');
  if (stats.firstPeriodDays > 0) cons.push(`1교시 ${stats.firstPeriodDays}일`);
  if (stats.longRuns > 0) cons.push(`3연강 이상 ${stats.longRuns}회`);
  if (stats.rushedMoves > 0) cons.push(`쉬는 시간 내 건물 이동 ${stats.rushedMoves}회`);
  if (stats.nightBlocks > 0) cons.push(`야간 수업 ${stats.nightBlocks}회`);
  if (stats.credits < 15) cons.push(`${stats.credits}학점으로 다소 적음`);
  return { pros, cons };
}
