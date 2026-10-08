# -*- coding: utf-8 -*-
"""Operator pages and optional analytics shared by every generated page."""
import html
import json
import os
import re


def add_foundation(root, out, base, verification_meta):
    esc = lambda text: html.escape(str(text), quote=True)
    measurement = os.environ.get('GA4_MEASUREMENT_ID', '')
    if measurement and not re.fullmatch(r'G-[A-Z0-9]+', measurement):
        raise ValueError('Invalid GA4_MEASUREMENT_ID')
    policies = json.loads((root / 'policies.json').read_text(encoding='utf-8'))
    links = ' ・ '.join(f'<a href="{esc(base + p["slug"] + "/")}">{esc(p["title"])}</a>' for p in policies)
    navigation = f'<nav aria-label="運営情報">{links}</nav>'
    urls = []
    for p in policies:
        canonical = base + p['slug'] + '/'
        body = ''.join(f'<section><h2>{esc(heading)}</h2><p>{esc(text)}</p></section>' for heading, text in p['sections'])
        if p['slug'] == 'privacy':
            status = '同意した場合のみGoogle Analyticsで計測します。' if measurement else '外部のアクセス解析は無効です。'
            body += f'<p>現在のアクセス解析：{status}</p><p><a href="https://policies.google.com/privacy">Googleのプライバシーポリシー</a></p>'
        markup = f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{verification_meta}<title>{esc(p['title'])}｜無料デー検索</title><meta name="description" content="{esc(p['description'])}"><link rel="canonical" href="{esc(canonical)}"><meta property="og:title" content="{esc(p['title'])}｜無料デー検索"><meta property="og:description" content="{esc(p['description'])}"><meta property="og:url" content="{esc(canonical)}"><link rel="stylesheet" href="{esc(base)}styles.css"></head><body><header class="site-header"><a class="brand" href="{esc(base)}">無料デー検索</a></header><main class="container"><h1>{esc(p['title'])}</h1>{body}<p>更新日：2026年10月8日</p></main><footer class="site-footer"><p>無料デー検索</p></footer></body></html>'''
        folder = out / p['slug']
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'index.html').write_text(markup, encoding='utf-8')
        urls.append(canonical)
    for page in out.rglob('*.html'):
        markup = page.read_text(encoding='utf-8')
        markup = markup.replace('</head>', f'<meta name="site-analytics" content="{esc(measurement)}"><meta name="analytics-site" content="無料デー検索"></head>')
        markup = markup.replace('</footer>', navigation + '</footer>')
        markup = markup.replace('</body>', f'<script defer src="{esc(base)}analytics.js"></script></body>')
        page.write_text(markup, encoding='utf-8')
    return urls
