// 요청의 Firebase ID 토큰을 확인해 사용자 uid를 얻는다. 브라우저가 보낸 uid는 쓰지 않는다.
import { firebaseConfig } from '../public/firebase-config.js';

export async function verifiedUid(req) {
  const match = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''));
  if (!match) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: match[1] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.users?.[0]?.localId ?? null;
}
