# データ管理方針

最終更新: 2026-09-26

## 結論
老後収支シミュレーターは、次の3層で管理する。

1. 公開GitHub: アプリ本体・一般仕様・匿名テスト
2. Private GitHub: 整理済みの個人設定・個人仕様・検証結果・バックアップ
3. GitHub外: 年金通知画像、口座番号、税資料、保険証券などの原本・高機密情報

公開リポジトリ内に `private/` フォルダを作って個人情報を置く運用は禁止する。

## 1. 公開GitHub
対象リポジトリ:
`Retirement-income-sim`

保存してよいもの:
- HTML / CSS / JavaScript
- PWA設定
- 公開技術仕様
- 匿名化したテストデータ
- 個人値を含まないテンプレート
- 変更履歴

保存禁止:
- 氏名、生年月日
- 個人資産額
- 個人年金額
- 退職金、iDeCo/DC残高
- 実績収支
- 個人設定JSON
- アプリの個人バックアップJSON
- 年金定期便等の画像
- 口座番号、契約番号、マイナンバー
- APIキー、PAT、秘密鍵

## 2. Private GitHub
推奨リポジトリ名:
`Retirement-income-sim-private`

用途:
計算・運用に必要な「整理済み個人データ」の正本を管理する。

推奨構成:

```
Retirement-income-sim-private/
├─ README_PRIVATE.md
├─ 00_policy/
│  ├─ DATA_CLASSIFICATION.md
│  └─ CHANGE_RULES.md
├─ 10_master/
│  ├─ personal_config_master.json
│  ├─ assumptions_master.md
│  └─ source_index.md
├─ 20_requirements/
│  ├─ requirements_master.md
│  ├─ pending_items.md
│  └─ decision_log.md
├─ 30_validation/
│  ├─ baseline_validation.md
│  └─ regression_check.md
├─ 40_exports/
│  ├─ latest/
│  │  ├─ full_backup.json
│  │  └─ annual_cashflow.csv
│  └─ archive/
├─ 50_reference_notes/
│  ├─ pension_reference.md
│  ├─ retirement_reference.md
│  └─ tax_social_reference.md
└─ 99_inbox/
```

### 正本ルール
- `10_master/personal_config_master.json` を個人設定の正本とする。
- 同名ファイルをGitの履歴で更新し、Rev付きコピーを増やしすぎない。
- 要求仕様は `20_requirements/requirements_master.md` を正本とする。
- 保留事項は `20_requirements/pending_items.md` に一本化する。
- 判断変更は `decision_log.md` に日付・変更内容・理由を残す。
- 最新バックアップは `40_exports/latest/` に置き、古いものだけ `archive/` へ移す。

## 3. GitHub外
以下はPrivate GitHubにも原則置かない。

- ねんきん定期便等の原本画像
- マイナンバー関連書類
- 銀行・証券の口座番号が分かる資料
- 保険証券や契約番号の原本
- 税務申告書・源泉徴収票の原本
- 医療情報
- パスワード、APIキー、GitHub PAT

これらはiCloud Drive等の本人管理領域へ保存し、GitHub側の
`10_master/source_index.md`
には「資料名・確認日・確認した値・保管場所」だけを記録する。

## source_index.md の例
```md
| 項目 | 確認日 | 採用値 | 根拠資料 | 原本保管場所 |
|---|---|---:|---|---|
| 本人70歳年金 | 2026-09-25 | 2,993,596円/年 | ねんきん定期便 | iCloud/老後計画/原本 |
```

## 更新手順
1. 原本を確認する。
2. `source_index.md` に根拠を記録する。
3. `personal_config_master.json` を更新する。
4. `baseline_validation.md` で主要計算値を検証する。
5. アプリへ設定JSONを読み込む。
6. 問題がなければ `40_exports/latest/full_backup.json` を更新する。
7. 重要な方針変更は `decision_log.md` に残す。

## GitHub接続権限
ChatGPT等のGitHub連携は、必要なリポジトリだけをSelected repositoriesで許可する。
公開用とPrivate用を分けることで、公開アプリ更新時に個人情報へ触れる必要をなくす。
