import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code = await readFile(new URL('../analytics.js', import.meta.url), 'utf8');
function setup(id = '', choice = '', unavailable = false) {
  const listeners = {}, nodes = [], scripts = [], stored = new Map();
  const makeNode = tag => ({tag, style: {}, dataset: {}, setAttribute(){}, addEventListener(name, fn){this[name] = fn;}, showModal(){this.open = true;}, close(){this.open = false;}});
  const context = {URL, Set, Date, window: {}, location: {origin: 'https://example.com', pathname: '/facility/zoo/', href: 'https://example.com/facility/zoo/?q=private@example.com', reload(){context.reloaded = true;}}, localStorage: {getItem(){if (unavailable) throw Error(); return choice;}, setItem(k,v){if (unavailable) throw Error(); stored.set(k,v);}}, document: {cookie: '_ga=sample', head: {append(s){scripts.push(s);}}, body: {append(n){nodes.push(n);}}, querySelector(selector){if (selector.includes('site-analytics')) return {content: id}; if (selector.includes('analytics-site')) return {content: 'test-site'}; return null;}, createElement: makeNode, addEventListener(name, fn){listeners[name] = fn;}}};
  vm.runInNewContext(code, context);
  return {context, nodes, scripts, listeners, stored, events: () => (context.window.dataLayer || []).filter(x => x[0] === 'event')};
}
test('unconfigured, undecided and denied visitors send nothing', () => {
  for (const [id, choice] of [['',''], ['G-TEST',''], ['G-TEST','denied'], ['invalid','granted']]) {
    const s = setup(id, choice);
    s.context.window.SiteMetrics.track('official_link_click', {link_domain:'example.org'});
    assert.equal(s.scripts.length, 0);
    assert.equal(s.events().length, 0);
  }
});
test('consent loads once and strips query, fragments, referrer and input', () => {
  const s = setup('G-TEST');
  s.nodes[0].click({target: {dataset: {choice:'granted'}}});
  s.nodes[0].click({target: {dataset: {choice:'granted'}}});
  assert.equal(s.scripts.length, 1);
  s.context.window.SiteMetrics.track('search_submit', {has_query:true, result_count:3, query:'private@example.com', age:64, url:'https://example.org/?token=secret'});
  const e = s.events().at(-1);
  assert.equal(e[1], 'search_submit');
  assert.equal(e[2].page_location, 'https://example.com/facility/zoo/');
  assert.equal(e[2].page_referrer, '');
  assert.equal(e[2].result_count, 3);
  assert.equal(e[2].query, undefined);
  assert.equal(e[2].age, undefined);
  assert.equal(e[2].url, undefined);
});
test('only approved event names are sent, storage failure does not break consent', () => {
  const s = setup('G-TEST', '', true);
  s.nodes[0].click({target: {dataset: {choice:'granted'}}});
  assert.equal(s.scripts.length, 1);
  const count = s.events().length;
  s.context.window.SiteMetrics.track('private_event');
  assert.equal(s.events().length, count);
});
test('delegated official clicks keep only domain; future ads require explicit marker', () => {
  const s = setup('G-TEST', 'granted');
  const click = link => s.listeners.click({target: {closest: () => link}});
  click({href:'https://official.example/apply?token=secret', dataset:{}, textContent:'公式情報'});
  assert.equal(s.events().at(-1)[1], 'official_link_click');
  assert.equal(s.events().at(-1)[2].link_domain, 'official.example');
  click({href:'https://partner.example/?affiliate=123', dataset:{metric:'affiliate_link_click'}, textContent:'PR'});
  assert.equal(s.events().at(-1)[1], 'affiliate_link_click');
  assert.ok(!JSON.stringify(s.events()).includes('secret'));
});
test('withdrawal disables sending and removes analytics cookies', () => {
  const s = setup('G-TEST', 'granted');
  const count = s.events().length;
  s.nodes[0].click({target: {dataset: {choice:'denied'}}});
  s.context.window.SiteMetrics.track('official_link_click');
  assert.equal(s.events().length, count);
  assert.equal(s.context.window['ga-disable-G-TEST'], true);
  assert.equal(s.context.reloaded, true);
  assert.match(s.context.document.cookie, /Max-Age=0/);
});
