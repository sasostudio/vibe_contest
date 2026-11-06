// 공개 랭킹. 닉네임, 학과, 점수, 등급, 칭호만 내보낸다. CDN 캐시로 읽기 횟수를 묶는다.
import { getSummary } from '../lib/store.js';
import { buildLeague } from '../lib/league.js';

const CACHE_MS = 15000;
let cached = { at: 0, body: null };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용' });
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=45');
  if (cached.body && Date.now() - cached.at < CACHE_MS) return res.status(200).json(cached.body);
  try {
    const body = buildLeague(await getSummary());
    cached = { at: Date.now(), body };
    return res.status(200).json(body);
  } catch (err) {
    console.error(`랭킹 실패: ${err.message}`);
    res.setHeader('Cache-Control', 'no-store');
    if (cached.body) return res.status(200).json(cached.body);
    return res.status(503).json({ error: '랭킹을 불러오지 못했습니다.' });
  }
}
