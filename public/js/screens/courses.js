// 3번 화면. 학과·학년 추천 과목을 확인하고 뺄 과목은 빼고 더할 과목은 검색한다.
import { DATA } from '../../data/courses.js';
import { defaultSelection, groupCourses, recommendedCourses, searchCourses, targetAllows } from '../../lib/planner.js';
import { courseKey } from '../../lib/timetable.js';
import { esc, pathLine, showAlert, win } from '../ui.js';
import { save, state } from '../state.js';

export function coursesByKeys(keys) {
  const wanted = new Set(keys);
  return groupCourses(DATA.courses.filter((c) => wanted.has(courseKey(c))));
}

function courseRow(course, checked) {
  const needsCheck = course.sections.some((s) => !targetAllows(s, state.profile.dept));
  return `<tr>
    <td class="mid"><input type="checkbox" data-key="${esc(course.key)}" aria-label="${esc(course.name)} 담기"${checked ? ' checked' : ''}></td>
    <td>${esc(course.name)}${needsCheck ? ' <span class="tag">수강대상 확인</span>' : ''}</td>
    <td>${esc(course.type)}</td>
    <td class="mid">${esc(course.grade)}</td>
    <td class="num">${course.credits}</td>
    <td class="num">${course.sections.length}</td>
  </tr>`;
}

const tableOf = (rows) => `<div class="scroll"><table>
  <thead><tr><th class="mid">담기</th><th>교과목명</th><th>이수구분</th><th class="mid">학년</th><th class="num">학점</th><th class="num">분반</th></tr></thead>
  <tbody>${rows}</tbody></table></div>`;

export function showCourses(view) {
  if (!state.profile) {
    location.hash = '#/profile';
    return;
  }
  const recommended = recommendedCourses(DATA, state.profile);
  if (state.selectedKeys === null) {
    state.selectedKeys = defaultSelection(recommended, state.conditions).map((c) => c.key);
    save();
  }
  const extras = coursesByKeys(state.extraKeys).filter((c) => !recommended.some((r) => r.key === c.key));
  const listed = [...recommended, ...extras];
  const isChecked = (key) => state.selectedKeys.includes(key);

  const emptyNote = recommended.length === 0
    ? '<div class="box-note">이번 학기 시간표에서 이 학과·학년의 추천 전공을 찾지 못했습니다. 아래에서 과목을 검색해 담으십시오.</div>'
    : '';

  view.innerHTML = `${pathLine('시간표 편성 신청', '과목 확인')}
    <div id="course-area">
    ${win(`${state.profile.dept} ${state.profile.year}학년 추천 과목`, `
      <p class="hint">시간표 자료에 필수 여부가 없어 「추천 과목」으로 표시합니다. 이미 들은 과목은 체크를 해제하십시오. 체크한 과목은 반드시 포함되고, 남은 학점은 교양으로 채웁니다.</p>
      ${emptyNote}
      ${listed.length ? tableOf(listed.map((c) => courseRow(c, isChecked(c.key))).join('')) : ''}
      <p><b id="credit-sum"></b></p>`)}
    ${win('과목 검색 추가', `
      <form class="row" id="search-form">
        <label for="query">교과목명</label><input id="query" type="search" placeholder="예: 빅데이터">
        <button class="btn" type="submit">검색</button>
      </form>
      <div id="search-result"></div>`)}
    </div>
    <div class="row row-end"><a class="btn" href="#/profile">이전</a><button class="btn btn-go" id="next">다음: 조건 접수</button></div>`;

  const paintSum = () => {
    const sum = coursesByKeys(state.selectedKeys).reduce((total, c) => total + c.credits, 0);
    view.querySelector('#credit-sum').textContent = `담은 과목 ${sum}학점 / 상한 ${state.profile.creditCap}학점`;
  };
  paintSum();

  // view는 화면끼리 공유하므로 리스너는 이 화면의 내용에만 건다
  view.querySelector('#course-area').addEventListener('change', (event) => {
    const key = event.target.dataset?.key;
    if (!key) return;
    state.selectedKeys = state.selectedKeys.filter((k) => k !== key);
    if (event.target.checked) {
      state.selectedKeys.push(key);
      if (!recommended.some((r) => r.key === key) && !state.extraKeys.includes(key)) state.extraKeys.push(key);
    }
    state.plans = null;
    save();
    paintSum();
  });

  view.querySelector('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const hits = searchCourses(DATA, view.querySelector('#query').value);
    view.querySelector('#search-result').innerHTML = hits.length
      ? tableOf(hits.map((c) => courseRow(c, isChecked(c.key))).join(''))
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
