// 4·5번 화면. 말로 쓴 조건을 AI가 조건표로 옮기고, 사용자가 확인해 편성을 실행한다.
// AI가 실패해도 조건표가 그대로 입력 수단이라 흐름이 끊기지 않는다.
import { DATA } from '../../data/courses.js';
import { GENERAL_AREAS, parseAiJson, sanitizeConditions } from '../../lib/conditions.js';
import { generatePlans } from '../../lib/planner.js';
import { DAY_NAMES, WEEKDAYS } from '../../lib/timetable.js';
import { askAi } from '../api.js';
import { closeDialog, esc, pathLine, showBusy, win } from '../ui.js';
import { save, state } from '../state.js';
import { coursesByKeys } from './courses.js';

const CREDIT_STEPS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const MAX_TEXT = 400;
const COMPOSE_DELAY_MS = 400;

const splitWords = (text) => text.split(',').map((w) => w.trim()).filter(Boolean);
const areaLabel = (area) => area.replace('(핵심)', '');

function readForm(view) {
  return sanitizeConditions({
    freeDays: [...view.querySelectorAll('[data-day]:checked')].map((box) => Number(box.dataset.day)),
    noFirst: view.querySelector('#no-first').checked,
    noNight: view.querySelector('#no-night').checked,
    minCredits: Number(view.querySelector('#min-credits').value),
    maxCredits: Number(view.querySelector('#max-credits').value),
    areas: [...view.querySelectorAll('[data-area]:checked')].map((box) => box.dataset.area),
    wantKeywords: splitWords(view.querySelector('#want').value),
    avoidKeywords: splitWords(view.querySelector('#avoid').value),
    preferences: state.conditions.preferences,
    unsupported: state.conditions.unsupported,
  });
}

const listBox = (title, items) => (items.length
  ? `<div class="box-note"><b>${title}</b><ul>${items.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`
  : '');

function paintForm(view) {
  const c = state.conditions;
  for (const box of view.querySelectorAll('[data-day]')) box.checked = c.freeDays.includes(Number(box.dataset.day));
  for (const box of view.querySelectorAll('[data-area]')) box.checked = c.areas.includes(box.dataset.area);
  view.querySelector('#no-first').checked = c.noFirst;
  view.querySelector('#no-night').checked = c.noNight;
  view.querySelector('#min-credits').value = String(c.minCredits);
  view.querySelector('#max-credits').value = String(c.maxCredits);
  view.querySelector('#want').value = c.wantKeywords.join(', ');
  view.querySelector('#avoid').value = c.avoidKeywords.join(', ');
  view.querySelector('#extra').innerHTML =
    listBox('예상 만족도 평가에 반영할 희망', c.preferences) +
    listBox('시간표로는 해결할 수 없는 요청', c.unsupported);
}

const areaRows = () => Object.entries(GENERAL_AREAS).map(([type, areas]) =>
  `<div><span class="tag">${type}</span> ${areas.map((a) =>
    `<label class="check"><input type="checkbox" data-area="${esc(a)}">${esc(areaLabel(a))}</label>`).join('')}</div>`).join('');

export function runPlanner() {
  const courses = coursesByKeys(state.selectedKeys).map((course) => {
    const pinned = state.pinned?.[course.key];
    const only = course.sections.filter((s) => s.id === pinned);
    return only.length ? { ...course, sections: only } : course;
  });
  const { plans, diagnosis } = generatePlans(DATA, state.profile, courses, state.conditions);
  state.plans = plans.map((plan) => ({ ids: plan.sections.map((s) => s.id), sat: null }));
  state.diagnosis = diagnosis;
  save();
}

