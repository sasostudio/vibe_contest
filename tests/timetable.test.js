import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../public/data/courses.js';
import { findConflict, sectionsConflict, blocksByDay } from '../public/lib/timetable.js';
import { eligibilityProblems, gradeOf, scoreTimetable } from '../public/lib/score.js';
import { generatePlans, recommendedCourses, targetAllows } from '../public/lib/planner.js';
import { DEFAULT_CONDITIONS, parseAiJson, sanitizeConditions } from '../public/lib/conditions.js';

const section = (id, slots, extra = {}) => ({
  id, code: id.slice(0, 7), dept: '컴퓨터공학부', type: '전공핵심', name: id, credits: 3, slots, ...extra,
});
const room = '07-101';

test('자료: 분반 수와 교수 이름 미포함', () => {
  assert.ok(DATA.courses.length > 2300);
  assert.ok(!('professor' in DATA.courses[0]) && !('prof' in DATA.courses[0]));
});

test('자료: 생략된 요일을 직전 요일로 상속', () => {
  const noDay = DATA.courses.filter((c) => c.slots.some((s) => s[0] == null));
  assert.equal(noDay.length, 0);
});

test('자료: 모든 칸의 시작이 끝보다 빠르고 요일이 범위 안', () => {
  for (const c of DATA.courses) {
    for (const [day, start, end] of c.slots) {
      assert.ok(day >= 0 && day <= 6 && start < end, c.id);
    }
  }
});

test('충돌: 75분과 50분 수업이 실제 시각으로 겹치면 충돌', () => {
  const a = section('A000001', [[0, 630, 705, room]]);
  const b = section('B000001', [[0, 660, 710, room]]);
  assert.ok(sectionsConflict(a, b));
});

test('충돌: 끝과 시작이 맞닿으면 충돌 아님', () => {
  const a = section('A000001', [[0, 600, 650, room]]);
  const b = section('B000001', [[0, 650, 700, room]]);
  assert.equal(findConflict([a, b]), null);
});

test('충돌: 시간 없는 온라인 분반은 충돌 없음', () => {
  assert.equal(findConflict([section('A000001', []), section('B000001', [[0, 600, 650, room]])]), null);
});

test('점수: 항목 만점 합이 100', () => {
  const { items } = scoreTimetable([section('A000001', [[0, 600, 650, room]])]);
  assert.equal(items.reduce((sum, i) => sum + i.max, 0), 100);
});

test('점수: 공강 시간표가 공강 없는 같은 학점 시간표보다 공강 항목이 높음', () => {
  const spread = [0, 1, 2, 3, 4].map((d, i) => section(`A00000${i}`, [[d, 840, 990, room]]));
  const packed = [0, 0, 1, 1, 2].map((d, i) => section(`B00000${i}`, [[d, i % 2 ? 900 : 780, i % 2 ? 1000 : 880, room]]));
  const free = (s) => scoreTimetable(s).items.find((i) => i.key === 'free').points;
  assert.ok(free(packed) > free(spread));
});

test('점수: 12학점 미만은 학점 항목 0점', () => {
  const sections = [section('A000001', [[0, 840, 990, room]])];
  assert.equal(scoreTimetable(sections).items.find((i) => i.key === 'credits').points, 0);
});

test('점수: 온라인 학점은 6학점까지만 인정', () => {
  const online = [1, 2, 3, 4].map((i) => section(`C00000${i}`, []));
  const { stats } = scoreTimetable([...online, section('A000001', [[0, 840, 990, room]])]);
  assert.equal(stats.credits, 15);
  assert.equal(stats.effectiveCredits, 9);
});

test('점수: 1교시와 야간은 감점', () => {
  const base = scoreTimetable([section('A000001', [[0, 840, 990, room]])]).items.find((i) => i.key === 'hours').points;
  const early = scoreTimetable([section('A000001', [[0, 540, 690, room]])]).items.find((i) => i.key === 'hours').points;
  const night = scoreTimetable([section('A000001', [[0, 1110, 1200, room]])]).items.find((i) => i.key === 'hours').points;
  assert.ok(early < base && night < base);
});

