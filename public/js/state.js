// 브라우저에 남기는 진행 상태. 점수의 근거가 아니라 다시 열었을 때 이어 가기 위한 값이다.
import { DEFAULT_CONDITIONS } from '../lib/conditions.js';

const KEY = 'timetable-league-v1';

const initial = () => ({
  profile: null, // { dept, year, nickname, creditCap }
  selectedKeys: null, // 담은 과목 키. null이면 아직 추천을 적용하지 않은 상태
  extraKeys: [], // 검색으로 추가한 과목 키
  conditionText: '',
  conditions: { ...DEFAULT_CONDITIONS },
  plans: null, // [{ ids: [분반 번호], note }]
  diagnosis: null,
  result: null, // 서버가 돌려준 { entry, standing }
});

function load() {
  try {
    return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return initial();
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장이 막힌 브라우저에서도 이번 방문 안에서는 계속 동작한다
  }
}
