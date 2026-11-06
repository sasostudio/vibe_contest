// 대표 시간표 저장 구조. 호출량을 낮추려고 랭킹 전체를 요약 문서 1개에 모은다.
// 등록 1회 = 읽기 2건, 쓰기 2건 · 랭킹 조회 = 읽기 1건(캐시 뒤)
import { getDoc, updateShared } from './firestore.js';

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

// 사용자가 직접 대표 등록을 취소한다. 요약 줄과 등록 문서를 같은 커밋에서 지운다.
export async function removeEntry(uid) {
  let removed = false;
  await updateShared(SUMMARY_PATH, (current) => {
    const summary = parseSummary(current);
    removed = uid in summary;
    delete summary[uid];
    return { data: { json: JSON.stringify(summary), updatedAt: Date.now() }, alsoDelete: [entryPath(uid)] };
  });
  return removed;
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
