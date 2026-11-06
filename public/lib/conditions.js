// 시간표 조건의 형태. AI 응답은 믿지 않고 항상 이 함수로 걸러 쓴다.
import { WEEKDAYS } from './timetable.js';
import { MAX_CREDITS, MIN_CREDITS } from './score.js';

export const DEFAULT_CONDITIONS = {
  freeDays: [],
  noFirst: false,
  noNight: true,
  targetCredits: 18,
  wantKeywords: [],
  avoidKeywords: [],
  unsupported: [],
};

const strings = (value, limit) =>
  (Array.isArray(value) ? value : [])
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim().slice(0, 40))
    .slice(0, limit);

export function sanitizeConditions(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const freeDays = (Array.isArray(value.freeDays) ? value.freeDays : []).filter((d) => WEEKDAYS.includes(d));
  const credits = Number(value.targetCredits);
  return {
    freeDays: [...new Set(freeDays)].sort(),
    noFirst: value.noFirst === true,
    noNight: value.noNight !== false,
    targetCredits: Number.isInteger(credits)
      ? Math.max(MIN_CREDITS, Math.min(MAX_CREDITS, credits))
      : DEFAULT_CONDITIONS.targetCredits,
    wantKeywords: strings(value.wantKeywords, 5),
    avoidKeywords: strings(value.avoidKeywords, 5),
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