test('등급 경계', () => {
  assert.equal(gradeOf(90).grade, 'A+');
  assert.equal(gradeOf(89).grade, 'A0');
  assert.equal(gradeOf(54).grade, 'F');
});

test('자격: 12학점 미만, 충돌, 타과 전공만 있는 시간표 거부', () => {
  const ok = [1, 2, 3, 4].map((i) => section(`A00000${i}`, [[i, 840, 990, room]]));
  assert.deepEqual(eligibilityProblems(ok, '컴퓨터공학부'), []);
  assert.equal(eligibilityProblems(ok.slice(0, 2), '컴퓨터공학부').length, 1);
  assert.ok(eligibilityProblems(ok, '경영학부').some((p) => p.includes('소속 학과')));
  const clash = [...ok, section('B000001', [[1, 840, 990, room]])];
  assert.ok(eligibilityProblems(clash, '컴퓨터공학부').some((p) => p.includes('겹칩니다')));
});

test('수강대상: 줄임말을 학과와 대조', () => {
  assert.ok(targetAllows({ target: '컴퓨터,정통,임베디드' }, '정보통신공학과'));
  assert.ok(!targetAllows({ target: '독문,불문,중국' }, '컴퓨터공학부'));
  assert.ok(targetAllows({}, '컴퓨터공학부'));
});

test('편성: 실제 자료로 3안을 만들고 충돌 없음', () => {
  const profile = { dept: '컴퓨터공학부', year: 2, creditCap: 19 };
  const courses = recommendedCourses(DATA, profile).slice(0, 3);
  const { plans, diagnosis } = generatePlans(DATA, profile, courses, { ...DEFAULT_CONDITIONS, targetCredits: 18 });
  assert.equal(diagnosis, null);
  assert.ok(plans.length >= 1 && plans.length <= 3);
  for (const plan of plans) {
    assert.equal(findConflict(plan.sections), null);
    for (const course of courses) assert.ok(plan.sections.some((s) => s.code === course.code));
  }
});

test('편성: 공강 조건을 지킴', () => {
  const profile = { dept: '컴퓨터공학부', year: 2, creditCap: 19 };
  const courses = recommendedCourses(DATA, profile).slice(0, 2);
  const { plans } = generatePlans(DATA, profile, courses, { ...DEFAULT_CONDITIONS, freeDays: [4] });
  for (const plan of plans) assert.ok(!blocksByDay(plan.sections).has(4));
});

test('편성 실패: 불가능한 조건이면 원인과 대안 제시', () => {
  const profile = { dept: '컴퓨터공학부', year: 2, creditCap: 19 };
  const course = recommendedCourses(DATA, profile)[0];
  const days = [...new Set(course.sections.flatMap((s) => s.slots.map((x) => x[0])))].filter((d) => d < 5);
  const { plans, diagnosis } = generatePlans(DATA, profile, [course], { ...DEFAULT_CONDITIONS, freeDays: days });
  assert.equal(plans.length, 0);
  assert.ok(diagnosis.causes[0].includes(course.name));
  assert.ok(diagnosis.fixes.length > 0);
});

test('편성 실패: 학점 상한 초과 안내', () => {
  const profile = { dept: '컴퓨터공학부', year: 2, creditCap: 3 };
  const courses = recommendedCourses(DATA, profile).slice(0, 3);
  const { diagnosis } = generatePlans(DATA, profile, courses, DEFAULT_CONDITIONS);
  assert.ok(diagnosis.causes[0].includes('상한'));
});

test('조건: AI가 준 이상한 값을 걸러냄', () => {
  const clean = sanitizeConditions({ freeDays: [4, 4, 9, '금'], targetCredits: 99, noFirst: 'yes', wantKeywords: ['', 3, '영어'] });
  assert.deepEqual(clean.freeDays, [4]);
  assert.equal(clean.targetCredits, 24);
  assert.equal(clean.noFirst, false);
  assert.deepEqual(clean.wantKeywords, ['영어']);
});

test('AI JSON: 코드블록과 깨진 응답 처리', () => {
  assert.deepEqual(parseAiJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseAiJson('죄송합니다'), null);
  assert.equal(parseAiJson('{깨짐'), null);
});
