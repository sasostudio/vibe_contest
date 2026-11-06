// 10번 화면. 심사 결과 통지서와 도장. 이 화면의 값은 전부 서버 응답이다.
import { esc, pathLine, scoreTable } from '../ui.js';
import { save, state } from '../state.js';
import { shareMyResult } from '../share.js';
import { startCompat } from './compat.js';

const COMPAT_RETURN_MS = 2800; // 도장이 찍힌 걸 본 뒤 궁합으로 돌아간다

const STAMP_DELAY_MS = 1100;

// 인주가 고르게 묻지 않은 느낌을 필터로 낸다. 글꼴이 늦게 와도 도장 형태는 유지된다.
function stampSvg(grade, word) {
  const size = grade.length > 1 ? 112 : 132;
  return `<svg viewBox="0 0 240 240" role="img" aria-label="등급 ${esc(grade)} ${esc(word)}">
    <defs>
      <filter id="ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="wobble"/>
        <feDisplacementMap in="SourceGraphic" in2="wobble" scale="4" result="rough"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="3"/>
        <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.8 1.9"/>
        <feComposite in="rough" operator="in"/>
      </filter>
    </defs>
    <g filter="url(#ink)" fill="none" stroke="#c8141e" font-family="'Black Han Sans', Impact, sans-serif">
      <rect x="10" y="10" width="220" height="220" rx="14" stroke-width="10"/>
      <rect x="23" y="23" width="194" height="194" rx="7" stroke-width="3"/>
      <text x="120" y="56" text-anchor="middle" font-size="21" fill="#c8141e" stroke="none">시간표심사위원회</text>
      <text x="120" y="${grade.length > 1 ? 156 : 166}" text-anchor="middle" font-size="${size}" fill="#c8141e" stroke="none">${esc(grade)}</text>
      <text x="120" y="201" text-anchor="middle" font-size="27" fill="#c8141e" stroke="none">${esc(word)}</text>
    </g>
  </svg>`;
}

function revealStamp(view, fresh) {
  const stamp = view.querySelector('.stamp');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fresh || calm) {
    stamp.classList.remove('hidden');
    return null;
  }
  const timer = setTimeout(() => {
    stamp.classList.remove('hidden');
    stamp.classList.add('slam');
    view.querySelector('.paper').classList.add('shake');
  }, STAMP_DELAY_MS);
  return () => clearTimeout(timer);
}

export function showResult(view) {
  if (!state.result) {
    location.hash = '#/me';
    return;
  }
  const { entry, standing, fresh, satisfaction } = state.result;
  // 만족도는 등록한 브라우저에만 있는 참고값이다. 서버 총점과 섞지 않는다.
  const satLine = satisfaction
    ? `<p class="hint">예상 만족도 ${satisfaction.score}% (${satisfaction.source === 'simple' ? '간이 계산' : 'AI 평가'}, 순위에는 반영하지 않음)</p>`
    : '';
  const date = new Date(entry.updatedAt);
  const dateText = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;

  view.innerHTML = `${pathLine('시간표 편성 신청', '심사 결과')}
    <article class="paper">
      <h1>심사 결과 통지서</h1>
      <p class="paper-no">2026학년도 2학기 시간표 심사 제${String(entry.updatedAt).slice(-5)}호</p>
      <table><tbody>
        <tr><th scope="row">성명</th><td>${esc(entry.nickname)}</td><th scope="row">소속</th><td>${esc(entry.dept)}</td></tr>
        <tr><th scope="row">학년</th><td>${entry.year}학년</td><th scope="row">학점</th><td>${entry.credits}학점</td></tr>
      </tbody></table>
      <div class="total-wrap">
        <p class="paper-total"><span>총점</span><b>${entry.score}</b><span>/ 100</span></p>
        ${satLine}
        <div class="stamp hidden">${stampSvg(entry.grade, entry.stamp)}</div>
      </div>
      ${scoreTable(entry.items)}
      <div class="verdict">
        <p class="paper-title"><small>칭호</small>${esc(entry.title)}</p>
        <p class="paper-review">${esc(entry.review)}</p>
      </div>
      <p class="paper-date">${dateText}<br>시간표 심사위원회</p>
    </article>
    <div class="paper-actions">
    ${state.pendingCompat ? '<div class="box-note">등록이 끝났습니다. 곧 친구와의 궁합 결과로 이동합니다.</div>' : ''}
    <div class="row row-end">
      <button class="btn btn-go" id="share-result">공유하기</button>
      <a class="btn" href="#/conditions">다시 짜기</a>
      <a class="btn" href="#/league">학과 대항전</a>
      <a class="btn btn-go" href="#/me">내 현황 보기</a>
    </div>
    <p class="hint" style="margin-top:9px">학과 내 ${standing.deptRank}위 / ${standing.deptTotal}명, 전체 ${standing.overallRank}위 / ${standing.overallTotal}명</p>
    </div>`;

  view.querySelector('#share-result').addEventListener('click', () => shareMyResult(entry));
  const stop = revealStamp(view, fresh);
  state.result.fresh = false;
  save();
  const pending = state.pendingCompat;
  const back = pending ? setTimeout(() => startCompat(pending), COMPAT_RETURN_MS) : null;
  return () => {
    stop?.();
    clearTimeout(back);
  };
}
