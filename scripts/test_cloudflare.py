import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import build_cloudflare

ROOT = Path(__file__).resolve().parents[1]

class CloudflareTests(unittest.TestCase):
    def test_preview_cannot_be_indexed_with_production_env(self):
        with patch.dict(os.environ, {'CF_PAGES_BRANCH':'preview', 'SITE_INDEXABLE':'true', 'SITE_URL':'https://example.com/', 'CF_PAGES_URL':'https://preview.example.pages.dev'}, clear=True):
            build_cloudflare.build()
        out = ROOT / '_site'
        self.assertIn('X-Robots-Tag: noindex', (out / '_headers').read_text())
        self.assertIn('https://preview.example.pages.dev/facility/ueno-zoo/', (out / 'facility/ueno-zoo/index.html').read_text())
        self.assertTrue((out / '404.html').exists())
        self.assertFalse((out / 'src').exists())

    def test_production_root_urls_and_no_stale_preview_headers(self):
        with patch.dict(os.environ, {'CF_PAGES_BRANCH':'main','SITE_INDEXABLE':'true','SITE_URL':'https://example.com/'}, clear=True):
            build_cloudflare.build()
        out = ROOT / '_site'
        self.assertFalse((out / '_headers').exists())
        self.assertIn('Sitemap: https://example.com/sitemap.xml', (out / 'robots.txt').read_text())
        self.assertNotIn('github.io', (out / 'sitemap.xml').read_text())

    def test_invalid_production_base_fails(self):
        for base in ('', 'http://example.com', 'https://example.com/free-day-search/', 'https://example.com/?x=1'):
            with self.subTest(base=base), patch.dict(os.environ, {'CF_PAGES_BRANCH':'main','SITE_INDEXABLE':'true','SITE_URL':base}, clear=True):
                with self.assertRaises(ValueError):
                    build_cloudflare.build()
