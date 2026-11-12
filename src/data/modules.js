// 装置モジュール(交換式)。provides は実行できる動作の種類。
export const MODULES = {
  liquid_handler: { name: '液体ハンドリング', provides: ['dispense'], note: '分注・希釈' },
  heat_stir: { name: '加熱・撹拌', provides: ['mix', 'heat'], maxTempC: 150, maxRpm: 1500, note: '上限150℃' },
  powder_weigh: { name: '粉体秤量', provides: ['weigh'], note: '粉体の計量' },
  centrifuge: { name: '遠心・分離', provides: ['centrifuge'], note: '分離・精製' },
  spectrometer: { name: '分光測定', provides: ['measure'], note: '試料の評価' },
  coater: { name: '成膜・コーティング', provides: ['coat'], note: '薄膜の塗布' },
  fume_hood: { name: '排気(ドラフト)対応', provides: ['enclosure'], note: '揮発性・有毒物質向け' },
  glovebox: { name: '不活性雰囲気(グローブボックス)', provides: ['enclosure', 'inert'], note: '空気・水分に弱い材料向け' },
};

// 動作の種類 -> 既定のモジュール(推奨の自動選択に使用)
export const DEFAULT_PROVIDER = {
  dispense: 'liquid_handler',
  mix: 'heat_stir',
  heat: 'heat_stir',
  weigh: 'powder_weigh',
  centrifuge: 'centrifuge',
  measure: 'spectrometer',
  coat: 'coater',
  enclosure: 'fume_hood',
};
