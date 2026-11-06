// 3번 화면. 추천 과목과 분반별 시간·강의실을 보고 담거나 빼고, 원하면 분반을 고정한다.
import { DATA } from '../../data/courses.js';
import { defaultSelection, groupCourses, recommendedCourses, searchCourses, targetAllows } from '../../lib/planner.js';
import { DAY_NAMES, courseKey, formatTime } from '../../lib/timetable.js';
import { esc, pathLine, showAlert, win } from '../ui.js';
import { save, state } from '../state.js';

export function coursesByKeys(keys) {
  const wanted = new Set(keys);
  return groupCourses(DATA.courses.filter((c) => wanted.has(courseKey(c))));
}

const sectionNo = (section) => section.id.slice(-3);
const sectionTime = (section) => (section.slots.length
  ? section.slots.map(([d, s, e, room]) => `${DAY_NAMES[d]} ${formatTime(s)}~${formatTime(e)} (${room})`).join(' / ')
  : `시간 없음 (${section.mode})`);

// 과목 하나 = 자동 배정 줄 + 분반 줄들. 과목 정보 칸은 세로로 합친다.
function courseRows(course) {
  const checked = state.selectedKeys.includes(course.key);
  const pinned = state.pinned[course.key] ?? '';
  const needsCheck = course.sections.some((s) => !targetAllows(s, state.profile.dept));
  const span = course.sections.length + 1;
  const pin = (value, label) =>
    `<label class="check"><input type="radio" name="pin-${esc(course.key)}" data-pin-key="${esc(course.key)}" value="${esc(value)}"${pinned === value ? ' checked' : ''}>${label}</label>`;
  const head = `<tr class="course-head">
    <td class="mid" rowspan="${span}"><input type="checkbox" data-key="${esc(course.key)}" aria-label="${esc(course.name)} 담기"${checked ? ' checked' : ''}></td>
    <td rowspan="${span}"><b>${esc(course.name)}</b>${needsCheck ? ' <span class="tag">수강대상 확인</span>' : ''}<br><span class="hint">${esc(course.dept)}</span></td>
    <td rowspan="${span}">${esc(course.type)}</td>
    <td class="num" rowspan="${span}">${course.credits}</td>
    <td colspan="3" class="hint">분반 ${course.sections.length}개</td>
    <td>${pin('', '자동 배정')}</td>
  </tr>`;
  const rows = course.sections.map((s) => `<tr>
    <td class="mid">${sectionNo(s)}</td>
    <td>${esc(sectionTime(s))}</td>
    <td class="num">${s.cap ? `${s.cap}명` : '-'}</td>
    <td>${pin(s.id, '이 분반 고정')}</td>
  </tr>`).join('');
  return head + rows;
}

const tableOf = (courses) => `<div class="scroll"><table class="sections">
  <thead><tr><th class="mid">담기</th><th>교과목명</th><th>이수구분</th><th class="num">학점</th><th class="mid">분반</th><th>요일·시간 (강의실)</th><th class="num">정원</th><th>배정</th></tr></thead>
  <tbody>${courses.map(courseRows).join('')}</tbody></table></div>`;

function cartHtml() {
  const picked = coursesByKeys(state.selectedKeys);
  if (picked.length === 0) return '<p class="hint">담은 과목이 없습니다. 남은 학점은 모두 교양으로 채웁니다.</p>';
  const sum = picked.reduce((total, c) => total + c.credits, 0);
  const rows = picked.map((c) => {
    const pinned = c.sections.find((s) => s.id === state.pinned[c.key]);
    return `<tr><td>${esc(c.name)}</td><td>${esc(c.type)}</td><td class="num">${c.credits}</td>
      <td>${pinned ? `${sectionNo(pinned)}분반 고정: ${esc(sectionTime(pinned))}` : '자동 배정'}</td>
      <td class="mid"><button class="btn" data-remove="${esc(c.key)}">취소</button></td></tr>`;
  }).join('');
  return `<div class="scroll"><table><thead><tr><th>교과목명</th><th>이수구분</th><th class="num">학점</th><th>배정</th><th class="mid">취소</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p><b>담은 과목 ${sum}학점 / 학적 상한 ${state.profile.creditCap}학점</b></p>`;
}

