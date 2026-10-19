# 検証画面の14日間公開：承認・実行条件・再開記録

更新日：2026-10-19（日本時間）。対象：Draft PR #28。直前候補 `50a5af5363d6aeb671f12bb818d90b7f87c9dd4c`。

## 最新の承認

利用者の「14日で承認します。自動で最大限に進めてください」を受領。既存の検証用Firebase `lifeplan-sync-sandbox` のHostingプレビューチャンネル `encrypted-mobile` に、診断用の静的7ファイルだけを **14日間** 配信する範囲が承認済み。同じ範囲の承認を再度求めない。

前段の `SYNC_MOBILE_DIAGNOSTIC_20261019.md` にある「7日・公開未承認」は承認前の提案履歴。本書と `tools/firebase-mobile/preview-approval.json` が期間と承認状態を更新する。画面本体・暗号化処理・12項目ランナーの仕様は変えない。

状態：**公開承認済み／Firebase認証済み接続待ち／未配信**。このターンでFirebase連携を再検索した結果は `installed:false`。接続済みツールなしでFirebaseに書き込まない。認証情報をGitHubやチャットへ求めず、別の本人Firebaseプロジェクト、課金先、ホスティングへ迂回しない。

14日は、承認メッセージの日ではなく、初回プレビュー配信操作から設定する。実行時の開始日時とFirebaseが返す `expireTime` を記録する。URL・開始日・終了日は未配信の段階で確定しない。繰返し配信で14日が延長される扱いにはせず、自動延長・自動再公開は行わない。GitHub成果物の保存期限とは別の期間である。

## 今回の準備

配布生成器の期間を `14d` へ変更し、承認済み・未配信と権限境界を記録するJSONを配布物の公開外に入れる。互換性のため既存名 `APPROVAL_REQUIRED.json` は保持するが、判定はファイル名でなく `approvalStatus: approved` と `deployed: false` による。

GitHub Actionsは、既存14項目と追加4項目、既存Chromium/WebKit各10ケースを確認後に配布候補を自動生成・成果物として保管する。これはHosting配信ではない。CIにFirebase認証情報やデプロイ処理は追加しない。公開対象は従来どおり7ファイル、画面・暗号化ランナー・CSP等の実行内容は変更しない。

## 接続後に行うこと

1. 使用可能なFirebase操作の説明・権限を読み、対象プロジェクト・サイト・既存チャンネル・Spark無料プラン・無料枠を読取り確認する。権限や確認手段がなければ、その範囲だけ確認待ちとする。有料化しない。
2. 同名チャンネルが存在する場合は、既存の作業結果か別作業かを照合する。承認だけを理由に無断上書き・削除・期限延長しない。初回配信途中の障害後も実施済み操作を確認してから再開する。
3. 取得した配布候補の対象コミット、公開7ファイル、SHA256、HTML/JSの内容、ヘッダーを確認する。個人の金額、UID、メール、パスワード、バックアップを含めない。既存アプリ本体・sw.js・個人原本は配布しない。
4. Hosting previewだけに配信し、14日と実期限を照合する。**Auth許可ドメインの自動変更を伴わない方法**を使う。CLIなら対応版のヘルプと挙動を確認し、`--no-authorized-domains` を必須とする。連携ツールがlive配信しか提供しない、期限設定がない、Authを書き換える場合はその操作を使わない。
5. 実在するプレビューURL、公開バイトの一致、CSP/no-store等、予約設定URLの接続先を確認する。検証用アカウントのログインは本人端末内で実行する。Auth設定不足などがあっても自動で権限を広げない。
6. 成功した配信のURL・Hosting版・配信日時・期限・検証証拠をPRへ記録し、その後にiPhoneで開くURLを案内する。本人PC/iPhoneの保存データ移行は実施しない。

CLIを利用可能な場合の承認範囲内の候補コマンド（**未実行**。上記の事前確認後、配布物のディレクトリでのみ使用）：

```sh
firebase hosting:channel:deploy encrypted-mobile --project lifeplan-sync-sandbox --config firebase.json --expires 14d --no-authorized-domains
```

`firebase deploy` やliveチャンネル、別プロジェクトへ置換しない。CLIを接続不能や権限不足の回避手段として利用しない。

## 維持する対象外・復旧

mainマージ、本番GitHub Pages、Hosting live、本人用Firebase、Authユーザー/ドメイン、Firestoreルール、課金、本人JSON・採用条件の変更は今回の承認対象外。クラウド診断の実行と結果確認も、配信しただけで完了扱いにしない。

配信前は候補・記録を保持して待機可能。配信後に停止する場合は対象プレビューチャンネルの状態を確認して限定停止する。チャンネル期限切れはFirestore文書の削除ではない。試験文書や本人データを一緒に自動削除しない。実機同期・本人移行の承認は別途扱う。

旧共通管理表は移行・上書きしていない。今回の承認と開発の最新記録は本書、JSON、PR #28の最新コメントを参照する。

## 根拠（2026-10-19に確認）

Firebaseは `--expires` で最大30日を指定可能。14日は設定可能範囲。既存チャンネルへの再配信では期限が更新され得るため、実期限の保持と再実行前照合が必要。
https://firebase.google.com/docs/hosting/manage-hosting-resources

公式CLIには `--no-authorized-domains` があり、Authドメイン同期を抑止する。実行環境のCLI版でサポートと適用を確認する。
https://github.com/firebase/firebase-tools/blob/master/src/commands/hosting-channel-deploy.ts
