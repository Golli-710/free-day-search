#!/usr/bin/env python3
"""Build the static site, high-value SEO landing pages, and sitemap."""
import argparse
import calendar
import html
import json
import re
import shutil
from datetime import date, timedelta
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SITE_FILES = ["index.html", "app.js", "data.js", "styles.css", "favicon.svg"]
AREAS = [("tokyo", "東京都"), ("kanagawa", "神奈川県"), ("osaka", "大阪府")]
CATEGORIES = ["美術館", "博物館", "科学館", "動物園", "水族館", "植物園", "庭園"]
CATEGORY_SLUGS = {"美術館": "art-museum", "博物館": "museum", "科学館": "science-museum", "動物園": "zoo", "水族館": "aquarium", "植物園": "botanical-garden", "庭園": "garden"}
GOOGLE_VERIFICATION_META = '<meta name="google-site-verification" content="1Mh9dLEDh98zsyMK-1fJe1bOT_gdS-vFDKZf-wMKRWU">'
WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"]


def facility_data():
    """Parse the project's JSON-compatible JavaScript object literals safely."""
    source = (ROOT / "data.js").read_text(encoding="utf-8").split("window.FACILITIES =", 1)[1].split(";", 1)[0]
    out, i, quote_char, escaped = [], 0, None, False
    while i < len(source):
        char = source[i]
        if quote_char:
            out.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote_char:
                quote_char = None
            i += 1
            continue
        if char in "\"'":
            quote_char = char
            out.append('"' if char == "'" else char)
            i += 1
            continue
        if char.isalpha() or char in "_$":
            end = i + 1
            while end < len(source) and (source[end].isalnum() or source[end] in "_$"):
                end += 1
            look = end
            while look < len(source) and source[look].isspace():
                look += 1
            prior = len(out) - 1
            while prior >= 0 and out[prior].isspace():
                prior -= 1
            word = source[i:end]
            if look < len(source) and source[look] == ":" and prior >= 0 and out[prior] in "{,":
                word = json.dumps(word)
            out.append(word)
            i = end
            continue
        out.append(char)
        i += 1
    return json.loads("".join(out))


def eligible(rule):
    if rule.get("eligibility"):
        e = rule["eligibility"]
        return "general" if e.get("adult_general") else "conditional" if e.get("adult_eligible") else "excluded"
    audience = str(rule.get("audience", ""))
    if not audience:
        return "general" if rule.get("type") != "eligibility" else "excluded"
    youth = bool(re.search(r"未就学児|小学生|中学生|高校生|18歳未満|\d+歳以下", audience)) and not bool(re.search(r"60歳以上|65歳以上|70歳以上|障害|手帳|大人|一般", audience))
    student = "学生" in audience and not bool(re.search(r"小学生|中学生|高校生|大学生", audience))
    adult_condition = bool(re.search(r"60歳以上|65歳以上|70歳以上|障害|手帳", audience)) or (not youth and bool(re.search(r"市内在住|都内在住|東京都民|横浜市民|区民", audience)))
    return "excluded" if youth or student or not adult_condition else "conditional"


def approved(f):
    a = f.get("audit", {})
    fields = a.get("field_status", {})
    return a.get("status") == "confirmed" and all(fields.get(k) not in ("needs_review", "unverified") for k in ("free_rules", "free_days", "free_conditions"))


def date_rules(f):
    return [r for r in f.get("free_rules", []) if r.get("type") in {"annual_date", "holiday", "specific_date", "nth_weekday", "weekly_weekday", "nearest_weekday", "annual_period"} and eligible(r) != "excluded"]


