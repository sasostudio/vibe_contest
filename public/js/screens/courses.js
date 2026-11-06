// 3번 화면. 왼쪽에서 전공·교양을 고르고 오른쪽 시간표에서 바로 확인한다.
// 탭: 추천 전공(담기) / 교양(희망·비희망) / 과목 검색(담기). 분반 고정은 모든 탭에서 가능하다.
import { DATA } from '../../data/courses.js';
import { GENERAL_AREAS } from '../../lib/conditions.js';
import { bestArrangement, defaultSelection, diagnose, groupCourses, recommendedCourses, searchCourses, targetAllows } from '../../lib/planner.js';
import { DAY_NAMES, courseKey, formatTime, sectionsConflict } from '../../lib/timetable.js';
import { esc, pathLine, showAlert, timetableGrid, win } from '../ui.js';
import { save, state } from '../state.js';

const GENERAL_TYPES = Object.keys(GENERAL_AREAS);
// 13:50 관리자: 「피할」과 「이미 수강」을 「비희망」 하나로 합침
const MARKS = [['', '상관없음'], ['want', '희망'], ['avoid', '비희망']];
const sectionById = new Map(DATA.courses.map((c) => [c.id, c]));

export function coursesByKeys(keys) {
  const wanted = new Set(keys);
  return groupCourses(DATA.courses.filter((c) => wanted.has(courseKey(c))));
}

// 편성에서 빼야 할 교양 과목번호 (비희망)
export const excludedGeneralCodes = () => Object.entries(state.generalMarks)
  .filter(([, mark]) => mark === 'avoid')
  .map(([key]) => key.split('|')[0]);

const sectionNo = (section) => section.id.slice(-3);
const sectionTime = (section) => (section.slots.length
  ? section.slots.map(([d, s, e, room]) => `${DAY_NAMES[d]} ${formatTime(s)}~${formatTime(e)} (${room})`).join(' / ')
  : `시간 없음 (${section.mode})`);

// ── 과목 목록 ─────────────────────────────────────────────
// 입력(체크·라디오)은 그대로 두고 알약 모양(.opt)으로만 보인다. data-* 속성이 동작의 기준이다.
const opt = (cls, input, label) => `<label class="opt ${cls}">${input}${label}</label>`;

function pinOpt(course, value, label) {
  const pinned = state.pinned[course.key] ?? '';
  return opt('', `<input type="radio" name="pin-${esc(course.key)}" data-pin-key="${esc(course.key)}" value="${esc(value)}"${pinned === value ? ' checked' : ''}>`, label);
}

function chooseCell(course, isGeneral) {
  if (!isGeneral) {
    const checked = state.selectedKeys.includes(course.key);
    return opt('want', `<input type="checkbox" data-key="${esc(course.key)}" aria-label="${esc(course.name)} 담기"${checked ? ' checked' : ''}>`, checked ? '담음' : '담기');
  }
  const current = state.generalMarks[course.key] ?? '';
  return MARKS.map(([value, label]) => opt(value || 'none',
    `<input type="radio" name="mark-${esc(course.key)}" data-mark-key="${esc(course.key)}" value="${value}"${current === value ? ' checked' : ''}>`, label)).join('');
}

