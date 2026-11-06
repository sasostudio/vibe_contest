// 순위 계산. 저장소를 모르는 순수 함수만 둔다.
// summary = { [uid]: { n: 닉네임, d: 학과, s: 점수, g: 등급, t: 칭호 } }
export const MIN_DEPT_MEMBERS = 3;
const PUBLIC_PEOPLE = 30;
const PUBLIC_DEPT_MEMBERS = 5;

const round1 = (value) => Math.round(value * 10) / 10;
const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
const byScore = (a, b) => b.s - a.s || a.n.localeCompare(b.n, 'ko');
const publicPerson = ({ n, d, s, g, t, sample }) => ({
  nickname: n, dept: d, score: s, grade: g, title: t, ...(sample ? { sample: true } : {}),
});

function groupByDept(summary) {
  const groups = new Map();
  for (const entry of Object.values(summary)) {
    if (!groups.has(entry.d)) groups.set(entry.d, []);
    groups.get(entry.d).push(entry);
  }
  return groups;
}

// 학과 점수 = 등록자 평균. 3명 이상만 순위에 들고, 동점이면 등록 인원이 많은 학과가 앞선다.
export function buildLeague(summary) {
  const depts = [...groupByDept(summary)].map(([dept, entries]) => ({
    dept,
    average: round1(average(entries.map((e) => e.s))),
    count: entries.length,
    top: [...entries].sort(byScore).slice(0, PUBLIC_DEPT_MEMBERS).map(publicPerson),
  }));
  const ranked = depts
    .filter((d) => d.count >= MIN_DEPT_MEMBERS)
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .map((d, i) => ({ ...d, rank: i + 1 }));
  const pending = depts
    .filter((d) => d.count < MIN_DEPT_MEMBERS)
    .sort((a, b) => b.count - a.count || a.dept.localeCompare(b.dept, 'ko'))
    .map((d) => ({ ...d, rank: null }));
  const people = Object.values(summary).sort(byScore);
  return {
    total: people.length,
    // 화면은 이 값이 1 이상이면 「시연용 가상 데이터」 표시를 띄운다
    sampleCount: people.filter((p) => p.sample).length,
    departments: [...ranked, ...pending],
    people: people.slice(0, PUBLIC_PEOPLE).map(publicPerson),
  };
}

// 나보다 점수가 높은 사람 수 + 1. 동점은 같은 순위다.
const rankIn = (entries, score) => entries.filter((e) => e.s > score).length + 1;

export function standingOf(summary, uid) {
  const me = summary[uid];
  if (!me) return null;
  const everyone = Object.values(summary);
  const mates = everyone.filter((e) => e.d === me.d);
  const others = mates.filter((e) => e !== me);
  const dept = buildLeague(summary).departments.find((d) => d.dept === me.d);
  return {
    overallRank: rankIn(everyone, me.s),
    overallTotal: everyone.length,
    deptRank: rankIn(mates, me.s),
    deptTotal: mates.length,
    deptAverage: dept.average,
    deptLeagueRank: dept.rank,
    needMembers: Math.max(0, MIN_DEPT_MEMBERS - mates.length),
    // 내가 없을 때와 비교해 학과 평균을 얼마나 올리거나 내렸는지
    contribution: others.length ? round1(average(mates.map((e) => e.s)) - average(others.map((e) => e.s))) : 0,
  };
}
