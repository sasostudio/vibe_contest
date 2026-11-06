// 시간표 궁합.
// POST { t: 공유 링크값 } → 로그인한 사람과 링크 주인의 궁합을 만들거나, 같은 쌍의 저장본을 돌려준다
// GET  ?c=궁합값          → 로그인 없이 공개본 (겹치는 정보만)
import { DATA } from '../public/data/courses.js';
import { compareTimetables } from '../public/lib/compat.js';
import { DAY_NAMES, formatTime } from '../public/lib/timetable.js';
import { verifiedUid } from '../lib/session.js';
import { getCompat, getEntry, getPair, pairKey, saveCompat, shareOwner } from '../lib/store.js';
import { TOKEN_PATTERN, makeToken, publicCompat, sectionsOf } from '../lib/share.js';
import { writeCompatLine } from '../lib/verdict.js';
import { clientIp, createLimiter } from '../lib/ratelimit.js';

const viewLimiter = createLimiter(300);
const makeLimiter = createLimiter(120);

const person = (entry) => ({ nickname: entry.nickname, dept: entry.dept, title: entry.title });
const span = (w) => `${DAY_NAMES[w.day]} ${formatTime(w.start)}~${formatTime(w.end)}`;

// 두 사람 다 시간표를 바꾸지 않았으면 저장본을 그대로 쓴다(AI 재호출 없음)
const unchanged = (pair, uidA, entryA, uidB, entryB) =>
  pair?.updated?.[uidA] === entryA.updatedAt && pair?.updated?.[uidB] === entryB.updatedAt;

async function make(req, res) {
  if (makeLimiter.limited(clientIp(req))) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 뒤 다시 시도하십시오.' });
  const uid = await verifiedUid(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const token = String(req.body?.t ?? '');
  const owner = TOKEN_PATTERN.test(token) ? await shareOwner(token) : null;
  if (!owner) return res.status(404).json({ error: '꺼졌거나 없는 링크입니다.' });
  if (owner === uid) return res.status(400).json({ error: '본인과는 궁합을 볼 수 없습니다. 링크를 친구에게 보내십시오.' });
  const [mine, theirs] = await Promise.all([getEntry(uid), getEntry(owner)]);
  if (!mine) return res.status(409).json({ error: '대표 시간표를 먼저 등록하십시오.', needEntry: true });
  if (!theirs || theirs.shareToken !== token) return res.status(404).json({ error: '꺼졌거나 없는 링크입니다.' });

  const key = pairKey(uid, owner);
  const pair = await getPair(key);
  if (unchanged(pair, uid, mine, owner, theirs)) return res.status(200).json({ token: pair.token, reused: true });

  const overlap = compareTimetables(sectionsOf(theirs), sectionsOf(mine));
  const { line, source } = await writeCompatLine({
    궁합점수: overlap.score,
    함께공강인요일: overlap.freeDays.map((d) => DAY_NAMES[d]),
    함께비는시간: overlap.windows.map(span),
    같은점심시간: overlap.lunches.map(span),
    같이쓰는건물: overlap.buildings.map((code) => DATA.buildings[code] ?? code),
  });
  const compatToken = makeToken();
  const compat = { a: person(theirs), b: person(mine), ...overlap, line, lineSource: source, createdAt: Date.now() };
  await saveCompat(compatToken, compat, key, { token: compatToken, updated: { [uid]: mine.updatedAt, [owner]: theirs.updatedAt } }, pair?.token);
  return res.status(200).json({ token: compatToken, reused: false });
}

async function view(req, res) {
  if (viewLimiter.limited(clientIp(req))) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 뒤 다시 여십시오.' });
  const token = String(req.query?.c ?? '');
  const compat = TOKEN_PATTERN.test(token) ? await getCompat(token) : null;
  if (!compat) return res.status(404).json({ error: '없는 궁합 결과입니다.' });
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.status(200).json(publicCompat(compat));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await view(req, res);
    if (req.method === 'POST') return await make(req, res);
    return res.status(405).json({ error: 'GET, POST만 허용' });
  } catch (err) {
    console.error(`궁합 실패: ${err.message}`);
    return res.status(503).json({ error: '저장소에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.' });
  }
}
