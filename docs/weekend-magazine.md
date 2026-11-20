# White weekend-magazine design

Approved visual direction: white background, green accents, editorial illustrations, readable facility facts. Implemented for the home page, dynamic results, generated listing pages and facility detail pages. Existing search form names, URL parameters, calendar behavior and eligibility rules remain in place.

Assets in assets/editorial are built-in image-generation illustrations, compressed to WebP (approximately 68–80 KB each). They are thematic rather than actual facilities or exhibits; captions disclose this. The outing illustration is the general fallback, history is assigned to JICA Yokohama, archaeology to archaeology IDs. Original assets and prompts are in the task workspace outputs/design/weekend-magazine-v2 and conversation generation calls.

Detail pages put regular fees, opening hours and a Google Maps search link first. These are existing data, not a claim that a facility is currently open. Conditions remain in expandable details. No factual records changed.

This branch builds on codex/area-calendar-context (PR #31). Production has not been updated.

## Validation — 2026-11-20

Cloudflare preview: https://5935b1db.free-day-search.pages.dev/ (commit 2521a90; noindex preview).

- Build: 73 facilities, 27 landing pages, 73 detail pages.
- 20 Python tests and 5 Node tests passed; JavaScript syntax and diff checks passed. GitHub verify and Cloudflare build succeeded.
- Browser visual inspection: home at desktop and 390px mobile; mobile search results and calendar; facility detail at 390px and 1280px.
- Search: Kanagawa + JICA + 2026-11-20 returned one matching facility; detail navigation succeeded.
- Detail disclosure opened successfully. Calendar November 21 selection succeeded.
- Measured mobile calendar results and desktop detail: document width matched viewport (390/1280); zero failed loaded images.
- This is representative page QA, not an audit of all facility records or external links. Generic illustrations are intentionally labeled as thematic.