export function showCourses(view) {
  if (!state.profile) {
    location.hash = '#/profile';
    return;
  }
  state.pinned ??= {};
  const recommended = recommendedCourses(DATA, state.profile);
  if (state.selectedKeys === null) {
    state.selectedKeys = defaultSelection(recommended, state.conditions).map((c) => c.key);
    save();
  }
  const extras = coursesByKeys(state.extraKeys).filter((c) => !recommended.some((r) => r.key === c.key));
  const listed = [...recommended, ...extras];
  const emptyNote = recommended.length === 0
    ? '<div class="box-note">이번 학기 시간표에서 이 학과·학년의 추천 전공을 찾지 못했습니다. 아래에서 과목을 검색해 담으십시오.</div>'
    : '';

  view.innerHTML = `${pathLine('시간표 편성 신청', '과목 확인')}
    <div id="course-area">
    ${win(`${state.profile.dept} ${state.profile.year}학년 추천 과목`, `
      <p class="hint">시간표 자료에 필수 여부가 없어 「추천 과목」으로 표시합니다. 이미 들은 과목은 체크를 해제하십시오. 담은 과목은 반드시 포함되고, 꼭 들어야 하는 분반이 있으면 「이 분반 고정」을 고르십시오.</p>
      ${emptyNote}
      ${listed.length ? tableOf(listed) : ''}`)}
    ${win('과목 검색 추가', `
      <form class="row" id="search-form">
        <label for="query">교과목명</label><input id="query" type="search" placeholder="예: 빅데이터">
        <button class="btn" type="submit">검색</button>
      </form>
      <div id="search-result"></div>`)}
    ${win('담은 과목', '<div id="cart"></div>')}
    </div>
    <div class="row row-end"><a class="btn" href="#/profile">이전</a><button class="btn btn-go" id="next">다음: 조건 접수</button></div>`;

  const area = view.querySelector('#course-area');
  const paintCart = () => { area.querySelector('#cart').innerHTML = cartHtml(); };
  const syncChecks = () => {
    for (const box of area.querySelectorAll('[data-key]')) box.checked = state.selectedKeys.includes(box.dataset.key);
  };
  const setSelected = (key, on) => {
    state.selectedKeys = state.selectedKeys.filter((k) => k !== key);
    if (on) {
      state.selectedKeys.push(key);
      if (!recommended.some((r) => r.key === key) && !state.extraKeys.includes(key)) state.extraKeys.push(key);
    }
    state.plans = null;
    save();
    syncChecks();
    paintCart();
  };
  paintCart();

  // view는 화면끼리 공유하므로 리스너는 이 화면의 내용에만 건다
  area.addEventListener('change', (event) => {
    const { key, pinKey } = event.target.dataset ?? {};
    if (key) setSelected(key, event.target.checked);
    if (pinKey) {
      if (event.target.value) state.pinned[pinKey] = event.target.value;
      else delete state.pinned[pinKey];
      setSelected(pinKey, true);
    }
  });
  area.addEventListener('click', (event) => {
    const removeKey = event.target.dataset?.remove;
    if (removeKey) setSelected(removeKey, false);
  });

  view.querySelector('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const hits = searchCourses(DATA, view.querySelector('#query').value, 15);
    view.querySelector('#search-result').innerHTML = hits.length
      ? tableOf(hits)
      : '<p class="hint">이번 학기에 개설된 과목 중 찾지 못했습니다. 과목 이름의 일부만 입력해 보십시오.</p>';
  });

  view.querySelector('#next').addEventListener('click', () => {
    const sum = coursesByKeys(state.selectedKeys).reduce((total, c) => total + c.credits, 0);
    if (sum > state.profile.creditCap) {
      showAlert('학점 초과', [`담은 과목이 ${sum}학점입니다. 상한 ${state.profile.creditCap}학점 이하로 줄이십시오.`]);
      return;
    }
    location.hash = '#/conditions';
  });
}
