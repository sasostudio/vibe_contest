// 시간표 궁합 화면(#/c/궁합값)과 궁합 시작(친구 링크에서 「나랑 궁합 보기」).
// 화면에는 겹치는 정보만 나온다. 상대의 전체 시간표는 서버가 보내지 않는다.
import { fetchCompat, makeCompat } from '../api.js';
import { ensureLogin } from '../account.js';
import { DAY_NAMES, formatTime } from '../../lib/timetable.js';
import { shareLink, shareUrl } from '../share.js';
import { closeDialog, esc, pathLine, showAlert, showBusy, win } from '../ui.js';
import { save, state } from '../state.js';

// 대표 시간표가 없으면 링크값을 기억해 두고 등록하러 보낸다. 등록이 끝나면 결과 화면이 여기로 돌려보낸다.
export async function startCompat(shareToken) {
  if (!(await ensureLogin())) return;
  showBusy('두 시간표의 궁합을 계산하고 있습니다.');
  const { ok, data } = await makeCompat(shareToken);
  closeDialog();
  if (ok) {
    state.pendingCompat = null;
    save();
    location.hash = `#/c/${data.token}`;
    return;
  }
  if (data.needEntry) {
    // 화면 전환이 대화상자를 닫으므로 알림 대신 학적 입력 화면의 안내 띠로 알린다
    state.pendingCompat = shareToken;
    save();
    location.hash = '#/profile';
    return;
  }
  showAlert('궁합 실패', [data.error ?? '잠시 뒤 다시 시도하십시오.']);
}

const span = (w) => `${DAY_NAMES[w.day]} ${formatTime(w.start)}~${formatTime(w.end)}`;
const list = (items, empty) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p class="hint">${empty}</p>`);

function compatHtml(c) {
  const who = (p) => `${esc(p.nickname)} <span class="hint">${esc(p.dept)} · ${esc(p.title ?? '')}</span>`;
  return `${pathLine('시간표 궁합')}
    ${win('시간표 궁합 결과', `
      <p class="lead">${who(c.a)}<br>× ${who(c.b)}</p>
      <p class="compat-score">궁합 ${c.score}%</p>
      <p class="paper-review">${esc(c.line)}</p>
      <table class="form"><tbody>
        <tr><th scope="row">함께 공강인 요일</th><td>${list(c.freeDays.map((d) => `${DAY_NAMES[d]}요일`), '없음')}</td></tr>
        <tr><th scope="row">함께 비는 시간</th><td>${list(c.windows.map(span), '1시간 이상 함께 비는 시간이 없습니다.')}</td></tr>
        <tr><th scope="row">같은 점심시간</th><td>${list(c.lunches.map(span), '함께 점심을 먹을 수 있는 날이 없습니다.')}</td></tr>
        <tr><th scope="row">같이 쓰는 건물</th><td>${list(c.buildings.map((b) => b.name), '없음')}</td></tr>
      </tbody></table>
      <div class="row"><button class="btn btn-go" id="share-compat">궁합 공유하기</button><a class="btn" href="#/profile">내 시간표 짜기</a><a class="btn" href="#/">학과 대항전</a></div>`)}`;
}

export async function showCompat(view, token) {
  view.innerHTML = `${pathLine('시간표 궁합')}<p class="hint">궁합 결과를 불러오는 중입니다.</p>`;
  const { ok, data } = await fetchCompat(token);
  if (!ok) {
    view.innerHTML = `${pathLine('시간표 궁합')}${win('시간표 궁합', `<p>${esc(data.error ?? '결과를 불러오지 못했습니다.')}</p>`)}`;
    return;
  }
  view.innerHTML = compatHtml(data);
  view.querySelector('#share-compat').addEventListener('click', () => shareLink({
    url: shareUrl('c', token),
    title: '시간표 궁합',
    text: `${data.a.nickname} × ${data.b.nickname} 시간표 궁합 ${data.score}%. 너도 나랑 궁합 볼래?`,
  }));
}
