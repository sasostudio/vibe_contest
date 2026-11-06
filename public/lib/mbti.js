// 시간표 MBTI. 대표 시간표의 시간 분포로 코드가 판정한다. AI는 유형 설명 한 줄만 쓴다.
// 축 3개 × 2 = 8유형 고정. 그림은 public/img/types/{id}.png 에 넣으면 화면이 자동으로 쓴다.
import { buildingOf } from './timetable.js';

const NOON_SPLIT = 13 * 60; // 이 시각 전 수업 시간이 더 많으면 아침형
const BLOCK_MAX_DAYS = 3; // 수업 있는 요일이 3일 이하면 몰아 듣기
const HOME_SHARE = 0.6; // 한 건물 비중이 60% 이상이면 붙박이

export const TYPES = {
  'early-block-home': { name: '출근 도장형', blurb: '아침부터 한 건물에 몰아 듣고 일찍 퇴근합니다.' },
  'early-block-roam': { name: '아침 마라토너형', blurb: '아침에 몰아 듣느라 건물 사이를 뛰어다닙니다.' },
  'early-spread-home': { name: '개근 반장형', blurb: '매일 아침 같은 건물로 성실하게 등교합니다.' },
  'early-spread-roam': { name: '캠퍼스 산책가형', blurb: '매일 아침 캠퍼스 이곳저곳을 돌아다닙니다.' },
  'late-block-home': { name: '오후 몰아치기 장인형', blurb: '늦게 시작해 한 건물에서 몰아치고 끝냅니다.' },
  'late-block-roam': { name: '오후 원정대형', blurb: '오후에 몰아서 여러 건물을 원정합니다.' },
  'late-spread-home': { name: '느긋한 터줏대감형', blurb: '천천히 나와 익숙한 건물에 머무릅니다.' },
  'late-spread-roam': { name: '자유로운 방랑자형', blurb: '여유롭게 나와 캠퍼스를 떠돕니다.' },
};

export const typeImage = (id) => `img/types/${id}.png`;

// 반환: { id, name, blurb, axes } — axes는 판정 근거 수치. 화면에는 이름만 보여 준다(13:33 관리자: 영문 코드 없음)
export function classifyType(sections) {
  const slots = sections.flatMap((s) => s.slots);
  let before = 0;
  let after = 0;
  for (const [, start, end] of slots) {
    before += Math.max(0, Math.min(end, NOON_SPLIT) - start);
    after += Math.max(0, end - Math.max(start, NOON_SPLIT));
  }
  const days = new Set(slots.map((s) => s[0]).filter((d) => d < 5)).size;
  const buildings = new Map();
  for (const slot of slots) buildings.set(buildingOf(slot[3]), (buildings.get(buildingOf(slot[3])) ?? 0) + 1);
  const topShare = slots.length ? Math.max(...buildings.values()) / slots.length : 0;

  const early = before >= after;
  const block = days <= BLOCK_MAX_DAYS;
  const home = topShare >= HOME_SHARE;
  const id = `${early ? 'early' : 'late'}-${block ? 'block' : 'spread'}-${home ? 'home' : 'roam'}`;
  return {
    id,
    ...TYPES[id],
    axes: { 오전수업분: before, 오후수업분: after, 수업요일: days, 최다건물비중: Math.round(topShare * 100) },
  };
}
