// 시간표 조합 탐색과 실패 진단. AI는 여기 관여하지 않는다.
import { DAY_NAMES, courseKey, sectionsConflict, totalCredits } from './timetable.js';
import { MORNING_END, scoreTimetable } from './score.js';

const FIRST_PERIOD_END = 10 * 60;
const NIGHT_START = 18 * 60;
const MAX_BASES = 200;
const MAX_NODES = 40000;
const FILL_BASES = 12;
const FILL_VARIANTS = 3; // 같은 전공 조합에 교양을 다르게 채운 안의 수
export const CANDIDATE_COUNT = 12;

const MAJOR_TYPES = ['전공기초', '전공핵심', '전공심화'];
const GENERAL_TYPES = new Set(['핵심교양', '심화교양', '기초교양']);

// 공지의 수강대상 줄임말 → 학과 이름에 들어 있는 글자
const TARGET_ALIAS = {
  정통: '정보통신', 국문: '국어국문', 영문: '영어영문', 일문: '일본', 독문: '독어독문', 불문: '불어불문',
  중국: '중어중국', 산경: '산업경영', 신방: '미디어', 정외: '정치외교', '기계ㆍ로봇공학': '기계',
  무역: 'Global Trade', // 이번 학기 주간 무역학부는 Global Trade & Service학부로 개설
};
// 학과 칸이 이 값인 교양은 누구나 듣는다. 그 밖의 학과가 개설한 교양은 그 학과 학생용이다.
const OPEN_DEPTS = new Set(['교양', '교직', '일선', '군사학', 'HUSS(타대학)']);

function tokenMatches(raw, dept) {
  const token = raw.trim();
  const night = token.endsWith('(야)');
  if (night !== dept.includes('(야)')) return false; // 주간 대상과 야간 대상을 섞지 않는다
  const base = token.replace(/\(야\)$/, '').replace(/\(.*\)$/, ''); // 자유전공학부(인문) → 자유전공학부
  if (/통상$/.test(base)) return dept.includes('동북아국제통상'); // 동북아·한국·중국 등 통상 트랙
  return dept.includes(base) || dept.includes(TARGET_ALIAS[base] ?? base);
}

// 이 학과 학생이 이 분반을 들을 수 있는가. 자동 채우기, 희망 과목, 미리보기, 화면 표시가 모두 이 함수를 쓴다.
// 11-06 실측: 학과 개설 기초교양 81분반을 아무 학과에나 채워 자동 편성의 48%에 남의 학과 분반이 들어갔다.
export function targetAllows(section, dept) {
  if (section.target) return section.target.split(',').some((token) => tokenMatches(token, dept));
  if (GENERAL_TYPES.has(section.type) && section.dept && !OPEN_DEPTS.has(section.dept)) return section.dept === dept;
  return true;
}

