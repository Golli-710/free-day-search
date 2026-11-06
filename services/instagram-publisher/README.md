# 無料デー検索 Instagram投稿サービス

状態：実装済み、クラウド未配置・アカウント未接続・公開無効。GOLLI側の2026-11-05実装を基に作成。GOLLIサービスの設定や停止状態は変更しない。

## 素材から公開確認まで

1. 既存 `scripts/social/pack.mjs --roundup` → `images.py` でエリア別まとめを生成する。
2. `python scripts/import_pack.py ../../social/outbox/trial/manifest.json` でJPEGと未承認queueを作成。週次Actionsでも下書き成果物まで生成する。生成だけでは予約・公開しない。
3. 画像・本文・対象週末の公式条件・投稿台帳との重複を確認する。木曜・金曜19時のうち具体的に承認された日時と本文だけ、queueの `approved:true` と承認根拠を記入。変更時は再確認。
4. 配置前に `node scripts/check.mjs`。ID・内容重複、期限切れ、JPEG、ファイルハッシュを検査する。公開済みはローカルキューから退避し、永続台帳は保持する。
5. cronはUTC毎分の `* * * * *` を接続確認後に登録。APIのコンテナ準備は予定1時間前から、公開は予定時刻以降のみ。15分を過ぎた未公開候補はmissedとして停止する。
6. 保護された `/status` の `published`・permalinkを確認して実投稿履歴へ転記。`uncertain` はInstagram実画面を確認して手動解決し、ID変更で再投入しない。

## 接続作業（未実施）

- Meta公式アプリで `free_day_search` 用の接続を行う。権限追加・認可の最終操作は、表示されたアカウント・要求権限をユーザーが確認した上で進める。
- Cloudflareの無料プラン上に別サービス名で配置し、有料プランへ切り替えない。SQLite Durable Objectsの無料枠と、既存サービスを含むアカウント利用量を配置時に確認する。
- `IG_ACCOUNT_ID` は公式APIで実アカウントを確認して設定。`PUBLIC_ORIGIN` は実際のHTTPSサービスURL。トークンと管理用ランダム値は `META_ACCESS_TOKEN` / `ADMIN_TOKEN` のSecretへ直接保存し、Git・出力・チャットに書かない。
- 公開無効のまま `/connection` でID/ユーザー名と必要な権限を確認。現在の実装はFacebook Graph経由の3権限（instagram_basic / instagram_content_publish / instagram_manage_insights）を確認する。Instagram Login APIの異なる権限名・ホストとは混在させない。Metaの現行仕様は接続画面で再確認が必要。
- 対象を誤ったら即停止。GOLLI用トークンを無料デー検索のために読み出し・流用しない。
- 今回はトークン発行・Secret保存・公開・予約操作を一切実行していない。

## 停止・検証

`PUBLISH_ENABLED=false` にしcronを解除。既に公開済みの投稿は取り消されない。非公開のstatus/connectionは管理トークンがなければ401。未承認素材はURLを知っていても配信しない。トークン期限・失効時は接続を復旧するまで停止し、投稿できたと推測しない。

検証：Node15件（重複・同時実行・タイムアウト・誤アカウント・公開URL確認等）、Python3件（変換・重複・パス逸脱・画像比率）、空キュー検査、Wrangler dry-run成功。実API接続・実公開は未検証。
