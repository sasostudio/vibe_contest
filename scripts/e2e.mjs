// 전 구간 헤드리스 시험. 창을 띄우지 않는다.
// 실행: node scripts/e2e.mjs <기준주소> <스크린샷폴더> <playwright-core 경로>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { firebaseConfig } from '../public/firebase-config.js';

const [base = 'http://127.0.0.1:4173', shots = 'shots', pwPath] = process.argv.slice(2);
const { chromium } = createRequire(import.meta.url)(pwPath);
mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` : ${detail}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function freshPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'ko-KR' });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  return page;
}

const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });

async function fillProfile(page, nickname) {
  await page.goto(`${base}/#/profile`);
  await page.fill('#dept', '컴퓨터공학부');
  await page.selectOption('#year', '2');
  await page.fill('#nickname', nickname);
  await page.click('button[type=submit]');
  await page.waitForSelector('#course-area');
}

// 1. 정상 흐름
const page = await freshPage();
await page.goto(base);
await page.waitForSelector('#league-area table, #league-area .box-note');
check('홈이 로그인 없이 열림', true);
check('가상 데이터 표시', (await page.textContent('#league-area')).includes('시연용 가상 데이터'));
await shot(page, '01-home');

await fillProfile(page, '시험학생');
const checked = await page.locator('#course-area input[type=checkbox]:checked').count();
check('추천 과목이 기본 체크됨', checked > 0, `${checked}개`);
const sectionText = await page.textContent('table.sections');
check('분반별 시간과 강의실 표시', /\d\d:\d\d~\d\d:\d\d \(/.test(sectionText));
const before = await page.locator('#preview .class').count();
await page.locator('[data-pin-key]').nth(1).check();
check('분반 고정이 실시간 시간표에 반영', (await page.locator('#preview .class').count()) > before);
await page.hover('tr[data-section] >> nth=4');
check('마우스 올린 분반 미리보기', (await page.locator('#preview .class.ghost').count()) > 0);
await page.locator('[data-pin-key][value=""]').first().check();
await shot(page, '02-courses');
await page.click('[data-tab=general]');
await page.click('[data-area="(핵심)인문"]');
const generalRows = await page.locator('#tab-body [data-mark-key]').count();
check('교양 탭에 영역 과목 전체 표시', generalRows >= 4 * 10, `선택 버튼 ${generalRows}개`);
const wantName = await page.locator('#tab-body tr.course-head b').first().textContent();
await page.locator('#tab-body [data-mark-key][value="want"]').first().check();
check('희망 교양이 담은 과목에 추가', (await page.textContent('#preview')).includes(wantName), wantName);
await page.locator('#tab-body [data-mark-key][value="avoid"]').nth(1).check();
await page.locator('#tab-body [data-mark-key][value="taken"]').nth(2).check();
const counts = await page.textContent('#preview');
check('피할·이미 수강 개수 표시', counts.includes('피할 교양 1') && counts.includes('이미 수강 1'));
await shot(page, '02b-general');
await page.locator('#tab-body [data-mark-key][value=""]').first().check();
await page.click('[data-tab=major]');

await page.click('#next');
await page.waitForSelector('#wish');
await page.fill('#wish', '금공강이면 좋겠고 아침 수업은 싫어. 15학점 듣고 싶어. 그리고 학점 잘 주는 교수님 수업으로.');
await page.click('#to-conditions');
await page.waitForFunction(() => /더했습니다|실패했습니다/.test(document.querySelector('#ai-status').textContent), null, { timeout: 20000 });
const aiStatus = await page.textContent('#ai-status');
check('AI 조건 변환 성공', aiStatus.includes('더했습니다'), aiStatus);
check('금요일 공강 반영', await page.isChecked('[data-day="4"]'));
check('아침 수업 → 오전 피하기 반영', await page.isChecked('#avoid-morning'));
check('버튼에도 같은 값 표시', (await page.getAttribute('[data-q-flag="avoidMorning"]', 'aria-pressed')) === 'true');
await page.click('[data-q-day="2"]');
check('버튼을 누르면 세부 조건에 반영', await page.isChecked('[data-day="2"]'));
await page.click('[data-q-day="2"]');
check('학점 15 반영', (await page.inputValue('#min-credits')) === '15' && (await page.inputValue('#max-credits')) === '15');
check('처리 불가 요청 분리', (await page.textContent('#extra')).includes('해결할 수 없는'), (await page.textContent('#extra')).slice(0, 80));
await shot(page, '03-conditions');

await page.click('#run');
// 오전 피하기는 반드시 지키는 조건이 아니라서 금공강과 함께여도 편성된다
await page.waitForSelector('.plan', { timeout: 30000 });
const planCount = await page.locator('.plan').count();
check('시간표 안 생성', planCount >= 1, `${planCount}안`);
const firstNote = await page.textContent('.plan-note');
check('예상 만족도 AI 평가', firstNote.includes('AI 평가'), firstNote.replace(/\s+/g, ' ').slice(0, 90));
check('총점 별도 표시', (await page.textContent('.plan .win-title')).includes('총점'));
const visible = await page.locator('.plan:visible').count();
check('처음엔 3안만 표시', visible === Math.min(3, planCount), `${visible}개`);
if (planCount > 3) { await page.click('#more'); check('더 보기로 전체 표시', (await page.locator('.plan:visible').count()) === planCount); }
await shot(page, '04-plans');

await page.click('[data-register="0"]');
await page.waitForSelector('[data-how=anonymous]');
await shot(page, '05-login');
await page.click('[data-how=anonymous]');
await page.waitForSelector('.paper', { timeout: 30000 });
check('등록 후 통지서 표시', true);
check('도장은 처음에 숨김', await page.locator('.stamp.hidden').count() === 1);
await page.waitForSelector('.stamp.slam', { timeout: 4000 });
await page.waitForTimeout(700);
await shot(page, '06-result');
const review = await page.textContent('.paper-review');
check('평론에 교수 표현 없음', !review.includes('교수'), review);

await page.click('a[href="#/me"].btn-go');
await page.waitForSelector('text=학과 기여도');
await shot(page, '07-me');
check('내 현황에 시간표 표시', await page.locator('.class').count() > 0);

await page.goto(`${base}/#/league`);
await page.waitForSelector('#league-table table, #league-table .box-note');
await shot(page, '08-league');
check('화면 오류 없음', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

// 2. AI가 죽어도 시연 유지
const offline = await freshPage();
await offline.route('**/api/ai', (route) => route.fulfill({ status: 503, json: { error: 'AI 사용 불가', fallback: true } }));
await fillProfile(offline, 'AI없음');
await offline.click('#next');
await offline.waitForSelector('#wish');
await offline.fill('#wish', '금공강');
await offline.click('#to-conditions');
await offline.waitForFunction(() => /실패했습니다/.test(document.querySelector('#ai-status').textContent));
check('AI 실패 안내 표시', true);
await offline.check('[data-day="4"]');
await offline.click('#run');
await offline.waitForSelector('.plan', { timeout: 15000 });
await offline.waitForTimeout(600);
const fixedNote = await offline.textContent('.plan-note');
check('AI 실패에도 간이 계산 만족도로 표시', fixedNote.includes('간이 계산'), fixedNote.replace(/\s+/g, ' ').slice(0, 80));

// 3. 편성 실패 진단
const stuck = await freshPage();
await fillProfile(stuck, '공강욕심');
await stuck.click('#next');
await stuck.waitForSelector('#wish');
for (const day of [0, 1, 2, 3, 4]) await stuck.check(`[data-day="${day}"]`);
await stuck.click('#run');
await stuck.waitForSelector('text=편성 불가 통지', { timeout: 15000 });
check('불가능한 조건에 원인 표시', true);
await shot(stuck, '09-failure');
const fixes = await stuck.locator('[data-fix]').count();
check('대안 버튼 제시', fixes > 0, `${fixes}개`);

// 4. 휴대폰 폭
const phone = await freshPage({ width: 375, height: 760 });
await phone.goto(base);
await phone.waitForSelector('#league-area table, #league-area .box-note');
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('휴대폰 폭 가로 넘침 없음', overflow <= 0, `${overflow}px`);
await shot(phone, '10-phone-home');
await fillProfile(phone, '폰학생');
const overflow2 = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('휴대폰 과목 화면 가로 넘침 없음', overflow2 <= 0, `${overflow2}px`);

// 5. 서버가 브라우저 값을 믿지 않는지
const post = (body, token) => fetch(`${base}/api/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const session = await page.evaluate(() => JSON.parse(localStorage.getItem('timetable-league-session')));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('timetable-league-v1')));
const payload = { nickname: '시험학생', dept: '컴퓨터공학부', year: 2, sectionIds: saved.result.entry.sectionIds };

check('토큰 없는 등록 거부', (await post(payload)).status === 401);
check('가짜 토큰 등록 거부', (await post(payload, 'fake-token')).status === 401);
check('없는 분반 거부', (await post({ ...payload, sectionIds: ['0000000000'] }, session.idToken)).status === 400);
check('없는 학과 거부', (await post({ ...payload, dept: '가짜학과' }, session.idToken)).status === 400);

await new Promise((r) => setTimeout(r, 16000));
const forged = await post({ ...payload, score: 100, total: 100, grade: 'A+' }, session.idToken);
const forgedBody = await forged.json();
check('브라우저가 보낸 점수 무시', forged.status === 200 && forgedBody.entry.score === saved.result.entry.score, `서버 ${forgedBody.entry?.score}점`);
const again = await post(payload, session.idToken);
check('연속 등록 제한', again.status === 429);

// 6. 공개 응답과 Firestore 직접 접근
const league = await (await fetch(`${base}/api/league`)).text();
check('공개 랭킹에 uid 없음', !league.includes(session.uid));
const docs = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const direct = (path, token, init = {}) => fetch(`${docs}/${path}`, {
  ...init,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});
const body = JSON.stringify({ fields: { score: { integerValue: '100' } } });
check('비로그인 직접 읽기 차단', (await direct('league/summary')).status === 403);
check('일반 사용자 직접 읽기 차단', (await direct('league/summary', session.idToken)).status === 403);
check('일반 사용자 점수 직접 쓰기 차단', (await direct(`entries/${session.uid}`, session.idToken, { method: 'PATCH', body })).status === 403);
check('비로그인 점수 직접 쓰기 차단', (await direct('entries/forged', null, { method: 'PATCH', body })).status === 403);

await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
