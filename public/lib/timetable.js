// 시간표의 시간 계산. 교시 번호는 50분·75분 체계가 섞여 있어 쓰지 않고 실제 시각(분)만 쓴다.
// slot = [요일(0=월), 시작분, 끝분, 강의실]

export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
export const WEEKDAYS = [0, 1, 2, 3, 4];

export const buildingOf = (room) => String(room).split('-')[0];

export const courseKey = (c) => `${c.code}|${c.dept}`;

export const formatTime = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function slotsOverlap(a, b) {
  return a[0] === b[0] && a[1] < b[2] && b[1] < a[2];
}

export function sectionsConflict(a, b) {
  return a.slots.some((x) => b.slots.some((y) => slotsOverlap(x, y)));
}

export function findConflict(sections) {
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sectionsConflict(sections[i], sections[j])) return [sections[i], sections[j]];
    }
  }
  return null;
}

// 요일별로 시작 시각순 정렬한 수업 칸. 키는 수업이 있는 요일만 포함한다.
export function blocksByDay(sections) {
  const days = new Map();
  for (const section of sections) {
    for (const [day, start, end, room] of section.slots) {
      if (!days.has(day)) days.set(day, []);
      days.get(day).push({ day, start, end, room, section });
    }
  }
  for (const blocks of days.values()) blocks.sort((a, b) => a.start - b.start);
  return days;
}

export const totalCredits = (sections) => sections.reduce((sum, s) => sum + s.credits, 0);
