// 결과 공유. 휴대폰은 기본 공유 창(Web Share API), 안 되면 링크 복사.
import { issueShare } from './api.js';
import { showAlert } from './ui.js';

export const shareUrl = (kind, token) => `${location.origin}/#/${kind}/${token}`;

// 반환: 'shared' | 'copied' | 'cancelled' | 'failed'
export async function shareLink({ url, title, text }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    showAlert('링크 복사', ['공유 링크를 복사했습니다. 카카오톡 등에 붙여 넣으십시오.']);
    return 'copied';
  } catch {
    showAlert('공유 링크', ['아래 주소를 길게 눌러 복사하십시오.', url]);
    return 'failed';
  }
}

// 내 결과 공유. 링크가 없으면 서버가 새로 만든다.
export async function shareMyResult(entry, typeName) {
  const { ok, data } = await issueShare(false);
  if (!ok) {
    showAlert('공유 실패', [data.error ?? '잠시 뒤 다시 시도하십시오.']);
    return;
  }
  await shareLink({
    url: shareUrl('s', data.token),
    title: '시간표 심사 결과',
    text: `${entry.nickname}님의 시간표 유형은 「${typeName}」, ${entry.grade} ${entry.score}점입니다. 나랑 시간표 궁합 볼래?`,
  });
}

export async function renewShareLink() {
  const { ok, data } = await issueShare(true);
  showAlert(ok ? '새 링크 발급' : '발급 실패', ok
    ? ['새 공유 링크를 만들었습니다. 이전에 보낸 링크는 더 열리지 않습니다.']
    : [data.error ?? '잠시 뒤 다시 시도하십시오.']);
}
