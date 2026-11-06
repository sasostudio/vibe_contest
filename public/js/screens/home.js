// 0번 화면. 로그인 없이 학과 순위와 개인 순위를 본다.
import { fetchLeague } from '../api.js';
import { esc, pathLine, win } from '../ui.js';
import { state } from '../state.js';

const POLL_MS = 30000;
const HOME_DEPTS = 10;
const HOME_PEOPLE = 10;

// 가상 순위가 하나라도 섞이면 순위표 위에 반드시 표시한다
export const sampleBanner = (league) =>
  (league.sampleCount > 0
    ? `<div class="box-note"><b>시연용 가상 데이터</b> 포함: 등록 ${league.total}건 중 ${league.sampleCount}건은 시연을 위해 넣은 가상 기록입니다.</div>`
    : '');

function deptRows(departments, myDept) {
  return departments.slice(0, HOME_DEPTS).map((d) => `
    <tr class="${d.rank ? '' : 'pending'} ${d.dept === myDept ? 'mine' : ''}">
      <td class="mid">${d.rank ? `<span class="medal${d.rank <= 3 ? ` m${d.rank}` : ''}">${d.rank}</span>` : '집계 중'}</td>
      <td>${esc(d.dept)}</td>
      <td class="num">${d.rank ? d.average.toFixed(1) : '-'}</td>
      <td class="num">${d.count}명</td>
    </tr>`).join('');
}

function peopleRows(people) {
  return people.slice(0, HOME_PEOPLE).map((p, i) => `
    <tr>
      <td class="mid"><span class="medal${i < 3 ? ` m${i + 1}` : ''}">${i + 1}</span></td>
      <td>${esc(p.nickname)}</td>
      <td>${esc(p.dept)}</td>
      <td class="num">${p.score}</td>
      <td class="mid">${esc(p.grade)}</td>
      <td>${esc(p.title)}</td>
    </tr>`).join('');
}

function leagueHtml(league) {
  if (league.total === 0) {
    return `<div class="box-note">아직 등록된 시간표가 없습니다. 첫 대표 시간표를 등록하면 소속 학과가 이 표의 맨 위에 올라갑니다.</div>`;
  }
  return `${sampleBanner(league)}<div class="split">
    ${win('학과 대항전 순위', `<div class="scroll"><table>
      <thead><tr><th class="mid">순위</th><th>학과</th><th class="num">평균 점수</th><th class="num">등록</th></tr></thead>
      <tbody>${deptRows(league.departments, state.profile?.dept)}</tbody></table></div>
      <p class="hint">등록 3명 이상인 학과만 순위에 듭니다. <a href="#/league">전체 순위표 보기</a></p>`)}
    ${win('개인 순위', `<div class="scroll"><table>
      <thead><tr><th class="mid">순위</th><th>닉네임</th><th>학과</th><th class="num">점수</th><th class="mid">등급</th><th>칭호</th></tr></thead>
      <tbody>${peopleRows(league.people)}</tbody></table></div>`)}
  </div>`;
}

export async function showHome(view) {
  view.innerHTML = `${pathLine('학과 대항전 현황')}
    ${win('시간표 심사 접수 안내', `
      <p class="lead">원하는 조건을 말로 쓰면 시간표를 짜 드립니다. 대표 시간표는 점수로 심사되고, 그 점수가 소속 학과의 순위가 됩니다.</p>
      <div class="row"><a class="btn btn-go btn-big" href="#/profile">시간표 편성 신청</a><a class="btn" href="#/me">내 현황 보기</a></div>`)}
    <div id="league-area"><p class="hint">순위를 불러오는 중입니다.</p></div>`;

  const area = view.querySelector('#league-area');
  const refresh = async () => {
    try {
      area.innerHTML = leagueHtml(await fetchLeague());
    } catch {
      area.innerHTML = '<div class="box-note">순위를 불러오지 못했습니다. 시간표 편성은 계속 이용할 수 있습니다.</div>';
    }
  };
  await refresh();
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  return () => clearInterval(timer);
}
