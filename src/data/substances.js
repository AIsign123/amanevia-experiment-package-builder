// 説明用の仮データです。実運用では SDS(安全データシート)と管理者の確認に基づいて整備してください。
// hazards: flammable / volatile / toxic / corrosive / oxidizer / fine_powder / water_reactive
// bp: 沸点(℃)。form: liquid | powder | solid

export const SUBSTANCES = {
  water: { name: '水', hazards: [], bp: 100, form: 'liquid' },
  ethanol: { name: 'エタノール', hazards: ['flammable', 'volatile'], bp: 78, form: 'liquid' },
  acetone: { name: 'アセトン', hazards: ['flammable', 'volatile'], bp: 56, form: 'liquid' },
  toluene: { name: 'トルエン', hazards: ['flammable', 'volatile', 'toxic'], bp: 111, form: 'liquid' },
  dmf: { name: 'N,N-ジメチルホルムアミド(DMF)', hazards: ['flammable', 'toxic'], bp: 153, form: 'liquid' },
  hcl: { name: '塩酸(1 mol/L)', hazards: ['corrosive'], bp: 100, form: 'liquid' },
  naoh: { name: '水酸化ナトリウム水溶液(1 mol/L)', hazards: ['corrosive'], bp: 100, form: 'liquid' },
  hno3: { name: '硝酸(1 mol/L)', hazards: ['corrosive', 'oxidizer'], bp: 100, form: 'liquid' },
  h2o2: { name: '過酸化水素水(3%)', hazards: ['oxidizer'], bp: 100, form: 'liquid' },
  naocl: { name: '次亜塩素酸ナトリウム水溶液', hazards: ['corrosive', 'oxidizer'], bp: 100, form: 'liquid' },
  nh3aq: { name: 'アンモニア水(1 mol/L)', hazards: ['corrosive', 'volatile'], bp: 100, form: 'liquid' },
  lifepo4: { name: 'リン酸鉄リチウム(粉体)', hazards: ['fine_powder'], bp: null, form: 'powder' },
  tio2: { name: '酸化チタン(ナノ粉体)', hazards: ['fine_powder'], bp: null, form: 'powder' },
  li_metal: {
    name: '金属リチウム',
    hazards: ['water_reactive', 'flammable'],
    bp: null,
    form: 'solid',
    prohibited: true,
    prohibitedReason: '水と激しく反応するため、この基盤の自動化対象外です。',
  },
};

// 同一パッケージ内で併用できない組み合わせ
export const INCOMPATIBLE = [
  { a: 'hno3', b: 'ethanol', reason: '硝酸と有機溶媒の混合は激しい反応や発熱のおそれがあります。' },
  { a: 'hno3', b: 'acetone', reason: '硝酸と有機溶媒の混合は激しい反応や発熱のおそれがあります。' },
  { a: 'hno3', b: 'toluene', reason: '硝酸と有機溶媒の混合は激しい反応や発熱のおそれがあります。' },
  { a: 'hno3', b: 'dmf', reason: '硝酸と有機溶媒の混合は激しい反応や発熱のおそれがあります。' },
  { a: 'h2o2', b: 'acetone', reason: '過酸化物が生成するおそれがあります。' },
  { a: 'h2o2', b: 'ethanol', reason: '酸化剤と可燃性溶媒の併用は避けてください。' },
  { a: 'naocl', b: 'hcl', reason: '有毒な塩素ガスが発生するおそれがあります。' },
  { a: 'naocl', b: 'hno3', reason: '有毒なガスが発生するおそれがあります。' },
  { a: 'naocl', b: 'nh3aq', reason: '有毒なクロラミンが発生するおそれがあります。' },
  { a: 'naocl', b: 'acetone', reason: 'ハロホルム反応により有害物質が生成するおそれがあります。' },
  { a: 'li_metal', b: 'water', reason: '水と金属リチウムは激しく反応します。' },
];
