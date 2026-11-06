// 화면 공통 부품. 사용자가 입력한 글자는 전부 esc를 거쳐 넣는다.
import { DAY_NAMES, WEEKDAYS, formatTime } from '../lib/timetable.js';

const PIXELS_PER_HOUR = 44;

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export const pathLine = (...names) => `<p class="path">HOME &gt; ${names.map(esc).join(' &gt; ')}</p>`;

export const win = (title, body, extraClass = '') =>
  `<section class="win ${extraClass}"><h2 class="win-title">${esc(title)}</h2><div class="win-body">${body}</div></section>`;

// 여러 안을 나란히 볼 때 시간축이 같아야 비교가 된다. 그래서 범위를 밖에서 함께 구한다.
export function hourRange(plans) {
  const slots = plans.flatMap((sections) => sections.flatMap((s) => s.slots));
  if (slots.length === 0) return { from: 9, to: 18 };
  return {
    from: Math.min(9, Math.floor(Math.min(...slots.map((s) => s[1])) / 60)),
    to: Math.max(18, Math.ceil(Math.max(...slots.map((s) => s[2])) / 60)),
  };
}

export function timetableGrid(sections, range = hourRange([sections])) {
  const hasSaturday = sections.some((s) => s.slots.some((slot) => slot[0] === 5));
  const days = hasSaturday ? [...WEEKDAYS, 5] : WEEKDAYS;
  const height = (range.to - range.from) * PIXELS_PER_HOUR;
  const toY = (minute) => ((minute - range.from * 60) / 60) * PIXELS_PER_HOUR;
  const color = new Map(sections.map((s, i) => [s.id, `c${i % 8}`]));

  const head = `<div class="grid-head"></div>${days.map((d) => `<div class="grid-head">${DAY_NAMES[d]}</div>`).join('')}`;
  const hours = Array.from({ length: range.to - range.from }, (_, i) =>
    `<span style="top:${i * PIXELS_PER_HOUR + 2}px">${range.from + i}</span>`).join('');
  const columns = days.map((day) => {
    const blocks = sections.flatMap((s) => s.slots.filter((slot) => slot[0] === day).map((slot) => {
      const label = `${s.name} ${DAY_NAMES[day]} ${formatTime(slot[1])}~${formatTime(slot[2])} ${slot[3]}`;
      return `<div class="class ${color.get(s.id)}" title="${esc(label)}" style="top:${toY(slot[1])}px;height:${toY(slot[2]) - toY(slot[1])}px">${esc(s.name)}<small>${esc(slot[3])}</small></div>`;
    }));
    return `<div class="grid-day${blocks.length ? '' : ' free'}">${blocks.join('')}</div>`;
  }).join('');
  const online = sections.filter((s) => s.slots.length === 0);
  const note = online.length ? `<p class="hint">시간 없는 수업: ${online.map((s) => esc(s.name)).join(', ')}</p>` : '';
  return `<div class="grid" style="--days:${days.length};--height:${height}px;--hour:${PIXELS_PER_HOUR}px">${head}<div class="grid-hours">${hours}</div>${columns}</div>${note}`;
}

export function scoreTable(items) {
  const rows = items.map((i) =>
    `<tr><th scope="row">${esc(i.label)}</th><td>${esc(i.detail)}</td><td class="num">${i.points} / ${i.max}</td></tr>`).join('');
  return `<div class="scroll"><table><thead><tr><th>심사 항목</th><th>내역</th><th class="num">점수</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const dialogRoot = () => document.getElementById('dialog');

export function closeDialog() {
  dialogRoot().innerHTML = '';
}

export function openDialog(title, body) {
  dialogRoot().innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2 class="win-title">${esc(title)}</h2><div class="modal-body">${body}</div></div></div>`;
  return dialogRoot().querySelector('.modal');
}

export function showBusy(message) {
  openDialog('처리 중', `<div class="busy"><p>${esc(message)}</p><div class="bar"></div></div>`);
}

export function showAlert(title, lines) {
  const modal = openDialog(title, `${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<div class="row row-end"><button class="btn" data-close>확인</button></div>`);
  const button = modal.querySelector('[data-close]');
  button.addEventListener('click', closeDialog);
  button.focus();
}
