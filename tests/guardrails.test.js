import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage, recommendModules, approvePackage, canExport, exportPackage, toMarkdown } from '../src/engine/package.js';

const build = (templateId, params = {}, moduleIds) =>
  buildPackage({ templateId, params, moduleIds: moduleIds ?? recommendModules(templateId, params) });

const ids = (pkg) => pkg.report.findings.map((f) => f.id);

test('水と塩酸の少量スクリーニングは自動実行可', () => {
  const pkg = build('liquid-screening');
  assert.equal(pkg.report.verdict, 'auto');
});

test('エタノール120mLは可燃性の自動上限(100mL)を超え、要承認', () => {
  const pkg = build('liquid-screening', { solvent: 'ethanol' });
  assert.equal(pkg.report.verdict, 'needs_approval');
  assert.ok(ids(pkg).some((i) => i.startsWith('amount.approval.ethanol.flammable')));
});

test('揮発性の溶媒でドラフトが無いと実行不可', () => {
  const mods = recommendModules('liquid-screening', { solvent: 'ethanol' }).filter((m) => m !== 'fume_hood');
  const pkg = build('liquid-screening', { solvent: 'ethanol' }, mods);
  assert.equal(pkg.report.verdict, 'blocked');
  assert.ok(ids(pkg).includes('enclosure.required'));
});

test('必要なモジュールが無いと実行不可', () => {
  const pkg = build('liquid-screening', {}, ['liquid_handler']);
  assert.equal(pkg.report.verdict, 'blocked');
  assert.ok(ids(pkg).includes('module.missing.mix'));
  assert.ok(ids(pkg).includes('module.missing.measure'));
});

test('硝酸と有機溶媒の併用は実行不可', () => {
  const pkg = build('precursor-synthesis', { solvent: 'ethanol', acid: 'hno3', temp_C: 40 });
  assert.equal(pkg.report.verdict, 'blocked');
  assert.ok(ids(pkg).includes('incompatible.hno3.ethanol'));
});

test('次亜塩素酸ナトリウムとアンモニア水の併用は実行不可', async () => {
  const { evaluate } = await import('../src/engine/guardrails.js');
  const step = (substance) => ({ id: substance, type: 'dispense', substance, amount: 1, unit: 'mL', requires: ['dispense'] });
  const base = { template: { verified: true }, params: {}, moduleIds: ['liquid_handler', 'fume_hood'], paramIssues: [] };
  const single = evaluate({ ...base, steps: [step('naocl')] });
  assert.notEqual(single.verdict, 'blocked');
  const both = evaluate({ ...base, steps: [step('naocl'), step('nh3aq')] });
  assert.equal(both.verdict, 'blocked');
  assert.ok(both.findings.some((f) => f.id === 'incompatible.naocl.nh3aq'));
});

test('加熱温度が装置の上限(150℃)を超えると実行不可', () => {
  const pkg = build('thin-film-coating', { solvent: 'dmf', anneal_C: 200 });
  assert.equal(pkg.report.verdict, 'blocked');
  assert.ok(ids(pkg).includes('heat.over_module_limit'));
});

test('溶媒の沸点付近までの加熱は実行不可', () => {
  const pkg = build('precursor-synthesis', { solvent: 'ethanol', acid: 'hcl', temp_C: 70 });
  assert.equal(pkg.report.verdict, 'blocked');
  assert.ok(ids(pkg).includes('heat.near_boiling'));
});

test('可燃性の物質を60℃以上で加熱すると要承認', () => {
  const pkg = build('precursor-synthesis', { solvent: 'dmf', acid: 'hcl', temp_C: 60, volume_mL: 2, n_samples: 10 });
  assert.equal(pkg.report.verdict, 'needs_approval');
  assert.ok(ids(pkg).includes('heat.flammable_warm'));
});

test('粉体の合計質量が自動上限(5g)を超えると要承認、微粉体は囲い込みが必須', () => {
  const pkg = build('powder-mixing', { mass_g: 1, n_samples: 24 });
  assert.equal(pkg.report.verdict, 'needs_approval');
  const mods = recommendModules('powder-mixing').filter((m) => m !== 'fume_hood');
  const noHood = build('powder-mixing', {}, mods);
  assert.equal(noHood.report.verdict, 'blocked');
  assert.ok(ids(noHood).includes('enclosure.required'));
});