function courseBlock(course) {
  const isGeneral = GENERAL_TYPES.includes(course.type);
  const mine = course.sections.filter((s) => targetAllows(s, state.profile.dept)).length;
  const tag = mine === 0 ? '내 학과 대상 분반 없음' : mine < course.sections.length ? '학과별 분반' : '';
  const grade = course.grade === '전학년' ? '전학년' : `${course.grade}학년`;
  const sections = course.sections.map((s) => {
    const allowed = targetAllows(s, state.profile.dept);
    const extra = [s.target ? `대상: ${esc(s.target)}` : '', s.cap ? `정원 ${s.cap}명` : ''].filter(Boolean).join(' · ');
    return `<div class="sec${allowed ? '' : ' not-mine'}" data-section="${esc(s.id)}">
      <span class="sec-no">${sectionNo(s)}</span>
      <span>${esc(sectionTime(s))}${extra ? `<span class="sec-cap">${extra}</span>` : ''}</span>
      ${allowed ? pinOpt(course, s.id, '지정') : '<span class="hint">다른 학과</span>'}
    </div>`;
  }).join('');
  return `<div class="course">
    <div class="course-info">
      <p class="course-name"><b>${esc(course.name)}</b>${tag ? ` <span class="tag">${tag}</span>` : ''}</p>
      <p class="course-meta">${grade} · <span class="tag">${esc(course.type)}</span> · ${course.credits}학점 · 분반 ${course.sections.length}개 · ${esc(isGeneral ? course.area : course.dept)}</p>
      <div class="course-choose">${chooseCell(course, isGeneral)}</div>
    </div>
    <div class="course-secs">
      <div class="sec-auto"><span>분반을 정하지 않으면 자동 배정</span>${pinOpt(course, '', '자동')}</div>
      ${sections}
    </div>
  </div>`;
}

const tableOf = (courses) => `<div class="course-list">${courses.map(courseBlock).join('')}</div>`;

// ── 탭 내용 ──────────────────────────────────────────────
function majorTab(recommended) {
  const extras = coursesByKeys(state.extraKeys).filter((c) => !recommended.some((r) => r.key === c.key) && !GENERAL_TYPES.includes(c.type));
  const listed = [...recommended, ...extras];
  return `<p class="hint">시간표 자료에 필수 여부가 없어 「추천 과목」으로 표시합니다. 이미 들은 과목은 체크를 해제하십시오. 담은 과목은 반드시 포함됩니다.</p>
    ${recommended.length ? '' : '<div class="box-note">이 학과·학년의 추천 전공을 찾지 못했습니다. 「과목 검색」 탭에서 담으십시오.</div>'}
    ${listed.length ? tableOf(listed) : ''}`;
}

function generalTab() {
  const areaButtons = Object.entries(GENERAL_AREAS).map(([type, areas]) =>
    `<div class="area-row"><span class="tag">${type}</span>${areas.map((a) =>
      `<button class="btn${a === state.generalArea ? ' btn-go' : ''}" data-area="${esc(a)}">${esc(a.replace('(핵심)', ''))}</button>`).join('')}</div>`).join('');
  const courses = groupCourses(DATA.courses.filter((c) => GENERAL_TYPES.includes(c.type) && c.area === state.generalArea))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return `${areaButtons}
    <p class="hint">희망은 반드시 넣고, 비희망은 넣지 않습니다. 상관없음인 교양은 남은 학점을 채울 때 후보가 됩니다. ${esc(state.generalArea)} 과목 ${courses.length}개.</p>
    ${tableOf(courses)}`;
}

function searchTab(query) {
  const hits = query ? searchCourses(DATA, query, 15) : [];
  return `<form class="row" id="search-form">
      <label for="query">교과목명</label><input id="query" type="search" placeholder="예: 빅데이터" value="${esc(query)}">
      <button class="btn" type="submit">검색</button>
    </form>
    ${query && !hits.length ? '<p class="hint">이번 학기에 개설된 과목 중 찾지 못했습니다. 과목 이름의 일부만 입력해 보십시오.</p>' : ''}
    ${hits.length ? tableOf(hits) : ''}`;
}

// ── 오른쪽: 실시간 시간표와 담은 과목 ───────────────────────
// 고정한 분반(실선)과 함께, 자동 배정 과목은 겹치지 않는 조합 중 총점이 가장 높은 분반을 「예상 배정」(점선)으로 그린다.
// 실제 편성은 조건과 교양 채우기까지 하므로 달라질 수 있다.
const NO_CONDITIONS = { freeDays: [], noFirst: false, noNight: false };
let arrangementCache = { key: '', value: null };

