// 4·5번 화면. 자주 찾는 조건은 버튼으로 고르고, 나머지는 기타 요청 문장을 AI가 조건으로 옮긴다.
// 버튼과 세부 조건표는 같은 state.conditions를 보여 주는 두 화면이라 한쪽을 바꾸면 다른 쪽도 다시 그린다.
// AI가 실패해도 버튼과 조건표만으로 편성할 수 있다.
import { DATA } from '../../data/courses.js';
import { DEFAULT_CONDITIONS, GENERAL_AREAS, parseAiJson, sanitizeConditions } from '../../lib/conditions.js';
import { generatePlans } from '../../lib/planner.js';
import { DAY_NAMES, WEEKDAYS } from '../../lib/timetable.js';
import { askAi } from '../api.js';
import { closeDialog, esc, pathLine, showBusy, win } from '../ui.js';
import { save, state } from '../state.js';
import { coursesByKeys, excludedGeneralCodes } from './courses.js';

const CREDIT_STEPS = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const CREDIT_PRESETS = [[12, 15], [15, 18], [18, 21]];
const LIFE_PREFERENCES = ['점심시간 확보', '우주 공강 피하기', '연강 피하기', '건물 이동 줄이기'];
const LIFE_LABELS = { '점심시간 확보': '점심시간 꼭', '우주 공강 피하기': '우주 공강 싫음', '연강 피하기': '연강 싫음', '건물 이동 줄이기': '건물 이동 적게' };
const TIME_TOGGLES = [['avoidMorning', '오전 수업 피하기 (12시 전)'], ['noFirst', '1교시 빼기 (10시 전)'], ['noNight', '야간 빼기 (18시 이후)']];
const MAX_TEXT = 400;
const COMPOSE_DELAY_MS = 400;

const splitWords = (text) => text.split(',').map((w) => w.trim()).filter(Boolean);
const areaLabel = (area) => area.replace('(핵심)', '');
const union = (a, b) => [...new Set([...a, ...b])];

// ── 버튼 ────────────────────────────────────────────────
const toggle = (attrs, label, pressed) => `<button type="button" class="btn chip" ${attrs} aria-pressed="${pressed}">${label}</button>`;

function quickHtml() {
  const c = state.conditions;
  return `<table class="form"><tbody>
    <tr><th scope="row">공강 요일</th><td>${WEEKDAYS.map((d) => toggle(`data-q-day="${d}"`, DAY_NAMES[d], c.freeDays.includes(d))).join('')}</td></tr>
    <tr><th scope="row">시간대</th><td>${TIME_TOGGLES.map(([key, label]) => toggle(`data-q-flag="${key}"`, label, c[key])).join('')}</td></tr>
    <tr><th scope="row">생활</th><td>${LIFE_PREFERENCES.map((p) => toggle(`data-q-pref="${esc(p)}"`, LIFE_LABELS[p], c.preferences.includes(p))).join('')}</td></tr>
    <tr><th scope="row">학점</th><td>${CREDIT_PRESETS.map(([min, max]) => toggle(`data-q-credits="${min}-${max}"`, `${min}~${max}학점`, c.minCredits === min && c.maxCredits === max)).join('')}</td></tr>
  </tbody></table>`;
}

function applyQuick(dataset) {
  const c = { ...state.conditions };
  if (dataset.qDay !== undefined) {
    const day = Number(dataset.qDay);
    c.freeDays = c.freeDays.includes(day) ? c.freeDays.filter((d) => d !== day) : [...c.freeDays, day];
  }
  if (dataset.qFlag) c[dataset.qFlag] = !c[dataset.qFlag];
  if (dataset.qPref) {
    c.preferences = c.preferences.includes(dataset.qPref) ? c.preferences.filter((p) => p !== dataset.qPref) : [...c.preferences, dataset.qPref];
  }
  if (dataset.qCredits) [c.minCredits, c.maxCredits] = dataset.qCredits.split('-').map(Number);
  state.conditions = sanitizeConditions(c);
}

