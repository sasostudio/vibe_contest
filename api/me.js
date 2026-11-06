// 내 현황. 읽기 2건.
import { verifiedUid } from '../lib/session.js';
import { getEntry, getSummary } from '../lib/store.js';
import { standingOf } from '../lib/league.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용' });
  try {
    const uid = await verifiedUid(req);
    if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const [entry, summary] = await Promise.all([getEntry(uid), getSummary()]);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ entry, standing: standingOf(summary, uid) });
  } catch (err) {
    console.error(`내 현황 실패: ${err.message}`);
    return res.status(503).json({ error: '저장소에 연결하지 못했습니다.' });
  }
}