function arrangement() {
  const key = JSON.stringify([state.selectedKeys, state.pinned]);
  if (arrangementCache.key === key) return arrangementCache.value;
  const courses = coursesByKeys(state.selectedKeys).map((c) => {
    const only = c.sections.filter((s) => s.id === state.pinned[c.key]);
    return only.length ? { ...c, sections: only } : c;
  });
  const fixedIds = new Set(courses.filter((c) => c.sections.length === 1).map((c) => c.sections[0].id));
  const best = bestArrangement(courses, state.profile.dept);
  const value = best
    ? { placed: best, guessIds: new Set(best.filter((s) => !fixedIds.has(s.id)).map((s) => s.id)), causes: [] }
    : { placed: courses.filter((c) => c.sections.length === 1).map((c) => c.sections[0]), guessIds: new Set(), causes: diagnose(courses, NO_CONDITIONS).causes };
  arrangementCache = { key, value };
  return value;
}

function previewHtml(hoverId) {
  const { placed, guessIds, causes } = arrangement();
  const hover = sectionById.get(hoverId);
  const showHover = hover && !placed.some((s) => s.id === hover.id);
  const sections = showHover ? [...placed, hover] : placed;
  const marks = Object.fromEntries([...guessIds].map((id) => [id, 'guess']));
  if (showHover) marks[hover.id] = placed.some((s) => sectionsConflict(s, hover)) ? 'ghost clash' : 'ghost';
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (sectionsConflict(placed[i], placed[j])) marks[placed[i].id] = marks[placed[j].id] = 'clash';
    }
  }
  const picked = coursesByKeys(state.selectedKeys);
  const sum = picked.reduce((total, c) => total + c.credits, 0);
  const count = (mark) => Object.values(state.generalMarks).filter((m) => m === mark).length;
  const rows = picked.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${c.credits}</td>
    <td class="mid"><button class="btn" data-remove="${esc(c.key)}">취소</button></td></tr>`).join('');
  const clash = Object.values(marks).some((m) => m.includes('clash'));
  return `${timetableGrid(sections, undefined, marks)}
    ${guessIds.size ? '<p class="hint">점선은 예상 배정입니다. 분반을 고정하지 않은 과목은 편성 때 조건에 맞춰 바뀔 수 있습니다.</p>' : ''}
    ${causes.length ? `<div class="box-note"><b>담은 과목끼리 시간이 겹칩니다</b><ul>${causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
    ${clash ? '<p class="clash-note">빨간 테두리: 시간이 겹칩니다.</p>' : ''}
    <p><b>담은 과목 ${sum}학점</b> / 학적 상한 ${state.profile.creditCap}학점 · 비희망 교양 ${count('avoid')}</p>
    ${picked.length ? `<div class="scroll"><table><tbody>${rows}</tbody></table></div>` : ''}`;
}

