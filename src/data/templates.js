// 検証済みテンプレート(説明用)。params で条件を定義し、build で手順を生成します。
const r1 = (x) => Math.round(x * 10) / 10;

const opt = (ids, names) => ids.map((id) => ({ value: id, label: names[id] }));
const NAMES = {
  water: '水', ethanol: 'エタノール', acetone: 'アセトン', toluene: 'トルエン', dmf: 'DMF',
  hcl: '塩酸', naoh: '水酸化ナトリウム水溶液', hno3: '硝酸', h2o2: '過酸化水素水', nh3aq: 'アンモニア水', naocl: '次亜塩素酸ナトリウム',
  lifepo4: 'リン酸鉄リチウム(粉体)', tio2: '酸化チタン(ナノ粉体)',
};

export const TEMPLATES = {
  'liquid-screening': {
    id: 'liquid-screening',
    name: '液体組成スクリーニング',
    domain: '材料・化学',
    summary: '溶媒と添加液の組み合わせを分注・撹拌し、分光で評価します。',
    verified: true,
    params: [
      { key: 'solvent', label: '溶媒', type: 'select', default: 'water', options: opt(['water', 'ethanol', 'acetone', 'toluene', 'dmf'], NAMES) },
      { key: 'additive', label: '添加液', type: 'select', default: 'hcl', options: opt(['hcl', 'naoh', 'h2o2', 'nh3aq', 'hno3', 'naocl'], NAMES) },
      { key: 'volume_mL', label: '1試料あたりの溶媒量', type: 'number', unit: 'mL', default: 5, min: 0.5, max: 20, step: 0.5 },
      { key: 'n_samples', label: '試料数', type: 'number', unit: '個', default: 24, min: 1, max: 384, step: 1 },
      { key: 'mix_rpm', label: '撹拌速度', type: 'number', unit: 'rpm', default: 600, min: 100, max: 1500, step: 50 },
    ],
    build: (p) => {
      const total = r1(p.volume_mL * p.n_samples);
      return [
        { type: 'dispense', label: '溶媒を分注', substance: p.solvent, amount: total, unit: 'mL', requires: ['dispense'] },
        { type: 'dispense', label: '添加液を分注', substance: p.additive, amount: r1(total * 0.1), unit: 'mL', requires: ['dispense'] },
        { type: 'mix', label: '撹拌', rpm: p.mix_rpm, duration_h: 0.1, requires: ['mix'] },
        { type: 'measure', label: '分光測定', requires: ['measure'] },
      ];
    },
  },

  'precursor-synthesis': {
    id: 'precursor-synthesis',
    name: '触媒前駆体の条件スクリーニング',
    domain: '材料・化学',
    summary: '溶媒と酸を加えて加熱し、遠心分離して評価します。',
    verified: true,
    params: [
      { key: 'solvent', label: '溶媒', type: 'select', default: 'water', options: opt(['water', 'ethanol', 'acetone', 'dmf'], NAMES) },
      { key: 'acid', label: '酸', type: 'select', default: 'hcl', options: opt(['hcl', 'hno3'], NAMES) },
      { key: 'volume_mL', label: '1試料あたりの溶媒量', type: 'number', unit: 'mL', default: 4, min: 0.5, max: 20, step: 0.5 },
      { key: 'n_samples', label: '試料数', type: 'number', unit: '個', default: 12, min: 1, max: 384, step: 1 },
      { key: 'temp_C', label: '加熱温度', type: 'number', unit: '℃', default: 60, min: 20, max: 200, step: 5 },
      { key: 'duration_h', label: '加熱時間', type: 'number', unit: '時間', default: 2, min: 0.1, max: 72, step: 0.1 },
    ],
    build: (p) => {
      const total = r1(p.volume_mL * p.n_samples);
      return [
        { type: 'dispense', label: '溶媒を分注', substance: p.solvent, amount: total, unit: 'mL', requires: ['dispense'] },
        { type: 'dispense', label: '酸を分注', substance: p.acid, amount: r1(total * 0.2), unit: 'mL', requires: ['dispense'] },
        { type: 'heat', label: '加熱', temp: p.temp_C, duration_h: p.duration_h, requires: ['heat'] },
        { type: 'centrifuge', label: '遠心分離', requires: ['centrifuge'] },
        { type: 'measure', label: '分光測定', requires: ['measure'] },
      ];
    },
  },

  'powder-mixing': {
    id: 'powder-mixing',
    name: '粉体の秤量・混合',
    domain: '材料・化学',
    summary: '粉体を秤量し、液体と混合して評価します。',
    verified: true,
    params: [
      { key: 'powder', label: '粉体', type: 'select', default: 'lifepo4', options: opt(['lifepo4', 'tio2'], NAMES) },
      { key: 'mass_g', label: '1試料あたりの質量', type: 'number', unit: 'g', default: 0.1, min: 0.01, max: 5, step: 0.01 },
      { key: 'n_samples', label: '試料数', type: 'number', unit: '個', default: 24, min: 1, max: 384, step: 1 },
      { key: 'liquid', label: '混合する液体', type: 'select', default: 'water', options: opt(['water', 'ethanol', 'dmf'], NAMES) },
      { key: 'mix_rpm', label: '撹拌速度', type: 'number', unit: 'rpm', default: 800, min: 100, max: 1500, step: 50 },
    ],
    build: (p) => [
      { type: 'weigh', label: '粉体を秤量', substance: p.powder, amount: Math.round(p.mass_g * p.n_samples * 100) / 100, unit: 'g', requires: ['weigh'] },
      { type: 'dispense', label: '液体を分注', substance: p.liquid, amount: r1(p.n_samples * 2), unit: 'mL', requires: ['dispense'] },
      { type: 'mix', label: '撹拌', rpm: p.mix_rpm, duration_h: 0.2, requires: ['mix'] },
      { type: 'measure', label: '分光測定', requires: ['measure'] },
    ],
  },

  'thin-film-coating': {
    id: 'thin-film-coating',
    name: '薄膜コーティング条件',
    domain: '材料・化学',
    summary: '溶液を塗布し、加熱処理(アニール)して評価します。',
    verified: true,
    params: [
      { key: 'solvent', label: '溶媒', type: 'select', default: 'ethanol', options: opt(['ethanol', 'toluene', 'dmf', 'water'], NAMES) },
      { key: 'volume_mL', label: '1試料あたりの溶液量', type: 'number', unit: 'mL', default: 1, min: 0.1, max: 10, step: 0.1 },
      { key: 'n_samples', label: '試料数', type: 'number', unit: '個', default: 24, min: 1, max: 384, step: 1 },
      { key: 'anneal_C', label: 'アニール温度', type: 'number', unit: '℃', default: 120, min: 50, max: 300, step: 5 },
    ],
    build: (p) => [
      { type: 'dispense', label: '溶液を分注', substance: p.solvent, amount: r1(p.volume_mL * p.n_samples), unit: 'mL', requires: ['dispense'] },
      { type: 'coat', label: '塗布', requires: ['coat'] },
      { type: 'heat', label: 'アニール', temp: p.anneal_C, duration_h: 0.5, requires: ['heat'] },
      { type: 'measure', label: '分光測定', requires: ['measure'] },
    ],
  },
};
