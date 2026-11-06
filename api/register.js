// 대표 시간표 등록. 브라우저는 분반 번호와 프로필만 보내고 점수는 여기서 계산한다.
import { DATA } from '../public/data/courses.js';
import { eligibilityProblems, scoreTimetable } from '../public/lib/score.js';
import { verifiedUid } from '../lib/session.js';
import { getEntry, saveEntry } from '../lib/store.js';
import { buildLeague, standingOf } from '../lib/league.js';
import { writeVerdict } from '../lib/verdict.js';
import { classifyType } from '../public/lib/mbti.js';

const MIN_INTERVAL_MS = 15000;
const MAX_SECTIONS = 14;
const MAX_NICKNAME = 12;
const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));

function readProfile(body) {
  const nickname = String(body?.nickname ?? '').replace(/\s+/g, ' ').trim();
  const year = Number(body?.year);
  if (!nickname || nickname.length > MAX_NICKNAME) return { error: `닉네임은 1~${MAX_NICKNAME}자로 입력하십시오.` };
  if (!DATA.depts.includes(body?.dept)) return { error: '학과 목록에 있는 학과를 고르십시오.' };
  if (![1, 2, 3, 4].includes(year)) return { error: '학년을 고르십시오.' };
  return { nickname, dept: body.dept, year };
}

function readSections(body) {
  const ids = body?.sectionIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_SECTIONS) return null;
  const sections = ids.map((id) => sectionById.get(id));
  return sections.every(Boolean) ? sections : null;
}

const sameSections = (entry, sections) =>
  entry && [...entry.sectionIds].sort().join() === sections.map((s) => s.id).sort().join();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });
  try {
    const uid = await verifiedUid(req);
    if (!uid) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const profile = readProfile(req.body);
    if (profile.error) return res.status(400).json({ error: profile.error });
    const sections = readSections(req.body);
    if (!sections) return res.status(400).json({ error: '시간표에 없는 분반이 포함되어 있습니다.' });
    const problems = eligibilityProblems(sections, profile.dept);
    if (problems.length) return res.status(422).json({ error: '등록 자격 미달', problems });

    const previous = await getEntry(uid);
    if (previous && Date.now() - previous.updatedAt < MIN_INTERVAL_MS) {
      return res.status(429).json({ error: '방금 등록했습니다. 15초 뒤에 다시 시도하십시오.' });
    }

    const score = scoreTimetable(sections);
    const type = classifyType(sections);
    // 같은 시간표를 다시 등록하면 AI를 부르지 않는다
    const verdict = sameSections(previous, sections) && previous.dept === profile.dept
      ? { title: previous.title, review: previous.review, typeLine: previous.typeLine ?? '', source: previous.verdictSource }
      : await writeVerdict({ dept: profile.dept, sections, score, type });

    const entry = {
      ...profile,
      sectionIds: sections.map((s) => s.id),
      score: score.total,
      grade: score.grade,
      stamp: score.stamp,
      items: score.items,
      credits: score.stats.credits,
      title: verdict.title,
      review: verdict.review,
      verdictSource: verdict.source,
      typeId: type.id,
      typeLine: verdict.typeLine,
      // 다시 등록해도 공유 링크는 그대로 둔다
      ...(previous?.shareToken ? { shareToken: previous.shareToken } : {}),
      previousScore: previous?.score ?? null,
      updatedAt: Date.now(),
    };
    const line = { n: profile.nickname, d: profile.dept, s: score.total, g: score.grade, t: verdict.title };
    const summary = await saveEntry(uid, entry, line);
    return res.status(200).json({ entry, standing: standingOf(summary, uid), league: buildLeague(summary) });
  } catch (err) {
    console.error(`등록 실패: ${err.message}`);
    return res.status(503).json({ error: '저장소에 연결하지 못했습니다. 잠시 뒤 다시 시도하십시오.' });
  }
}
