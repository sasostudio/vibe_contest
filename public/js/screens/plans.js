// 7·9번 화면. 3안 비교, 실패 시 원인과 대안, 대표 등록.
import { DATA } from '../../data/courses.js';
import { parseAiJson } from '../../lib/conditions.js';
import { planSummary } from '../../lib/planner.js';
import { eligibilityProblems, scoreTimetable } from '../../lib/score.js';
import { askAi, registerTimetable } from '../api.js';
import { currentSession, signInAnonymously, signInWithGoogle } from '../auth.js';
import { closeDialog, esc, hourRange, openDialog, pathLine, showAlert, showBusy, timetableGrid, win } from '../ui.js';
import { save, state } from '../state.js';
import { runPlanner } from './conditions.js';

const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));

const loadPlans = () => (state.plans ?? []).map((saved) => {
  const sections = saved.ids.map((id) => sectionById.get(id)).filter(Boolean);
  return { ...saved, sections, score: scoreTimetable(sections) };
});

function planHtml(plan, index, range) {
  const { pros, cons } = planSummary(plan);
  const problems = eligibilityProblems(plan.sections, state.profile.dept);
  const fixedNote = pros.length ? `${pros.join(', ')}.` : '조건에 맞춘 기본안입니다.';
  return `<section class="win plan">
    <h2 class="win-title"><span>제${index + 1}안</span><span>예상 ${plan.score.total}점 ${esc(plan.score.grade)}</span></h2>
    <div class="win-body">
      ${timetableGrid(plan.sections, range)}
      <p class="plan-note" data-note="${index}">${esc(plan.note ?? fixedNote)}</p>
      ${pros.length ? `<ul>${pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${cons.length ? `<ul class="cons">${cons.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      <p class="course-list">${plan.score.stats.credits}학점: ${plan.sections.map((s) => esc(s.name)).join(', ')}</p>
      ${problems.length ? `<div class="box-note"><b>등록 자격 미달</b><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <button class="btn btn-go" data-register="${index}"${problems.length ? ' disabled' : ''}>이 안을 대표로 등록</button>
    </div>
  </section>`;
}

async function fillAiNotes(view, plans) {
  if (plans.every((p) => p.note)) return;
  const facts = plans.map((p, i) => ({
    안: i + 1,
    학점: p.score.stats.credits,
    '평일 공강': `${p.score.stats.freeDays}일`,
    '점심시간 있는 날': `${p.score.stats.lunchDays}일`,
    '수업 있는 날': `${p.score.stats.classDays}일`,
    '1교시 있는 날': `${p.score.stats.firstPeriodDays}일`,
    '3연강 이상': `${p.score.stats.longRuns}회`,
    '예상 점수': p.score.total,
    과목: p.sections.map((s) => s.name),
  }));
  const answer = await askAi('plan_notes', JSON.stringify(facts));
  const notes = answer ? parseAiJson(answer)?.notes : null;
  if (!Array.isArray(notes)) return;
  plans.forEach((plan, i) => {
    if (typeof notes[i] !== 'string' || !notes[i].trim() || notes[i].includes('교수')) return;
    const note = notes[i].trim().slice(0, 120);
    state.plans[i].note = note;
    const slot = view.querySelector(`[data-note="${i}"]`);
    if (slot) slot.textContent = note;
  });
  save();
}

function askLogin() {
  return new Promise((resolve) => {
    const modal = openDialog('본인 확인', `
      <p>대표 시간표는 계정마다 1개만 등록됩니다. 로그인 방법을 고르십시오.</p>
      <div class="row"><button class="btn btn-go" data-how="google">구글 로그인</button><button class="btn" data-how="anonymous">익명으로 계속</button><button class="btn" data-how="cancel">취소</button></div>
      <p class="hint" id="login-status">익명으로 등록하면 이 브라우저에서만 내 현황을 볼 수 있습니다.</p>`);
    modal.addEventListener('click', async (event) => {
      const how = event.target.dataset.how;
      if (!how) return;
      if (how === 'cancel') {
        closeDialog();
        resolve(false);
        return;
      }
      try {
        await (how === 'google' ? signInWithGoogle() : signInAnonymously());
        resolve(true);
      } catch {
        modal.querySelector('#login-status').textContent = '로그인에 실패했습니다. 익명으로 계속을 눌러 진행하십시오.';
      }
    });
  });
}

async function register(plan) {
  if (!currentSession() && !(await askLogin())) return;
  showBusy('서버가 시간표를 심사하고 있습니다.');
  const { profile } = state;
  try {
    const { ok, data } = await registerTimetable({
      nickname: profile.nickname, dept: profile.dept, year: profile.year, sectionIds: plan.sections.map((s) => s.id),
    });
    closeDialog();
    if (!ok) {
      showAlert('등록 실패', data.problems ?? [data.error ?? '잠시 뒤 다시 시도하십시오.']);
      return;
    }
    state.result = { ...data, fresh: true };
    save();
    location.hash = '#/result';
  } catch {
    closeDialog();
    showAlert('등록 실패', ['서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하십시오.']);
  }
}

function failureHtml() {
  const { causes, fixes } = state.diagnosis ?? { causes: ['편성 결과가 없습니다.'], fixes: [] };
  return win('편성 불가 통지', `
    <p class="lead">입력한 조건으로는 시간표를 만들 수 없습니다.</p>
    <div class="box-note"><b>원인</b><ul>${causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    ${fixes.length ? `<p><b>이렇게 바꾸면 편성됩니다</b></p><div class="row">${fixes.map((f, i) => `<button class="btn" data-fix="${i}">${esc(f.label)}</button>`).join('')}</div>` : ''}
    <div class="row"><a class="btn" href="#/conditions">조건 다시 입력</a><a class="btn" href="#/courses">과목 다시 고르기</a></div>`);
}

function applyFix(fix) {
  if (fix.kind === 'condition') state.conditions = fix.conditions;
  else state.selectedKeys = state.selectedKeys.filter((k) => k !== fix.removeKey);
  runPlanner();
  // 같은 주소라 hashchange가 없으므로 직접 다시 그린다
  showPlans(document.getElementById('view'));
}

export function showPlans(view) {
  if (!state.profile || state.plans === null) {
    location.hash = state.profile ? '#/conditions' : '#/profile';
    return;
  }
  if (state.plans.length === 0) {
    view.innerHTML = `${pathLine('시간표 편성 신청', '편성 결과')}${failureHtml()}`;
    for (const button of view.querySelectorAll('[data-fix]')) {
      button.addEventListener('click', () => applyFix(state.diagnosis.fixes[Number(button.dataset.fix)]));
    }
    return;
  }
  const plans = loadPlans();
  const range = hourRange(plans.map((p) => p.sections));
  view.innerHTML = `${pathLine('시간표 편성 신청', '편성 결과')}
    <div class="plans">${plans.map((p, i) => planHtml(p, i, range)).join('')}</div>
    <p class="hint">표시된 점수는 예상치입니다. 등록하면 서버가 다시 계산해 확정합니다.</p>
    <div class="row row-end"><a class="btn" href="#/conditions">조건 바꿔 다시 짜기</a></div>`;
  for (const button of view.querySelectorAll('[data-register]')) {
    button.addEventListener('click', () => register(plans[Number(button.dataset.register)]));
  }
  fillAiNotes(view, plans);
}
