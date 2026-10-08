# Revenue foundation

`policies.json` provides the about, advertising and privacy pages. Operator labels are the site name plus 運営; no personal name or unconfirmed contact address is published. Add a verified shared support address to the about page when it is ready. Update the advertising policy when actual ads or affiliate links are introduced.

## Optional analytics

Set `GA4_MEASUREMENT_ID=G-...` in the production build environment only after creating the site's GA4 web stream. Leave it unset to send nothing to Google. Preview/staging builds disable the ID. Do not enable it on the old GitHub Pages site.

In GA4, disable **all Enhanced Measurement** before enabling this integration. Automatic measurement can collect full URLs/search terms and duplicate the manual events. Use separate web streams/properties for the two sites. Google Signals and advertising personalization are disabled in this adapter. The analytics preference is stored under a site-specific localStorage key. GA scripts load only after explicit consent; declining does not limit site functions. The footer setting lets users change the choice. Withdrawal disables tracking, removes host analytics cookies and reloads.

Events currently implemented: `page_view`, `search_submit`, `official_link_click`, `detail_link_click`, `calendar_navigation` (calendar links where present). A future affiliate link must explicitly have `data-metric="affiliate_link_click"`; no affiliate links are installed now. Future favorite/export features can call the approved `SiteMetrics.track` event names. Their events are not claimed as implemented features.

Only sanitized page location without query/hash, a fixed site title, optional link hostname, result count and boolean query presence are sent. No search text, input values, full outbound URL, user ID or raw referrer is sent by this adapter. GA4 still handles normal browser/network metadata when enabled; this is not anonymous or cookieless analytics. Search Console provides search impressions/clicks separately. Link clicks are not confirmed affiliate revenue; reconcile confirmed outcomes in the ASP dashboard.

Test: `node --test scripts/analytics.test.mjs`. Verify each site in GA4 Realtime after activation, both consent choices, dynamic result clicks, and withdrawal. Configure event dimensions/reporting for page, event name and link domain. Existing features work when the analytics script is blocked.

References: [basic consent](https://developers.google.com/tag-platform/security/concepts/consent-mode), [manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views), [configuration](https://developers.google.com/analytics/devguides/collection/ga4/reference/config).
