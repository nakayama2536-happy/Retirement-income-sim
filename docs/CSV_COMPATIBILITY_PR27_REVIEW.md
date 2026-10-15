# Draft PR #27: 旧詳細CSVと現行年齢期CSVの互換性レビュー

状態：架空データの自動照合を追加。本人計画書・非公開バックアップ・採用条件は使用しない。main未マージ・未公開。

## 対象経路
- 旧詳細全項目CSV：`csv-export.mjs` の `buildAnnualCsvDataset`。収入・原価の**詳細参考**と、計算エンジンの集計欄を同時に出力する。
- 現行年齢期CSV：`annual-csv.mjs` の `annualCsvRows`。月次 `runRetirementPlan` から `annual-cashflow.mjs` 経由で集計。未確定の参考内訳は空欄。
- Draft比較用CSV：上記の**現行年齢期CSV**を未反映提案値で明示ダウンロードし、期末資産を比較エンジン値に照合する。旧詳細CSVそのものを出力しない。

## 同じ定義として照合できる列
| 旧詳細CSV（エンジン列） | 現行年齢期CSV | 判定 |
|---|---|---|
| startAsset | startAsset | 同じ月次エンジンの年齢期首 |
| investmentGain | investmentGain | 同じ期中運用益 |
| engineLabor | labor | エンジンによる労働収入 |
| engineTotalIncome | incomeTotal | 実際に資産へ計上した収入総額 |
| engineExpense | managementExpense | 管理予算に基づく実支出 |
| extraExpense | extraExpense | 実際に計上した別枠支出 |
| engineTotalOutflow | totalExpense | 管理予算支出＋別枠支出 |
| endAsset | endAsset | 実際の年齢期末資産 |

これらに `test_csv_paths_compatibility.mjs` の架空条件で金額・資産恒等式・元設定不変の回帰確認を追加。

## 設計上そのまま比較できない列
- 旧 `detailTotalIncome` と現行 `incomeTotal`：旧版は `cashflow.manualIncomeItems` の追加参考額を合算し得る。一方、資産計算には新方式の計上経路だけが反映される。差を自動的に資産へ加算しない。
- 旧 `managementBudget`／`plannedCost`／`travelAnnual`／`buffer` と現行 `managementExpense`：旧版の年齢帯基準の詳細予定と、月次資産負担月・価格基準を反映したエンジン支出とは一致するとは限らない。旧版の詳細予定は支出正本にしない。
- 旧 `periodStart`／`periodEnd` は誕生日基準の期間表示。現行 `startDate`／`endDate` は実際に計算した月次行の両端。途中月開始・短縮初年度では日付が異なる場合がある。旧期間表示を現行月次の証拠としない。
- 旧 `extraIncome` は臨時収入の旧まとめ列。現行は iDeCo一時金・退職金・家計からの追加・その他臨時収入を内訳として区別。内数を収入合計へ再加算しない。
- 旧 `actuals` を含む実績列は現行CSVの同名の必須列ではない。空欄・未確定と明示0は別物。
- 出力日時、CSV BOM、列名、端数、列数、年齢期の期間表示は両形式で一致を要件としない。金額は検算上の許容差で確認する。

## 検証境界と制約
- `test_csv_paths_compatibility.mjs` はNode架空データによる**共通の計算列**検証であり、制度適合・個人バックアップ・iPhone実機・全列同値性の証明ではない。
- 年金の手取・税社会保険・雇用保険の資格、NISA/特定口座別売却は引き続き未検証。
- 比較エンジンが開始した年齢の管理予算を欠く入力は、旧設定の予算開始年齢に引きずられず明示エラーとする（未入力を0として続行しない）。
- 事後に合致しない共通列が出れば、計算不整合か仕様変更要否を切り分ける。本人値の無断変更と本番適用は行わない。
