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
