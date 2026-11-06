// 공유와 궁합에서 밖으로 나가는 값을 고르는 곳. 이 함수들을 거치지 않은 값은 응답에 넣지 않는다.
// 공개: 닉네임, 학과, 칭호, 평론, 등급, 점수. 비공개: 사용자 ID, 전체 시간표, 이메일, 학번.
// 평론에는 과목명이 들어갈 수 있다. 관리자가 알고 공개를 정했다(13:54).
import { randomBytes } from 'node:crypto';
import { DATA } from '../public/data/courses.js';

const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16}$/;

// 사용자 ID와 무관한 무작위 값. 12바이트 → 16글자
export const makeToken = () => randomBytes(12).toString('base64url');

export const sectionsOf = (entry) => (entry.sectionIds ?? []).map((id) => sectionById.get(id)).filter(Boolean);

export function publicShare(entry) {
  return {
    nickname: entry.nickname,
    dept: entry.dept,
    title: entry.title,
    review: entry.review,
    grade: entry.grade,
    score: entry.score,
  };
}

// 궁합 공개본: 두 사람의 닉네임·학과·칭호와 겹치는 정보만
export function publicCompat(compat) {
  const person = (p) => ({ nickname: p.nickname, dept: p.dept, title: p.title });
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
