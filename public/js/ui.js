// 화면 공통 부품. 사용자가 입력한 글자는 전부 esc를 거쳐 넣는다.
import { DAY_NAMES, WEEKDAYS, formatTime } from '../lib/timetable.js';

const PIXELS_PER_HOUR = 44;
const STEP_NAMES = ['학적 입력', '과목 확인', '조건 접수', '편성 결과', '심사 결과', '내 현황', '학과 대항전'];
const NOTICE = '1교시 신청자는 본인 의사임을 재확인하시기 바랍니다 · 공강은 학칙상 권리가 아니라 실력입니다';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// 화면 머리글. 위쪽 막대의 현재 위치도 함께 바꾼다. 마지막 이름이 화면 제목이다.
export function pathLine(...names) {
  const crumbs = document.getElementById('crumbs');
  if (crumbs) crumbs.innerHTML = ['홈', ...names].map((n, i, all) => (i === all.length - 1 ? `<b>${esc(n)}</b>` : esc(n))).join(' › ');
  const title = names.at(-1);
  const step = STEP_NAMES.indexOf(title);
  return `<div class="page-head">
    <h1>${esc(title)}${step >= 0 ? ` <span class="step-pill">${step + 1} / ${STEP_NAMES.length}</span>` : ''}</h1>
    <p class="notice-pill"><b>공지</b> · ${NOTICE}</p>
  </div>`;
}

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

// marks: 분반 번호 → 덧붙일 클래스 (미리보기 'ghost', 겹침 'clash', 예상 배정 'guess')
export function timetableGrid(sections, range = hourRange([sections]), marks = {}) {
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
      return `<div class="class ${color.get(s.id)} ${marks[s.id] ?? ''}" title="${esc(label)}" style="top:${toY(slot[1])}px;height:${toY(slot[2]) - toY(slot[1])}px">${esc(s.name)}<small>${esc(slot[3])}</small></div>`;
    }));
    return `<div class="grid-day${blocks.length ? '' : ' free'}">${blocks.join('')}</div>`;
  }).join('');
  const online = sections.filter((s) => s.slots.length === 0);
  const note = online.length ? `<p class="hint">시간 없는 수업: ${online.map((s) => esc(s.name)).join(', ')}</p>` : '';
  return `<div class="grid" style="--days:${days.length};--height:${height}px;--hour:${PIXELS_PER_HOUR}px">${head}<div class="grid-hours">${hours}</div>${columns}</div>${note}`;
}

// 항목별 점수. 만점의 절반 미만이면 주황 막대로 약점을 드러낸다.
export function scoreTable(items) {
  const total = items.reduce((sum, i) => sum + i.points, 0);
  const max = items.reduce((sum, i) => sum + i.max, 0);
  const rows = items.map((i) => {
    const ratio = i.max ? i.points / i.max : 0;
    return `<div class="score-row">
      <span class="score-label">${esc(i.label)}</span>
      <span class="score-detail">${esc(i.detail)}<span class="bar${ratio < 0.5 ? ' low' : ''}"><i style="width:${Math.round(ratio * 100)}%"></i></span></span>
      <span class="score-num">${i.points} / ${i.max}</span>
    </div>`;
  }).join('');
  return `<div class="score-list"><div class="score-sum">총점 ${total} / ${max}</div>${rows}</div>`;
}

const dialogRoot = () => document.getElementById('dialog');

export function closeDialog() {
  clearInterval(busyTimer);
  clearInterval(runTimer);
  dialogRoot().innerHTML = '';
}

export function openDialog(title, body) {
  dialogRoot().innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2 class="win-title">${esc(title)}</h2><div class="modal-body">${body}</div></div></div>`;
  return dialogRoot().querySelector('.modal');
}

// 대기 창. 달리는 횃불이 3프레임을 130ms 간격으로 돌린다(실제 비동기 작업이 있을 때만 부른다).
// 사람이 몰려 AI가 줄을 서면 몇 초째인지 보여 준다. closeDialog가 두 타이머를 모두 멈춘다.
let busyTimer = null;
let runTimer = null;
const BUSY_NOTE_AFTER_S = 4;
const RUN_FRAMES = ['img/mascot/run-1.png', 'img/mascot/run-2.png', 'img/mascot/run-3.png'];
const RUN_FRAME_MS = 130;
for (const src of RUN_FRAMES) new Image().src = src; // 첫 재생 때 깜빡이지 않게 미리 받는다

export function showBusy(message) {
  openDialog('처리 중', `<div class="busy">
    <img class="runner" src="${RUN_FRAMES[0]}" alt="" width="110" height="158">
    <p>${esc(message)}</p>
    <p class="hint" id="busy-wait"></p>
  </div>`);
  const started = Date.now();
  clearInterval(busyTimer);
  clearInterval(runTimer);
  busyTimer = setInterval(() => {
    const note = document.getElementById('busy-wait');
    if (!note) return clearInterval(busyTimer);
    const seconds = Math.floor((Date.now() - started) / 1000);
    if (seconds >= BUSY_NOTE_AFTER_S) note.textContent = `${seconds}초 경과 · 이용자가 몰려 AI가 차례로 처리하고 있습니다. 오래 걸리면 코드가 대신 계산합니다.`;
  }, 1000);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // 첫 프레임 정지 화면
  let frame = 0;
  runTimer = setInterval(() => {
    const img = dialogRoot().querySelector('.runner');
    if (!img) return clearInterval(runTimer);
    frame = (frame + 1) % RUN_FRAMES.length;
    img.src = RUN_FRAMES[frame];
  }, RUN_FRAME_MS);
}

export function showAlert(title, lines) {
  const modal = openDialog(title, `${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<div class="row row-end"><button class="btn btn-go" data-close>확인</button></div>`);
  const button = modal.querySelector('[data-close]');
  button.addEventListener('click', closeDialog);
  button.focus();
}
