// 화면 전환만 맡는다. 각 화면의 동작은 screens/ 아래 자기 파일에 있다.
import { state } from './state.js';
import { currentSession } from './auth.js';
import { closeDialog, esc } from './ui.js';
import { bindAccountButtons } from './account.js';
import { showHome } from './screens/home.js';
import { showProfile } from './screens/profile.js';
import { showCourses } from './screens/courses.js';
import { showConditions } from './screens/conditions.js';
import { showPlans } from './screens/plans.js';
import { showResult } from './screens/result.js';
import { showMe } from './screens/me.js';
import { showLeague } from './screens/league.js';
import { showJoin } from './screens/join.js';
import { showShared } from './screens/shared.js';
import { showCompat } from './screens/compat.js';

const ROUTES = {
  '': showHome,
  profile: showProfile,
  courses: showCourses,
  conditions: showConditions,
  plans: showPlans,
  result: showResult,
  me: showMe,
  league: showLeague,
  join: showJoin,
  s: showShared, // #/s/공유값
  c: showCompat, // #/c/궁합값
};

const STEPS = [
  ['profile', '학적 입력'],
  ['courses', '과목 확인'],
  ['conditions', '조건 접수'],
  ['plans', '편성 결과'],
  ['result', '심사 결과'],
  ['me', '내 현황'],
  ['league', '학과 대항전'],
];

const view = document.getElementById('view');
let cleanup = null;

// 편성 절차 화면에서는 「편성」 아이콘이 켜진다
const FLOW = new Set(['profile', 'courses', 'conditions', 'plans', 'result']);

function paintChrome(route) {
  const steps = STEPS.map(([key, label], i) =>
    `<li><a href="#/${key}"${key === route ? ' aria-current="step"' : ''}><i>${i + 1}</i>${label}</a></li>`).join('');
  document.getElementById('steps').innerHTML = steps;
  document.getElementById('steps-inline').innerHTML = FLOW.has(route) ? steps : '';
  const active = FLOW.has(route) ? 'profile' : route;
  for (const link of document.querySelectorAll('.rail a[data-route]')) {
    if (link.dataset.route === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const { profile } = state;
  const who = profile ? `${esc(profile.nickname)} 님` : '비로그인 열람';
  const logout = currentSession() ? ' <button class="btn top-btn" data-account="logout">로그아웃</button>' : '';
  document.getElementById('top-user').innerHTML = `<span class="top-who">${who}</span>${logout}`;
  document.getElementById('rail-avatar').textContent = profile?.nickname?.[0] ?? '나';
  // 횃불이는 데이터와 버튼을 가리지 않는 왼쪽 메뉴 아래에만 둔다(휴대폰에서는 숨김)
  document.getElementById('greet').innerHTML = `<img src="img/mascot/run-1.png" alt="" width="44" height="63">
    <p><b>어서 와요, ${profile ? esc(profile.nickname) : '주자'}님!</b><br>실명 말고 닉네임으로 등록해요</p>`;
}

async function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const show = ROUTES[name] ?? showHome;
  if (cleanup) cleanup();
  cleanup = null;
  closeDialog();
  paintChrome(name);
  window.scrollTo(0, 0);
  cleanup = (await show(view, arg)) ?? null;
  paintChrome(name);
}

bindAccountButtons(document.body);
window.addEventListener('hashchange', route);
route();
