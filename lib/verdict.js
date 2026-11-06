// 칭호와 평론. AI가 실패하거나 규칙을 어기면 등급별 고정 문구를 쓴다.
import { askAi } from '../api/ai.js';
import { parseAiJson } from '../public/lib/conditions.js';

const FIXED = {
  'A+': ['공강의 설계자', '본 시간표는 모범 사례로 보관될 예정입니다. 다음 학기에도 이 운이 따르기를 바랍니다.'],
  A0: ['점심 수호자', '시간 배분이 안정적입니다. 사소한 흠은 심사관이 못 본 것으로 처리합니다.'],
  'B+': ['성실한 편성자', '대체로 양호합니다. 다만 한두 개 요일에서 체력 소모가 예상됩니다.'],
  B0: ['무난한 재학생', '문제는 없습니다. 자랑할 것도 없습니다.'],
  'C+': ['평범한 이동러', '수업은 들을 수 있습니다. 쉬는 시간의 안전은 보장하지 않습니다.'],
  C0: ['동선의 희생양', '본 시간표는 체력을 전제로 작성되었습니다. 충분한 수면을 권고합니다.'],
  'D+': ['아침의 포로', '시간표가 재학생을 시험하고 있습니다. 재편성을 검토하십시오.'],
  D0: ['학사경고 후보', '이 시간표로 한 학기를 보내는 것은 권장되지 않습니다.'],
  F: ['재편성 대상자', '심사관이 끝까지 읽었습니다. 다시 짜기 버튼을 찾아 주십시오.'],
};

const isClean = (text) => typeof text === 'string' && text.trim() && !text.includes('교수');

export async function writeVerdict({ dept, sections, score }) {
  const facts = {
    학과: dept,
    총점: score.total,
    등급: score.grade,
    항목: score.items.map((i) => ({ 이름: i.label, 점수: i.points, 만점: i.max, 내용: i.detail })),
    과목: sections.map((s) => s.name),
  };
  const answer = await askAi('verdict', [{ role: 'user', text: JSON.stringify(facts) }]);
  const parsed = answer ? parseAiJson(answer.text) : null;
  if (parsed && isClean(parsed.title) && isClean(parsed.review)) {
    return { title: parsed.title.trim().slice(0, 14), review: parsed.review.trim().slice(0, 160), source: answer.provider };
  }
  const [title, review] = FIXED[score.grade];
  return { title, review, source: 'fixed' };
}
