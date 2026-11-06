// 계정 관리: 로그아웃, 작성 기록 초기화, 대표 등록 취소. 셋 다 확인 창을 거친다.
import { withdrawTimetable } from './api.js';
import { currentSession, signOut } from './auth.js';
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
    if (action === 'logout') askLogout();
    if (action === 'reset') askReset();
    if (action === 'withdraw') askWithdraw();
  });
}
