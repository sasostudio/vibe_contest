// 시간표 유형 표시. 그림(public/img/types/{id}.png)이 있으면 함께, 없으면 글만.
import { TYPES, classifyType, typeImage } from '../lib/mbti.js';
import { esc } from './ui.js';

// 유형 판정 이전에 등록한 기록은 시간표로 다시 판정한다
export function typeOfEntry(entry, sections) {
  const id = TYPES[entry.typeId] ? entry.typeId : classifyType(sections).id;
  return { id, name: TYPES[id].name, line: entry.typeLine || TYPES[id].blurb };
}

export const typeCardHtml = ({ id, name, line }) => `<div class="type-card">
  <img class="type-img" src="${typeImage(id)}" alt="" onerror="this.remove()">
  <p class="type-name">${esc(name)}</p>
  <p class="type-line">${esc(line)}</p>
</div>`;
