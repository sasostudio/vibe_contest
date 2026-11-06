import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLeague, standingOf } from '../lib/league.js';

const person = (n, d, s) => ({ n, d, s, g: 'B0', t: '칭호' });

const summary = {
  a: person('가', '컴퓨터공학부', 90),
  b: person('나', '컴퓨터공학부', 80),
  c: person('다', '컴퓨터공학부', 70),
  d: person('라', '경영학부', 85),
  e: person('마', '경영학부', 80),
  f: person('바', '경영학부', 75),
  g: person('사', '경영학부', 80),
  h: person('아', '물리학과', 100),
};

test('학과 점수는 평균, 3명 미만은 순위 없음', () => {
  const { departments } = buildLeague(summary);
  const physics = departments.find((d) => d.dept === '물리학과');
  assert.equal(physics.rank, null);
  assert.equal(departments.at(-1).dept, '물리학과');
});

test('평균 동점이면 등록 인원이 많은 학과가 앞선다', () => {
  const { departments } = buildLeague(summary);
  assert.equal(departments[0].dept, '경영학부');
  assert.equal(departments[0].rank, 1);
  assert.equal(departments[1].dept, '컴퓨터공학부');
  assert.equal(departments[1].rank, 2);
});

test('공개 자료에 uid가 없다', () => {
  const text = JSON.stringify(buildLeague({ 'secret-uid-1': person('가', '컴퓨터공학부', 90) }));
  assert.ok(!text.includes('secret-uid-1'));
});

test('내 현황: 순위와 기여도', () => {
  const me = standingOf(summary, 'a');
  assert.equal(me.overallRank, 2);
  assert.equal(me.overallTotal, 8);
  assert.equal(me.deptRank, 1);
  assert.equal(me.deptTotal, 3);
  assert.equal(me.deptLeagueRank, 2);
  assert.equal(me.contribution, 5);
});

test('내 현황: 동점은 같은 순위', () => {
  assert.equal(standingOf(summary, 'e').deptRank, standingOf(summary, 'g').deptRank);
});

test('내 현황: 학과 인원이 모자라면 필요 인원 표시', () => {
  const me = standingOf(summary, 'h');
  assert.equal(me.deptLeagueRank, null);
  assert.equal(me.needMembers, 2);
  assert.equal(me.contribution, 0);
});

test('미등록자는 현황 없음', () => {
  assert.equal(standingOf(summary, '없음'), null);
});

test('빈 리그', () => {
  assert.deepEqual(buildLeague({}), { total: 0, sampleCount: 0, departments: [], people: [] });
});

test('가상 데이터가 있으면 개수와 표시 값을 내보낸다', () => {
  const league = buildLeague({ a: { ...person('가', '컴퓨터공학부', 90), sample: true }, b: person('나', '컴퓨터공학부', 80) });
  assert.equal(league.sampleCount, 1);
  assert.equal(league.people[0].sample, true);
  assert.equal(league.people[1].sample, undefined);
});

test('실제 데이터만 있으면 가상 표시가 없다', () => {
  assert.equal(buildLeague(summary).sampleCount, 0);
});
