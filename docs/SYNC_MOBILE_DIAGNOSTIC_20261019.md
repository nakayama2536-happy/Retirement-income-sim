# iPhone向け暗号化診断：開発候補と公開前確認

確認日：2026-10-19。対象：Draft PR #28。基準head `8ea0efb85af59b68c78f90e743c53e9c63ae5d01`、公開main `183fd13167dfa5d05e242e0ed99fcaee4b98f7e6`。
状態：開発ブランチのみ。検証画面の公開・Firebase操作・本人データ移行は今回実施しない。最終CIの実測結果と対象headはPRの最新コメントに記録する。

## 目的・維持条件

PCを立ち上げず、iPhoneのSafariから暗号化した架空データの往復検証を始められる画面を準備する。現在のアプリ・計算・保存・比較案・既存の7項目/12項目診断・暗号化処理・Firestoreルールは変更しない。

今回はPC/iPhoneの本人データを同期する機能ではない。既存の12項目ランナーと暗号化モジュールをバイト不変で再利用する。1台のブラウザ内に独立したFirebase接続を作る検証であり、2台の実機による同期完了と扱わない。

## 公開方法の候補と必要承認

**提案：既存の検証用Firebaseだけに、7日で期限切れになるHostingプレビューを追加する。** サイト `lifeplan-sync-sandbox`、プレビューチャンネル `encrypted-mobile` に限定。本番アプリのコード・公開経路は従来どおりGitHubとGitHub Pagesを維持する。

これは従来の「Firebaseは同期検証だけ、Hosting未使用」に対する**検証画面だけの例外案**であり、実施承認はまだ受けていない。通常のGitHub Pagesにパスワード入力画面を追加せず、本番アプリからもリンクしない。Firebase HostingのプレビューはURLを知る人がアクセスできる公開画面であり、非公開保管領域と説明しない。認証とFirestoreルールが別途必要。

公開承認対象：上記プレビューへの7ファイルの静的配信、7日期限、配信後のハッシュ・CSP・接続設定・対象プロジェクト確認。Hosting liveチャンネル、本人用Firebase、main/Pages、Authユーザー・ルール変更、課金設定、有料Blaze、本人JSON送信は対象外。配信前に既存同名チャンネルの有無を読み取り、存在する場合は無断上書きしない。Sparkの維持と無料枠の利用状況を確認する。

今回確認したFirebase連携は未接続。承認だけでアクセス権が生じるわけではない。実行時にはFirebaseの本人管理アカウントへの認証済み接続が必要。パスワード、UID、トークン、サービスアカウント鍵をチャットやGitHubへ送付しない。

## 利用者の操作（公開後の完成イメージ）

1. 通常のSafariで検証用HTTPSプレビューURLを開く。
2. 「検証用の接続先を自動確認」を押す。`/__/firebase/init.json` を同一オリジンから取得し、対象プロジェクトを検査する。apiKey/appIdの手動転記は不要。取得失敗や別プロジェクトの場合は認証を許可せず停止する。
3. 検証用メール/パスワードを端末内だけで入力し、架空データの作成・削除にチェックして1回実行する。
4. 暗号化・保存・別接続で復号・誤鍵/改ざん/未認証/旧世代の拒否・削除・不存在確認を自動実行する。
5. 12/12成功と接続終了を確認して「結果だけをコピー」。コピー不可なら結果欄を選択する。認証情報を送る必要はない。

初回表示ではSDK・Auth・Firestoreへ接続しない。接続設定取得も最初のボタンを押した後のみ。IDトークンのaudience/issuer/subjectと実ユーザーを照合する。認証はメモリ専用で初期化し、終了時にサインアウト・接続破棄。入力欄は送信直後に空にする。端末のパスワードマネージャーによる保存はアプリ管理外。

## 中断・失敗時の扱い

書込み前に診断専用の未完了マーカーを保存する。保存できなければ書かない。完了・安全な不存在確認までマーカーを保持。未完了なら再読込みでも実行停止。Web Locksで同一オリジンの連打/同時実行を制限し、別端末や別オリジンに対しては既存ランナーのトランザクションによる不存在/世代/内容照合で保護する。Safariのバックグラウンドで完走する保証はせず、前面を維持する案内を出す。

削除確認の不明な文書を再実行で上書きしない。前の診断が作成した文書を無断削除する機能もない。認証終了に失敗した場合はデータ検証成功と接続終了未確認を分ける。新しいプレビューURLは別保存領域なので、旧URLの未完了記録を自動継承しない。新URL配信時は前回のクラウド残存状態を別途確認する。

## 配布境界・自動検証

`node tools/firebase-mobile/prepare.mjs NEW_DIRECTORY_OUTSIDE_REPO` は配布候補を作るだけ。Firebase CLI/APIもデプロイも呼ばない。既存の出力先は拒否し、7ファイルだけを明示して梱包。実アプリ本体・sw.js・本人JSON・バックアップ・共通管理表は入れない。CSP、no-store、no-referrer、フレーム禁止、検索除外を設定。URLの推測困難さや検索除外はアクセス制御の代わりではない。

Node試験は14件。GitHub ActionsではChromiumとWebKitをそれぞれ使い、同じHTTPSフィクスチャで10ケースずつ確認する予定。実行までは合格としない。ブラウザのWeb Cryptoは実処理、Firebase SDKと接続設定応答は模擬。WebKit/Linuxでの成功をiPhone/Safari実機や実Firebaseの成功へ読み替えない。

実クラウド接続、予約URLの実応答、SDKへの実ネットワーク、iPhoneキーボード/画面休止、実機間同期は未確認。以前の7/7実接続結果は形式確認の履歴として保持する。

## 次工程と戻し方

最終候補の自動検証・配布検査・GitHub記録がそろったら、検証画面だけの期限付き公開について承認とFirebase接続をまとめて確認する。許可後に配信内容・接続設定・版を照合し、実在するプレビューURLを案内する。未配信のURLは作成済みとして示さない。

公開前は候補不採用で戻せる。公開後は当該プレビューチャンネルのみ停止/削除し、Firestore文書や本人データは自動削除しない。プレビュー期限切れはFirestore文書の削除ではない。旧共通管理表の個人記録・原本の移行は未実施。

## 公式情報（2026-10-19参照）

- GitHub Pagesの機密取引に関する注意：https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- Firebase Hostingのプレビューと実バックエンドの区別：https://firebase.google.com/docs/hosting/test-preview-deploy
- Hosting予約URLと接続設定JSON：https://firebase.google.com/docs/hosting/reserved-urls （SDKモジュール自体は既存のgstatic固定版を使用）
- Firebase SDK対応環境：https://firebase.google.com/docs/web/environments-js-sdk
- Hosting設定とHTTPヘッダー：https://firebase.google.com/docs/hosting/full-config
