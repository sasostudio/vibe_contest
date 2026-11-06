// 동시 등록 부하 시험. 계정을 만들지 않고 저장 계층(saveEntry)에 동시에 쏜다.
// 익명 계정을 대량으로 만들면 같은 IP의 Firebase 계정 생성 한도를 미리 써 버리므로 피한다.
// 실행: LEAGUE_NAMESPACE=test_ node --env-file=.env.local scripts/load_register.mjs [인원]
import { getSummary, saveEntry } from '../lib/store.js';

if (process.env.LEAGUE_NAMESPACE !== 'test_') throw new Error('운영 데이터 보호: LEAGUE_NAMESPACE=test_ 로만 실행');
const COUNT = Number(process.argv[2] ?? 60);
const started = Date.now();
const results = await Promise.allSettled(Array.from({ length: COUNT }, (_, i) => {
  const uid = `load-${String(i).padStart(3, '0')}`;
  const score = 60 + (i % 35);
  return saveEntry(uid, { nickname: `부하${i}`, score, updatedAt: Date.now() }, { n: `부하${i}`, d: '부하시험학과', s: score, g: 'C0', t: '시험' });
}));
const ms = Date.now() - started;
const failed = results.filter((r) => r.status === 'rejected');
const summary = await getSummary();
const saved = Object.keys(summary).filter((k) => k.startsWith('load-')).length;
console.log(`동시 ${COUNT}건 · 성공 ${COUNT - failed.length} · 실패 ${failed.length} · 요약 문서에 남은 줄 ${saved} · ${(ms / 1000).toFixed(1)}초`);
if (failed.length) console.log('실패 원인:', [...new Set(failed.map((f) => f.reason.message))].join(', '));
