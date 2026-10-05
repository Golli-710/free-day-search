# 無料デー検索

東京都・神奈川県・大阪府の美術館、博物館、科学館、動物園、水族館、植物園、庭園を対象に、無料の日や対象者別の無料条件を探せる、月移動・日別結果・カテゴリ／都道府県絞り込み対応の静的WebサイトMVPです。公式情報を出典とした52施設を掲載しています（2026-10-05時点：confirmed 46、needs_review 6、unverified 0）。確認状況が曖昧な項目には状態を表示します。

## 使用技術

- HTML、CSS、JavaScript（ビルド工程・外部ライブラリなし）
- Python 3（公開前にサイトマップとrobots.txtを生成する標準ライブラリスクリプトのみ）
- GitHub Pages（無料の静的ホスティング候補。GitHub Freeでは公開リポジトリが必要）

## ローカルで起動

Python 3があれば、プロジェクトのフォルダーで次を実行します。

```sh
python3 -m http.server 8000
```

ブラウザーで `http://localhost:8000/` を開きます。停止はターミナルで `Ctrl+C` です。環境変数やAPIキーは必要ありません。

## 公開

1. GitHubに新しい公開リポジトリを作り、このプロジェクトを保存します。`.gitignore` は `.env`、秘密鍵、ローカル生成物を除外します。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
3. `main` ブランチへ反映すると `.github/workflows/deploy.yml` が静的ファイルだけを公開します。
4. 初回の Actions 実行が終わると公開URLが表示されます。ワークフローはGitHub PagesのURLから `sitemap.xml` と `robots.txt` を生成します。

GitHub FreeでGitHub Pagesを使う場合、リポジトリは公開設定が必要です。独自ドメインは不要です。公開前に、施設情報・監査メモ・データに含めたくない情報がないか確認してください。サイトの配信に外部サービス契約や秘密情報は使いません。

## 環境変数

通常のローカル起動では環境変数はありません。デプロイ時の公開URLはGitHub Actionsがリポジトリ名から自動計算します。手元で公開用ファイルだけ生成する場合は、実際のベースURL（末尾 `/`）を指定します。

```sh
python3 scripts/prepare_site.py --site-url https://OWNER.github.io/REPOSITORY/ --output /tmp/free-day-site
```

このコマンドは `_site/` 相当の出力にHTML・CSS・JS・施設データ・アイコン・サイトマップ・robots.txtと、施設データをもとにした検索向けHTMLページを生成します。`.env` ファイルは使いません。

## X投稿候補のDry Run

`npm run social:dry-run` は、確認済み施設と無料日ルールから候補を1件作り、本文・対象日・選定理由を表示します。生成した候補は `social/outbox/latest.json`、履歴は `social/history.json` に記録します。outboxはローカル専用でGit管理しません。Dry RunはX APIに接続しません。

毎日17時（日本時間）のGitHub Actionsワークフローも、初期状態ではDry Runだけを実行します。生成JSONはActionsの実行結果から14日間ダウンロードできます。履歴はActions Cacheに保存し、毎日の実行で次回へ引き継ぎます（キャッシュは長期間実行が止まるとGitHubに削除されるため、投稿履歴の定期バックアップは今後の運用課題です）。投稿対象がない場合は `No eligible post candidate` として正常終了します。

### 投稿候補の選定

- 優先順位は「明日 → 今日 → 今週末 → 今週」。日付条件より常時無料の施設を後回しにします。
- `audit.status` と無料日関連項目が `confirmed` の施設だけを対象とし、needs_review / unverifiedは対象外です。
- 大人・一般が無料になるルールを使います。子ども・学生など大人対象外の条件は除外し、成人でも条件がある場合は投稿文に対象条件を明記します。
- 施設詳細の静的URLへリンクし、`utm_source=x` 等の計測用パラメーターを付けます。サイトのcanonical URLは変更しません。
- 投稿済み履歴から同一施設の14日間再選出、同一施設・対象日の再投稿、同じ本文の再投稿を防ぎます。Dry Runは投稿済み扱いにせず、実際の投稿履歴とは区別します。地域・カテゴリの直近候補も参照して偏りを抑えます。
- 自動文面は施設データから生成します。知名度のような根拠のない人気評価は使いません。

### X API接続と有効化