test('範囲外の条件は実行不可', () => {
  const pkg = build('liquid-screening', { volume_mL: 999 });
  assert.equal(pkg.report.verdict, 'blocked');
  assert.ok(ids(pkg).includes('param.invalid'));
});

test('試料数が96を超えると要承認', () => {
  const pkg = build('liquid-screening', { n_samples: 200, volume_mL: 1 });
  assert.equal(pkg.report.verdict, 'needs_approval');
  assert.ok(ids(pkg).includes('samples.many'));
});

test('禁止物質(金属リチウム)は実行不可', async () => {
  const { evaluate } = await import('../src/engine/guardrails.js');
  const report = evaluate({
    template: { verified: true },
    params: {},
    moduleIds: ['liquid_handler', 'glovebox'],
    paramIssues: [],
    steps: [{ id: 'S1', type: 'dispense', substance: 'li_metal', amount: 1, unit: 'g', requires: ['dispense'] }],
  });
  assert.equal(report.verdict, 'blocked');
  assert.ok(report.findings.some((f) => f.id === 'substance.prohibited'));
});

test('未登録の物質は実行不可', async () => {
  const { evaluate } = await import('../src/engine/guardrails.js');
  const report = evaluate({
    template: { verified: true },
    params: {},
    moduleIds: ['liquid_handler'],
    paramIssues: [],
    steps: [{ id: 'S1', type: 'dispense', substance: 'mystery', amount: 1, unit: 'mL', requires: ['dispense'] }],
  });
  assert.equal(report.verdict, 'blocked');
  assert.ok(report.findings.some((f) => f.id === 'substance.unknown'));
});

test('長時間(12時間超)は要承認、48時間超は実行不可', () => {
  const longer = build('precursor-synthesis', { solvent: 'water', acid: 'hcl', temp_C: 60, duration_h: 24 });
  assert.equal(longer.report.verdict, 'needs_approval');
  const tooLong = build('precursor-synthesis', { solvent: 'water', acid: 'hcl', temp_C: 60, duration_h: 60 });
  assert.equal(tooLong.report.verdict, 'blocked');
});

test('実行不可は出力できず、要承認は承認後のみ出力できる', async () => {
  const blocked = build('liquid-screening', { volume_mL: 999 });
  assert.equal(canExport(blocked), false);
  await assert.rejects(() => exportPackage(blocked));

  const needs = build('liquid-screening', { solvent: 'ethanol' });
  assert.equal(canExport(needs), false);
  await assert.rejects(() => exportPackage(needs));
  assert.throws(() => approvePackage(needs, { by: ' ' }));

  const approved = approvePackage(needs, { by: '安全管理者', note: '確認済み' });
  assert.equal(canExport(approved), true);
  const out = await exportPackage(approved, new Date('2026-11-12T00:00:00Z'));
  assert.equal(out.schema, 'experiment-package/v0');
  assert.match(out.id, /^pkg-[0-9a-f]{12}$/);
  assert.equal(out.guardrail.verdict, 'needs_approval');
});

test('自動実行可は承認なしで出力でき、同じ内容は同じIDになる', async () => {
  const a = await exportPackage(build('liquid-screening'));
  const b = await exportPackage(build('liquid-screening'));
  assert.equal(a.id, b.id);
});

test('推奨モジュールは手順に必要な動作を満たす', () => {
  const mods = recommendModules('precursor-synthesis', { solvent: 'ethanol', acid: 'hcl' });
  for (const m of ['liquid_handler', 'heat_stir', 'centrifuge', 'spectrometer', 'fume_hood']) assert.ok(mods.includes(m), m);
});

test('Markdown出力に判定と指摘が含まれる', () => {
  const md = toMarkdown(build('liquid-screening', { solvent: 'ethanol' }));
  assert.match(md, /要承認/);
  assert.match(md, /エタノール/);
});
