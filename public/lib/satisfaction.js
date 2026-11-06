// 예상 만족도: 사용자가 말한 조건을 이 시간표가 얼마나 채웠나. 랭킹에는 쓰지 않는다.
// AI가 평가하고, AI가 실패하거나 결과가 규칙에 어긋나면 코드의 간이 계산을 쓴다.
import { DAY_NAMES, blocksByDay, formatTime } from './timetable.js';

const MAX_CHECKS = 5;
const MAX_REASON = 30;

// AI에 보내는 판단 재료. 코드가 계산한 사실만 담는다.
export function planFacts(plan, index) {
  const days = blocksByDay(plan.sections);
  const s = plan.score.stats;
  return {
    id: index + 1,
    학점: s.credits,
    '수업 없는 평일': [0, 1, 2, 3, 4].filter((d) => !days.has(d)).map((d) => DAY_NAMES[d]).join('') || '없음',
    요일별: [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, blocks]) => {
      let gap = 0;
      for (let i = 1; i < blocks.length; i++) gap = Math.max(gap, blocks[i].start - blocks[i - 1].end);
      return `${DAY_NAMES[day]} ${formatTime(blocks[0].start)}-${formatTime(blocks.at(-1).end)} 최장빈${gap}분`;
    }),
    // AI가 시각 목록을 잘못 읽은 사례가 있어(9시 수업을 「아침 없음」으로 판정) 판정용 수치를 직접 준다
    '10시 전 시작하는 날': s.firstPeriodDays,
    '18시 이후 수업': s.nightBlocks,
    '점심 있는 날': `${s.lunchDays}/${s.classDays}`,
    '2시간 이상 빈 시간': s.longGaps,
    '3연강': s.longRuns,
    과목: plan.sections.map((x) => `${x.name}(${x.type === '심화교양' || x.type === '핵심교양' || x.type === '기초교양' ? `${x.type} ${x.area}` : x.type})`),
  };
}

// 조건별로 충족 여부를 코드가 판정할 수 있는 것만 센다
const PREFERENCE_RULES = [
  { words: ['점심'], met: (s) => s.lunchDays === s.classDays },
  { words: ['우주', '사이', '빈 시간', '공강시간'], met: (s) => s.longGaps === 0 },
  { words: ['연강'], met: (s) => s.longRuns === 0 },
  { words: ['이동', '동선'], met: (s) => s.rushedMoves === 0 },
];

export function simpleSatisfaction(plan, conditions) {
  const s = plan.score.stats;
  const days = blocksByDay(plan.sections);
  const names = plan.sections.map((x) => x.name);
  const checks = [
    ...conditions.freeDays.map((d) => [`${DAY_NAMES[d]}요일 공강`, !days.has(d)]),
    ...(conditions.noFirst ? [['1교시 없음', s.firstPeriodDays === 0]] : []),
    ...(conditions.noNight ? [['야간 없음', s.nightBlocks === 0]] : []),
    [`${conditions.minCredits}~${conditions.maxCredits}학점`, s.credits >= conditions.minCredits && s.credits <= conditions.maxCredits],
    ...conditions.wantKeywords.map((w) => [`${w} 포함`, names.some((n) => n.includes(w))]),
    ...conditions.avoidKeywords.map((w) => [`${w} 제외`, !names.some((n) => n.includes(w))]),
    ...conditions.preferences.flatMap((text) => {
      const rule = PREFERENCE_RULES.find((r) => r.words.some((w) => text.includes(w)));
      return rule ? [[text, rule.met(s)]] : [];
    }),
  ].map(([label, met]) => ({ label, met, reason: '' }));
  const score = checks.length ? Math.round((checks.filter((c) => c.met).length / checks.length) * 100) : 100;
  return { score, checks: checks.slice(0, MAX_CHECKS + 3), source: 'simple' };
}

// 코드가 사실로 판정할 수 있는 희망은 AI 판정 대신 코드 판정을 쓴다.
// 11-06 실측: AI가 「10시 전 시작하는 날 2일」이라 적고도 「아침 수업 없음 충족」으로 판정했다.
function codeTruth(label, plan) {
  const s = plan.score.stats;
  const days = blocksByDay(plan.sections);
  const day = DAY_NAMES.slice(0, 5).findIndex((name) => label.includes(`${name}공강`) || label.includes(`${name}요일 공강`));
  if (day >= 0) return !days.has(day);
  if (/아침|1교시|9시/.test(label)) return s.firstPeriodDays === 0;
  if (label.includes('야간')) return s.nightBlocks === 0;
  if (label.includes('점심')) return s.lunchDays === s.classDays;
  if (/우주|사이|빈 시간/.test(label)) return s.longGaps === 0;
  if (label.includes('연강')) return s.longRuns === 0;
  return null;
}

// AI 응답을 후보별로 검사한다. 통과하지 못한 후보는 간이 계산을 쓴다.
// otherNames: 이 후보에 없는 과목 이름이 근거에 나오면 지어낸 것으로 보고 버린다.
export function readAiSatisfaction(parsed, plans, conditions, allNames) {
  const byId = new Map((Array.isArray(parsed?.plans) ? parsed.plans : []).map((p) => [p?.id, p]));
  return plans.map((plan, i) => {
    const raw = byId.get(i + 1);
    const own = new Set(plan.sections.map((s) => s.name));
    const invented = (text) => text.includes('교수') || allNames.some((n) => n.length > 2 && !own.has(n) && text.includes(n));
    const score = Number(raw?.score);
    const checks = (Array.isArray(raw?.checks) ? raw.checks : [])
      .filter((c) => Array.isArray(c) && typeof c[0] === 'string' && typeof c[2] === 'string')
      .map(([label, met, reason]) => ({ label: label.slice(0, 20), met: met === 1 || met === true, reason: reason.slice(0, MAX_REASON) }))
      .slice(0, MAX_CHECKS);
    const valid = Number.isInteger(score) && score >= 0 && score <= 100 && checks.length > 0
      && !checks.some((c) => invented(c.label) || invented(c.reason));
    if (!valid) return simpleSatisfaction(plan, conditions);
    let corrected = false;
    for (const check of checks) {
      const truth = codeTruth(check.label, plan);
      if (truth !== null && truth !== check.met) {
        check.met = truth;
        corrected = true;
      }
    }
    // 판정을 고쳤으면 AI 점수와 충족 비율의 평균으로 맞춘다
    const ratio = Math.round((checks.filter((c) => c.met).length / checks.length) * 100);
    return { score: corrected ? Math.round((score + ratio) / 2) : score, checks, source: corrected ? 'ai-corrected' : 'ai' };
  });
}

// 만족도 높은 순, 같으면 총점 높은 순
export const bySatisfaction = (a, b) => b.sat.score - a.sat.score || b.score.total - a.score.total;
