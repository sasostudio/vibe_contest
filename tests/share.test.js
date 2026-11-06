import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTimetables } from '../public/lib/compat.js';
import { TOKEN_PATTERN, makeToken, publicCompat, publicShare } from '../lib/share.js';
import { PROMPTS } from '../prompts/index.js';

const sec = (id, slots) => ({ id, code: id.slice(0, 7), name: id, credits: 3, slots });

test('궁합: 겹치는 공강 요일, 함께 비는 시간, 같은 점심, 같은 건물', () => {
  const a = [sec('A000001', [[0, 540, 690, '07-101'], [1, 780, 870, '15-201']])];
  const b = [sec('B000001', [[0, 600, 690, '07-305'], [1, 540, 630, '08-101']])];
  const r = compareTimetables(a, b);
  assert.deepEqual(r.freeDays, [2, 3, 4]);
  assert.deepEqual(r.lunches.map((l) => l.day), [0, 1]);
  assert.ok(r.windows.some((w) => w.day === 0 && w.start === 690 && w.end === 1080));
  assert.deepEqual(r.buildings, ['07']);
  assert.ok(r.score > 0 && r.score <= 100);
});

test('궁합: 결과에 상대의 수업 시각·과목이 들어가지 않는다', () => {
  const a = [sec('비밀과목A', [[0, 540, 690, '07-101']])];
  const b = [sec('비밀과목B', [[0, 600, 690, '07-305']])];
  const text = JSON.stringify(compareTimetables(a, b));
  assert.ok(!text.includes('비밀과목'));
  assert.ok(!text.includes('305'));
});

test('공유 링크값: 무작위 16글자, 매번 다름', () => {
  const tokens = new Set(Array.from({ length: 200 }, makeToken));
  assert.equal(tokens.size, 200);
  for (const t of tokens) assert.ok(TOKEN_PATTERN.test(t));
});

test('공유 공개본: 정해진 6개 값만, 사용자 ID·시간표·링크값 없음', () => {
  const entry = {
    nickname: '닉', dept: '컴퓨터공학부', year: 2, score: 80, grade: 'B+', title: '칭호', review: '평론',
    sectionIds: ['0004890001'], shareToken: 'secret-token-abc', items: [{ key: 'free' }], uid: 'uid-1', email: 'a@b.c',
  };
  const shared = publicShare(entry);
  assert.deepEqual(Object.keys(shared).sort(), ['dept', 'grade', 'nickname', 'review', 'score', 'title']);
  const text = JSON.stringify(shared);
  for (const secret of ['secret-token-abc', 'uid-1', 'a@b.c', '0004890001', 'free']) assert.ok(!text.includes(secret), secret);
});

test('궁합 공개본: 두 사람 정보는 닉네임·학과·칭호만', () => {
  const compat = {
    a: { nickname: '가', dept: 'X', title: '칭호', uid: 'u1' }, b: { nickname: '나', dept: 'Y', title: '칭호' },
    score: 50, freeDays: [], windows: [], lunches: [], buildings: ['07'], line: '해설', updated: { u1: 1 },
  };
  const out = publicCompat(compat);
  assert.deepEqual(Object.keys(out.a).sort(), ['dept', 'nickname', 'title']);
  assert.ok(!JSON.stringify(out).includes('u1'));
  assert.equal(out.buildings[0].code, '07');
});

test('AI 지시문: 궁합과 칭호 모두 교수·인물 평가 금지 문구 포함', () => {
  for (const task of ['compat', 'verdict']) assert.ok(PROMPTS[task].system.includes('교수'), task);
  assert.ok(!PROMPTS.verdict.system.includes('typeLine'));
});
