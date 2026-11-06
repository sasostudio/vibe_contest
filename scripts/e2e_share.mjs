// 공유·궁합 흐름 헤드리스 시험(휴대폰 크기). 익명 계정 2개만 만든다(IP당 시간당 100개 한도 절약).
// 실행: node scripts/e2e_share.mjs <기준주소> <스크린샷폴더> <playwright-core 경로>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [base, shots, pwPath] = process.argv.slice(2);
const { chromium } = createRequire(import.meta.url)(pwPath);
mkdirSync(shots, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` : ${detail}` : ''}`);
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });

// 공유 창 대신 복사로 떨어지게 하고, 복사한 글을 가로챈다
async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true });
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const copiedUrl = async (page) => {
  await page.waitForFunction(() => window.__copied, null, { timeout: 15000 });
  return (await page.evaluate(() => window.__copied)).match(/https?:\/\/\S+/)[0];
};

async function registerTimetable(page, dept, nickname) {
  await page.goto(`${base}/#/profile`);
  await page.fill('#dept', dept);
  await page.fill('#nickname', nickname);
  await page.click('button[type=submit]');
  await page.waitForSelector('#course-area');
  await page.click('#next');
  await page.waitForSelector('#run');
  await page.click('#run');
  await page.waitForSelector('.plan', { timeout: 40000 });
  await page.click('[data-register="0"]');
  if (await page.locator('[data-how=anonymous]').count()) await page.click('[data-how=anonymous]');
  await page.waitForSelector('.paper', { timeout: 60000 });
}

// 1. A가 등록하고 공유
const a = await phone();
await registerTimetable(a, '정보통신공학과', '공유시험A');
check('결과에 시간표 유형 표시', (await a.textContent('.type-name')).length > 0, await a.textContent('.type-name'));
await a.click('#share-result');
const shareUrl = await copiedUrl(a);
const shareToken = shareUrl.split('#/s/')[1];
check('공유 링크는 무작위 값', /^[A-Za-z0-9_-]{16}$/.test(shareToken ?? ''), shareUrl);
await shot(a, 's1-result');

// 2. B가 로그인 없이 링크를 연다
const b = await phone();
await b.goto(shareUrl);
await b.waitForSelector('#compat');
const sharedText = await b.textContent('#view');
check('로그인 없이 공유 결과 열람', sharedText.includes('공유시험A') && sharedText.includes('점'));
check('공유 화면에 시간표·수업 시각 없음', !/\d\d:\d\d/.test(sharedText) && (await b.locator('.class').count()) === 0);
check('공유 화면 가로 넘침 없음', (await overflow(b)) <= 0);
await shot(b, 's2-shared');

// 3. B가 궁합을 누르면 로그인 → 시간표 없음 → 등록 → 궁합으로 복귀
await b.click('#compat');
await b.click('[data-how=anonymous]');
await b.waitForSelector('#compat-note', { timeout: 15000 });
check('시간표 없으면 등록 안내', b.url().endsWith('#/profile'));
await registerTimetable(b, '컴퓨터공학부', '궁합시험B');
await b.waitForFunction(() => location.hash.startsWith('#/c/'), null, { timeout: 60000 });
await b.waitForSelector('.compat-score', { timeout: 30000 });
const compatUrl = b.url();
const compatText = await b.textContent('#view');
check('등록 후 궁합 결과로 자동 복귀', compatText.includes('공유시험A') && compatText.includes('궁합시험B'), await b.textContent('.compat-score'));
check('궁합에 상대 전체 시간표 없음', (await b.locator('.class').count()) === 0);
check('궁합 해설에 교수 언급 없음', !(await b.textContent('.paper-review')).includes('교수'));
check('궁합 화면 가로 넘침 없음', (await overflow(b)) <= 0);
await shot(b, 's3-compat');
await b.evaluate(() => { window.__copied = null; });
await b.click('#share-compat');
check('궁합 결과 공유 링크', (await copiedUrl(b)).includes('#/c/'));

// 4. 같은 쌍은 저장본 재사용
await b.goto(shareUrl);
await b.waitForSelector('#compat');
await b.click('#compat');
await b.waitForFunction(() => location.hash.startsWith('#/c/'), null, { timeout: 30000 });
check('같은 쌍은 같은 궁합 결과 재사용', b.url() === compatUrl);

// 5. 궁합 링크는 로그인 없이 열린다
const c = await phone();
await c.goto(compatUrl);
await c.waitForSelector('.compat-score');
check('궁합 링크 로그인 없이 열람', true);

// 6. 본인 링크로는 궁합 불가
await a.goto(shareUrl);
await a.waitForSelector('#compat');
await a.click('#compat');
await a.waitForSelector('text=본인과는', { timeout: 15000 });
check('본인과 궁합 거부', true);
await a.click('[data-close]');

// 7. 링크 새로 발급하면 이전 링크가 꺼진다
await a.goto(`${base}/#/me`);
await a.waitForSelector('[data-renew]');
await a.click('[data-renew]');
await a.waitForSelector('text=새 링크 발급');
const old = await fetch(`${base}/api/share?t=${shareToken}`);
check('새로 발급하면 이전 링크 404', old.status === 404, String(old.status));
await shot(a, 's4-me');

check('화면 오류 없음', [a, b, c].every((p) => p.errors.length === 0), [a, b, c].flatMap((p) => p.errors).join(' | '));
await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
