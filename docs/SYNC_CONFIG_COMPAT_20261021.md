# 接続設定のappId欠落：再開記録・診断専用の互換修正候補

確認日：2026-10-21。対象はDraft PR #28、基準 `5ac6d758e32877eaf92073f76cae866e99fa5a27`。
公開main基準は `183fd13167dfa5d05e242e0ed99fcaee4b98f7e6`。今回の目的はスマホからの指示で、接続設定の停止原因を再現し、診断画面の修正候補を自動検証すること。公開配信・個人データ変更・公開期間延長は実施しない。

## 正本案内・前回以降の利用者実施記録

以下は2026-10-20の利用者提供画面と回答に基づく。AIがFirebase管理APIを独立取得した証拠ではない。

- 検証用Hosting `lifeplan-sync-sandbox` の `encrypted-mobile` プレビューを公開済み。診断画面の表示成功、公開7ファイルのマニフェスト照合成功。以前の「公開未実施」は履歴であり、現在地には使わない。
- CLI表示の期限は **2026-11-03 22:53:34（利用者端末の日本時間）**。再配信時に `--expires 14d` を繰り返すと期限を延ばす可能性があるため、そのコマンドを流用しない。再配信前に管理APIのexpireTimeを読取り、元の期限を保持できる方法だけを採用する。
- 診断の接続先確認で停止。利用者は `/__/firebase/init.json` のJSON表示、projectId/authDomainの一致、appId項目の欠落を確認。
- Hostingサイトと、同名2件のうち選択した既存Webアプリの関連付けを利用者が実施し、CLIでもApp ID表示を確認。しかしプレビューのJSONにはappIdがない状態が続いた。
- 通常サイトの `Site Not Found` を理由にliveチャンネルへ新規配信しない。Webアプリの追加・削除・再リンクも不要。
- 診断でのログイン・暗号化12工程は未実施。本人PC/iPhoneデータは変更なしとの利用者確認を維持。
- Firebaseプラグインはインストール済みだが、このチャットにFirebase操作ツールは未提供。利用者PCのCLIログインは、このチャットへの委任認証とは別。

既存の個人情報を含む共通管理表は更新・移行していない。開発の今回記録は本書とPRの最新検証コメント。個人条件の原本は従来の非公開領域のまま。

## 再現できた直接原因と未確認事項

基準コードの `checkedConfig()` はappIdを必須としていた。同じ構造の**架空JSON**（正しいprojectId/authDomain、非空apiKey、appIdなし）で `config-invalid` が発生することをローカルNodeで再現した。これは認証開始前の診断側チェックによる停止。

本番URLへの独立したGETはwebツールで取得できず、コンテナでもDNS解決できなかった。公開サーバーがappIdを返さない内部理由、実Content-Type、キャッシュ・反映状況までは断定しない。関連付けだけで必ず解消するとした以前の推測は、利用者の実測で裏付けられていない。

Firebase JavaScript `FirebaseOptions.appId` は任意プロパティ。本診断はメール/パスワードAuthとFirestoreだけを使用し、Analytics/Installations/Messaging/App Checkの有効化は行わない。型定義だけで動作保証はせず、画面と同じSDK 12.19.0を使用する実エミュレーター試験を追加した。

## 修正候補の範囲

- **診断画面だけ**で、JSONにappIdという項目そのものがない場合を扱う。架空IDや別WebアプリのIDを補完しない。
- appIdが明示されていれば従来同様に非空文字列・長さを検査。空欄/null/型不正は省略扱いせず停止。
- projectId/authDomainの完全一致、非空apiKey、HTTPSプレビュー限定、同一オリジンの設定取得、リダイレクト拒否、サイズ/JSON検査を維持。
- 実認証トークンのaudience/issuer/subject、UID一致、Firestoreのユーザー別ルール、既存文書保護、世代競合・限定削除、未完了マーカーを変更しない。
- `appId未提供・認証/Firestore限定` と画面・共有結果に表示する。設定確認成功を認証成功や同期完了と表示しない。
- 主アプリの `sync-*`、計算、保存形式、本人データ、Firebaseルール、料金プラン、既存Webアプリ登録は一切変更しない。

旧開発文書の「常に4項目必須」を黙って変更した扱いにはしない。本書は診断に限定した互換条件の差分を明示する。主アプリの本番同期設定への一般化、他サービスのappId省略、権限設定の緩和は対象外。

## 検証計画・証拠区分

1. ローカルNode：旧コードで再現、新規互換テスト18件成功。架空入力のみ、ネットワーク・認証なし。
2. GitHub Node CI：既存の全回帰と追加互換ケース。対象headと最終結果はPRコメントへ実測で記録。
3. モバイルブラウザ：既存のChromium/WebKit 10ケースずつを、appIdあり/なしの2構成で実行。40ケース予定。実Web Crypto、Firebase応答は模擬。実iPhone試験と区別する。
4. SDK統合：SDK 12.19.0を固定。Auth/Firestoreの実ローカルエミュレーターのみを固定demoプロジェクト/loopbackで使用。appIdあり/なしで実際のサインアップ、別クライアントのサインイン、誤パスワード拒否、暗号化12工程、未認証・別UID拒否、試験文書削除を確認する。クラウドのユーザーは作らない。
5. 公開サイトへの修正反映・実Firebase・iPhone実機：未実施。CI成功で代用しない。

最終合否は対象コミットのCIログを確認して記録する。未実行/実行中を合格としない。マニフェスト・スクリーンショット・保存artifactはその環境の証拠であり、公開済み内容の証明ではない。

## 次工程・戻し方

公開候補はGitHub Actionsの `mobile-config-compat-candidate-no-deploy` に保存する。これは旧プレビューを更新したものではない。候補JSONの `deployed:false` はその候補の状態であり、前版プレビューが存在しないという意味ではない。

公開ファイルは引き続き7件で、変更は `mobile-policy.mjs` と `mobile.mjs` の2件だけ。他の5件と暗号化ランナーは不変。新しい公開設定ファイルや本人の接続値のコピーは不要。

次に必要なのは**認証済みの実行環境からの、差分2件を含む同チャンネルへの反映と期限保持確認**。このチャットにはその接続がないため、スマホからの指示だけでデプロイ済みとは報告しない。同じ認証/インストール/リンク操作を利用者へ繰り返させない。今回の候補を使う修正配信の対象・差分・期限保持・戻し方を確認してから進める。

戻す場合は診断の変更2ファイルだけを元の検証済み候補へ戻す。未配信なら候補を不採用にするだけでよい。個人データやブラウザ保存を削除しない。元の診断へ戻すとappId欠落時は再び認証前で停止するが、既存データが勝手に上書きされることはない。

## 一次資料（2026-10-21確認）

- FirebaseOptions: https://firebase.google.com/docs/reference/js/app.firebaseoptions
- Hosting予約URL: https://firebase.google.com/docs/hosting/reserved-urls
- 公式Auth実装: https://github.com/firebase/firebase-js-sdk/blob/main/packages/auth/src/core/auth/register.ts
- Authエミュレーター: https://firebase.google.com/docs/emulator-suite/connect_auth
- プレビュー期限管理: https://firebase.google.com/docs/hosting/manage-hosting-resources
