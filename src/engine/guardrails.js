import { SUBSTANCES, INCOMPATIBLE } from '../data/substances.js';
import { MODULES } from '../data/modules.js';

export const RULES_VERSION = '0.1.0-demo';

// 物質ごとの総量の閾値。auto 超過 = 要承認、block 超過 = 実行不可。
export const LIMITS = {
  flammable: { unit: 'mL', auto: 100, block: 500, label: '可燃性' },
  toxic: { unit: 'mL', auto: 20, block: 100, label: '有毒性' },
  corrosive: { unit: 'mL', auto: 200, block: 1000, label: '腐食性' },
  oxidizer: { unit: 'mL', auto: 50, block: 200, label: '酸化性' },
  volatile: { unit: 'mL', auto: 200, block: 1000, label: '揮発性' },
  fine_powder: { unit: 'g', auto: 5, block: 50, label: '微粉体' },
};

export const ENCLOSURE_HAZARDS = ['volatile', 'toxic', 'fine_powder'];
export const MAX_SAMPLES_AUTO = 96;
export const DURATION_APPROVAL_H = 12;
export const DURATION_BLOCK_H = 48;
export const HEAT_FLAMMABLE_APPROVAL_C = 60;
export const BOILING_MARGIN_C = 10;

export function needsEnclosure(steps) {
  return steps.some((s) => {
    const sub = s.substance && SUBSTANCES[s.substance];
    return sub && sub.hazards.some((h) => ENCLOSURE_HAZARDS.includes(h));
  });
}

function providersOf(cap) {
  return Object.values(MODULES).filter((m) => m.provides.includes(cap)).map((m) => m.name);
}

/**
 * パッケージを検査する純粋関数。
 * pkg: { template:{verified}, params, steps, moduleIds, paramIssues }
 * 戻り値: { verdict: 'auto'|'needs_approval'|'blocked', findings, usedSubstances, requiredCapabilities }
 */
