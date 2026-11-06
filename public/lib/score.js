// 점수표의 단일 원본. 화면의 예상 점수와 서버의 확정 점수가 같은 함수를 쓴다.
// 랭킹에 들어가는 값은 항상 서버가 이 함수로 다시 계산한다.
import { WEEKDAYS, blocksByDay, buildingOf, findConflict, totalCredits } from './timetable.js';

export const MIN_CREDITS = 12;
export const MAX_CREDITS = 24;
const ONLINE_CREDIT_LIMIT = 6; // 온라인으로 학점만 채워 공강을 만드는 시간표를 견제한다
const FIRST_PERIOD_END = 10 * 60;
const NIGHT_START = 18 * 60;
const LUNCH_FROM = 11 * 60;
const LUNCH_TO = 14 * 60;
const LUNCH_MIN = 50;
const BACK_TO_BACK_GAP = 15;
const LONG_RUN_MIN = 240;

const MAJOR_TYPES = new Set(['전공기초', '전공핵심', '전공심화']);

export const GRADES = [
  { min: 90, grade: 'A+', stamp: '수석 편성' },
  { min: 85, grade: 'A0', stamp: '우수 편성' },
  { min: 80, grade: 'B+', stamp: '양호' },
  { min: 75, grade: 'B0', stamp: '무난' },
  { min: 70, grade: 'C+', stamp: '보통' },
  { min: 65, grade: 'C0', stamp: '주의' },
  { min: 60, grade: 'D+', stamp: '경고' },
  { min: 55, grade: 'D0', stamp: '학사경고' },
  { min: 0, grade: 'F', stamp: '재수강 권고' },
];

export const gradeOf = (total) => GRADES.find((g) => total >= g.min);

function hasLunch(blocks) {
  let cursor = LUNCH_FROM;
  for (const b of blocks) {
    if (b.end <= LUNCH_FROM || b.start >= LUNCH_TO) continue;
    if (b.start - cursor >= LUNCH_MIN) return true;
    cursor = Math.max(cursor, b.end);
  }
  return LUNCH_TO - cursor >= LUNCH_MIN;
}

// 쉬는 시간 안에 이어지는 수업 묶음
function runsOf(blocks) {
  const runs = [];
  for (const b of blocks) {
    const run = runs.at(-1);
    if (run && b.start - run.at(-1).end <= BACK_TO_BACK_GAP) run.push(b);
    else runs.push([b]);
  }
  return runs;
}

function measure(sections) {
  const days = blocksByDay(sections);
  const stats = {
    credits: totalCredits(sections),
    effectiveCredits: 0,
    classDays: days.size,
    freeDays: WEEKDAYS.filter((d) => !days.has(d)).length,
    lunchDays: 0,
    firstPeriodDays: 0,
    nightBlocks: 0,
    longRuns: 0,
    rushedMoves: 0,
    sameBuildingPairs: 0,
    movePairs: 0,
  };
  const online = sections.filter((s) => s.slots.length === 0).reduce((sum, s) => sum + s.credits, 0);
  stats.effectiveCredits = stats.credits - online + Math.min(online, ONLINE_CREDIT_LIMIT);

  for (const blocks of days.values()) {
    if (hasLunch(blocks)) stats.lunchDays += 1;
    if (blocks[0].start < FIRST_PERIOD_END) stats.firstPeriodDays += 1;
    stats.nightBlocks += blocks.filter((b) => b.start >= NIGHT_START).length;
    for (const run of runsOf(blocks)) {
      if (run.length >= 3 || run.at(-1).end - run[0].start >= LONG_RUN_MIN) stats.longRuns += 1;
    }
    for (let i = 1; i < blocks.length; i++) {
      const same = buildingOf(blocks[i - 1].room) === buildingOf(blocks[i].room);
      stats.movePairs += 1;
      if (same) stats.sameBuildingPairs += 1;
      else if (blocks[i].start - blocks[i - 1].end <= BACK_TO_BACK_GAP) stats.rushedMoves += 1;
    }
  }
  return stats;
}

const clamp = (value, max) => Math.max(0, Math.min(max, value));

export function scoreTimetable(sections) {
  const s = measure(sections);
  const freePoints = [0, 15, 25][Math.min(s.freeDays, 2)];
  const lunchPoints = s.classDays ? Math.round((s.lunchDays / s.classDays) * 20) : 0;
  const creditPoints = s.effectiveCredits < MIN_CREDITS ? 0 : clamp((s.effectiveCredits - MIN_CREDITS) * 2 + 8, 20);
  const hoursPoints = clamp(15 - 4 * s.firstPeriodDays - 5 * s.nightBlocks, 15);
  const runPoints = clamp(10 - 3 * s.longRuns, 10);
  const sameRatio = s.movePairs ? s.sameBuildingPairs / s.movePairs : 1;
  const movePoints = clamp(Math.round(sameRatio * 10) - 2 * s.rushedMoves, 10);

  const items = [
    { key: 'free', label: '공강일', points: freePoints, max: 25, detail: `평일 공강 ${s.freeDays}일` },
    { key: 'lunch', label: '점심시간', points: lunchPoints, max: 20, detail: `수업일 ${s.classDays}일 중 ${s.lunchDays}일 확보` },
    { key: 'credits', label: '학점 충실도', points: creditPoints, max: 20, detail: `인정 ${s.effectiveCredits}학점` },
    { key: 'hours', label: '1교시·야간', points: hoursPoints, max: 15, detail: `1교시 ${s.firstPeriodDays}일, 야간 ${s.nightBlocks}회` },
    { key: 'runs', label: '연강', points: runPoints, max: 10, detail: `3연강 이상 ${s.longRuns}회` },
    { key: 'moves', label: '동선', points: movePoints, max: 10, detail: `같은 건물 연속 ${s.sameBuildingPairs}/${s.movePairs}, 쉬는 시간 내 건물 이동 ${s.rushedMoves}회` },
  ];
  const total = items.reduce((sum, i) => sum + i.points, 0);
  return { total, ...gradeOf(total), items, stats: s };
}

// 랭킹 자격. 사유 문장 목록을 돌려주며 빈 배열이면 등록 가능이다.
export function eligibilityProblems(sections, dept) {
  const problems = [];
  const conflict = findConflict(sections);
  if (conflict) problems.push(`${conflict[0].name}과(와) ${conflict[1].name}의 시간이 겹칩니다.`);
  const credits = totalCredits(sections);
  if (credits < MIN_CREDITS) problems.push(`${MIN_CREDITS}학점 이상이어야 합니다. 현재 ${credits}학점입니다.`);
  if (credits > MAX_CREDITS) problems.push(`${MAX_CREDITS}학점을 넘을 수 없습니다. 현재 ${credits}학점입니다.`);
  if (!sections.some((s) => s.slots.length > 0)) problems.push('시간이 정해진 수업이 1개 이상 있어야 합니다.');
  if (new Set(sections.map((s) => s.code)).size !== sections.length) problems.push('같은 과목을 두 번 담을 수 없습니다.');
  if (!sections.some((s) => s.dept === dept && MAJOR_TYPES.has(s.type))) {
    problems.push('소속 학과 전공 과목이 1개 이상 있어야 학과 대항전에 등록할 수 있습니다.');
  }
  return problems;
}
