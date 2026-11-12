import { TEMPLATES } from '../data/templates.js';
import { DEFAULT_PROVIDER } from '../data/modules.js';
import { evaluate, needsEnclosure, RULES_VERSION } from './guardrails.js';

function coerceParams(template, input) {
  const params = {};
  const issues = [];
  for (const spec of template.params) {
    const raw = input[spec.key] ?? spec.default;
    if (spec.type === 'number') {
      const v = Number(raw);
      params[spec.key] = v;
      if (!Number.isFinite(v) || v < spec.min || v > spec.max) {
        issues.push({ label: spec.label, message: `${spec.min}〜${spec.max}${spec.unit ?? ''}の範囲で指定してください(入力値: ${raw})` });
      }
    } else {
      params[spec.key] = raw;
      if (!spec.options.some((o) => o.value === raw)) {
        issues.push({ label: spec.label, message: `選択肢にない値です(${raw})` });
      }
    }
  }
  return { params, issues };
}

export function buildPackage({ templateId, params = {}, moduleIds = [] }) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`未知のテンプレートです: ${templateId}`);
  const { params: p, issues } = coerceParams(template, params);
  const steps = template.build(p).map((s, i) => ({ id: `S${i + 1}`, ...s }));
  const pkg = {
    template: { id: template.id, name: template.name, verified: template.verified },
    params: p,
    moduleIds: [...moduleIds],
    steps,
    paramIssues: issues,
    approval: null,
  };
  pkg.report = evaluate(pkg);
  return pkg;
}

// 手順に必要なモジュールを既定の提供元から自動選択する
export function recommendModules(templateId, params = {}) {
  const template = TEMPLATES[templateId];
  if (!template) return [];
  const { params: p } = coerceParams(template, params);
  const steps = template.build(p);
  const caps = new Set(steps.flatMap((s) => s.requires ?? []));
  if (needsEnclosure(steps)) caps.add('enclosure');
  return [...new Set([...caps].map((c) => DEFAULT_PROVIDER[c]).filter(Boolean))];
}

export function approvePackage(pkg, { by, note = '' }) {
  if (!by || !by.trim()) throw new Error('承認者名が必要です');
  return { ...pkg, approval: { by: by.trim(), note, at: new Date().toISOString() } };
}

export function canExport(pkg) {
  const v = pkg.report.verdict;
  if (v === 'blocked') return false;
  if (v === 'needs_approval') return Boolean(pkg.approval?.by);
  return true;
}

async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function exportPackage(pkg, now = new Date()) {
  if (!canExport(pkg)) {
    throw new Error(pkg.report.verdict === 'blocked' ? '実行不可の判定のため出力できません' : '承認が必要です');
  }
  const body = {
    schema: 'experiment-package/v0',
    template: pkg.template,
    params: pkg.params,
    modules: pkg.moduleIds,
    steps: pkg.steps,
    guardrail: { verdict: pkg.report.verdict, rulesVersion: RULES_VERSION, findings: pkg.report.findings, usedSubstances: pkg.report.usedSubstances },
    approval: pkg.approval,
  };
  const digest = await sha256Hex(JSON.stringify(body));
  return { id: `pkg-${digest.slice(0, 12)}`, createdAt: now.toISOString(), sha256: digest, ...body };
}

const VERDICT_LABEL = { auto: '自動実行可', needs_approval: '要承認', blocked: '実行不可' };
const SEVERITY_LABEL = { block: '実行不可', approval: '要承認', info: '情報' };

export function toMarkdown(pkg) {
  const r = pkg.report;
  const lines = [];
  lines.push(`# 実験パッケージ: ${pkg.template.name}`, '');
  lines.push(`- 判定: **${VERDICT_LABEL[r.verdict]}**`);
  if (pkg.approval) lines.push(`- 承認: ${pkg.approval.by}(${pkg.approval.at})${pkg.approval.note ? ` / ${pkg.approval.note}` : ''}`);
  lines.push(`- ルール版: ${r.rulesVersion}`, '', '## 条件');
  for (const [k, v] of Object.entries(pkg.params)) lines.push(`- ${k}: ${v}`);
  lines.push('', '## 手順');
  pkg.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.label}${s.substance ? `(${s.substance}: ${s.amount} ${s.unit})` : ''}${s.temp ? ` ${s.temp}℃` : ''}`));
  lines.push('', '## ガードレールの指摘');
  if (r.findings.length === 0) lines.push('- なし');
  for (const f of r.findings) lines.push(`- [${SEVERITY_LABEL[f.severity]}] ${f.title}${f.detail ? ` — ${f.detail}` : ''}`);
  return lines.join('\n');
}
