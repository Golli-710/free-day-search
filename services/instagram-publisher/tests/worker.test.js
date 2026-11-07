import test from 'node:test';
import assert from 'node:assert/strict';
import queue from '../queue.json' with {type: 'json'};
import worker, {Publisher, handleRequest} from '../src/worker.js';
import {fingerprint} from '../src/engine.js';

test('public endpoints expose neither drafts nor status; disabled cron does nothing', async () => {
  const env = {PUBLISH_ENABLED: 'false', ADMIN_TOKEN: 'test-secret'};
  assert.equal((await handleRequest(new Request('https://unit/status'), env)).status, 401);
  assert.equal((await handleRequest(new Request('https://unit/connection'), env)).status, 401);
  assert.equal((await handleRequest(new Request('https://unit/media/case-13/01.jpg'), env)).status, 404);
  assert.equal((await handleRequest(new Request('https://unit/queue.json'), env)).status, 404);
  assert.equal((await handleRequest(new Request('https://unit/status', {method: 'POST'}), env)).status, 405);
  const health = await (await handleRequest(new Request('https://unit/health'), env)).json();
  assert.equal(health.enabled, false);
  await worker.scheduled({}, env, {waitUntil() {throw new Error('disabled cron must not dispatch');}});
});

test('protected connection check validates account and all three permissions without publishing', async () => {
  const previous = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init.method !== 'GET') writes++;
    return Response.json(String(url).includes('/me/permissions')
      ? {data: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'].map(permission => ({permission, status: 'granted'}))}
      : {id: 'test-account-id', username: 'free_day_search'});
  };
  try {
    const result = await handleRequest(new Request('https://unit/connection', {headers: {Authorization: 'Bearer test-secret'}}),
      {ADMIN_TOKEN: 'test-secret', META_ACCESS_TOKEN: 'fake', GRAPH_VERSION: 'v25.0', IG_ACCOUNT_ID: 'test-account-id', IG_USERNAME: 'free_day_search', PUBLISH_ENABLED: 'false'});
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).missing_permissions, []);
    assert.equal(writes, 0);
  } finally {globalThis.fetch = previous;}
});

test('concurrent account ticks publish once; changed ID cannot replay same content', async () => {
  const backup = structuredClone(queue.posts);
  const originalFetch = globalThis.fetch;
  const data = new Map();
  let serial = Promise.resolve(), publishes = 0;
  const ctx = {
    storage: {get: async key => structuredClone(data.get(key)),
      put: async (key,value) => {data.set(key, structuredClone(value));}},
    blockConcurrencyWhile(fn) {const next = serial.then(fn); serial = next.catch(() => {}); return next;}
  };
  const p = {id: 'test-weekend', caption: '週末の無料施設まとめ', format: 'carousel', media_paths: ['/media/test/01.jpg', '/media/test/02.jpg'], asset_sha256: ['a','b'], approved: true, approval_reference: 'test fixture', scheduled_at: new Date(Date.now() - 60000).toISOString().replace('Z', '+00:00')};
  // Real timestamps in production are explicit JST; generate an equivalent JST fixture.
  p.scheduled_at = new Date(Date.now() + 9 * 3600000 - 60000).toISOString().slice(0,19) + '+09:00';
  queue.posts = [p];
  const hash = await fingerprint(p);
  data.set('post:' + p.id, {id: p.id, fingerprint: hash, scheduled_at: p.scheduled_at, status: 'ready', container_id: 'ready-1', children: []});
  globalThis.fetch = async url => {
    if (String(url).includes('/media_publish')) {publishes++; return Response.json({id: 'published-test'});}
    if (String(url).includes('published-test')) return Response.json({id: 'published-test', permalink: 'https://www.instagram.com/p/test/'});
    return Response.json({id: 'test-account-id', username: 'free_day_search'});
  };
  try {
    const actor = new Publisher(ctx, {PUBLISH_ENABLED: 'true', META_ACCESS_TOKEN: 'fake',
      IG_ACCOUNT_ID: 'test-account-id', IG_USERNAME: 'free_day_search', GRAPH_VERSION: 'v25.0', PUBLIC_ORIGIN: 'https://unit.example'});
    await Promise.all([actor.fetch(new Request('https://internal/tick')), actor.fetch(new Request('https://internal/tick'))]);
    assert.equal(publishes, 1);
    assert.equal(data.get('post:' + p.id).status, 'published');
    queue.posts.push({...p, id: 'renamed-copy'});
    await actor.fetch(new Request('https://internal/tick'));
    assert.equal(data.get('post:renamed-copy').status, 'cancelled');
    assert.equal(publishes, 1);
  } finally {queue.posts = backup; globalThis.fetch = originalFetch;}
});