// ── 화면 ────────────────────────────────────────────────
export function showCourses(view) {
  if (!state.profile) {
    location.hash = '#/profile';
    return;
  }
  state.pinned ??= {};
  state.generalMarks ??= {};
  // 합치기 전에 저장된 「이미 수강」은 비희망으로 옮긴다
  for (const [key, mark] of Object.entries(state.generalMarks)) if (mark === 'taken') state.generalMarks[key] = 'avoid';
  state.courseTab ??= 'major';
  state.generalArea ??= '학문의기초';
  const recommended = recommendedCourses(DATA, state.profile);
  if (state.selectedKeys === null) {
    state.selectedKeys = defaultSelection(recommended, state.conditions).map((c) => c.key);
    save();
  }
  let query = '';
  const TABS = [['major', '추천 전공'], ['general', '교양'], ['search', '과목 검색']];

  view.innerHTML = `${pathLine('시간표 편성 신청', '과목 확인')}
    <div class="course-layout">
      <div id="course-area" class="course-area-card">
        <div class="tabs" role="tablist">${TABS.map(([key, label]) => `<button class="tab" role="tab" data-tab="${key}">${label}</button>`).join('')}</div>
        <div class="tab-body" id="tab-body"></div>
      </div>
      <aside class="preview">${win('내 시간표', '<div id="preview"></div>')}</aside>
    </div>
    <div class="row row-end"><a class="btn" href="#/profile">이전</a><button class="btn btn-go" id="next">다음: 조건 접수</button></div>`;

  const area = view.querySelector('#course-area');
  const previewBox = view.querySelector('#preview');
  const paintPreview = (hoverId) => { previewBox.innerHTML = previewHtml(hoverId); };
  const paintTab = () => {
    for (const tab of area.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === state.courseTab));
    const body = area.querySelector('#tab-body');
    if (state.courseTab === 'general') body.innerHTML = generalTab();
    else if (state.courseTab === 'search') body.innerHTML = searchTab(query);
    else body.innerHTML = majorTab(recommended);
  };
  const setSelected = (key, on) => {
    state.selectedKeys = state.selectedKeys.filter((k) => k !== key);
    if (on) {
      state.selectedKeys.push(key);
      if (!recommended.some((r) => r.key === key) && !state.extraKeys.includes(key)) state.extraKeys.push(key);
    }
    state.plans = null;
    save();
  };
  // 교양의 상태를 바꾼다. 희망만 담기 목록에 넣고, 나머지는 빼면서 분반 고정도 푼다
  const setMark = (key, mark) => {
    if (mark) state.generalMarks[key] = mark;
    else delete state.generalMarks[key];
    if (mark !== 'want') delete state.pinned[key];
    setSelected(key, mark === 'want');
  };
  const isGeneralKey = (key) => coursesByKeys([key]).some((c) => GENERAL_TYPES.includes(c.type));
  paintTab();
  paintPreview();

  // view는 화면끼리 공유하므로 리스너는 이 화면의 내용에만 건다
  area.addEventListener('click', (event) => {
    const { tab, area: areaName } = event.target.dataset ?? {};
    if (tab) state.courseTab = tab;
    if (areaName) state.generalArea = areaName;
    if (tab || areaName) {
      save();
      paintTab();
    }
  });
  area.addEventListener('change', (event) => {
    const { key, pinKey, markKey } = event.target.dataset ?? {};
    if (key) setSelected(key, event.target.checked);
    if (markKey) setMark(markKey, event.target.value);
    if (pinKey) {
      if (event.target.value) state.pinned[pinKey] = event.target.value;
      else delete state.pinned[pinKey];
      if (isGeneralKey(pinKey)) setMark(pinKey, 'want');
      else setSelected(pinKey, true);
    }
    if (key || markKey || pinKey) {
      paintTab();
      paintPreview();
    }
  });
  area.addEventListener('submit', (event) => {
    event.preventDefault();
    query = area.querySelector('#query').value.trim();
    paintTab();
  });
  area.addEventListener('mouseover', (event) => {
    const row = event.target.closest('[data-section]');
    if (row) paintPreview(row.dataset.section);
  });
  area.addEventListener('mouseleave', () => paintPreview());
  previewBox.addEventListener('click', (event) => {
    const key = event.target.dataset?.remove;
    if (!key) return;
    if (state.generalMarks[key]) setMark(key, '');
    else setSelected(key, false);
    delete state.pinned[key];
    save();
    paintTab();
    paintPreview();
  });

  view.querySelector('#next').addEventListener('click', () => {
    const sum = coursesByKeys(state.selectedKeys).reduce((total, c) => total + c.credits, 0);
    if (sum > state.profile.creditCap) {
      showAlert('학점 초과', [`담은 과목이 ${sum}학점입니다. 상한 ${state.profile.creditCap}학점 이하로 줄이십시오.`]);
      return;
    }
    location.hash = '#/conditions';
  });
}
