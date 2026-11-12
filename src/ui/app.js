import { TEMPLATES } from '../data/templates.js';
import { MODULES } from '../data/modules.js';
import { buildPackage, recommendModules, approvePackage, canExport, exportPackage, toMarkdown } from '../engine/package.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const VERDICT = {
  auto: '判定: 自動実行可',
  needs_approval: '判定: 要承認(責任者の承認が必要です)',
  blocked: '判定: 実行不可(下の指摘を解消してください)',
};
const SEVERITY = { block: '実行不可', approval: '要承認', info: '情報' };

const state = {
  templateId: Object.keys(TEMPLATES)[0],
  params: {},
  moduleIds: new Set(),
  modulesManual: false, // 手動で装置を変更するまでは、推奨が条件に自動追従する
  approval: null, // { by, note }
  approver: { by: '', note: '' },
};

function resetParams() {
  state.params = {};
  for (const spec of TEMPLATES[state.templateId].params) state.params[spec.key] = spec.default;
}

function currentPackage() {
  let pkg = buildPackage({ templateId: state.templateId, params: state.params, moduleIds: [...state.moduleIds] });
  if (state.approval) pkg = approvePackage(pkg, state.approval);
  return pkg;
}

function invalidateApproval() {
  state.approval = null;
}

function renderTemplates() {
  $('templates').innerHTML = Object.values(TEMPLATES).map((t) => `
    <button type="button" class="card" role="radio" aria-checked="${t.id === state.templateId}" data-id="${esc(t.id)}">
      <b>${esc(t.name)}</b><span>${esc(t.summary)}</span>
    </button>`).join('');
  $('templates').querySelectorAll('.card').forEach((el) => el.addEventListener('click', () => {
    state.templateId = el.dataset.id;
    resetParams();
    state.moduleIds = new Set(recommendModules(state.templateId, state.params));
    state.modulesManual = false;
    invalidateApproval();
    renderTemplates();
    renderForm();
    renderModules();
    update();
  }));
}

