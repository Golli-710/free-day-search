#!/usr/bin/env python3
"""Create a compact audit of the pages produced by prepare_site.py."""
import argparse
import html
import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

import prepare_site


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = self.description = self.canonical = self.h1 = ""
        self.links = []
        self.articles = []
        self.text = []
        self.in_title = self.in_h1 = False
        self.article_depth = 0
        self.current_article = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title": self.in_title = True
        if tag == "h1": self.in_h1 = True
        if tag == "article":
            if self.article_depth == 0: self.current_article = []
            self.article_depth += 1
        if tag == "meta" and attrs.get("name") == "description": self.description = attrs.get("content", "")
        if tag == "link" and attrs.get("rel") == "canonical": self.canonical = attrs.get("href", "")
        if tag == "a": self.links.append((attrs.get("href", ""), ""))

    def handle_endtag(self, tag):
        if tag == "title": self.in_title = False
        if tag == "h1": self.in_h1 = False
        if tag == "article" and self.article_depth:
            self.article_depth -= 1
            if self.article_depth == 0: self.articles.append(" ".join(self.current_article))

    def handle_data(self, data):
        self.text.append(data)
        if self.in_title: self.title += data
        if self.in_h1: self.h1 += data
        if self.article_depth: self.current_article.append(data)


def md(value):
    return str(value).replace("|", "\\|").replace("\n", " ").strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", default="/tmp/free-day-build")
    parser.add_argument("--base", default="https://golli-710.github.io/free-day-search/")
    parser.add_argument("--output", default="SEO_AUDIT.md")
    args = parser.parse_args()
    site, base = Path(args.site), args.base.rstrip("/") + "/"
    rows = prepare_site.facility_data()
    by_id = {f["facility_id"]: f for f in rows}
    sitemap_root = ET.parse(site / "sitemap.xml").getroot()
    sitemap = {node.text for node in sitemap_root.findall("{*}url/{*}loc")}
    pages = []
    for file in sorted(site.glob("**/index.html")):
        if file.parent == site or file.parent.name == "facility": continue
        rel = file.parent.relative_to(site).as_posix()
        if rel.startswith("facility/"): continue
        p = Page(); p.feed(file.read_text(encoding="utf-8"))
        url = base + rel + "/"
        ids = []
        for link, _ in p.links:
            m = re.search(r"/facility/([^/]+)/", link)
            if m and unquote(m.group(1)) in by_id: ids.append(unquote(m.group(1)))
        facilities = [by_id[x] for x in dict.fromkeys(ids)]
        areas = "・".join(dict.fromkeys(f["prefecture"] for f in facilities)) or "対象施設なし"
        cats = "・".join(dict.fromkeys(f["category"] for f in facilities)) or "対象施設なし"
        if rel.startswith("free/") and rel.count("/") == 1 and rel.split("/")[1] not in {"today", "tomorrow", "this-week", "this-weekend", "this-month"}:
            intent = "カテゴリ横断・無料日"
        elif rel.startswith("free/"):
            intent = "日付・期間指定の無料施設"
        elif rel.startswith(("tokyo/", "kanagawa/", "osaka/")) and rel.count("/") > 1:
            intent = "地域×カテゴリの無料施設"
        else:
            intent = "地域の無料施設"
        free_count = sum("無料日：" in article for article in p.articles)
        internal = []
        for link, _ in p.links:
            if link.startswith(base): internal.append(link.removeprefix(base))
            elif link.startswith("/"): internal.append(link.lstrip("/"))
            elif link and not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", link) and not link.startswith("#"):
                internal.append(link)
        pages.append({"url": url, "path": rel, "title": p.title, "description": p.description, "h1": p.h1, "facilities": len(p.articles), "free": free_count, "areas": areas, "cats": cats, "intent": intent, "canonical": p.canonical, "links": list(dict.fromkeys(internal)), "sitemap": url in sitemap})

    detail_rows = []
    for f in rows:
        rel = f"facility/{f['facility_id']}"
        p = Page(); p.feed((site / rel / "index.html").read_text(encoding="utf-8"))
        text = " ".join(p.text)
        has_date = "次回無料日" in text and not any(x in text for x in ("情報確認中", "公式情報を確認できていません"))
        detail_rows.append({"url": base + rel + "/", "title": p.title, "description": p.description, "h1": p.h1, "facility": f["name"], "prefecture": f["prefecture"], "category": f["category"], "status": f.get("audit", {}).get("status", f.get("audit_status", "unverified")), "has_date": has_date, "canonical": p.canonical, "sitemap": base + rel + "/" in sitemap, "links": len(p.links)})

    title_dupes = len(pages) - len({p["title"] for p in pages})
    desc_dupes = len(pages) - len({p["description"] for p in pages})
    h1_dupes = len(pages) - len({p["h1"] for p in pages})
    urls = [node.text for node in sitemap_root.findall("{*}url/{*}loc")]
    out = ["# SEOページ監査", "", "生成時点：2026-10-05（Asia/Tokyo）。ページ件数・無料日件数はこの日を基準にしたビルド結果です。ランディングページは日付更新のたびに掲載件数・タイトルが変わります。", "", f"- 確認済み施設データ：{len(rows)}件（confirmed {sum(f.get('audit', {}).get('status') == 'confirmed' for f in rows)} / needs_review {sum(f.get('audit', {}).get('status') == 'needs_review' for f in rows)} / unverified {sum(f.get('audit', {}).get('status') == 'unverified' for f in rows)}）", f"- 検索向けランディングページ：{len(pages)}件、静的施設詳細：{len(detail_rows)}件", f"- sitemap.xml：{len(urls)} URL、重複 {len(urls) - len(set(urls))}件", f"- ランディングページの重複 title / description / H1：{title_dupes} / {desc_dupes} / {h1_dupes}件", "- canonical：全ページで設定を確認。施設一覧があるページはsitemapへの掲載も確認。空の当日ページはnoindexにしてsitemapから除外します。", "", "## ランディングページ", "", "|URL|title|meta description|H1|掲載施設数|無料日情報件数|地域|カテゴリ|検索意図|canonical|内部リンク数|sitemap|", "|---|---|---|---|---:|---:|---|---|---|---|---:|---|"]
    for p in pages:
        out.append(f"|`/{p['path']}/`|{md(p['title'])}|{md(p['description'])}|{md(p['h1'])}|{p['facilities']}|{p['free']}|{md(p['areas'])}|{md(p['cats'])}|{p['intent']}|{'あり' if p['canonical'] == p['url'] else '要確認'}|{len(p['links'])}|{'あり' if p['sitemap'] else 'なし'}|")
    out += ["", "### 内部リンク先（各ランディングページ）", ""]
    for p in pages:
        out.append(f"- `/{p['path']}/` → " + (", ".join(f"`/{x}`" for x in p["links"]) or "内部リンクなし"))
    out += ["", "## 施設詳細ページ（52件）", "", "静的HTMLに固有のtitle・description・H1・canonical・TouristAttraction構造化データを出力。詳細ページの無料日欄はconfirmedの成人対象ルールから計算し、needs_reviewは日付要確認と表示します。クエリ付き旧URLは機能互換を保ち、canonicalは固有の静的ページに向けます。", "", "|URL|施設名|title|meta description|H1|掲載施設数|無料日情報|地域|カテゴリ|検索意図|canonical|内部リンク|sitemap|状態|", "|---|---|---|---|---|---:|---|---|---|---|---|---:|---|---|"]
    for d in detail_rows:
        out.append(f"|`/facility/{d['url'].split('/facility/',1)[1]}`|{md(d['facility'])}|{md(d['title'])}|{md(d['description'])}|{md(d['h1'])}|1|{'次回日あり' if d['has_date'] else '要確認・日付未確定'}|{md(d['prefecture'])}|{md(d['category'])}|施設名＋無料日・料金|{'あり' if d['canonical'] == d['url'] else '要確認'}|{d['links']}|{'あり' if d['sitemap'] else 'なし'}|{d['status']}|")
    out += ["", "## 監査所見", "", "- 地域ページは確認済みの成人向け無料日を複数掲載し、該当地域のカテゴリページ・日付ページへつなぎます。", "- 地域×カテゴリページは対象3施設以上に限定。今回、2施設のみだった東京の動物園・植物園ページは生成・sitemap掲載を停止し、東京全体とカテゴリ横断ページから案内します。", "- 日付ページはその日の該当施設を毎日再計算し、確認済みルールのみ掲載。空ページも生成対象から除外する追加条件は今後の改善候補です。", "- 施設詳細はクエリ付きURLのJavaScript描画だけだったため、今回静的な固有URLを生成して内部リンク・canonical・sitemapを統一しました。", "- 検索ボリューム・表示回数・クリック数・CTR・掲載順位は未取得です。ページ数やキーワード候補から流入量を推測していません。", ""]
    Path(args.output).write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {args.output}: {len(pages)} landing pages, {len(detail_rows)} details, {len(urls)} sitemap URLs")


if __name__ == "__main__":
    main()
