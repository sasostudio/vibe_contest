// 서버 호출 모음. 점수는 보내지 않고 분반 번호만 보낸다.
import { idToken } from './auth.js';

// 서버가 한도 초과 때 최대 30초 줄을 서고 한 번의 호출에 최대 15초가 걸릴 수 있어 그보다 길게 둔다
const AI_TIMEOUT_MS = 55000;

// 실패하면 null을 돌려준다. 화면은 null이면 체크박스와 고정 문구로 진행한다.
export async function askAi(task, text) {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, messages: [{ role: 'user', text }] }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()).text ?? null;
  } catch {
    return null;
  }
}

export async function fetchLeague() {
  const res = await fetch('/api/league');
  if (!res.ok) throw new Error('랭킹 조회 실패');
  return res.json();
}

async function authHeaders() {
  const token = await idToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchMe() {
  const res = await fetch('/api/me', { headers: await authHeaders() });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('내 현황 조회 실패');
  return res.json();
}

async function json(res) {
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const fetchShare = async (token) => json(await fetch(`/api/share?t=${encodeURIComponent(token)}`));
export const issueShare = async (renew = false) => json(await fetch('/api/share', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  body: JSON.stringify({ renew }),
}));
export const fetchCompat = async (token) => json(await fetch(`/api/compat?c=${encodeURIComponent(token)}`));
export const makeCompat = async (shareToken) => json(await fetch('/api/compat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  body: JSON.stringify({ t: shareToken }),
}));

export async function withdrawTimetable() {
  const res = await fetch('/api/withdraw', { method: 'POST', headers: await authHeaders() });
  if (!res.ok) throw new Error('등록 취소 실패');
  return res.json();
}

// 반환: { ok, status, data }. 자격 미달 사유를 화면에 보여 줘야 해서 예외로 바꾸지 않는다.
export async function registerTimetable(payload) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}
