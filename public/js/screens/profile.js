// 2번 화면. 학과, 학년, 닉네임, 학점 상한. 재방문이면 값이 채워져 있다.
import { DATA } from '../../data/courses.js';
import { esc, pathLine, showAlert, win } from '../ui.js';
import { save, state } from '../state.js';

const YEARS = [1, 2, 3, 4];
const CREDIT_CAPS = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

export function showProfile(view) {
  const p = state.profile ?? { dept: '', year: 2, nickname: '', creditCap: 19 };
  const options = (values, selected, unit) =>
    values.map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}${unit}</option>`).join('');

  view.innerHTML = `${pathLine('시간표 편성 신청', '학적 입력')}
    ${win('학적 입력', `
      <form id="profile-form">
        <table class="form"><tbody>
          <tr><th scope="row"><label for="dept">소속 학과</label></th><td>
            <input id="dept" type="text" list="dept-list" value="${esc(p.dept)}" placeholder="학과 이름을 입력해 고르기" autocomplete="off" required>
            <datalist id="dept-list">${DATA.depts.map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
          </td></tr>
          <tr><th scope="row"><label for="year">학년</label></th><td><select id="year">${options(YEARS, p.year, '학년')}</select></td></tr>
          <tr><th scope="row"><label for="nickname">닉네임</label></th><td>
            <input id="nickname" type="text" maxlength="12" value="${esc(p.nickname)}" placeholder="순위표에 공개됩니다" required>
            <p class="hint">실명을 쓰지 마십시오. 순위표에는 닉네임, 학과, 점수, 등급만 공개됩니다.</p>
          </td></tr>
          <tr><th scope="row"><label for="cap">학점 상한</label></th><td><select id="cap">${options(CREDIT_CAPS, p.creditCap, '학점')}</select></td></tr>
        </tbody></table>
        <div class="row row-end" style="margin-top:9px"><button class="btn btn-go" type="submit">다음: 과목 확인</button></div>
      </form>`)}`;

  view.querySelector('#profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const dept = view.querySelector('#dept').value.trim();
    const nickname = view.querySelector('#nickname').value.trim();
    if (!DATA.depts.includes(dept)) {
      showAlert('입력 확인', ['목록에 있는 학과를 고르십시오. 학과 이름 일부를 입력하면 후보가 나타납니다.']);
      return;
    }
    if (!nickname) {
      showAlert('입력 확인', ['닉네임을 입력하십시오.']);
      return;
    }
    const year = Number(view.querySelector('#year').value);
    const changed = !state.profile || state.profile.dept !== dept || state.profile.year !== year;
    state.profile = { dept, year, nickname, creditCap: Number(view.querySelector('#cap').value) };
    if (changed) {
      state.selectedKeys = null;
      state.extraKeys = [];
      state.plans = null;
    }
    save();
    location.hash = '#/courses';
  });
}
