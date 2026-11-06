import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, classifyType } from '../public/lib/mbti.js';
import { compareTimetables } from '../public/lib/compat.js';
import { TOKEN_PATTERN, makeToken, publicCompat, publicShare } from '../lib/share.js';
import { PROMPTS } from '../prompts/index.js';

const sec = (id, slots) => ({ id, code: id.slice(0, 7), name: id, credits: 3, slots });

test('유형: 8개 고정, 이름과 설명이 있고 영문 코드는 없다', () => {
  assert.equal(Object.keys(TYPES).length, 8);
  for (const t of Object.values(TYPES)) {
    assert.ok(t.name && t.blurb);
    assert.equal(t.code, undefined);
  }
});

test('유형: 아침에 한 건물에서 몰아 들으면 출근 도장형', () => {
  const s = [sec('A000001', [[0, 540, 690, '07-101'], [2, 540, 690, '07-102']])];
  assert.equal(classifyType(s).id, 'early-block-home');
});

test('유형: 오후에 여러 건물로 매일 나오면 자유로운 방랑자형', () => {
  const s = [0, 1, 2, 3, 4].map((d) => sec(`B00000${d}`, [[d, 900, 990, `${10 + d}-101`]]));
  assert.equal(classifyType(s).id, 'late-spread-roam');
});

test('유형: 8개 모두 나올 수 있다', () => {
  const ids = new Set();
  for (const early of [true, false]) for (const block of [true, false]) for (const home of [true, false]) {
    const days = block ? [0, 1] : [0, 1, 2, 3];
    const start = early ? 540 : 900;
    const s = days.map((d, i) => sec(`C0000${d}${i}`, [[d, start, start + 75, home ? '07-101' : `${20 + i}-101`]]));
    ids.add(classifyType(s).id);
  }
  assert.equal(ids.size, 8);
});

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

test('공유 공개본: 정해진 7개 값만, 사용자 ID·시간표·링크값 없음', () => {
  const entry = {
    nickname: '닉', dept: '컴퓨터공학부', year: 2, score: 80, grade: 'B+', title: '칭호', review: '평론',
    sectionIds: ['0004890001'], shareToken: 'secret-token-abc', typeId: 'late-block-home', typeLine: '설명', uid: 'uid-1', email: 'a@b.c',
  };
  const shared = publicShare(entry);
  assert.deepEqual(Object.keys(shared).sort(), ['dept', 'grade', 'nickname', 'score', 'title', 'typeId', 'typeLine', 'typeName'].sort());
  const text = JSON.stringify(shared);
  for (const secret of ['secret-token-abc', 'uid-1', 'a@b.c', '0004890001', '평론']) assert.ok(!text.includes(secret), secret);
});

test('궁합 공개본: 두 사람 정보는 닉네임·학과·유형 이름만', () => {
  const compat = {
    a: { nickname: '가', dept: 'X', typeName: '유형', uid: 'u1' }, b: { nickname: '나', dept: 'Y', typeName: '유형' },
    score: 50, freeDays: [], windows: [], lunches: [], buildings: ['07'], line: '해설', updated: { u1: 1 },
  };
  const out = publicCompat(compat);
  assert.deepEqual(Object.keys(out.a).sort(), ['dept', 'nickname', 'typeName']);
  assert.ok(!JSON.stringify(out).includes('u1'));
  assert.equal(out.buildings[0].code, '07');
});

test('AI 지시문: 궁합과 칭호 모두 교수·인물 평가 금지 문구 포함', () => {
  for (const task of ['compat', 'verdict']) assert.ok(PROMPTS[task].system.includes('교수'), task);
  assert.ok(PROMPTS.verdict.system.includes('typeLine'));
});
