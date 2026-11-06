// 공유 결과 화면(#/s/링크값). 로그인 없이 보이며 공개 정보만 나온다.
import { fetchShare } from '../api.js';
import { typeCardHtml } from '../typecard.js';
import { esc, pathLine, win } from '../ui.js';
import { startCompat } from './compat.js';

export async function showShared(view, token) {
  view.innerHTML = `${pathLine('공유된 심사 결과')}<p class="hint">결과를 불러오는 중입니다.</p>`;
  const { ok, data } = await fetchShare(token);
  if (!ok) {
    view.innerHTML = `${pathLine('공유된 심사 결과')}${win('공유된 심사 결과', `<p>${esc(data.error ?? '결과를 불러오지 못했습니다.')}</p><div class="row"><a class="btn btn-go" href="#/profile">내 시간표 짜기</a></div>`)}`;
    return;
  }
  view.innerHTML = `${pathLine('공유된 심사 결과')}
    ${win(`${data.nickname} 님의 시간표 심사 결과`, `
      ${typeCardHtml({ id: data.typeId, name: data.typeName, line: data.typeLine })}
      <table class="form"><tbody>
        <tr><th scope="row">소속</th><td>${esc(data.dept)}</td></tr>
        <tr><th scope="row">칭호</th><td>${esc(data.title)}</td></tr>
        <tr><th scope="row">총점</th><td><b>${data.score}점 ${esc(data.grade)}</b></td></tr>
      </tbody></table>
      <div class="row"><button class="btn btn-go btn-big" id="compat">나랑 시간표 궁합 보기</button><a class="btn" href="#/profile">내 시간표 짜기</a></div>`)}`;
  view.querySelector('#compat').addEventListener('click', () => startCompat(token));
}
