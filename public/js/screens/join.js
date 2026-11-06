// 참여 QR. 발표 화면에 띄워 청중이 휴대폰으로 바로 들어오게 한다.
// QR 그리기는 qrcodejs(MIT, cdnjs)를 이 화면에서만 불러온다.
import { pathLine, win } from '../ui.js';

const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
const QR_SIZE = 840;

function loadQrLib() {
  if (window.QRCode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = QR_LIB;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

export async function showJoin(view) {
  const url = `${location.origin}/`;
  view.innerHTML = `${pathLine('참여 QR')}
    ${win('시간표 심사 참여 안내', `<div class="join">
      <p class="lead">휴대폰 카메라로 QR을 찍으면 바로 참여할 수 있습니다. 내 시간표를 등록해 학과 순위를 올려 주십시오.</p>
      <div class="join-qr" id="qr"></div>
      <p class="join-url">${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
    </div>`)}`;
  try {
    await loadQrLib();
    new window.QRCode(view.querySelector('#qr'), { text: url, width: QR_SIZE, height: QR_SIZE, correctLevel: window.QRCode.CorrectLevel.M });
  } catch {
    view.querySelector('#qr').textContent = 'QR을 불러오지 못했습니다. 아래 주소로 접속하십시오.';
  }
}