export function evaluate(pkg) {
  const findings = [];
  const add = (severity, id, title, detail, fix = '') => findings.push({ severity, id, title, detail, fix });

  for (const issue of pkg.paramIssues ?? []) {
    add('block', 'param.invalid', `条件が範囲外です: ${issue.label}`, issue.message, '許可された範囲内の値に変更してください。');
  }

  const caps = new Set(
    (pkg.moduleIds ?? []).flatMap((id) => (MODULES[id] ? MODULES[id].provides : [])),
  );
  const requiredCapabilities = [...new Set(pkg.steps.flatMap((s) => s.requires ?? []))];

  // 1. 必要な動作を提供するモジュールが選ばれているか
  for (const cap of requiredCapabilities) {
    if (!caps.has(cap)) {
      const names = providersOf(cap).join(' / ') || '対応モジュールなし';
      add('block', `module.missing.${cap}`, `必要な装置モジュールが未選択です(${cap})`,
        '手順に必要な動作を実行できるモジュールが選ばれていません。', `追加するモジュール: ${names}`);
    }
  }

  // 2. 物質の確認・総量の集計・加熱の検査(手順順に内容物を追跡)
  const totals = new Map();
  const contents = new Set();
  const heatLimit = Math.min(
    ...(pkg.moduleIds ?? []).map((id) => MODULES[id]).filter((m) => m && m.maxTempC).map((m) => m.maxTempC),
  );

  for (const step of pkg.steps) {
    if (step.substance) {
      const sub = SUBSTANCES[step.substance];
      if (!sub) {
        add('block', 'substance.unknown', `未登録の物質です: ${step.substance}`,
          '物質データベースに無い物質は自動実行できません。', '管理者が SDS を確認し、物質を登録してください。');
        continue;
      }
      if (sub.prohibited) {
        add('block', 'substance.prohibited', `自動化の対象外です: ${sub.name}`, sub.prohibitedReason ?? '', '専門家の管理下で、手作業または別の手順で実施してください。');
      }
      const prev = totals.get(step.substance) ?? { total: 0, unit: step.unit };
      prev.total += step.amount ?? 0;
      totals.set(step.substance, prev);
      contents.add(step.substance);
    }

    if (step.type === 'heat') {
      if (Number.isFinite(heatLimit) && step.temp > heatLimit) {
        add('block', 'heat.over_module_limit', `加熱温度が装置の上限を超えています(${step.temp}℃ > ${heatLimit}℃)`,
          '選択した加熱モジュールの仕様範囲外です。', '温度を下げるか、高温対応のモジュールを使用してください。');
      }
      for (const id of contents) {
        const sub = SUBSTANCES[id];
        if (sub && sub.bp != null && step.temp >= sub.bp - BOILING_MARGIN_C) {
          add('block', 'heat.near_boiling', `${sub.name}の沸点付近まで加熱しています(${step.temp}℃、沸点${sub.bp}℃)`,
            '沸騰・突沸や蒸気の発生のおそれがあります。', `沸点より${BOILING_MARGIN_C}℃以上低い温度に設定してください。`);
        }
      }
      const hasFlammable = [...contents].some((id) => SUBSTANCES[id]?.hazards.includes('flammable'));
      if (hasFlammable && step.temp >= HEAT_FLAMMABLE_APPROVAL_C) {
        add('approval', 'heat.flammable_warm', `可燃性の物質を${step.temp}℃で加熱します`,
          '可燃性物質の加熱は、責任者の確認が必要です。', '承認を取得してください。');
      }
    }

    if (Number.isFinite(step.duration_h)) {
      if (step.duration_h > DURATION_BLOCK_H) {
        add('block', 'duration.too_long', `実行時間が長すぎます(${step.duration_h}時間)`, `${DURATION_BLOCK_H}時間を超える無人実行は許可されません。`, '時間を短縮するか、分割してください。');
      } else if (step.duration_h > DURATION_APPROVAL_H) {
        add('approval', 'duration.long', `無人の長時間実行です(${step.duration_h}時間)`, `${DURATION_APPROVAL_H}時間を超える実行は承認が必要です。`, '承認を取得してください。');
      }
    }
  }

  const usedSubstances = [...totals.entries()].map(([id, v]) => ({
    id, name: SUBSTANCES[id]?.name ?? id, total: Math.round(v.total * 100) / 100, unit: v.unit,
  }));

  // 3. 総量の上限
  for (const [id, v] of totals) {
    const sub = SUBSTANCES[id];
    if (!sub) continue;
    for (const h of sub.hazards) {
      const lim = LIMITS[h];
      if (!lim || lim.unit !== v.unit) continue;
      if (v.total > lim.block) {
        add('block', `amount.block.${id}.${h}`, `${sub.name}の使用量が上限を超えています(${lim.label})`,
          `合計 ${Math.round(v.total * 100) / 100} ${v.unit} > 上限 ${lim.block} ${v.unit}`, '試料数または量を減らしてください。');
      } else if (v.total > lim.auto) {
        add('approval', `amount.approval.${id}.${h}`, `${sub.name}の使用量が自動実行の範囲を超えています(${lim.label})`,
          `合計 ${Math.round(v.total * 100) / 100} ${v.unit} > 自動実行の上限 ${lim.auto} ${v.unit}`, '承認を取得するか、量を減らしてください。');
      }
    }
  }

  // 4. 併用禁止の組み合わせ
  for (const rule of INCOMPATIBLE) {
    if (totals.has(rule.a) && totals.has(rule.b)) {
      add('block', `incompatible.${rule.a}.${rule.b}`,
        `併用できない組み合わせです: ${SUBSTANCES[rule.a].name} と ${SUBSTANCES[rule.b].name}`, rule.reason, 'どちらかの物質を変更してください。');
    }
  }

  // 5. 排気・不活性雰囲気の要否
  if (needsEnclosure(pkg.steps) && !caps.has('enclosure')) {
    add('block', 'enclosure.required', '排気(ドラフト)または不活性雰囲気のモジュールが必要です',
      '揮発性・有毒性・微粉体の物質を扱うため、囲い込みが必須です。', 'モジュール「排気(ドラフト)対応」を追加してください。');
  }

  // 6. 規模・テンプレート
  const n = pkg.params?.n_samples;
  if (Number.isFinite(n) && n > MAX_SAMPLES_AUTO) {
    add('approval', 'samples.many', `試料数が多いです(${n}個)`, `${MAX_SAMPLES_AUTO}個を超える実行は承認が必要です。`, '承認を取得してください。');
  }
  if (!pkg.template?.verified) {
    add('approval', 'template.unverified', '未検証の手順です', '検証済みテンプレート以外は承認が必要です。', '承認を取得してください。');
  }

  // 7. 情報
  if ([...totals.keys()].some((id) => SUBSTANCES[id]?.hazards.includes('corrosive'))) {
    add('info', 'info.corrosive', '腐食性の物質を使用します', '耐薬品仕様の器具・配管であることを確認してください。', '');
  }

  const verdict = findings.some((f) => f.severity === 'block')
    ? 'blocked'
    : findings.some((f) => f.severity === 'approval')
      ? 'needs_approval'
      : 'auto';

  return { verdict, findings, usedSubstances, requiredCapabilities, rulesVersion: RULES_VERSION };
}