// 고른 과목에서 내 학과가 들을 수 있는 분반만 남긴다. 하나도 없으면 그대로 둔다(화면이 「내 학과 대상 분반 없음」을 알린다).
export function sectionsForDept(course, dept) {
  const allowed = course.sections.filter((s) => targetAllows(s, dept));
  return allowed.length && allowed.length < course.sections.length ? { ...course, sections: allowed } : course;
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

// 과목 화면의 실시간 미리보기용: 담은 과목만으로 겹치지 않는 분반 조합 중 총점이 가장 높은 것. 없으면 null.
// 조건(공강 요일 등)은 다음 단계에서 적용하므로 여기서는 겹침만 본다.
const OPEN_CONDITIONS = { freeDays: [], noFirst: false, noNight: false };
export function bestArrangement(courses, dept) {
  const bases = searchCombinations(courses.map((c) => sectionsForDept(c, dept)), OPEN_CONDITIONS);
  if (bases.length === 0) return null;
  let best = bases[0];
  let bestTotal = -1;
  for (const sections of bases) {
    const total = scoreTimetable(sections).total;
    if (total > bestTotal) [best, bestTotal] = [sections, total];
  }
  return best;
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

const hasMorning = (section) => section.slots.some((slot) => slot[1] < MORNING_END);
const morningCount = (sections) => sections.reduce((n, s) => n + s.slots.filter((slot) => slot[1] < MORNING_END).length, 0);

// excludeCodes: 사용자가 「피할」 또는 「이미 수강」으로 고른 교양의 과목번호
function generalPool(data, { dept, year }, conditions, excludeCodes) {
  const avoid = conditions.avoidKeywords;
  return data.courses.filter(
    (c) =>
      GENERAL_TYPES.has(c.type) &&
      !excludeCodes.has(c.code) &&
      (conditions.areas.length === 0 || conditions.areas.includes(c.area)) &&
      c.slots.length > 0 &&
      gradeMatches(c, year) &&
      targetAllows(c, dept) &&
      sectionFits(c, conditions) &&
      !avoid.some((word) => c.name.includes(word)),
  );
}

// 희망 키워드 과목을 먼저 담고, 최소 학점까지는 점수가 가장 오르는 교양을 채운다.
// 최소 학점을 넘은 뒤에는 총점이 오를 때만 최대 학점까지 더 담는다. banned는 다른 안에서 쓴 교양이다.
// 오전 수업 피하기가 켜져 있으면 오전 교양은 최소 학점을 못 채울 때만 쓴다.
function fillWithGeneral(base, pool, conditions, banned = new Set()) {
  const plan = [...base];
  const preferred = conditions.avoidMorning ? pool.filter((c) => !hasMorning(c)) : pool;
  const canAdd = (c) =>
    !banned.has(c.id) &&
    !plan.some((p) => p.code === c.code || sectionsConflict(p, c)) &&
    totalCredits(plan) + c.credits <= conditions.maxCredits;
  const bestAddition = (from = preferred) => {
    let best = null;
    let bestScore = -1;
    for (const candidate of from) {
      if (!canAdd(candidate)) continue;
      const score = scoreTimetable([...plan, candidate]).total;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best && { section: best, score: bestScore };
  };

  for (const word of conditions.wantKeywords) {
    const wanted = pool.find((c) => c.name.includes(word) && canAdd(c));
    if (wanted) plan.push(wanted);
  }
  while (totalCredits(plan) < conditions.minCredits) {
    const next = bestAddition() ?? bestAddition(pool);
    if (!next) break;
    plan.push(next.section);
  }
  for (let next = bestAddition(); next && next.score > scoreTimetable(plan).total; next = bestAddition()) {
    plan.push(next.section);
  }
  return plan;
}

function fillVariants(base, pool, conditions) {
  const banned = new Set();
  const variants = [];
  for (let i = 0; i < FILL_VARIANTS; i++) {
    const plan = fillWithGeneral(base, pool, conditions, banned);
    variants.push(plan);
    for (const section of plan.slice(base.length)) banned.add(section.id);
  }
  return variants;
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
    if (chosen.length === CANDIDATE_COUNT) break;
    if (isDistinct(plan)) chosen.push(plan);
  }
  for (const plan of ranked) {
    if (chosen.length === CANDIDATE_COUNT) break;
    if (!chosen.includes(plan)) chosen.push(plan);
  }
  return chosen;
}

function buildPlans(data, profile, courses, conditions, excludeCodes) {
  const bases = searchCombinations(courses, conditions);
  if (bases.length === 0) return [];
  const pool = generalPool(data, profile, conditions, excludeCodes);
  // 오전 수업 피하기는 반드시 지키는 조건이 아니라, 오전 수업이 적은 전공 조합을 먼저 고르는 방식이다
  const morningFirst = (a, b) => (conditions.avoidMorning ? a.morning - b.morning : 0) || b.total - a.total;
  const top = bases
    .map((sections) => ({ sections, total: scoreTimetable(sections).total, morning: morningCount(sections) }))
    .sort(morningFirst)
    .slice(0, FILL_BASES);
  const unique = new Map();
  for (const { sections } of top) {
    for (const filled of fillVariants(sections, pool, conditions)) {
      const key = filled.map((s) => s.id).sort().join();
      if (!unique.has(key)) unique.set(key, { sections: filled, score: scoreTimetable(filled) });
    }
  }
  const ranked = [...unique.values()].sort((a, b) =>
    (conditions.avoidMorning ? a.score.stats.morningBlocks - b.score.stats.morningBlocks : 0) || b.score.total - a.score.total);
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

// 반환: { plans, diagnosis }. plans는 총점순 후보 최대 12개이며, 비어 있으면 diagnosis를 보여 준다.
export function generatePlans(data, profile, courses, conditions, { excludeCodes = [] } = {}) {
  const maxCredits = Math.min(conditions.maxCredits, profile.creditCap);
  const credits = courses.reduce((sum, c) => sum + c.credits, 0);
  if (credits > maxCredits) {
    return {
      plans: [],
      diagnosis: { causes: [`담은 과목이 ${credits}학점으로 최대 ${maxCredits}학점을 넘습니다.`], fixes: [] },
    };
  }
  const limited = { ...conditions, maxCredits, minCredits: Math.min(conditions.minCredits, maxCredits) };
  courses = courses.map((c) => sectionsForDept(c, profile.dept));
  const plans = buildPlans(data, profile, courses, limited, new Set(excludeCodes));
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
  if (stats.longGaps > 0) cons.push(`우주 공강 ${stats.longGaps}회`);
  return { pros, cons };
}