// ── 세부 조건표 ──────────────────────────────────────────
function readForm(view) {
  return sanitizeConditions({
    freeDays: [...view.querySelectorAll('[data-day]:checked')].map((box) => Number(box.dataset.day)),
    noFirst: view.querySelector('#no-first').checked,
    avoidMorning: view.querySelector('#avoid-morning').checked,
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
  view.querySelector('#avoid-morning').checked = c.avoidMorning;
  view.querySelector('#no-night').checked = c.noNight;
  view.querySelector('#min-credits').value = String(c.minCredits);
  view.querySelector('#max-credits').value = String(c.maxCredits);
  view.querySelector('#want').value = c.wantKeywords.join(', ');
  view.querySelector('#avoid').value = c.avoidKeywords.join(', ');
  view.querySelector('#extra').innerHTML =
    listBox('예상 만족도 평가에 반영할 희망', c.preferences) +
    listBox('시간표로는 해결할 수 없는 요청', c.unsupported);
  view.querySelector('#quick').innerHTML = quickHtml();
}

const areaRows = () => Object.entries(GENERAL_AREAS).map(([type, areas]) =>
  `<div><span class="tag">${type}</span> ${areas.map((a) =>
    `<label class="check"><input type="checkbox" data-area="${esc(a)}">${esc(areaLabel(a))}</label>`).join('')}</div>`).join('');

// AI가 정리한 기타 요청을 버튼으로 고른 조건에 더한다. 버튼 선택은 지우지 않는다.
function mergeAi(current, ai) {
  const creditsSaid = ai.minCredits !== DEFAULT_CONDITIONS.minCredits || ai.maxCredits !== DEFAULT_CONDITIONS.maxCredits;
  return sanitizeConditions({
    freeDays: union(current.freeDays, ai.freeDays),
    noFirst: current.noFirst || ai.noFirst,
    avoidMorning: current.avoidMorning || ai.avoidMorning,
    noNight: current.noNight && ai.noNight,
    minCredits: creditsSaid ? ai.minCredits : current.minCredits,
    maxCredits: creditsSaid ? ai.maxCredits : current.maxCredits,
    areas: union(current.areas, ai.areas),
    wantKeywords: union(current.wantKeywords, ai.wantKeywords),
    avoidKeywords: union(current.avoidKeywords, ai.avoidKeywords),
    preferences: union(current.preferences, ai.preferences),
    unsupported: ai.unsupported,
  });
}

export function runPlanner() {
  const courses = coursesByKeys(state.selectedKeys).map((course) => {
    const only = course.sections.filter((s) => s.id === state.pinned?.[course.key]);
    return only.length ? { ...course, sections: only } : course;
  });
  const { plans, diagnosis } = generatePlans(DATA, state.profile, courses, state.conditions, { excludeCodes: excludedGeneralCodes() });
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
    <div id="conditions-area">
    ${win('자주 찾는 조건', '<p class="hint">눌러서 켜고 끕니다. 아래 세부 조건에 바로 반영됩니다.</p><div id="quick"></div>')}
    ${win('기타 요청', `
      <label for="wish">버튼에 없는 희망을 말로 적으십시오.</label>
      <textarea id="wish" maxlength="${MAX_TEXT}" placeholder="예: 수요일은 오후만 듣고 싶어. 인문 교양 하나 넣어 줘. 학점 잘 주는 수업이면 좋겠어.">${esc(state.conditionText)}</textarea>
      <div class="row"><button class="btn" id="to-conditions">AI로 조건 정리</button><span class="hint" id="ai-status"></span></div>`)}
    ${win('세부 조건', `
      <p class="hint">아래 값으로 편성합니다. 직접 고칠 수 있습니다.</p>
      <table class="form"><tbody>
        <tr><th scope="row">공강 요일</th><td>${dayBoxes}</td></tr>
        <tr><th scope="row">시간대</th><td>
          <label class="check"><input type="checkbox" id="avoid-morning">오전 수업 피하기 (가능하면)</label>
          <label class="check"><input type="checkbox" id="no-first">1교시 제외</label>
          <label class="check"><input type="checkbox" id="no-night">야간 제외</label>
        </td></tr>
        <tr><th scope="row">학점 범위</th><td>
          <label for="min-credits">최소</label> <select id="min-credits">${steps}</select>
          ~ <label for="max-credits">최대</label> <select id="max-credits">${steps}</select>
          <span class="hint">학적의 학점 상한 ${state.profile.creditCap}학점을 넘지 않습니다.</span>
        </td></tr>
        <tr><th scope="row">채울 교양 영역</th><td>${areaRows()}<p class="hint">자동으로 채울 교양의 영역입니다. 아무것도 고르지 않으면 모든 영역에서 채웁니다. 과목별 희망·비희망은 과목 확인 화면의 교양 탭에서 고릅니다.</p></td></tr>
        <tr><th scope="row"><label for="want">듣고 싶은 교양</label></th><td><input id="want" type="text" placeholder="쉼표로 구분"></td></tr>
        <tr><th scope="row"><label for="avoid">피할 과목</label></th><td><input id="avoid" type="text" placeholder="쉼표로 구분"></td></tr>
      </tbody></table>
      <div id="extra"></div>`)}
    </div>
    <div class="row row-end"><a class="btn" href="#/courses">이전</a><button class="btn btn-go btn-big" id="run">시간표 편성 실행</button></div>`;
  paintForm(view);

  const area = view.querySelector('#conditions-area');
  area.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (!button) return;
    applyQuick(button.dataset);
    save();
    paintForm(view);
  });
  area.addEventListener('change', (event) => {
    if (event.target.id === 'wish') return;
    state.conditions = readForm(view);
    save();
    paintForm(view);
  });

  const status = view.querySelector('#ai-status');
  view.querySelector('#to-conditions').addEventListener('click', async (event) => {
    const text = view.querySelector('#wish').value.trim();
    if (!text) {
      status.textContent = '기타 요청을 먼저 적으십시오. 버튼과 세부 조건만으로도 편성할 수 있습니다.';
      return;
    }
    event.target.disabled = true;
    status.textContent = 'AI가 조건을 정리하는 중입니다.';
    const answer = await askAi('conditions', text);
    const parsed = answer ? parseAiJson(answer) : null;
    event.target.disabled = false;
    state.conditionText = text;
    if (!parsed) {
      status.textContent = 'AI 연결에 실패했습니다. 버튼과 세부 조건으로 입력하면 그대로 편성됩니다.';
      save();
      return;
    }
    state.conditions = mergeAi(state.conditions, sanitizeConditions(parsed));
    save();
    paintForm(view);
    status.textContent = '조건을 정리해 위 선택에 더했습니다. 확인하십시오.';
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
