// 11번 화면. 내 점수, 항목별 내역, 순위, 학과 기여도. 값은 서버에서 다시 읽는다.
import { DATA } from '../../data/courses.js';
import { fetchMe } from '../api.js';
import { currentSession } from '../auth.js';
import { esc, pathLine, scoreTable, timetableGrid, win } from '../ui.js';
import { save, state } from '../state.js';
import { accountHtml } from '../account.js';
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
  const stat = (cls, label, value, sub) => `<div class="stat ${cls}"><p>${label}</p><b>${value}</b><span>${sub}</span></div>`;
  return `${pathLine('내 현황')}
    <div class="stats">
      ${stat('main', '내 점수', `${entry.score}점 ${esc(entry.grade)}`, changeLine(entry))}
      ${stat('', '학과 내 순위', `${standing.deptRank}위`, `/ ${standing.deptTotal}명`)}
      ${stat('', '전체 순위', `${standing.overallRank}위`, `/ ${standing.overallTotal}명`)}
      ${stat('', '학과 순위', standing.deptLeagueRank ? `${standing.deptLeagueRank}위` : '집계 중', `평균 ${standing.deptAverage.toFixed(1)}점`)}
    </div>
    <div class="split">
      <div>
        ${win(`${entry.nickname} 님의 현황`, `<table class="form"><tbody>
          <tr><th scope="row">소속</th><td>${esc(entry.dept)} ${entry.year}학년</td></tr>
          <tr><th scope="row">칭호</th><td><b>${esc(entry.title)}</b></td></tr>
          <tr><th scope="row">학과 순위</th><td>${deptLine(standing)}</td></tr>
          <tr><th scope="row">학과 기여도</th><td>학과 평균을 ${signed(standing.contribution)}점 움직임</td></tr>
        </tbody></table>
        <div class="row row-end"><a class="btn" href="#/league">학과 대항전</a><a class="btn btn-go" href="#/conditions">다시 짜기</a></div>`)}
        ${win('결과 공유', `<p>칭호 「${esc(entry.title)}」</p><p class="hint">${esc(entry.review)}</p>
          <div class="row"><button class="btn btn-go" data-share>결과 공유하기</button><button class="btn" data-renew>공유 링크 새로 발급</button></div>
          <p class="hint">새로 발급하면 이전에 보낸 링크는 더 열리지 않습니다. 공유 화면에는 닉네임, 학과, 칭호, 평론, 등급, 점수만 나옵니다.</p>`)}
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
      // 이 계정에는 등록이 없다. 이전 계정의 결과가 남아 다른 이름이 보이지 않게 비운다
      state.result = null;
      save();
      view.innerHTML = emptyHtml();
      return;
    }
    state.result = { entry: me.entry, standing: me.standing, fresh: false };
    // 다른 기기에서 로그인했으면 이 브라우저에 학적 입력이 없다. 등록 정보로 채워 바로 다시 짤 수 있게 한다.
    state.profile ??= { dept: me.entry.dept, year: me.entry.year, nickname: me.entry.nickname, creditCap: 19 };
    save();
    view.innerHTML = meHtml(me);
    view.querySelector('[data-share]').addEventListener('click', () => shareMyResult(me.entry));
    view.querySelector('[data-renew]').addEventListener('click', renewShareLink);
  } catch {
    view.innerHTML = `${pathLine('내 현황')}${win('내 현황', '<p>현황을 불러오지 못했습니다. 잠시 뒤 다시 여십시오.</p>')}`;
  }
}
