// 대표 등록 취소. 로그인한 본인의 기록만 지운다. 쓰기 1건 + 삭제 1건.
import { verifiedUid } from '../lib/session.js';
import { removeEntry } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });
  try {
    const uid = await verifiedUid(req);
    if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const removed = await removeEntry(uid);
    return res.status(200).json({ removed });
  } catch (err) {
    console.error(`등록 취소 실패: ${err.message}`);
    return res.status(503).json({ error: '저장소에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.' });
  }
}
