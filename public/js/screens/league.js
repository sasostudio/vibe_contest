// 12번 화면. 학과 순위와 학과별 상위 점수. 시간표 내용은 공개하지 않는다.
import { fetchLeague } from '../api.js';
import { esc, pathLine, win } from '../ui.js';
import { state } from '../state.js';
import { sampleBanner } from './home.js';

const POLL_MS = 30000;

function topList(dept) {
  return dept.top.map((p) => `${esc(p.nickname)} ${p.score}점 ${esc(p.grade)}`).join(', ');
}

function tableHtml(league) {
  if (league.total === 0) {
    return `<div class="box-note">아직 등록된 시간표가 없습니다. <a href="#/profile">첫 시간표를 등록하십시오.</a></div>`;
  }
  const rows = league.departments.map((d) => `
    <tr class="${d.rank ? '' : 'pending'} ${d.dept === state.profile?.dept ? 'mine' : ''}">
      <td class="mid">${d.rank ? `<span class="medal${d.rank <= 3 ? ` m${d.rank}` : ''}">${d.rank}</span>` : '집계 중'}</td>
      <td>${esc(d.dept)}</td>
      <td class="num">${d.rank ? d.average.toFixed(1) : '-'}</td>
      <td class="num">${d.count}명</td>
      <td>${topList(d)}</td>
    </tr>`).join('');
  return `${sampleBanner(league)}<div class="scroll"><table>
    <thead><tr><th class="mid">순위</th><th>학과</th><th class="num">평균</th><th class="num">등록</th><th>학과 상위 시간표</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="hint">학과 점수는 등록자 평균입니다. 등록 3명 미만은 집계 중으로 표시하고, 평균이 같으면 등록 인원이 많은 학과가 앞섭니다. 총 등록 ${league.total}명.</p>`;
}

export async function showLeague(view) {
  view.innerHTML = `${pathLine('학과별 순위표')}${win('학과 대항전 순위표', '<div id="league-table"><p class="hint">순위를 불러오는 중입니다.</p></div>')}`;
  const area = view.querySelector('#league-table');
  const refresh = async () => {
    try {
      area.innerHTML = tableHtml(await fetchLeague());
    } catch {
      area.innerHTML = '<div class="box-note">순위를 불러오지 못했습니다. 잠시 뒤 다시 여십시오.</div>';
    }
  };
  await refresh();
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
  return () => clearInterval(timer);
}
