# Cloudflare Pages移行手順

## 現状と準備済みの変更

HTML/CSS/JSと52施設データを既存と同じ生成処理で `_site` に出力します。GitHub Pagesの設定、毎日00:00 JSTの再生成・公開、X候補生成17:00 JST・投稿無効の既定値は保持しています。施設情報の自動収集は現在ありません。GitHub Pages停止やURL切替は行っていません。

- `npm run build:cloudflare`: Cloudflare専用ビルド。canonical、OGP URL、構造化データ、内部リンク、robots.txt、sitemapの全URLをルート配下に生成。
- 検証公開は既定でnoindex。プレビューは本番変数を継承しても常にHTTPヘッダーとHTMLでnoindexになります。robotsでクロール禁止にせずnoindexの取得を許可します。
- mainブランチは検証中も `SITE_URL` があれば固定ホスト名を使います。`SITE_INDEXABLE=false` のままnoindexを維持し、日次ビルド後も内部リンクが過去のデプロイURLに固定されません。初回でURL未設定なら `CF_PAGES_URL` を使います。Previewは `SITE_URL` を継承しても自身の `CF_PAGES_URL` を使います。本番index許可には `SITE_URL` の明示設定が必須です。
- 404を生成し、不明なURLがCloudflareのSPAフォールバックで200になることを防止。
- 日付SEOページはpushなしでも毎日再ビルドする任意のDeploy Hookワークフローを追加。GitHub側は変更ありません。
- X投稿のリンク先はGitHubの `SOCIAL_SITE_URL` 変数で切替可能。未設定なら旧URL。UTM品質検査も新base pathに対応。
- OGPは既存のtitle/description/urlとTwitter summaryを保持。既存のOG画像がないため新たな画像は追加していません。

## 利用者が行うCloudflare設定

1. Cloudflareへログインし **Workers & Pages → Create application → Pages → Connect to Git**。GitHub認証で `Golli-710/free-day-search` のアクセスを許可。
2. Production branch=`main`、Framework preset=`None`、Build command=`npm run build:cloudflare`、Build output directory=`_site`、Root directoryは空。
3. 環境変数 `NODE_VERSION=22`、`PYTHON_VERSION=3.12`、`SITE_INDEXABLE=false` を設定して初回公開。CF_PAGES_URL/CF_PAGES_BRANCHはCloudflareが提供するため手動設定不要。必要なら `GOOGLE_SITE_VERIFICATION` をCloudflareにも設定。
4. 発行された固定Pages URL（例：`https://free-day-search.pages.dev/`）をProduction環境の `SITE_URL` に設定し、`SITE_INDEXABLE=false` を維持して再ビルド。デプロイごとに変わるハッシュ付きURLは指定しないでください。固定Pages URLを共有。トップ、検索、月移動、絞り込み、施設詳細・日付・地域ページ、CSS、favicon、404、UTM URLを実環境で確認。プレビューと検証本番で `X-Robots-Tag: noindex, follow` を確認。
5. Pages Settings → Builds & deployments → Deploy hooksでmain向けHookを作り、URLをGitHub Actions Secret `CLOUDFLARE_DEPLOY_HOOK` に保存。Actions Variable `CLOUDFLARE_REFRESH_ENABLED=true` で毎日00:00 JSTの再生成を有効化。手動実行後、Cloudflare側のbuild成功も確認（Hook応答はbuild完了を示しません）。push時の自動デプロイはCloudflare Git連携が担当。
6. 本番ホスト名を確定後、Productionのみに `SITE_URL=https://確定ホスト名/`、`SITE_INDEXABLE=true` を設定し再デプロイ。Previewは常時noindex。Pagesの別名URLはCloudflare側で本番ホストへのリダイレクトを設定し重複公開を避ける。
7. 全ページとsitemapを確認した後、Xを使っている場合のみGitHub Variable `SOCIAL_SITE_URL` を本番URLへ変更。Search Consoleの新プロパティ確認とsitemap送信を行う。

## 旧URLとSEO

現行は `https://golli-710.github.io/free-day-search/`。旧サーバーをCloudflareの `_redirects` で制御できないため、旧URLの301はこの実装ではできません。既存GitHub Pagesを保持したまま、新環境の検証完了後に旧ページを新canonical／移転案内へ更新する別変更を検討してください。独自ドメインを維持できる場合はDNS移行でURLを維持する方法を優先。旧GitHub Pagesの変更は今は一切していません。施設の相対pathは新環境で `/facility/.../`、旧環境で `/free-day-search/facility/.../`。旧クエリ `?facility=` とUTMは互換性を保持。

生成処理に既存の地域リンク誤り（`/tokyo/`等）があったため、実際に存在する `/tokyo/free/`等へ修正。地域ページの在庫条件で消えるpathについてはアプリ表示の既存リンクも公開前に確認が必要です。

## 無料枠と自動更新

Cloudflare Pages Freeは月500 builds、20,000 files、1ファイル25 MiBが上限。日次約31回とpush／previewの合計を監視してください。buildは依存ライブラリなしで軽量です。GitHubスケジュールは遅延する場合があります。将来botでcommitする場合は、Git連携のCIスキップ接頭辞 `[ci skip]`/`[skip ci]` 等を付けないこと。今回bot pushはありません。

参照: https://developers.cloudflare.com/pages/configuration/build-configuration/ 、https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/ 、https://developers.cloudflare.com/pages/configuration/deploy-hooks/ 、https://developers.cloudflare.com/pages/platform/limits/ 、https://developers.cloudflare.com/pages/configuration/serving-pages/
