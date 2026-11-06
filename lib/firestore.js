// Firestore REST 접근. 서버 전용 계정의 토큰으로만 읽고 쓴다.
// firebase-admin을 쓰지 않아 함수가 가볍고 서비스 계정 키도 필요 없다. 규칙은 firestore.rules 참고.
import { firebaseConfig } from '../public/firebase-config.js';

const TIMEOUT_MS = 8000;
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
const ROOT = `projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${ROOT}`;

let cached = { token: null, expiresAt: 0 };

async function serverToken() {
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;
  const refreshToken = process.env.FIREBASE_SERVER_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('서버 계정 토큰 미설정');
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`서버 계정 토큰 갱신 실패 ${res.status}`);
  const data = await res.json();
  cached = { token: data.id_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 - TOKEN_MARGIN_MS };
  return cached.token;
}

async function request(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await serverToken()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const error = new Error(`Firestore ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: encodeFields(value) } };
}

const encodeFields = (object) => Object.fromEntries(Object.entries(object).map(([k, v]) => [k, encode(v)]));

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

const decodeFields = (fields) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));

export async function getDoc(path) {
  const doc = await request(`${BASE}/${path}`);
  return doc ? decodeFields(doc.fields ?? {}) : null;
}

const toWrite = ({ path, data }) => ({ update: { name: `${ROOT}/${path}`, fields: encodeFields(data) } });

// 공유 문서를 읽고 고쳐 쓴다. 읽은 뒤 다른 등록이 먼저 썼으면 커밋이 거부되고 처음부터 다시 한다.
// 사용자 토큰은 REST beginTransaction이 403이라(11-06 실측) updateTime 전제 조건으로 같은 보장을 얻는다.
// build(현재값)은 공유 문서의 새 값과 함께 쓸 문서 목록을 돌려준다: { data, alsoWrite: [{path, data}] }
export async function updateShared(path, build, attempts = 6) {
  for (let attempt = 1; ; attempt++) {
    const doc = await request(`${BASE}/${path}`);
    const { data, alsoWrite = [] } = build(doc ? decodeFields(doc.fields ?? {}) : null);
    const guarded = {
      ...toWrite({ path, data }),
      currentDocument: doc ? { updateTime: doc.updateTime } : { exists: false },
    };
    try {
      await request(`${BASE}:commit`, {
        method: 'POST',
        body: JSON.stringify({ writes: [guarded, ...alsoWrite.map(toWrite)] }),
      });
      return;
    } catch (err) {
      const raced = err.status === 409 || err.status === 400;
      if (!raced || attempt >= attempts) throw err;
    }
  }
}
