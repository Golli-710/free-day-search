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

## 既知の制約

施設ページは単一のHTMLとクエリ付きURLで表示します。検索エンジンがクエリ付きページをどの程度クロールするかは公開後にSearch Console等で確認してください。無料条件には年齢や居住地など対象者限定のものが含まれ、利用者の属性を入力して適用判定する機能はまだありません。施設へ行く前に必ず公式案内を確認してください。
