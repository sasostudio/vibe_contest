// 계정 관리: 로그아웃, 작성 기록 초기화, 대표 등록 취소. 셋 다 확인 창을 거친다.
import { withdrawTimetable } from './api.js';
import { currentSession, signInAnonymously, signInWithGoogle, signOut } from './auth.js';
import { closeDialog, esc, openDialog, showAlert, showBusy } from './ui.js';
import { resetState, save, state } from './state.js';

function confirmThen(title, lines, actionLabel, action) {
  const modal = openDialog(title, `${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    <div class="row row-end"><button class="btn" data-no>취소</button><button class="btn btn-go" data-yes>${esc(actionLabel)}</button></div>`);
  modal.querySelector('[data-no]').addEventListener('click', closeDialog);
  modal.querySelector('[data-yes]').addEventListener('click', async () => {
    closeDialog();
    await action();
  });
  modal.querySelector('[data-no]').focus();
}

const goHome = () => {
  if (location.hash === '#/' || location.hash === '') location.reload();
  else location.hash = '#/';
};

// 로그인이 필요할 때 부른다. 이미 로그인했으면 바로 true, 취소하면 false.
export function ensureLogin() {
  if (currentSession()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const modal = openDialog('본인 확인', `
      <p>대표 시간표와 궁합 결과는 계정마다 따로 저장됩니다. 로그인 방법을 고르십시오.</p>
      <div class="row"><button class="btn btn-go" data-how="google">구글 로그인</button><button class="btn" data-how="anonymous">익명으로 계속</button><button class="btn" data-how="cancel">취소</button></div>
      <p class="hint" id="login-status">익명으로 계속하면 이 브라우저에서만 내 현황을 볼 수 있습니다.</p>`);
    modal.addEventListener('click', async (event) => {
      const how = event.target.dataset.how;
      if (!how) return;
      if (how === 'cancel') {
        closeDialog();
        resolve(false);
        return;
      }
      try {
        await (how === 'google' ? signInWithGoogle() : signInAnonymously());
        closeDialog();
        resolve(true);
      } catch {
        modal.querySelector('#login-status').textContent = '로그인에 실패했습니다. 익명으로 계속을 눌러 진행하십시오.';
      }
    });
  });
}

// 위쪽 막대의 로그인. 로그인하면 내 현황으로 간다(이미 내 현황이면 다시 그린다).
async function loginAndShowMe() {
  if (!(await ensureLogin())) return;
  if (location.hash === '#/me') window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = '#/me';
}

export function askLogout() {
  const anonymous = currentSession()?.provider === 'anonymous';
  const lines = anonymous
    ? ['익명으로 등록한 기록은 로그아웃하면 다시 볼 수 없습니다.', '순위표의 기록은 그대로 남습니다. 지우려면 먼저 「대표 등록 취소」를 하십시오.']
    : ['로그아웃합니다. 같은 구글 계정으로 다시 로그인하면 기록이 돌아옵니다.'];
  confirmThen('로그아웃', lines, '로그아웃', async () => {
    try {
      await signOut();
    } catch {
      // 구글 SDK를 못 받아도 이 사이트의 세션은 이미 지워졌다
    }
    state.result = null;
    save();
    goHome();
  });
}

export function askReset() {
  confirmThen('작성 기록 초기화', ['이 브라우저에 남은 학적 입력, 고른 과목, 조건, 편성 결과를 모두 지웁니다.', '로그인과 등록한 대표 시간표는 그대로입니다.'], '초기화', async () => {
    resetState();
    goHome();
  });
}

export function askWithdraw() {
  confirmThen('대표 등록 취소', ['대표 시간표를 지우고 순위표에서 뺍니다. 학과 평균도 다시 계산됩니다.', '되돌릴 수 없습니다. 다시 참여하려면 새로 등록하십시오.'], '등록 취소', async () => {
    showBusy('대표 등록을 취소하고 있습니다.');
    try {
      await withdrawTimetable();
      closeDialog();
      state.result = null;
      save();
      goHome();
    } catch {
      closeDialog();
      showAlert('등록 취소 실패', ['서버에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.']);
    }
  });
}

export function accountHtml(hasEntry) {
  const signedIn = Boolean(currentSession());
  return `<div class="row">
    <button class="btn" data-account="reset">작성 기록 초기화</button>
    ${hasEntry ? '<button class="btn" data-account="withdraw">대표 등록 취소</button>' : ''}
    ${signedIn ? '<button class="btn" data-account="logout">로그아웃</button>' : ''}
  </div>`;
}

// 화면 어디든 data-account 버튼을 누르면 해당 동작을 연다
export function bindAccountButtons(root) {
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-account]')?.dataset.account;
    if (action === 'login') loginAndShowMe();
    if (action === 'logout') askLogout();
    if (action === 'reset') askReset();
    if (action === 'withdraw') askWithdraw();
  });
}