export function showConditions(view) {
  if (!state.profile || state.selectedKeys === null) {
    location.hash = '#/profile';
    return;
  }
  // 이전 버전에서 저장된 조건에도 새 칸이 생기도록 한 번 걸러 쓴다
  state.conditions = sanitizeConditions(state.conditions);
  const dayBoxes = WEEKDAYS.map((d) =>
    `<label class="check"><input type="checkbox" data-day="${d}">${DAY_NAMES[d]}</label>`).join('');
  const steps = CREDIT_STEPS.map((c) => `<option value="${c}">${c}학점</option>`).join('');

  view.innerHTML = `${pathLine('시간표 편성 신청', '조건 접수')}
    ${win('희망사항 접수', `
      <label for="wish">원하는 시간표를 말로 적으십시오.</label>
      <textarea id="wish" maxlength="${MAX_TEXT}" placeholder="예: 금공강이면 좋겠고 아침 수업은 싫어. 15학점 이상, 수업 사이에 길게 비는 건 싫어.">${esc(state.conditionText)}</textarea>
      <div class="row"><button class="btn" id="to-conditions">AI로 조건 정리</button><span class="hint" id="ai-status"></span></div>`)}
    ${win('조건 확인', `
      <p class="hint">아래 값으로 편성합니다. 직접 고칠 수 있습니다.</p>
      <table class="form"><tbody>
        <tr><th scope="row">공강 요일</th><td>${dayBoxes}</td></tr>
        <tr><th scope="row">시간대</th><td>
          <label class="check"><input type="checkbox" id="no-first">1교시 제외</label>
          <label class="check"><input type="checkbox" id="no-night">야간 제외</label>
        </td></tr>
        <tr><th scope="row">학점 범위</th><td>
          <label for="min-credits">최소</label> <select id="min-credits">${steps}</select>
          ~ <label for="max-credits">최대</label> <select id="max-credits">${steps}</select>
          <span class="hint">학적의 학점 상한 ${state.profile.creditCap}학점을 넘지 않습니다.</span>
        </td></tr>
        <tr><th scope="row">교양 영역</th><td>${areaRows()}<p class="hint">아무것도 고르지 않으면 모든 영역에서 채웁니다.</p></td></tr>
        <tr><th scope="row"><label for="want">듣고 싶은 교양</label></th><td><input id="want" type="text" placeholder="쉼표로 구분"></td></tr>
        <tr><th scope="row"><label for="avoid">피할 과목</label></th><td><input id="avoid" type="text" placeholder="쉼표로 구분"></td></tr>
      </tbody></table>
      <div id="extra"></div>`)}
    <div class="row row-end"><a class="btn" href="#/courses">이전</a><button class="btn btn-go btn-big" id="run">시간표 편성 실행</button></div>`;
  paintForm(view);

  const status = view.querySelector('#ai-status');
  view.querySelector('#to-conditions').addEventListener('click', async (event) => {
    const text = view.querySelector('#wish').value.trim();
    if (!text) {
      status.textContent = '희망사항을 먼저 적으십시오. 아래 조건표로 바로 입력해도 됩니다.';
      return;
    }
    event.target.disabled = true;
    status.textContent = 'AI가 조건을 정리하는 중입니다.';
    const answer = await askAi('conditions', text);
    const parsed = answer ? parseAiJson(answer) : null;
    event.target.disabled = false;
    state.conditionText = text;
    if (!parsed) {
      status.textContent = 'AI 연결에 실패했습니다. 아래 조건표로 입력하면 그대로 편성됩니다.';
      save();
      return;
    }
    state.conditions = sanitizeConditions(parsed);
    save();
    paintForm(view);
    status.textContent = '조건을 정리했습니다. 아래 내용을 확인하십시오.';
  });

  view.querySelector('#run').addEventListener('click', () => {
    state.conditionText = view.querySelector('#wish').value.trim();
    state.conditions = readForm(view);
    showBusy('수강 가능한 조합을 심사하고 있습니다.');
    // 대기 창이 먼저 그려지도록 계산을 한 박자 늦춘다
    setTimeout(() => {
      runPlanner();
      closeDialog();
      location.hash = '#/plans';
    }, COMPOSE_DELAY_MS);
  });
}