def open_on(f, day):
    weekday = (day.weekday() + 1) % 7  # Match JavaScript: Sunday is 0.
    if "open_weekdays" in f and weekday not in f["open_weekdays"]:
        return False
    if weekday in f.get("closed_weekdays", []) and not (day in holidays(day.year) and weekday in f.get("open_on_holidays", [])):
        return False
    if f.get("closed_holidays") and day in holidays(day.year):
        return False
    if f.get("closed_day_after_holiday") and day - timedelta(days=1) in holidays(day.year):
        return False
    if any(weekday == rule["weekday"] and rule.get("month") in (None, day.month) and (day.day - 1) // 7 + 1 == rule["ordinal"] for rule in f.get("closed_nth_weekdays", [])):
        return False
    if day.strftime("%m-%d") in f.get("closed_month_days", []) or day.isoformat() in f.get("closed_dates", []):
        return False
    return True


def has_always(f, day=None):
    return approved(f) and any(r.get("type") == "always_free" for r in f.get("free_rules", [])) and (day is None or open_on(f, day))


def equinox(year, spring):
    if not 1980 <= year <= 2099:
        return None
    base = year - 1980
    return int((20.8431 if spring else 23.2488) + 0.242194 * base - base // 4)


def nth_weekday(year, month, ordinal, weekday):
    first = date(year, month, 1)
    day = 1 + ((weekday - first.weekday() - 1) % 7) + (ordinal - 1) * 7
    try:
        return date(year, month, day)
    except ValueError:
        return None


def holidays(year):
    names = {}
    for y in (year - 1, year):
        fixed = [(1, 1, "元日"), (2, 11, "建国記念の日"), (2, 23, "天皇誕生日"), (4, 29, "昭和の日"), (5, 3, "憲法記念日"), (5, 4, "みどりの日"), (5, 5, "こどもの日"), (8, 11, "山の日"), (11, 3, "文化の日"), (11, 23, "勤労感謝の日")]
        for m, d, name in fixed:
            names[date(y, m, d)] = name
        for m, n, name in [(1, 2, "成人の日"), (7, 3, "海の日"), (9, 3, "敬老の日"), (10, 2, "スポーツの日")]:
            names[nth_weekday(y, m, n, 0)] = name
        for m, spring in [(3, True), (9, False)]:
            d = equinox(y, spring)
            if d:
                names[date(y, m, d)] = "春分の日" if spring else "秋分の日"
    for current in (date(year, 1, 2) + timedelta(days=i) for i in range(364)):
        if current.year != year:
            break
        if current not in names and current - timedelta(days=1) in names and current + timedelta(days=1) in names:
            names[current] = "国民の休日"
    for holiday in list(names):
        if holiday.weekday() == 6:
            substitute = holiday + timedelta(days=1)
            while substitute in names:
                substitute += timedelta(days=1)
            if substitute.year == year:
                names[substitute] = "振替休日"
    return {d: n for d, n in names.items() if d.year == year}


def movable(label, year):
    for pattern, month, ordinal in [("成人の日", 1, 2), ("海の日", 7, 3), ("敬老の日", 9, 3), ("スポーツの日|体育の日", 10, 2)]:
        if re.search(pattern, label):
            return nth_weekday(year, month, ordinal, 0)
    if "春分の日" in label:
        d = equinox(year, True)
        return date(year, 3, d) if d else None
    if "秋分の日" in label:
        d = equinox(year, False)
        return date(year, 9, d) if d else None
    return None


def matches(rule, day):
    typ = rule["type"]
    md = day.strftime("%m-%d")
    if typ in ("annual_date", "holiday"):
        moved = movable(str(rule.get("label", "")), day.year)
        return moved == day if moved else md == rule.get("month_day")
    if typ == "specific_date":
        return day.isoformat() == rule.get("date")
    if typ == "nth_weekday":
        return (rule.get("month", 0) in (0, day.month) and day.month not in rule.get("excluded_months", []) and day.weekday() == (rule.get("weekday", -1) + 6) % 7 and (day.day - 1) // 7 + 1 == rule.get("ordinal"))
    if typ == "weekly_weekday":
        return day.weekday() == (rule.get("weekday", -1) + 6) % 7
    if typ == "nearest_weekday":
        if day.month != rule.get("month"):
            return False
        candidates = []
        for offset in range(-7, 8):
            try:
                candidate = date(day.year, rule["month"], rule["day"]) + timedelta(days=offset)
                if candidate.weekday() == (rule.get("weekday", -1) + 6) % 7:
                    candidates.append((abs(offset), offset, candidate))
            except ValueError:
                pass
        return bool(candidates) and min(candidates)[2] == day
    if typ == "annual_period":
        return rule.get("start", "99-99") <= md <= rule.get("end", "00-00")
    return False


def free_events(f, day):
    if not approved(f) or not open_on(f, day):
        return []
    found = [r for r in date_rules(f) if matches(r, day)]
    if found:
        return found
    return [{"label": "常時無料", "type": "always_free"}] if has_always(f) else []


def esc(value):
    return html.escape(str(value or ""), quote=True)


def human_date(day):
    holiday = "・祝" if day in holidays(day.year) else ""
    return f"{day.year}年{day.month}月{day.day}日（{WEEKDAYS[day.weekday()]}{holiday}）"


def eligible_facilities(rows):
    """Confirmed facilities with adult-general or explicit conditional-adult free rules."""
    return [f for f in rows if approved(f) and (has_always(f) or date_rules(f))]


def next_occurrence(f, today):
    if not approved(f):
        return None
    if has_always(f):
        for offset in range(8 * 366):
            day = today + timedelta(days=offset)
            if has_always(f, day):
                return day, [{"label": "常時無料", "type": "always_free"}]
    for offset in range(8 * 366):
        day = today + timedelta(days=offset)
        if not open_on(f, day):
            continue
        found = [r for r in date_rules(f) if matches(r, day)]
        if found:
            return day, found
    return None


def page_html(title, description, heading, intro, facilities, base, canonical, related, today=None):
    today = today or date.today()
    cards = []
    for f, event_date, event_rules in facilities:
        condition = "常時無料" if any(r.get("type") == "always_free" for r in event_rules) else "・".join(dict.fromkeys(r.get("label", "無料日") for r in event_rules))
        audience = "条件付き" if any(eligible(r) == "conditional" for r in event_rules) else "大人・一般"
        facility_url = f'{base}?facility={quote(f["facility_id"])}'
        cards.append(f'''<article class="facility-card"><div class="card-top"><span class="tag">{esc(f["category"])}</span><span class="muted">{esc(f["prefecture"])}・{esc(f["municipality"])}</span></div><h2><a href="{facility_url}">{esc(f["name"])}</a></h2><p class="address">{esc(f["address"])}</p><p><strong>{esc(audience)}：無料</strong>{f'（{esc("、".join(r.get("audience", "") for r in event_rules if r.get("audience")))}）' if audience == "条件付き" else ""}</p><p>無料日：{esc(human_date(event_date)) if event_date else "常時"}／無料条件：{esc(condition)}</p><p>通常料金：{esc(f.get("regular_fee"))}</p><p>最終確認日：{esc(f.get("last_checked"))}</p><p><a href="{esc(f.get("official_url"))}" target="_blank" rel="noopener">公式サイト ↗</a></p></article>''')
    listing = "\n".join(cards) if cards else '<p class="empty">この条件で大人・一般向けに確認済みの無料日がある施設はありません。無料日や条件が未確認の施設は、無料施設として掲載していません。<a href="' + base + '">検索条件を変える</a></p>'
    related_html = "・".join(f'<a href="{esc(url)}">{esc(label)}</a>' for label, url in related)
    schema = {"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": description, "url": canonical, "inLanguage": "ja", "mainEntity": {"@type": "ItemList", "numberOfItems": len(facilities), "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": f["name"], "url": f'{base}?facility={quote(f["facility_id"])}'} for i, (f, _, _) in enumerate(facilities)]}}
    return f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">{GOOGLE_VERIFICATION_META}<title>{esc(title)}</title><meta name="description" content="{esc(description)}"><link rel="canonical" href="{esc(canonical)}"><meta property="og:locale" content="ja_JP"><meta property="og:type" content="website"><meta property="og:site_name" content="無料デー検索"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{esc(canonical)}"><meta name="twitter:card" content="summary"><link rel="icon" href="{base}favicon.svg"><link rel="stylesheet" href="{base}styles.css"><script type="application/ld+json">{json.dumps(schema, ensure_ascii=False)}</script></head><body><header class="site-header"><a class="brand" href="{base}"><span class="brand-mark">￥</span> 無料デー検索</a><a class="header-link" href="{base}">無料日を検索</a></header><main class="container"><a class="back-link" href="{base}">← トップへ</a><div class="page-heading"><span class="eyebrow">無料日が確認できる施設</span><h1>{esc(heading)}</h1><p>{esc(intro)}</p><p>{len(facilities)}施設。掲載対象は無料条件を確認できた施設です。最終確認日を併記しています。最新の開館・無料情報は訪問前に公式サイトをご確認ください。</p></div><section class="cards" aria-label="無料施設一覧">{listing}</section><section class="content-section"><h2>関連ページ</h2><p>{related_html}</p><p><a href="{base}?view=calendar">無料日カレンダーを見る</a></p></section></main><footer class="site-footer"><p><strong>無料デー検索</strong> — 施設の公式情報を確認して掲載しています。</p><p>無料条件や開館日は変更される場合があります。訪問前に公式案内をご確認ください。</p></footer></body></html>'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-url", required=True, help="Public base URL, ending with slash")
    parser.add_argument("--output", default="_site")
    parser.add_argument("--today", help="Override date for reproducible checks (YYYY-MM-DD)")
    args = parser.parse_args()
    base = args.site_url.rstrip("/") + "/"
    today = date.fromisoformat(args.today) if args.today else datetime.now(ZoneInfo("Asia/Tokyo")).date()
    out = Path(args.output).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name in SITE_FILES:
        shutil.copy2(ROOT / name, out / name)
    rows = facility_data()
    eligible = eligible_facilities(rows)
    urls = [base]
    page_defs = []

    # Regional/category landing pages are emitted only where at least two confirmed,
    # adult-eligible facilities give the page enough inventory to be useful.
    for area_slug, prefecture in AREAS:
        area_rows = [(f, *next_occurrence(f, today)) for f in eligible if f["prefecture"] == prefecture and next_occurrence(f, today)]
        if len(area_rows) >= 2:
            page_defs.append((f"{area_slug}/free", f"{prefecture}の無料施設一覧｜無料の日が分かる｜無料デー検索", f"{prefecture}で無料の日がある施設", f"{prefecture}にある施設のうち、大人・一般向けの無料日や無料条件を公式情報で確認できた施設を紹介します。対象者限定の場合は条件を明記しています。", area_rows))
        for category in CATEGORIES:
            chosen = [entry for entry in area_rows if entry[0]["category"] == category]
            if len(chosen) >= 2:
                page_defs.append((f"{area_slug}/{CATEGORY_SLUGS[category]}/free", f"{prefecture}の無料{category}一覧｜無料デー検索", f"{prefecture}の無料{category}", f"{prefecture}の{category}から、大人・一般向けの無料日を確認できる施設をまとめました。無料条件、通常料金、自治体、公式サイトも確認できます。", chosen))

    # Rolling day/week/month pages are rebuilt daily; unknown schedules never enter.
    start_week = today - timedelta(days=today.weekday())
    start_weekend = start_week + timedelta(days=5)
    if start_weekend < today:
        start_weekend = today
    end_week = start_week + timedelta(days=6)
    end_month = date(today.year, today.month, calendar.monthrange(today.year, today.month)[1])
    ranges = [
        ("today", today, today, "今日無料", "今日無料の施設"),
        ("tomorrow", today + timedelta(days=1), today + timedelta(days=1), "明日無料", "明日無料の施設"),
        ("this-week", max(today, start_week), end_week, "今週無料", "今週無料の日がある施設"),
        ("this-weekend", start_weekend, start_week + timedelta(days=6), "今週末無料", "今週末無料の日がある施設"),
        ("this-month", today, end_month, "今月無料", "今月無料の日がある施設"),
    ]
    for slug, first, last, period, heading in ranges:
        matches_by_id = {}
        for f in eligible:
            for offset in range((last - first).days + 1):
                day = first + timedelta(days=offset)
                rules = free_events(f, day)
                if rules:
                    matches_by_id[f["facility_id"]] = (f, day, rules)
                    break
        page_defs.append((f"free/{slug}", f"{human_date(first)}の{period}施設｜無料デー検索" if first == last else f"{heading}｜無料日を日付で探す｜無料デー検索", heading, f"{human_date(first)}{f'から{human_date(last)}まで' if first != last else ''}に、大人・一般が無料になることを確認できた施設です。対象者限定の条件は施設ごとに表示します。", sorted(matches_by_id.values(), key=lambda x: (x[1], x[0]["name"]))))

    by_path = {item[0]: item for item in page_defs}
    # Topic pages only exist when there is sufficient confirmed inventory overall.
    for category in CATEGORIES:
        chosen = [(f, *next_occurrence(f, today)) for f in eligible if f["category"] == category and next_occurrence(f, today)]
        if len(chosen) >= 3:
            slug = CATEGORY_SLUGS[category]
            page_defs.append((f"free/{slug}", f"無料{category}一覧｜無料の日・条件が分かる｜無料デー検索", f"無料{category}一覧", f"東京・神奈川・大阪の{category}から、確認済みの無料日がある施設を掲載しています。対象者の条件と最終確認日を施設ごとに確認できます。", chosen))

    related_base = [("今日無料", base + "free/today/"), ("明日無料", base + "free/tomorrow/"), ("今週無料", base + "free/this-week/"), ("今週末無料", base + "free/this-weekend/"), ("今月無料", base + "free/this-month/")]
    for item in page_defs:
        path, title, heading, intro, facilities = item
        links = list(related_base)
        if path.startswith("free/"):
            links += [(f"{pref}の無料施設", base + area + "/free/") for area, pref in AREAS if area + "/free" in by_path]
        else:
            links += [(f"{pref}の無料施設", base + area + "/free/") for area, pref in AREAS if area + "/free" in by_path and area not in path]
        canonical = base + path + "/"
        (out / path).mkdir(parents=True, exist_ok=True)
        html_page = page_html(title, f"{intro}施設の無料条件・通常料金・確認日・公式情報を掲載。", heading, intro, facilities, base, canonical, links, today)
        (out / path / "index.html").write_text(html_page, encoding="utf-8")
        urls.append(canonical)

    ids = [f["facility_id"] for f in rows]
    urls += [base + "?facility=" + facility_id for facility_id in ids]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sitemap += [f"  <url><loc>{html.escape(url)}</loc></url>" for url in urls]
    sitemap.append("</urlset>")
    (out / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")
    (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n", encoding="utf-8")
    (out / ".nojekyll").touch()
    print(f"Prepared {len(ids)} facilities and {len(page_defs)} useful SEO pages at {base} in {out}")


if __name__ == "__main__":
    main()
