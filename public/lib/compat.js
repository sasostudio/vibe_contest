// 시간표 궁합. 두 시간표의 겹치는 공강, 같은 점심시간, 같은 건물만 코드가 계산한다.
// 결과에는 겹치는 정보만 담는다. 상대의 전체 시간표는 담지 않는다.
import { WEEKDAYS, blocksByDay, buildingOf } from './timetable.js';

const DAY_START = 9 * 60;
const DAY_END = 18 * 60;
const MIN_WINDOW = 60; // 함께 비는 시간은 1시간 이상만 센다
const LUNCH_FROM = 11 * 60;
const LUNCH_TO = 14 * 60;
const LUNCH_MIN = 50;
const RAW_MAX = 90;

// 하루 중 두 사람이 모두 비는 구간. busy는 [시작, 끝] 목록
function freeWindows(busy, from, to) {
  const sorted = [...busy].sort((a, b) => a[0] - b[0]);
  const windows = [];
  let cursor = from;
  for (const [start, end] of sorted) {
    if (end <= cursor) continue;
    if (start > cursor) windows.push([cursor, Math.min(start, to)]);
    cursor = Math.max(cursor, end);
    if (cursor >= to) break;
  }
  if (cursor < to) windows.push([cursor, to]);
  return windows.filter(([s, e]) => e > s);
}

const busyOf = (days, day) => (days.get(day) ?? []).map((b) => [b.start, b.end]);
const buildingsOf = (sections) => new Set(sections.flatMap((s) => s.slots.map((slot) => buildingOf(slot[3]))));

export function compareTimetables(sectionsA, sectionsB) {
  const a = blocksByDay(sectionsA);
  const b = blocksByDay(sectionsB);
  const freeDays = [];
  const windows = [];
  const lunches = [];
  for (const day of WEEKDAYS) {
    if (!a.has(day) && !b.has(day)) {
      freeDays.push(day);
      continue;
    }
    const busy = [...busyOf(a, day), ...busyOf(b, day)];
    for (const [s, e] of freeWindows(busy, DAY_START, DAY_END)) {
      if (e - s >= MIN_WINDOW) windows.push({ day, start: s, end: e });
    }
    // 같은 점심시간: 둘 다 그날 학교에 있고, 11~14시 사이에 함께 비는 50분 이상이 있다
    if (a.has(day) && b.has(day)) {
      const lunch = freeWindows(busy, LUNCH_FROM, LUNCH_TO).find(([s, e]) => e - s >= LUNCH_MIN);
      if (lunch) lunches.push({ day, start: lunch[0], end: lunch[1] });
    }
  }
  const mine = buildingsOf(sectionsA);
  const buildings = [...buildingsOf(sectionsB)].filter((code) => mine.has(code) && !code.startsWith('Z')).sort();
  const windowHours = windows.reduce((sum, w) => sum + (w.end - w.start), 0) / 60;
  const raw = Math.min(freeDays.length * 12, 24) + Math.min(lunches.length * 10, 30)
    + Math.min(Math.floor(windowHours) * 3, 21) + Math.min(buildings.length * 5, 15);
  return { score: Math.round((raw / RAW_MAX) * 100), freeDays, windows, lunches, buildings };
}
