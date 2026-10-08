"""Cloudflare Git builds: isolated staging by default, explicit production opt-in."""
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]


def build():
    production = os.environ.get("CF_PAGES_BRANCH") == os.environ.get("PRODUCTION_BRANCH", "main")
    indexable = production and os.environ.get("SITE_INDEXABLE", "false") == "true"
    configured_url = os.environ.get("SITE_URL", "")
    # Main builds should link to the stable hostname even before indexing is enabled.
    # Branch previews remain isolated at their own deployment URL.
    base = configured_url if production and (configured_url or indexable) else os.environ.get("CF_PAGES_URL", "")
    parsed = urlsplit(base)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Cloudflare build needs an HTTPS root SITE_URL (production) or CF_PAGES_URL (staging)")
    base = base.rstrip("/") + "/"
    out = ROOT / "_site"
    subprocess.run([sys.executable, str(ROOT / "scripts/prepare_site.py"), "--site-url", base, "--output", str(out)], check=True)
    # A real 404 disables Cloudflare's default SPA fallback for unknown routes.
    (out / "404.html").write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="robots" content="noindex"><title>ページが見つかりません</title><h1>ページが見つかりません</h1><a href="/">無料デー検索へ</a></html>', encoding="utf-8")
    if not indexable:
        for page in out.rglob("*.html"):
            markup = page.read_text(encoding="utf-8")
            if '<meta name="robots"' not in markup:
                markup = markup.replace('<head>', '<head><meta name="robots" content="noindex,follow">', 1)
            page.write_text(markup, encoding="utf-8")
        (out / "_headers").write_text('/*\n  X-Robots-Tag: noindex, follow\n', encoding="utf-8")
    print("Cloudflare production" if indexable else "Cloudflare staging (noindex)")


if __name__ == "__main__":
    build()
