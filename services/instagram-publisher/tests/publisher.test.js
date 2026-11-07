import test from 'node:test';
import assert from 'node:assert/strict';
import {step, validatePost} from '../src/engine.js';
import {Meta, MetaError} from '../src/meta.js';

const due = Date.parse('2026-11-06T12:30:00+09:00');
const post = {id: 'test-13', approved: true, approval_reference: 'test fixture only',
  scheduled_at: '2026-11-06T12:30:00+09:00', caption: '週末の無料施設まとめ\n公式条件を確認',
  format: 'carousel', media_paths: ['/media/test/01.jpg', '/media/test/02.jpg'], asset_sha256: ['a', 'b']};
function harness(apiOverrides = {}) {
  let state;
  const calls = [];
  const api = {
    identity: async () => { calls.push('identity'); return {}; },
    create: async params => { calls.push(['create', params]); return {id: 'c' + calls.length}; },
    container: async () => { calls.push('container'); return {status_code: 'FINISHED'}; },
    publish: async () => { calls.push('publish'); return {id: 'published-1'}; },
    media: async () => ({id: 'published-1', permalink: 'https://www.instagram.com/p/test/', timestamp: '2026-11-06T03:30:00+0000'}),
    ...apiOverrides
  };
  return {calls, get state() {return state;},
    set state(value) {state = value;},
    run: async (now = due, p = post, saver) => step({post: p, state, now, origin: 'https://publisher.example', api,
      save: saver ?? (async value => {state = structuredClone(value);})})};
}
test('prepares in order, waits until schedule, publishes once and verifies URL', async () => {
  const h = harness();
  for (let i = 0; i < 6; i++) await h.run(due - 30 * 60000);
  assert.equal(h.state.status, 'ready');
  assert.equal(h.calls.filter(x => x === 'publish').length, 0);
  await h.run(due - 1);
  assert.equal(h.state.status, 'ready');
  await h.run();
  assert.equal(h.state.status, 'verifying');
  await h.run();
  assert.equal(h.state.status, 'published');
  await h.run();
  assert.equal(h.calls.filter(x => x === 'publish').length, 1);
  const writes = h.calls.filter(x => Array.isArray(x));
  assert.equal(writes[0][1].image_url, 'https://publisher.example/media/test/01.jpg');
  assert.equal(writes[2][1].media_type, 'CAROUSEL');
  assert.equal(writes[2][1].caption, post.caption);
});
test('unapproved, missing approval and old timestamps are not silently accepted', () => {
  assert.throws(() => validatePost({...post, approved: false}), /not_approved/);
  assert.throws(() => validatePost({...post, approval_reference: null}), /approval/);
  assert.throws(() => validatePost({...post, scheduled_at: '2026-11-06'}), /jst/);
  assert.throws(() => validatePost({...post, media_paths: ['/media/../private.jpg', '/media/x.jpg']}), /path/);
});
test('does not call API too early, or catch up an old missed post', async () => {
  const h = harness();
  await h.run(due - 61 * 60000);
  assert.equal(h.calls.length, 0);
  await h.run(due + 16 * 60000);
  assert.equal(h.state.status, 'missed');
  assert.equal(h.calls.length, 0);
});
test('timeout after publishing intent never triggers an automatic resend', async () => {
  const h = harness({publish: async () => {throw new MetaError('transport_or_invalid_response');}});
  for (let i = 0; i < 6; i++) await h.run();
  await h.run();
  assert.equal(h.state.status, 'uncertain');
  assert.equal(h.state.error, 'transport_or_invalid_response');
  const count = h.calls.length;
  await h.run();
  assert.equal(h.calls.length, count);
});
test('crash after intent, including process restart, stops safely', async () => {
  const h = harness();
  await h.run();
  h.state = {...h.state, status: 'publishing'};
  await h.run();
  assert.equal(h.state.status, 'uncertain');
  assert.equal(h.calls.filter(x => x === 'publish').length, 0);
});
test('changed caption or schedule after preparation requires manual resolution', async () => {
  for (const patch of [{caption: '変更'}, {scheduled_at: '2026-11-06T12:31:00+09:00'}]) {
    const h = harness(); await h.run(); const count = h.calls.length;
    await h.run(due, {...post, ...patch});
    assert.equal(h.state.status, 'uncertain'); assert.equal(h.calls.length, count);
  }
});
test('wrong account fails before any external write', async () => {
  const h = harness({identity: async () => {throw new MetaError('account_mismatch');}});
  await h.run();
  assert.equal(h.state.status, 'failed');
  assert.equal(h.calls.length, 0);
});
test('processing errors stop; checking an already published ID can retry safely', async () => {
  const h = harness({container: async () => ({status_code: 'ERROR'})});
  await h.run(); await h.run();
  assert.equal(h.state.status, 'failed');
  const v = harness({media: async () => {throw new MetaError('meta_error', 190);}});
  for (let i = 0; i < 7; i++) await v.run();
  await v.run(); await v.run();
  assert.equal(v.state.status, 'verifying');
  assert.equal(v.calls.filter(x => x === 'publish').length, 1);
});
test('reels use same guarded publish flow', async () => {
  const h = harness();
  const reel = {...post, format: 'reel', video_path: '/media/reel/demo.mp4'};
  for (let i = 0; i < 4; i++) await h.run(due, reel);
  assert.equal(h.state.status, 'published');
  assert.equal(h.calls.find(x => Array.isArray(x))[1].media_type, 'REELS');
});
test('Meta uses header credentials, timeouts and sanitized errors', async () => {
  const env = {META_ACCESS_TOKEN: 'SECRET', GRAPH_VERSION: 'v25.0', IG_ACCOUNT_ID: '123', IG_USERNAME: 'free_day_search'};
  const api = new Meta(env, async (url, init) => {
    assert.ok(!url.toString().includes('SECRET'));
    assert.equal(init.headers.Authorization, 'Bearer SECRET');
    assert.equal(init.redirect, 'manual');
    assert.ok(init.signal);
    return Response.json({error: {code: 190, message: 'SECRET accidental upstream reflection'}}, {status: 400});
  });
  await assert.rejects(api.identity(), error => error.code === 190 && !String(error).includes('SECRET'));
});
test('redirect response is rejected without forwarding credentials', async () => {
  let calls = 0;
  const api = new Meta({META_ACCESS_TOKEN: 'SECRET', GRAPH_VERSION: 'v25.0'}, async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
    return new Response(null, {status: 302, headers: {Location: 'https://other.invalid/'}});
  });
  await assert.rejects(api.call('me'), error => error.kind === 'redirect_rejected' && error.code === 302);
  assert.equal(calls, 1);
});
test('native fetch is invoked without a Meta instance receiver', async () => {
  const api = new Meta({META_ACCESS_TOKEN: 'SECRET', GRAPH_VERSION: 'v25.0'}, async function () {
    assert.equal(this, undefined);
    return Response.json({id: 'test'});
  });
  assert.equal((await api.call('me')).id, 'test');
});
