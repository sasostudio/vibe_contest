// 화면 전환만 맡는다. 각 화면의 동작은 screens/ 아래 자기 파일에 있다.
import { state } from './state.js';
import { currentSession } from './auth.js';
import { closeDialog, esc } from './ui.js';
import { showHome } from './screens/home.js';
import { showProfile } from './screens/profile.js';
import { showCourses } from './screens/courses.js';
import { showConditions } from './screens/conditions.js';
import { showPlans } from './screens/plans.js';
import { showResult } from './screens/result.js';
import { showMe } from './screens/me.js';
import { showLeague } from './screens/league.js';

const ROUTES = {
  '': showHome,
  profile: showProfile,
  courses: showCourses,
  conditions: showConditions,
  plans: showPlans,
  result: showResult,
  me: showMe,
  league: showLeague,
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

function paintChrome(route) {
  document.getElementById('steps').innerHTML = STEPS.map(([key, label]) =>
    `<li><a href="#/${key}"${key === route ? ' aria-current="step"' : ''}>${label}</a></li>`).join('');
  for (const link of document.querySelectorAll('.menu a')) {
    const target = link.getAttribute('href').slice(2);
    if (target === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const { profile } = state;
  const who = profile ? `${esc(profile.dept)} ${esc(profile.nickname)} 님` : '비로그인 열람';
  document.getElementById('top-user').innerHTML = `${who}${currentSession() ? ' 접속 중' : ''}`;
}

async function route() {
  const name = location.hash.replace(/^#\/?/, '');
  const show = ROUTES[name] ?? showHome;
  if (cleanup) cleanup();
  cleanup = null;
  closeDialog();
  paintChrome(name);
  window.scrollTo(0, 0);
  cleanup = (await show(view)) ?? null;
  paintChrome(name);
}

window.addEventListener('hashchange', route);
route();
