// 11번 화면. 내 점수, 항목별 내역, 순위, 학과 기여도. 값은 서버에서 다시 읽는다.
import { DATA } from '../../data/courses.js';
import { fetchMe } from '../api.js';
import { currentSession } from '../auth.js';
import { esc, pathLine, scoreTable, timetableGrid, win } from '../ui.js';
import { save, state } from '../state.js';
import { accountHtml } from '../account.js';
import { typeCardHtml, typeOfEntry } from '../typecard.js';
import { renewShareLink, shareMyResult } from '../share.js';

const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));
const signed = (value) => (value > 0 ? `+${value}` : String(value));

function emptyHtml() {
  return `${pathLine('내 현황')}${win('내 현황', `
    <p class="lead">아직 등록한 대표 시간표가 없습니다.</p>
    <div class="row"><a class="btn btn-go" href="#/profile">시간표 편성 신청</a></div>`)}
    ${win('계정 관리', accountHtml(false))}`;
}

function deptLine(standing) {
  if (standing.deptLeagueRank) return `${standing.deptLeagueRank}위`;
  return `집계 중 (${standing.needMembers}명 더 등록하면 순위 진입)`;
}

function changeLine(entry) {
  if (entry.previousScore === null || entry.previousScore === undefined) return '첫 등록';
  return `직전 등록 ${entry.previousScore}점에서 ${signed(entry.score - entry.previousScore)}점`;
}

function meHtml({ entry, standing }) {
  const sections = entry.sectionIds.map((id) => sectionById.get(id)).filter(Boolean);
  const type = typeOfEntry(entry, sections);
  return `${pathLine('내 현황')}
    <div class="split">
      <div>
        ${win(`${entry.nickname} 님의 현황`, `<table class="form"><tbody>
          <tr><th scope="row">소속</th><td>${esc(entry.dept)} ${entry.year}학년</td></tr>
          <tr><th scope="row">내 점수</th><td><b>${entry.score}점 ${esc(entry.grade)}</b> (${changeLine(entry)})</td></tr>
          <tr><th scope="row">칭호</th><td>${esc(entry.title)}</td></tr>
          <tr><th scope="row">학과 내 순위</th><td>${standing.deptRank}위 / ${standing.deptTotal}명</td></tr>
          <tr><th scope="row">전체 순위</th><td>${standing.overallRank}위 / ${standing.overallTotal}명</td></tr>
          <tr><th scope="row">학과 순위</th><td>${deptLine(standing)}, 평균 ${standing.deptAverage.toFixed(1)}점</td></tr>
          <tr><th scope="row">학과 기여도</th><td>학과 평균을 ${signed(standing.contribution)}점 움직임</td></tr>
        </tbody></table>
        <div class="row"><a class="btn btn-go" href="#/conditions">다시 짜기</a><a class="btn" href="#/league">학과 대항전</a></div>`)}
        ${win('시간표 유형', `${typeCardHtml(type)}
          <div class="row"><button class="btn btn-go" data-share>결과 공유하기</button><button class="btn" data-renew>공유 링크 새로 발급</button></div>
          <p class="hint">새로 발급하면 이전에 보낸 링크는 더 열리지 않습니다. 공유 화면에는 닉네임, 학과, 유형, 칭호, 등급, 점수만 나옵니다.</p>`)}
        ${win('항목별 내역', scoreTable(entry.items))}
        ${win('계정 관리', accountHtml(true))}
      </div>
      ${win('대표 시간표', timetableGrid(sections))}
    </div>`;
}

export async function showMe(view) {
  if (!currentSession()) {
    view.innerHTML = emptyHtml();
    return;
  }
  view.innerHTML = `${pathLine('내 현황')}<p class="hint">현황을 불러오는 중입니다.</p>`;
  try {
    const me = await fetchMe();
    if (!me?.entry) {
      view.innerHTML = emptyHtml();
      return;
    }
    state.result = { entry: me.entry, standing: me.standing, fresh: false };
    save();
    view.innerHTML = meHtml(me);
    const type = typeOfEntry(me.entry, me.entry.sectionIds.map((id) => sectionById.get(id)).filter(Boolean));
    view.querySelector('[data-share]').addEventListener('click', () => shareMyResult(me.entry, type.name));
    view.querySelector('[data-renew]').addEventListener('click', renewShareLink);
  } catch {
    view.innerHTML = `${pathLine('내 현황')}${win('내 현황', '<p>현황을 불러오지 못했습니다. 잠시 뒤 다시 여십시오.</p>')}`;
  }
}