投稿クライアントは `src/social/xClient.js` に分離しています。現行のX API v2 `POST https://api.x.com/2/tweets` とOAuth 1.0aユーザーコンテキストを使う実装です。Xの公式ガイドは投稿作成にUser Access Tokenを求め、OAuth 1.0aの例も示しています。投稿作成は従量課金対象です。料金は変更されるため、実際に有効化する前に[公式料金ページ](https://developer.x.com/)を確認してください。このプロジェクトでは投稿機能を初期無効にしており、API契約・購入・本番投稿は行っていません。

本番投稿を使う場合は、まずX Developer Consoleで投稿権限を持つアプリとUser Access Tokenを用意し、GitHubリポジトリの **Settings → Secrets and variables → Actions → Secrets** に以下を設定します。

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

その後、同じ画面の **Variables** に `SOCIAL_POSTING_ENABLED=true` を設定すると、スケジュール実行または手動実行時に候補をXへ投稿します。変数が未設定の場合は `false` として扱います。候補確認だけ続ける場合は変数を設定しないでください。環境変数の見本は [.env.example](.env.example) にありますが、実際のキーはGitHub Secretsにのみ保存し、`.env` をコミットしないでください。

通信タイムアウトまたはサーバー応答で送信成否が不明な場合は、重複投稿防止のため履歴を `unknown` にし、自動再試行しません。X上の投稿履歴を確認してから手動で処理してください。認証、レート制限、拒否エラーは種別だけログと履歴に残し、秘密情報や応答本文は出力しません。

ローカルテストは `npm run test:social` で実行します。実データを使うDry Runは `npm run social:dry-run`、無効状態の投稿コマンド確認は `npm run social:post` です。`SOCIAL_POSTING_ENABLED=true` にすると外部投稿につながるため、確認が終わるまではfalseのままにしてください。

## 施設データ

施設データは `data.js` の `window.FACILITIES` にあります。`facility_id` は施設詳細の固有URL（`?facility=施設ID`）に使います。既存アプリとの互換性を保つため、`free_conditions` / `free_condition`、`free_days` / `free_dates`、`source_url` / `source`、`last_checked` / `last_verified_date` は同じ情報の別名として保持します。`lat` / `lon` は確認できていない施設では `null` とし、座標を推測しません。無料条件の文章は `free_conditions`、日付や対象者を検索するルールは `free_rules` に保持します。対象者条件は各ルールの `eligibility` と施設単位の `free_eligibility` に構造化し、対象グループ、年齢条件、居住都道府県・市区町村、学生条件、その他条件、一般（大人）対象か、条件詳細を保存します。明示された対象だけを判定し、不明なものは一般無料にしません。ルール型は `annual_date`、`specific_date`、`holiday`、`nth_weekday`、`weekly_weekday`、`nearest_weekday`、`annual_period`、`eligibility`、`always_free` です。無料日のない施設に日付を補完しないでください。

確認状態は `audit.status`（`confirmed` / `needs_review`）、`audit.field_status`（`confirmed` / `needs_review` / `unverified`）、`audit.reviewed_at`、`audit.issues` に記録します。詳細ページと一覧カードは未確定状態を利用者に表示します。`AUDIT.md` は2026年10月3日時点の監査記録です。追加した都立9庭園は2026年10月5日に各施設の公式ページを確認しています。

## 自動更新の方針

現在は自動収集を行いません。将来の更新処理では、公式ページと情報源を項目単位で記録し、前回値との差分を作って `needs_review` にします。担当者が公式情報を確認した後にのみ `confirmed` にし、確認できない場合は `unverified` のまま保留します。自動取得が安定してから、GitHub Actionsの定期実行とSupabaseの無料枠などを検討します。Supabaseへ移す場合のテーブル案は `database/schema.sql` にあります。

### 検索向けページ

`scripts/prepare_site.py` は `data.js` から施設データを読み、監査済みの無料ルールがある地域・カテゴリのページと、今日・明日・今週・今週末・今月のページを静的HTMLとして生成します。対象者限定の条件は表示し、`needs_review` / `unverified` の無料日情報は一覧に掲載しません。地域×カテゴリページは次回日付を計算できる対象施設が3件以上、カテゴリ横断ページは3件以上の場合だけ生成します。全施設に `/facility/{facility_id}/` の静的な詳細ページを生成し、一覧・canonical・サイトマップから直接到達できるようにします。従来の `?facility=` URLも互換のため残します。`Asia/Tokyo` の日付に合わせ、Actionsが毎日00:00 JSTに日付ページとサイトマップを再生成・公開します。

ページごとにtitle、description、canonical、OGP、CollectionPage/ItemList構造化データを設定します。施設詳細にはTouristAttraction構造化データを出力します。キーワード仮説とページ対応は `SEO_KEYWORDS.md`、生成URL・メタ情報・掲載数の監査結果は `SEO_AUDIT.md` に記録しています。再監査は以下で実行できます。

```sh
python3 scripts/prepare_site.py --site-url https://OWNER.github.io/REPOSITORY/ --output /tmp/free-day-site
python3 scripts/audit_seo.py --site /tmp/free-day-site --base https://OWNER.github.io/REPOSITORY/
```

検索ボリュームは未計測のため、月1,000PVは目標であり保証値ではありません。公開後はGoogle Search Consoleの実績を見て見直します。

## ファイル

- `index.html` — ページ枠、基本SEO、OGP
- `app.js` — 検索、一覧、施設詳細、ページ単位のメタ情報と構造化データ
- `data.js` — 施設レコードと監査状態
- `styles.css` — レスポンシブ表示
- `scripts/prepare_site.py` — 確認済みデータからのSEOページ、サイトマップ、robots.txt生成
- `SEO_KEYWORDS.md` — キーワード仮説とページ対応
- `.github/workflows/deploy.yml` — GitHub Pagesへの自動公開
- `AUDIT.md` — 施設データ監査結果
- `database/schema.sql` — 将来のSupabase/PostgreSQL向け定義
- `src/social/` — X APIクライアントと投稿候補生成
- `scripts/social/` — Dry Run、履歴管理、テスト
- `.github/workflows/social-post.yml` — 17時JSTの投稿候補生成ワークフロー（本番投稿は既定で無効）

## 既知の制約

施設ページは単一のHTMLとクエリ付きURLで表示します。検索エンジンがクエリ付きページをどの程度クロールするかは公開後にSearch Console等で確認してください。無料条件には年齢や居住地など対象者限定のものが含まれ、利用者の属性を入力して適用判定する機能はまだありません。施設へ行く前に必ず公式案内を確認してください。
