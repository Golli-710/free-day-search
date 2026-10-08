/* Optional GA4 adapter. No Google script or event is sent before consent. */
(() => {
  const config = document.querySelector('meta[name="site-analytics"]')?.content || '';
  const key = 'analytics-consent-v1:' + (document.querySelector('meta[name="analytics-site"]')?.content || 'site');
  const valid = /^G-[A-Z0-9]+$/.test(config);
  let consent = '';
  try { consent = localStorage.getItem(key) || ''; } catch {}
  let started = false;
  const allowed = new Set(['page_view', 'search_submit', 'official_link_click', 'affiliate_link_click', 'detail_link_click', 'calendar_navigation', 'favorite_add', 'favorite_remove', 'calendar_export']);
  const page = () => location.origin + location.pathname;
  function track(name, parameters = {}) {
    if (!valid || consent !== 'granted' || !started || !allowed.has(name)) return;
    const safe = {page_location: page(), page_referrer: '', page_title: document.querySelector('meta[name="analytics-site"]')?.content || '検索サイト'};
    if (Number.isInteger(parameters.result_count)) safe.result_count = Math.max(0, Math.min(parameters.result_count, 10000));
    if (typeof parameters.has_query === 'boolean') safe.has_query = parameters.has_query;
    if (/^[a-z0-9.-]+$/.test(parameters.link_domain || '')) safe.link_domain = parameters.link_domain;
    window.gtag('event', name, safe);
  }
  window.SiteMetrics = {track};
  function start() {
    if (!valid || consent !== 'granted' || started) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    window.gtag('consent', 'update', {analytics_storage: 'granted'});
    window.gtag('js', new Date());
    window.gtag('config', config, {send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: 'none', page_location: page(), page_referrer: '', page_title: document.querySelector('meta[name="analytics-site"]')?.content || '検索サイト'});
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + config;
    document.head.append(script);
    track('page_view');
  }
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let target;
    try { target = new URL(link.href, location.href); } catch { return; }
    if (!['http:', 'https:'].includes(target.protocol)) return;
    const kind = link.dataset.metric || (target.origin !== location.origin && /公式/.test(link.textContent) ? 'official_link_click' : target.origin === location.origin && /\/(?:facility\/|(?:kawasaki|yokohama|osaka)\/[^/]+\/)/.test(target.pathname) ? 'detail_link_click' : target.searchParams.get('view') === 'calendar' ? 'calendar_navigation' : '');
    if (kind) track(kind, {link_domain: target.hostname});
  });
  if (!valid) return;
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'analytics-heading');
  dialog.style.cssText = 'max-width:440px;width:calc(100% - 32px);padding:24px;border:1px solid #ccc;border-radius:12px;color:#20332e;background:white';
  dialog.innerHTML = '<h2 id="analytics-heading">アクセス解析の設定</h2><p>検索サービスの改善のため、同意した場合にGoogle Analyticsでページの利用状況とリンクのクリックを計測します。検索語や年齢・住所などの入力内容は計測イベントに含めません。</p><p>同意しなくても検索を利用できます。設定はいつでも変更できます。</p><button type="button" data-choice="denied">同意しない</button> <button type="button" data-choice="granted">同意する</button>';
  document.body.append(dialog);
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'アクセス解析の設定';
  button.style.cssText = 'width:auto;margin:8px;padding:6px 12px';
  button.addEventListener('click', () => dialog.showModal());
  (document.querySelector('footer') || document.body).append(button);
  dialog.addEventListener('click', event => {
    const choice = event.target.dataset.choice;
    if (!['granted', 'denied'].includes(choice)) return;
    consent = choice;
    try { localStorage.setItem(key, choice); } catch {}
    dialog.close();
    if (choice === 'granted') start();
    else if (started) {
      window['ga-disable-' + config] = true;
      for (const entry of document.cookie.split(';')) {
        const name = entry.split('=')[0].trim();
        if (/^_ga(?:_|$)/.test(name)) document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax';
      }
      location.reload();
    }
  });
  start();
  if (!consent) dialog.showModal();
})();
