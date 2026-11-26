# 5施設追加（公式確認2026-11-15）
main73→78件。main、PR24、27、29の追加名と重複なし。本番未反映。

- 気象科学館 https://www.jma.go.jp/jma/kishou/intro/kagakukan.html 無料9〜20時、予約不要、第2月曜と翌日（月曜祝日は火水）、12/29〜1/3休館。2026/27日付生成。
- ニコン https://www.jp.nikon.com/company/corporate/museum/guide/ https://www.jp.nikon.com/company/news/2026/0910_01/ 無料・日月祝休館・西大井4分。30名超団体は連絡。
- ガスミュージアム https://www.gasmuseum.jp/access/ https://www.gasmuseum.jp/gallery/ https://www.gasmuseum.jp/wp-content/uploads/group.pdf 無料10〜17時、月祝翌日。年末年始具体日は未確認。
- 杉並アニメーション https://sam.or.jp/access https://sam.or.jp/faq 見学シアター無料、材料費別。月曜祝日翌平日・12/28〜1/4休館、団体予約。
- 郵政 https://www.postalmuseum.jp/guide/open.html https://www.postalmuseum.jp/guide/access.html 一般有料、手帳等所持者と介助者無料。不定休。一般無料一覧に含めない。

各施設のアクセス・無料範囲・予約・条件とURLをdata.jsに保存。
schedule_confirmed_untilは休館ではなく日付検索の確認有効期限。ニコン・ガスは指定日/年末年始の確認不足を推測で補わず11/30まで、気象は計算済み2027年末まで。期限後も施設情報は残す。期限前に公式情報を再確認して延長。臨時休館は訪問前確認。
検証：JS3テスト（新施設16境界＋条件限定確認）、Python10境界、metadata4テスト、diff check成功。
除外：東芝未来科学館は https://www.global.toshiba/jp/news/corporate/2024/05/news-20240523-01.html にて2024/6/29一般公開終了。東武は無料条件未確定で保留。
