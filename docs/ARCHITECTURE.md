# 設計メモ

## データの流れ

```
テンプレート + 条件 + 装置モジュール
        │  buildPackage()
        ▼
   手順(steps)  ──►  evaluate()  ──►  判定(auto / needs_approval / blocked) + 指摘
        │                                   │
        └──────────── approvePackage() ◄────┘(要承認のみ)
                              │
                       exportPackage()  ──►  experiment-package/v0 (JSON, SHA-256)
```

## 出力スキーマ(experiment-package/v0)

| フィールド | 内容 |
|---|---|
| `id` | 内容のSHA-256先頭12桁から作るID(同じ内容は同じID) |
| `template` | テンプレートID・名称・検証済みか |
| `params` | 入力条件 |
| `modules` | 選択した装置モジュール |
| `steps` | 実行する手順(動作、物質、量、温度、時間、必要な機能) |
| `guardrail` | 判定、ルール版、指摘、使用物質の合計量 |
| `approval` | 承認者、メモ、時刻(要承認の場合) |

## 拡張のしかた

- **実験を増やす**: `src/data/templates.js` に `params` と `build` を追加します。
- **物質を増やす**: `src/data/substances.js` に `hazards`、`bp`、`form` を追加し、併用禁止は `INCOMPATIBLE` に追加します。
- **装置を増やす**: `src/data/modules.js` に `provides` を追加します。
- **規則を増やす**: `src/engine/guardrails.js` の `evaluate()` に追加し、`tests/` にテストを足します。

## 本番化に必要なこと

1. 物質・上限値をSDSと施設の許可範囲に基づいて整備し、出典・更新日・承認者を管理する
2. 認証と権限(承認者の本人確認、規則変更の複数人承認)
3. 出力パッケージの改ざん検知(署名)と、実行側でのガードレールの再検査
4. 実行中の監視ルール(センサ閾値、通信断での安全停止)との共通化
