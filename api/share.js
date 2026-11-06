// 결과 공유.
// GET  ?t=링크값  → 로그인 없이 공개 정보만 (닉네임, 학과, 유형, 유형 설명, 칭호, 등급, 점수)
// POST { renew }  → 본인 링크 발급. renew면 새 값으로 바꾸고 이전 링크를 끈다
import { verifiedUid } from '../lib/session.js';
import { getEntry, issueShareToken, shareOwner } from '../lib/store.js';
import { TOKEN_PATTERN, makeToken, publicShare } from '../lib/share.js';
import { clientIp, createLimiter } from '../lib/ratelimit.js';

// 청중이 같은 와이파이(IP 하나)로 동시에 열어도 막히지 않을 만큼 둔다
const viewLimiter = createLimiter(300);
const issueLimiter = createLimiter(60);

async function view(req, res) {
  if (viewLimiter.limited(clientIp(req))) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 뒤 다시 여십시오.' });
  const token = String(req.query?.t ?? '');
  if (!TOKEN_PATTERN.test(token)) return res.status(404).json({ error: '없는 링크입니다.' });
  const owner = await shareOwner(token);
  const entry = owner ? await getEntry(owner) : null;
  if (!entry || entry.shareToken !== token) return res.status(404).json({ error: '꺼졌거나 없는 링크입니다.' });
  // 링크를 새로 발급하면 이전 링크가 즉시 꺼져야 하므로 CDN 캐시를 쓰지 않는다(13:40 운영 시험에서 20초 캐시가 꺼진 링크를 보여 줌)
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(publicShare(entry));
}

async function issue(req, res) {
  if (issueLimiter.limited(clientIp(req))) return res.status(429).json({ error: '요청이 너무 많습니다.' });
  const uid = await verifiedUid(req);
  if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
  const entry = await getEntry(uid);
  if (!entry) return res.status(409).json({ error: '대표 시간표를 먼저 등록하십시오.', needEntry: true });
  const token = await issueShareToken(uid, entry, makeToken, req.body?.renew === true);
  return res.status(200).json({ token });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await view(req, res);
    if (req.method === 'POST') return await issue(req, res);
    return res.status(405).json({ error: 'GET, POST만 허용' });
  } catch (err) {
    console.error(`공유 실패: ${err.message}`);
    return res.status(503).json({ error: '저장소에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.' });
  }
}
