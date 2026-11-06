// 7·9번 화면. 후보 평가와 비교, 실패 시 원인과 대안, 대표 등록.
// 후보는 코드가 만들고, 어느 안을 위에 둘지는 AI 예상 만족도로 정한다. 총점은 코드 값 그대로다.
import { DATA } from '../../data/courses.js';
import { parseAiJson } from '../../lib/conditions.js';
import { planSummary } from '../../lib/planner.js';
import { bySatisfaction, planFacts, readAiSatisfaction, simpleSatisfaction } from '../../lib/satisfaction.js';
import { eligibilityProblems, scoreTimetable } from '../../lib/score.js';
import { askAi, registerTimetable } from '../api.js';
import { currentSession, signInAnonymously, signInWithGoogle } from '../auth.js';
import { closeDialog, esc, hourRange, openDialog, pathLine, showAlert, showBusy, timetableGrid, win } from '../ui.js';
import { save, state } from '../state.js';
import { runPlanner } from './conditions.js';

const FIRST_SHOWN = 3;
const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));
const allNames = [...new Set(DATA.courses.map((c) => c.name))];

const loadPlans = () => (state.plans ?? []).map((saved) => {
  const sections = saved.ids.map((id) => sectionById.get(id)).filter(Boolean);
  return { ...saved, sections, score: scoreTimetable(sections) };
});

// 후보 전체를 AI 1회 호출로 평가한다. 실패하면 간이 계산으로 채운다.
async function rateCandidates(plans) {
  const c = state.conditions;
  const request = {
    '학생이 쓴 문장': state.conditionText || '(문장 없음, 조건표로 입력)',
    조건: {
      공강: c.freeDays.map((d) => '월화수목금'[d]).join(''),
      '1교시 제외': c.noFirst,
      '야간 제외': c.noNight,
      학점: `${c.minCredits}~${c.maxCredits}`,
      '교양 영역': c.areas.join(', ') || '전체',
      듣고싶은: c.wantKeywords,
      피할: c.avoidKeywords,
      '그 밖의 희망': c.preferences,
    },
    후보: plans.map(planFacts),
  };
  const answer = await askAi('satisfaction', JSON.stringify(request));
  const parsed = answer ? parseAiJson(answer) : null;
  const sats = parsed ? readAiSatisfaction(parsed, plans, c, allNames) : plans.map((p) => simpleSatisfaction(p, c));
  const rated = plans.map((plan, i) => ({ ...plan, sat: sats[i] })).sort(bySatisfaction);
  state.plans = rated.map(({ ids, sat }) => ({ ids, sat }));
  save();
  return rated;
}

function checksHtml(sat) {
  const source = { ai: 'AI 평가', 'ai-corrected': 'AI 평가, 코드 보정' }[sat.source] ?? '간이 계산';
  const rows = sat.checks.map((c) =>
    `<li><b>${c.met ? '충족' : '미충족'}</b> ${esc(c.label)}${c.reason ? ` <span class="hint">${esc(c.reason)}</span>` : ''}</li>`).join('');
  return `<div class="plan-note"><p><b>예상 만족도 ${sat.score}%</b> <span class="tag">${source}</span></p><ul>${rows}</ul></div>`;
}

function planHtml(plan, index, range) {
  const { cons } = planSummary(plan);
  const problems = eligibilityProblems(plan.sections, state.profile.dept);
  return `<section class="win plan">
    <h2 class="win-title"><span>제${index + 1}안 · 만족도 ${plan.sat.score}%</span><span>총점 ${plan.score.total}점 ${esc(plan.score.grade)}</span></h2>
    <div class="win-body">
      ${timetableGrid(plan.sections, range)}
      ${checksHtml(plan.sat)}
      ${cons.length ? `<p class="cons">총점 감점: ${cons.map(esc).join(', ')}</p>` : ''}
      <p class="course-list">${plan.score.stats.credits}학점: ${plan.sections.map((s) => esc(s.name)).join(', ')}</p>
      ${problems.length ? `<div class="box-note"><b>등록 자격 미달</b><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
      <button class="btn btn-go" data-register="${index}"${problems.length ? ' disabled' : ''}>이 안을 대표로 등록</button>
    </div>
  </section>`;
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
    state.result = { ...data, satisfaction: plan.sat, fresh: true };
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

function paint(view, plans) {
  const range = hourRange(plans.map((p) => p.sections));
  const first = plans.slice(0, FIRST_SHOWN);
  const rest = plans.slice(FIRST_SHOWN);
  view.innerHTML = `${pathLine('시간표 편성 신청', '편성 결과')}
    <p class="hint">조건에 맞는 후보 ${plans.length}개를 예상 만족도 순으로 보여 줍니다. 순위표에 들어가는 점수는 모두에게 같은 기준인 총점입니다.</p>
    <div class="plans">${first.map((p, i) => planHtml(p, i, range)).join('')}</div>
    ${rest.length ? `<div class="row row-end" style="margin-top:9px"><button class="btn" id="more">다른 안 더 보기 (${rest.length}개)</button></div>
      <div class="plans" id="more-plans" hidden>${rest.map((p, i) => planHtml(p, i + FIRST_SHOWN, range)).join('')}</div>` : ''}
    <div class="row row-end" style="margin-top:9px"><a class="btn" href="#/conditions">조건 바꿔 다시 짜기</a></div>`;
  for (const button of view.querySelectorAll('[data-register]')) {
    button.addEventListener('click', () => register(plans[Number(button.dataset.register)]));
  }
  view.querySelector('#more')?.addEventListener('click', (event) => {
    view.querySelector('#more-plans').hidden = false;
    event.target.remove();
  });
}

export async function showPlans(view) {
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
  let plans = loadPlans();
  if (plans.some((p) => !p.sat)) {
    view.innerHTML = pathLine('시간표 편성 신청', '편성 결과');
    showBusy(`AI가 후보 ${plans.length}개의 예상 만족도를 평가하고 있습니다.`);
    plans = await rateCandidates(plans);
    closeDialog();
  }
  paint(view, plans);
}
