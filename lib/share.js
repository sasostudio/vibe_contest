// 공유와 궁합에서 밖으로 나가는 값을 고르는 곳. 이 함수들을 거치지 않은 값은 응답에 넣지 않는다.
// 공개: 닉네임, 학과, 유형, 유형 설명, 칭호, 등급, 점수. 비공개: 사용자 ID, 전체 시간표, 이메일, 학번.
import { randomBytes } from 'node:crypto';
import { DATA } from '../public/data/courses.js';
import { TYPES, classifyType } from '../public/lib/mbti.js';

const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16}$/;

// 사용자 ID와 무관한 무작위 값. 12바이트 → 16글자
export const makeToken = () => randomBytes(12).toString('base64url');

export const sectionsOf = (entry) => (entry.sectionIds ?? []).map((id) => sectionById.get(id)).filter(Boolean);

// 유형 판정 이전에 등록한 기록도 시간표로 다시 판정해 보여 준다
export function typeOf(entry) {
  const id = entry.typeId && TYPES[entry.typeId] ? entry.typeId : classifyType(sectionsOf(entry)).id;
  return { id, name: TYPES[id].name, line: entry.typeLine || TYPES[id].blurb };
}

export function publicShare(entry) {
  const type = typeOf(entry);
  return {
    nickname: entry.nickname,
    dept: entry.dept,
    typeId: type.id,
    typeName: type.name,
    typeLine: type.line,
    title: entry.title,
    grade: entry.grade,
    score: entry.score,
  };
}

// 궁합 공개본: 두 사람의 닉네임·학과·유형 이름과 겹치는 정보만
export function publicCompat(compat) {
  const person = (p) => ({ nickname: p.nickname, dept: p.dept, typeName: p.typeName });
  return {
    a: person(compat.a),
    b: person(compat.b),
    score: compat.score,
    freeDays: compat.freeDays,
    windows: compat.windows,
    lunches: compat.lunches,
    buildings: compat.buildings.map((code) => ({ code, name: DATA.buildings[code] ?? code })),
    line: compat.line,
  };
}
