// 시간표 조건의 형태. AI 응답은 믿지 않고 항상 이 함수로 걸러 쓴다.
import { WEEKDAYS } from './timetable.js';
import { MAX_CREDITS, MIN_CREDITS } from './score.js';

// 종합강의시간표의 교양 이수영역 값 그대로. tests/timetable.test.js가 자료와 일치하는지 검사한다.
export const GENERAL_AREAS = {
  기초교양: ['학문의기초', '기초과학ㆍ공학'],
  핵심교양: ['(핵심)인문', '(핵심)사회', '(핵심)외국어', '(핵심)예술체육', '(핵심)과학기술', '(핵심)INU세미나'],
  심화교양: ['인문', '사회', '외국어', '예술체육', '과학기술'],
};
const ALL_AREAS = Object.values(GENERAL_AREAS).flat();

export const DEFAULT_CONDITIONS = {
  freeDays: [],
  noFirst: false,
  avoidMorning: false, // 12시 전 수업을 가능하면 피함 (반드시 빼지는 않음)
  noNight: true,
  minCredits: 15,
  maxCredits: 18,
  areas: [], // 비어 있으면 모든 교양 영역
  wantKeywords: [],
  avoidKeywords: [],
  preferences: [], // 조건표로 못 옮긴 희망. 예상 만족도 평가에만 쓴다
  unsupported: [], // 시간표로는 해결할 수 없는 요청
};

const strings = (value, limit) =>
  (Array.isArray(value) ? value : [])
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim().slice(0, 40))
    .slice(0, limit);

const creditOr = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(MIN_CREDITS, Math.min(MAX_CREDITS, n)) : fallback;
};

export function sanitizeConditions(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const freeDays = (Array.isArray(value.freeDays) ? value.freeDays : []).filter((d) => WEEKDAYS.includes(d));
  const minCredits = creditOr(value.minCredits, DEFAULT_CONDITIONS.minCredits);
  const maxCredits = Math.max(minCredits, creditOr(value.maxCredits, Math.max(minCredits, DEFAULT_CONDITIONS.maxCredits)));
  return {
    freeDays: [...new Set(freeDays)].sort(),
    noFirst: value.noFirst === true,
    avoidMorning: value.avoidMorning === true,
    noNight: value.noNight !== false,
    minCredits,
    maxCredits,
    areas: [...new Set(strings(value.areas, ALL_AREAS.length).filter((a) => ALL_AREAS.includes(a)))],
    wantKeywords: strings(value.wantKeywords, 5),
    avoidKeywords: strings(value.avoidKeywords, 5),
    preferences: strings(value.preferences, 6),
    unsupported: strings(value.unsupported, 5),
  };
}

// AI가 코드블록으로 감싸거나 앞뒤 문장을 붙여도 JSON 본문만 꺼낸다. 실패하면 null.
export function parseAiJson(text) {
  const start = String(text).indexOf('{');
  const end = String(text).lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(String(text).slice(start, end + 1));
  } catch {
    return null;
  }
}
