import os
import html
import json
import re
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from urllib.parse import unquote, urlsplit
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import prepare_site  # noqa: E402

BASE = "https://golli-710.github.io/free-day-search/"


def build_site(output, verification=""):
    args = ["prepare_site.py", "--site-url", BASE, "--output", str(output), "--today", "2026-10-05"]
    if verification:
        args += ["--google-site-verification", verification]
    with patch.object(sys, "argv", args), patch.dict(os.environ, {"GOOGLE_SITE_VERIFICATION": verification}), redirect_stdout(StringIO()):
        prepare_site.main()


class SiteMetadataTests(unittest.TestCase):
    def test_always_free_page_excludes_conditional_and_unverified_facilities(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'site'
            build_site(output)
            page = (output / 'free/always/index.html').read_text(encoding='utf-8')
            expected = {f['facility_id'] for f in prepare_site.eligible_facilities(prepare_site.facility_data())
                        if any(r.get('type') == 'always_free' and prepare_site.eligible(r) == 'general'
                               for r in f.get('free_rules', []))}
            schemas = [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page)]
            collection = next(s for s in schemas if s.get('@type') == 'CollectionPage')
            actual = {entry['url'].rstrip('/').split('/')[-1] for entry in collection['mainEntity']['itemListElement']}
            self.assertEqual(actual, expected)
            self.assertIn(BASE + 'free/always/', (output / 'sitemap.xml').read_text())

    def test_visible_breadcrumbs_match_schema_and_all_internal_targets_exist(self):
        with tempfile.TemporaryDirectory(prefix="free-day-navigation-") as directory:
            output = Path(directory) / "site"
            build_site(output)
            titles = set()
            for page in output.rglob('index.html'):
                markup = page.read_text(encoding='utf-8')
                title = re.search(r'<title>(.*?)</title>', markup).group(1)
                self.assertNotIn(title, titles, str(page))
                titles.add(title)
                canonical = re.search(r'<link rel="canonical" href="([^"]+)"', markup).group(1)
                og = re.search(r'<meta property="og:url" content="([^"]+)"', markup).group(1)
                self.assertEqual(canonical, og)
                for href in re.findall(r'(?:href|src)="([^"]+)"', markup):
                    if not href.startswith(BASE):
                        continue
                    local = unquote(urlsplit(html.unescape(href[len(BASE):])).path)
                    target = output / local
                    if not local or local.endswith('/'):
                        target /= 'index.html'
                    self.assertTrue(target.exists(), f'{page}: {href}')
                if page == output / 'index.html':
                    continue
                nav = re.search(r'<nav class="breadcrumbs"[^>]*>(.*?)</nav>', markup).group(1)
                visible = re.findall(r'<li>(.*?)</li>', nav)
                schemas = [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', markup)]
                breadcrumbs = [s for s in schemas if s.get('@type') == 'BreadcrumbList']
                self.assertEqual(len(breadcrumbs), 1, str(page))
                items = breadcrumbs[0]['itemListElement']
                self.assertGreaterEqual(len(items), 2)
                self.assertEqual(len(items), len(visible))
                for i, (item, entry) in enumerate(zip(items, visible)):
                    self.assertEqual(item['position'], i + 1)
                    self.assertEqual(item['name'], html.unescape(re.sub('<[^>]+>', '', entry)))
                    if i < len(items) - 1:
                        self.assertIn(f'href="{html.escape(item["item"], quote=True)}"', entry)
                    else:
                        self.assertEqual(item['item'], html.unescape(canonical))
                        self.assertIn('aria-current="page"', entry)

    def test_sitemap_robots_canonical_and_noindex_are_consistent(self):
        with tempfile.TemporaryDirectory(prefix="free-day-seo-") as directory:
            output = Path(directory) / "site"
            build_site(output)
            sitemap = ET.parse(output / "sitemap.xml").getroot()
            namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            urls = [node.text for node in sitemap.findall("s:url/s:loc", namespace)]
            self.assertTrue(urls)
            self.assertEqual(len(urls), len(set(urls)))
            self.assertTrue(all(url.startswith(BASE) for url in urls))
            self.assertTrue(all(url == url.lower() for url in urls))
            self.assertIn(BASE + "facility/ueno-zoo/", urls)
            self.assertIn(BASE + "free/today/", urls)

            robots = (output / "robots.txt").read_text(encoding="utf-8")
            self.assertIn("Sitemap: " + BASE + "sitemap.xml", robots)

            canonicals = []
            sitemap_set = set(urls)
            for page in output.rglob("*.html"):
                markup = page.read_text(encoding="utf-8")
                match = re.search(r'<link rel="canonical" href="([^"]+)"', markup)
                self.assertIsNotNone(match, str(page))
                canonical = match.group(1)
                self.assertTrue(canonical.startswith(BASE), canonical)
                self.assertNotIn("?", canonical)
                canonicals.append(canonical)
                if 'name="robots" content="noindex,follow"' in markup:
                    self.assertNotIn(canonical, sitemap_set)
            self.assertIn(BASE, canonicals)
            self.assertEqual(len(canonicals), len(set(canonicals)))

    def test_verification_meta_is_configured_at_build_and_absent_by_default(self):
        with tempfile.TemporaryDirectory(prefix="free-day-verify-") as directory:
            output = Path(directory) / "site"
            build_site(output, "sc-test-code-123")
            pages = list(output.rglob("*.html"))
            self.assertGreater(len(pages), 1)
            for page in pages:
                markup = page.read_text(encoding="utf-8")
                self.assertIn('<meta name="google-site-verification" content="sc-test-code-123">', markup, str(page))

            clean_output = Path(directory) / "no-verification"
            with patch.dict(os.environ, {"GOOGLE_SITE_VERIFICATION": ""}):
                build_site(clean_output)
            for page in clean_output.rglob("*.html"):
                markup = page.read_text(encoding="utf-8")
                self.assertNotIn("google-site-verification", markup, str(page))


if __name__ == "__main__":
    unittest.main()