function renderForm() {
  const t = TEMPLATES[state.templateId];
  $('params').innerHTML = t.params.map((spec) => {
    const id = `p-${spec.key}`;
    const input = spec.type === 'select'
      ? `<select id="${id}" data-key="${esc(spec.key)}">${spec.options.map((o) => `<option value="${esc(o.value)}"${o.value === state.params[spec.key] ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
      : `<input id="${id}" data-key="${esc(spec.key)}" type="number" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${esc(state.params[spec.key])}">`;
    return `<div class="field"><label for="${id}">${esc(spec.label)}${spec.unit ? ` <span class="unit">(${esc(spec.unit)})</span>` : ''}</label>${input}</div>`;
  }).join('');
  $('params').querySelectorAll('[data-key]').forEach((el) => el.addEventListener('input', () => {
    state.params[el.dataset.key] = el.value;
    if (!state.modulesManual) {
      state.moduleIds = new Set(recommendModules(state.templateId, state.params));
      syncModuleChecks();
    }
    invalidateApproval();
    update();
  }));
}

function renderModules() {
  $('modules').innerHTML = Object.entries(MODULES).map(([id, m]) => `
    <label class="mod"><input type="checkbox" data-mod="${esc(id)}"${state.moduleIds.has(id) ? ' checked' : ''}>
      <span>${esc(m.name)} <small>${esc(m.note)}</small></span></label>`).join('');
  $('modules').querySelectorAll('[data-mod]').forEach((el) => el.addEventListener('change', () => {
    if (el.checked) state.moduleIds.add(el.dataset.mod); else state.moduleIds.delete(el.dataset.mod);
    state.modulesManual = true;
    invalidateApproval();
    update();
  }));
}

function syncModuleChecks() {
  $('modules').querySelectorAll('[data-mod]').forEach((el) => { el.checked = state.moduleIds.has(el.dataset.mod); });
}

function stepMeta(s) {
  const parts = [];
  if (s.substance) parts.push(`${s.substance}: ${s.amount} ${s.unit}`);
  if (s.temp != null) parts.push(`${s.temp}℃`);
  if (s.rpm != null) parts.push(`${s.rpm} rpm`);
  if (s.duration_h != null) parts.push(`${s.duration_h}時間`);
  return parts.join(' / ');
}

function update() {
  const pkg = currentPackage();
  const r = pkg.report;

  $('steps').innerHTML = pkg.steps.map((s) => `<li>${esc(s.label)} <span class="meta">${esc(stepMeta(s))}</span></li>`).join('');

  const v = $('verdict');
  v.className = `verdict ${r.verdict}`;
  v.textContent = VERDICT[r.verdict];

  const order = { block: 0, approval: 1, info: 2 };
  const sorted = [...r.findings].sort((a, b) => order[a.severity] - order[b.severity]);
  $('findings').innerHTML = sorted.length === 0
    ? '<li class="empty">指摘はありません。</li>'
    : sorted.map((f) => `<li class="finding ${f.severity}">
        <div class="t"><span class="badge ${f.severity}">${SEVERITY[f.severity]}</span>${esc(f.title)}</div>
        ${f.detail ? `<div class="d">${esc(f.detail)}</div>` : ''}
        ${f.fix ? `<div class="f">対応: ${esc(f.fix)}</div>` : ''}</li>`).join('');

  renderApproval(pkg);
  $('btn-json').disabled = !canExport(pkg);
  $('btn-md').disabled = r.verdict === 'blocked';
  $('out-msg').textContent = '';
}

function renderApproval(pkg) {
  const box = $('approval');
  const verdict = pkg.report.verdict;
  if (verdict === 'auto') { box.innerHTML = '<p class="empty">承認は不要です。</p>'; return; }
  if (verdict === 'blocked') { box.innerHTML = '<p class="empty">実行不可のため、承認はできません。指摘を解消してください。</p>'; return; }
  if (state.approval) {
    box.innerHTML = `<p>承認済み: ${esc(state.approval.by)}${state.approval.note ? `(${esc(state.approval.note)})` : ''}。条件や装置を変更すると、承認は取り消されます。</p>`;
    return;
  }
  box.innerHTML = `
    <div class="field"><label for="ap-by">承認者名</label><input id="ap-by" type="text" value="${esc(state.approver.by)}"></div>
    <div class="field"><label for="ap-note">メモ</label><input id="ap-note" type="text" value="${esc(state.approver.note)}"></div>
    <div class="row"><button type="button" id="btn-approve">承認する(模擬)</button></div>
    <p id="ap-err" class="msg" role="alert"></p>`;
  $('ap-by').addEventListener('input', (e) => { state.approver.by = e.target.value; $('ap-err').textContent = ''; });
  $('ap-note').addEventListener('input', (e) => { state.approver.note = e.target.value; });
  $('btn-approve').addEventListener('click', () => {
    if (!state.approver.by.trim()) { $('ap-err').textContent = '承認者名を入力してください。'; return; }
    state.approval = { by: state.approver.by, note: state.approver.note };
    update();
  });
}

$('btn-recommend').addEventListener('click', () => {
  state.moduleIds = new Set(recommendModules(state.templateId, state.params));
  state.modulesManual = false;
  invalidateApproval();
  syncModuleChecks();
  update();
});

$('btn-clear').addEventListener('click', () => {
  state.moduleIds = new Set();
  state.modulesManual = true;
  invalidateApproval();
  syncModuleChecks();
  update();
});

$('btn-json').addEventListener('click', async () => {
  try {
    const out = await exportPackage(currentPackage());
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${out.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    $('out-msg').textContent = `${out.id}.json を保存しました。`;
  } catch (e) {
    $('out-msg').textContent = e.message;
  }
});

$('btn-md').addEventListener('click', async () => {
  const text = toMarkdown(currentPackage());
  try {
    await navigator.clipboard.writeText(text);
    $('out-msg').textContent = 'Markdownをコピーしました。';
  } catch {
    $('out-msg').textContent = 'コピーできませんでした。ブラウザの権限を確認してください。';
  }
});

resetParams();
state.moduleIds = new Set(recommendModules(state.templateId, state.params));
renderTemplates();
renderForm();
renderModules();
update();
