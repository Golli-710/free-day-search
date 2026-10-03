#!/usr/bin/env python3
"""Prepare the static website and its absolute SEO URLs for deployment."""
import argparse
import re
import shutil
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SITE_FILES = ["index.html", "app.js", "data.js", "styles.css", "favicon.svg"]
PREFECTURES = ["東京都", "神奈川県", "大阪府"]
CATEGORIES = ["美術館", "博物館", "科学館", "動物園", "水族館", "植物園"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-url", required=True, help="Public base URL, ending with slash")
    parser.add_argument("--output", default="_site")
    args = parser.parse_args()
    base = args.site_url.rstrip("/") + "/"
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for name in SITE_FILES:
        shutil.copy2(ROOT / name, out / name)
    ids = re.findall(r'facility_id:"([^"]+)"', (ROOT / "data.js").read_text(encoding="utf-8"))
    urls = [base]
    urls += [base + "?prefecture=" + quote(pref, safe="") for pref in PREFECTURES]
    urls += [base + "?category=" + quote(category, safe="") for category in CATEGORIES]
    urls += [base + "?facility=" + facility_id for facility_id in ids]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{url}</loc></url>" for url in urls]
    sitemap.append("</urlset>")
    (out / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")
    (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n", encoding="utf-8")
    (out / ".nojekyll").touch()
    print(f"Prepared {len(ids)} facility URLs at {base} in {out}")


if __name__ == "__main__":
    main()
