// 대표 시간표 저장 구조. 호출량을 낮추려고 랭킹 전체를 요약 문서 1개에 모은다.
// 등록 1회 = 읽기 2건, 쓰기 2건 · 랭킹 조회 = 읽기 1건(캐시 뒤)
import { commitWrites, getDoc, updateShared } from './firestore.js';

// 시험 실행은 LEAGUE_NAMESPACE=test_ 로 실제 리그와 다른 컬렉션에 쓴다
const NAMESPACE = process.env.LEAGUE_NAMESPACE ?? '';
const SUMMARY_PATH = `${NAMESPACE}league/summary`;
const entryPath = (uid) => `${NAMESPACE}entries/${uid}`;

export const getEntry = (uid) => getDoc(entryPath(uid));

const parseSummary = (doc) => (doc?.json ? JSON.parse(doc.json) : {});

export async function getSummary() {
  return parseSummary(await getDoc(SUMMARY_PATH));
}

// 시연용 가상 기록을 통째로 바꾼다. 실제 등록자는 rescore(uid, 줄)로 받은 새 값만 반영한다.
// rescore가 { line, entry }를 돌려주면 그 등록자의 문서와 요약 줄을 같은 커밋에서 고친다.
export const SAMPLE_PREFIX = 'sample-';
export async function replaceSampleLines(lines, rescore = async () => null) {
  let summary;
  const current = parseSummary(await getDoc(SUMMARY_PATH));
  const updates = {};
  for (const uid of Object.keys(current).filter((key) => !key.startsWith(SAMPLE_PREFIX))) {
    const result = await rescore(uid, current[uid]);
    if (result) updates[uid] = result;
  }
  await updateShared(SUMMARY_PATH, (latest) => {
    const real = Object.entries(parseSummary(latest))
      .filter(([key]) => !key.startsWith(SAMPLE_PREFIX))
      .map(([uid, line]) => [uid, updates[uid]?.line ?? line]);
    summary = Object.fromEntries([...real, ...Object.entries(lines)]);
    return {
      data: { json: JSON.stringify(summary), updatedAt: Date.now() },
      alsoWrite: Object.entries(updates).map(([uid, { entry }]) => ({ path: entryPath(uid), data: entry })),
    };
  });
  return summary;
}

// 사용자가 직접 대표 등록을 취소한다. 요약 줄, 등록 문서, 공유 링크를 같은 커밋에서 지운다.
export async function removeEntry(uid) {
  let removed = false;
  const entry = await getEntry(uid);
  await updateShared(SUMMARY_PATH, (current) => {
    const summary = parseSummary(current);
    removed = uid in summary;
    delete summary[uid];
    const share = entry?.shareToken ? [sharePath(entry.shareToken)] : [];
    return { data: { json: JSON.stringify(summary), updatedAt: Date.now() }, alsoDelete: [entryPath(uid), ...share] };
  });
  return removed;
}

// ── 공유 링크: shares/{무작위 값} → 주인 uid. 링크에는 uid가 드러나지 않는다 ──
const sharePath = (token) => `${NAMESPACE}shares/${token}`;

export async function shareOwner(token) {
  return (await getDoc(sharePath(token)))?.uid ?? null;
}

// 있으면 그대로 쓰고, renew면 새 값을 만들고 이전 링크를 지운다(이전 링크는 더 열리지 않는다)
export async function issueShareToken(uid, entry, makeToken, renew = false) {
  if (entry.shareToken && !renew) return entry.shareToken;
  const token = makeToken();
  await commitWrites({
    writes: [
      { path: sharePath(token), data: { uid, createdAt: Date.now() } },
      { path: entryPath(uid), data: { ...entry, shareToken: token } },
    ],
    deletes: entry.shareToken ? [sharePath(entry.shareToken)] : [],
  });
  return token;
}

// ── 궁합: compat/{무작위 값} = 공개 결과, compatPairs/{두 uid} = 같은 쌍 재사용 표시 ──
const compatPath = (token) => `${NAMESPACE}compat/${token}`;
const pairPath = (key) => `${NAMESPACE}compatPairs/${key}`;
export const pairKey = (uidA, uidB) => [uidA, uidB].sort().join('__');

export const getCompat = (token) => getDoc(compatPath(token));
export const getPair = (key) => getDoc(pairPath(key));

export async function saveCompat(token, compat, key, pair, staleToken) {
  await commitWrites({
    writes: [{ path: compatPath(token), data: compat }, { path: pairPath(key), data: pair }],
    deletes: staleToken ? [compatPath(staleToken)] : [],
  });
}

export async function saveEntry(uid, entry, line) {
  let summary;
  await updateShared(SUMMARY_PATH, (current) => {
    summary = parseSummary(current);
    summary[uid] = line;
    return {
      data: { json: JSON.stringify(summary), updatedAt: entry.updatedAt },
      alsoWrite: [{ path: entryPath(uid), data: entry }],
    };
  });
  return summary;
}
