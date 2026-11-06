// 로그인 세션. 익명 로그인은 REST로 바로 처리하고, 구글을 고를 때만 Firebase SDK를 받는다.
import { firebaseConfig } from '../firebase-config.js';

const KEY = 'timetable-league-session';
const SDK = 'https://www.gstatic.com/firebasejs/12.6.0';
const EARLY_REFRESH_MS = 60000;

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

let session = read();

function keep(next) {
  session = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장이 막혀도 이번 방문의 세션은 메모리에 남는다
  }
  return next;
}

export const currentSession = () => session;

export async function signInAnonymously() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!res.ok) throw new Error('익명 로그인 실패');
  const data = await res.json();
  return keep({
    uid: data.localId,
    provider: 'anonymous',
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
  });
}

export async function signInWithGoogle() {
  const [{ initializeApp }, auth] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const { getApps } = await import(`${SDK}/firebase-app.js`);
  const app = getApps()[0] ?? initializeApp(firebaseConfig); // 로그아웃 뒤 다시 로그인해도 앱을 두 번 만들지 않는다
  const { user } = await auth.signInWithPopup(auth.getAuth(app), new auth.GoogleAuthProvider());
  const result = await user.getIdTokenResult();
  return keep({
    uid: user.uid,
    provider: 'google',
    idToken: result.token,
    refreshToken: user.refreshToken,
    expiresAt: new Date(result.expirationTime).getTime(),
  });
}

// 로그아웃. 익명 계정은 이 뒤로 다시 들어갈 방법이 없으므로 화면에서 먼저 확인을 받는다.
export async function signOut() {
  const wasGoogle = session?.provider === 'google';
  session = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 저장소가 막힌 브라우저는 메모리 세션만 지우면 된다
  }
  if (!wasGoogle) return;
  // 구글 로그인은 SDK도 자기 저장소에 세션을 남기므로 함께 끊는다
  const [{ getApps, initializeApp }, auth] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  await auth.signOut(auth.getAuth(getApps()[0] ?? initializeApp(firebaseConfig)));
}

export async function idToken() {
  if (!session) return null;
  if (Date.now() < session.expiresAt - EARLY_REFRESH_MS) return session.idToken;
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
  });
  if (!res.ok) throw new Error('세션 갱신 실패');
  const data = await res.json();
  keep({ ...session, idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in) * 1000 });
  return session.idToken;
}
