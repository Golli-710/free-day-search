# White weekend-magazine design

Approved visual direction: white background, green accents, editorial illustrations, readable facility facts. Implemented for the home page, dynamic results, generated listing pages and facility detail pages. Existing search form names, URL parameters, calendar behavior and eligibility rules remain in place.

Assets in assets/editorial are built-in image-generation illustrations, compressed to WebP (approximately 68–80 KB each). They are thematic rather than actual facilities or exhibits; captions disclose this. The outing illustration is the general fallback, history is assigned to JICA Yokohama, archaeology to archaeology IDs. Original assets and prompts are in the task workspace outputs/design/weekend-magazine-v2 and conversation generation calls.

Detail pages put regular fees, opening hours and a Google Maps search link first. These are existing data, not a claim that a facility is currently open. Conditions remain in expandable details. No factual records changed.

This branch builds on codex/area-calendar-context (PR #31). Browser visual QA remains pending: the previous local file preview was rejected by browser URL policy. Do not treat static checks as desktop/mobile visual verification. Production has not been updated.
