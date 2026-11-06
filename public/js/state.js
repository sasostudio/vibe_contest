// 브라우저에 남기는 진행 상태. 점수의 근거가 아니라 다시 열었을 때 이어 가기 위한 값이다.
import { DEFAULT_CONDITIONS } from '../lib/conditions.js';

const KEY = 'timetable-league-v1';

const initial = () => ({
  profile: null, // { dept, year, nickname, creditCap }
  selectedKeys: null, // 담은 과목 키. null이면 아직 추천을 적용하지 않은 상태
  extraKeys: [], // 검색으로 추가한 과목 키
  pinned: {}, // 과목 키 → 고정한 분반 번호. 없으면 자동 배정
  generalMarks: {}, // 교양 과목 키 → 'want' 희망 | 'avoid' 피할 | 'taken' 이미 수강. 희망은 selectedKeys에도 들어간다
  courseTab: 'major', // 과목 화면에서 연 탭
  generalArea: '학문의기초', // 교양 탭에서 연 영역
  conditionText: '',
  conditions: { ...DEFAULT_CONDITIONS },
  plans: null, // [{ ids: [분반 번호], sat: 예상 만족도 }]
  diagnosis: null,
  result: null, // 서버가 돌려준 { entry, standing }
  pendingCompat: null, // 친구 링크에서 궁합을 누른 뒤 등록하러 간 경우 그 링크값. 등록이 끝나면 궁합으로 돌아온다
});

function load() {
  try {
    return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return initial();
  }
}

export const state = load();

// 작성 기록 초기화: 학적, 고른 과목, 조건, 편성 결과를 처음 상태로 돌린다
export function resetState() {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, initial());
  save();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 저장이 막힌 브라우저에서도 이번 방문 안에서는 계속 동작한다
  }
}
