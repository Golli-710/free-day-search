import queue from '../queue.json' with {type: 'json'};
import {Meta} from './meta.js';
import {step, fingerprint, validatePost} from './engine.js';

function approvedPosts() { return queue.posts.filter(p => p.approved === true).map(validatePost); }
function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
}
async function authorized(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const digest = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const a = await digest(request.headers.get('Authorization') ?? '');
  const b = await digest(`Bearer ${env.ADMIN_TOKEN}`);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return json({error: 'method_not_allowed'}, 405);
  if (url.pathname === '/health') return json({service: 'Free Day Search Instagram publisher',
    enabled: env.PUBLISH_ENABLED === 'true', approved_posts: approvedPosts().length});
  if (url.pathname === '/status') {
    if (!await authorized(request, env)) return json({error: 'unauthorized'}, 401);
    return env.PUBLISHER.get(env.PUBLISHER.idFromName('free_day_search')).fetch('https://internal/status');
  }
  if (url.pathname === '/connection') {
    if (!await authorized(request, env)) return json({error: 'unauthorized'}, 401);
    try {
      const api = new Meta(env);
      const account = await api.identity();
      const result = await api.call('me/permissions');
      const granted = new Set((result.data ?? []).filter(p => p.status === 'granted').map(p => p.permission));
      const required = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'];
      const missing = required.filter(p => !granted.has(p));
      return json({connected: missing.length === 0, account, missing_permissions: missing,
        publishing_enabled: env.PUBLISH_ENABLED === 'true'}, missing.length ? 503 : 200);
    } catch (error) {return json({connected: false, error: error.kind ?? 'connection_failed', code: error.code ?? null}, 503);}
  }
  // Only media referenced by explicitly approved posts can be fetched by Meta.
  const allowed = new Set(approvedPosts().flatMap(p => p.format === 'carousel' ? p.media_paths : [p.video_path]));
  if (allowed.has(url.pathname)) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, noarchive');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, {status: response.status, headers});
  }
  return json({error: 'not_found'}, 404);
}
export default {
  fetch: handleRequest,
  async scheduled(_event, env, ctx) {
    if (env.PUBLISH_ENABLED !== 'true' || approvedPosts().length === 0) return;
    ctx.waitUntil(env.PUBLISHER.get(env.PUBLISHER.idFromName('free_day_search'))
      .fetch('https://internal/tick', {method: 'POST'}).then(r => {
        if (!r.ok) throw new Error('publisher_tick_failed');
      }));
  }
};

export class Publisher {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(request) {
    if (new URL(request.url).pathname === '/status') {
      const entries = await this.ctx.storage.list({prefix: 'post:'});
      return json({posts: [...entries.values()]});
    }
    // Serialize the whole account, including outbound calls, to avoid two cron invocations publishing twice.
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.env.PUBLISH_ENABLED !== 'true') return json({paused: true});
      const posts = approvedPosts().sort((a,b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
      const now = Date.now();
      // One transition per tick keeps requests bounded. Future drafts don't block due posts.
      for (const post of posts) {
        const key = `post:${post.id}`;
        const state = await this.ctx.storage.get(key);
        if (['published', 'failed', 'uncertain', 'missed', 'cancelled'].includes(state?.status)) continue;
        if (now < Date.parse(post.scheduled_at) - 3600000) continue;
        if (state?.status === 'ready' && now < Date.parse(post.scheduled_at)) continue;
        const hash = await fingerprint(post);
        const duplicateKey = `content:${hash}`;
        const owner = await this.ctx.storage.get(duplicateKey);
        if (owner && owner !== post.id) {
          await this.ctx.storage.put(key, {id: post.id, status: 'cancelled', error: 'duplicate_content', duplicate_of: owner});
          continue;
        }
        if (!owner) await this.ctx.storage.put(duplicateKey, post.id);
        await step({post, state, now, origin: this.env.PUBLIC_ORIGIN,
          api: new Meta(this.env), save: value => this.ctx.storage.put(key, value)});
        return json({processed: post.id});
      }
      return json({idle: true});
    });
  }
}
