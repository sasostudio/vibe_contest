// 4·5번 화면. 말로 쓴 조건을 AI가 체크박스로 옮기고, 사용자가 확인해 편성을 실행한다.
// AI가 실패해도 체크박스가 그대로 입력 수단이라 흐름이 끊기지 않는다.
import { DATA } from '../../data/courses.js';
import { parseAiJson, sanitizeConditions } from '../../lib/conditions.js';
import { generatePlans } from '../../lib/planner.js';
import { DAY_NAMES, WEEKDAYS } from '../../lib/timetable.js';
import { askAi } from '../api.js';
import { closeDialog, esc, pathLine, showBusy, win } from '../ui.js';
import { save, state } from '../state.js';
import { coursesByKeys } from './courses.js';

const CREDIT_TARGETS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const MAX_TEXT = 400;
const COMPOSE_DELAY_MS = 500;

const splitWords = (text) => text.split(',').map((w) => w.trim()).filter(Boolean);

function readForm(view) {
  return sanitizeConditions({
    freeDays: [...view.querySelectorAll('[data-day]:checked')].map((box) => Number(box.dataset.day)),
    noFirst: view.querySelector('#no-first').checked,
    noNight: view.querySelector('#no-night').checked,
    targetCredits: Number(view.querySelector('#target').value),
    wantKeywords: splitWords(view.querySelector('#want').value),
    avoidKeywords: splitWords(view.querySelector('#avoid').value),
    unsupported: state.conditions.unsupported,
  });
}

function paintForm(view) {
  const c = state.conditions;
  for (const box of view.querySelectorAll('[data-day]')) box.checked = c.freeDays.includes(Number(box.dataset.day));
  view.querySelector('#no-first').checked = c.noFirst;
  view.querySelector('#no-night').checked = c.noNight;
  view.querySelector('#target').value = String(c.targetCredits);
  view.querySelector('#want').value = c.wantKeywords.join(', ');
  view.querySelector('#avoid').value = c.avoidKeywords.join(', ');
  view.querySelector('#unsupported').innerHTML = c.unsupported.length
    ? `<div class="box-note"><b>시간표 계산으로 처리할 수 없는 요청</b><ul>${c.unsupported.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></div>`
    : '';
}

export function runPlanner() {
  const courses = coursesByKeys(state.selectedKeys);
  const { plans, diagnosis } = generatePlans(DATA, state.profile, courses, state.conditions);
  state.plans = plans.map((plan) => ({ ids: plan.sections.map((s) => s.id), note: null }));
  state.diagnosis = diagnosis;
  save();
}

export function showConditions(view) {
  if (!state.profile || state.selectedKeys === null) {
    location.hash = '#/profile';
    return;
  }
  const dayBoxes = WEEKDAYS.map((d) =>
    `<label class="check"><input type="checkbox" data-day="${d}">${DAY_NAMES[d]}</label>`).join('');
  const targets = CREDIT_TARGETS.map((c) => `<option value="${c}">${c}학점</option>`).join('');

  view.innerHTML = `${pathLine('시간표 편성 신청', '조건 접수')}
    ${win('희망사항 접수', `
      <label for="wish">원하는 시간표를 말로 적으십시오.</label>
      <textarea id="wish" maxlength="${MAX_TEXT}" placeholder="예: 금공강이면 좋겠고 아침 수업은 싫어. 15학점 정도로 듣고 싶어.">${esc(state.conditionText)}</textarea>
      <div class="row"><button class="btn" id="to-conditions">AI로 조건 정리</button><span class="hint" id="ai-status"></span></div>`)}
    ${win('조건 확인', `
      <p class="hint">아래 값으로 편성합니다. 직접 고칠 수 있습니다.</p>
      <table class="form"><tbody>
        <tr><th scope="row">공강 요일</th><td>${dayBoxes}</td></tr>
        <tr><th scope="row">시간대</th><td>
          <label class="check"><input type="checkbox" id="no-first">1교시 제외</label>
          <label class="check"><input type="checkbox" id="no-night">야간 제외</label>
        </td></tr>
        <tr><th scope="row"><label for="target">목표 학점</label></th><td><select id="target">${targets}</select></td></tr>
        <tr><th scope="row"><label for="want">듣고 싶은 교양</label></th><td><input id="want" type="text" placeholder="쉼표로 구분"></td></tr>
        <tr><th scope="row"><label for="avoid">피할 과목</label></th><td><input id="avoid" type="text" placeholder="쉼표로 구분"></td></tr>
      </tbody></table>
      <div id="unsupported"></div>`)}
    <div class="row row-end"><a class="btn" href="#/courses">이전</a><button class="btn btn-go btn-big" id="run">시간표 편성 실행</button></div>`;
  paintForm(view);

  const status = view.querySelector('#ai-status');
  view.querySelector('#to-conditions').addEventListener('click', async (event) => {
    const text = view.querySelector('#wish').value.trim();
    if (!text) {
      status.textContent = '희망사항을 먼저 적으십시오. 아래 체크박스로 바로 입력해도 됩니다.';
      return;
    }
    event.target.disabled = true;
    status.textContent = 'AI가 조건을 정리하는 중입니다.';
    const answer = await askAi('conditions', text);
    const parsed = answer ? parseAiJson(answer) : null;
    event.target.disabled = false;
    state.conditionText = text;
    if (!parsed) {
      status.textContent = 'AI 연결에 실패했습니다. 아래 체크박스로 입력하면 그대로 편성됩니다.';
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
