"""Generate visible navigation and JSON-LD from one real page hierarchy."""
import html
import json
from html.parser import HTMLParser
from urllib.parse import unquote


class Heading(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.value = ''

    def handle_starttag(self, tag, attrs):
        if tag == 'h1':
            self.active = True

    def handle_endtag(self, tag):
        if tag == 'h1':
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.value += data


def add_breadcrumbs(out, base, facilities, areas):
    pages = {p.parent.relative_to(out).as_posix(): p for p in out.rglob('index.html')}
    headings = {}
    for path, page in pages.items():
        parser = Heading()
        parser.feed(page.read_text(encoding='utf-8'))
        headings[path] = parser.value
    by_id = {f['facility_id']: f for f in facilities}
    area_by_pref = {pref: slug for slug, pref in areas}
    esc = lambda value: html.escape(value, quote=True)
    for path, page in pages.items():
        if path == '.':
            continue
        crumbs = [('トップ', base)]
        region = None
        if path.startswith('facility/'):
            facility = by_id[unquote(path.split('/')[1])]
            slug = area_by_pref.get(facility['prefecture'])
            region = f'{slug}/free' if slug else None
        elif path.count('/') > 1 and not path.startswith('free/'):
            region = path.split('/')[0] + '/free'
        if region in pages and region != path:
            crumbs.append((headings[region], base + region + '/'))
        crumbs.append((headings[path], base + path + '/'))
        items = ''.join(
            f'<li><a href="{esc(url)}">{esc(name)}</a></li>' if i < len(crumbs) - 1
            else f'<li><span aria-current="page">{esc(name)}</span></li>'
            for i, (name, url) in enumerate(crumbs)
        )
        navigation = f'<nav class="breadcrumbs" aria-label="パンくず"><ol>{items}</ol></nav>'
        schema = {'@context': 'https://schema.org', '@type': 'BreadcrumbList',
                  'itemListElement': [{'@type': 'ListItem', 'position': i + 1,
                                      'name': name, 'item': url}
                                     for i, (name, url) in enumerate(crumbs)]}
        encoded = json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c')
        markup = page.read_text(encoding='utf-8')
        markup = markup.replace('<main class="container">', '<main class="container">' + navigation, 1)
        markup = markup.replace('</head>', f'<script type="application/ld+json">{encoded}</script></head>', 1)
        page.write_text(markup, encoding='utf-8')
