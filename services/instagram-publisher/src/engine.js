const MINUTE = 60000;
const FINAL = new Set(['published', 'failed', 'uncertain', 'missed', 'cancelled']);
const INTENT = new Set(['creating_child', 'creating_parent', 'publishing']);

export function validatePost(post) {
  if (!/^[a-z0-9-]{3,80}$/.test(post.id ?? '')) throw new Error('invalid_id');
  if (post.approved !== true) throw new Error('not_approved');
  if (!post.approval_reference?.trim()) throw new Error('approval_reference_required');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+09:00$/.test(post.scheduled_at ?? '') ||
      !Number.isFinite(Date.parse(post.scheduled_at))) throw new Error('explicit_jst_schedule_required');
  if (!post.caption?.trim() || [...post.caption].length > 2200) throw new Error('invalid_caption');
  if (!['carousel', 'reel'].includes(post.format)) throw new Error('unsupported_format');
  if (post.format === 'carousel' && !Array.isArray(post.media_paths)) throw new Error('invalid_carousel');
  const count = post.format === 'carousel' ? post.media_paths.length : 1;
  if (post.format === 'carousel' && (count < 2 || count > 10)) throw new Error('invalid_carousel');
  const paths = post.format === 'carousel' ? post.media_paths : [post.video_path];
  for (const p of paths ?? []) {
    if (!/^\/media\/[a-z0-9/-]+\.(jpg|mp4)$/.test(p ?? '') || p.includes('..')) throw new Error('invalid_media_path');
    if (post.format === 'carousel' && !p.endsWith('.jpg')) throw new Error('jpeg_required');
    if (post.format === 'reel' && !p.endsWith('.mp4')) throw new Error('mp4_required');
  }
  return post;
}

export async function fingerprint(post) {
  const content = JSON.stringify({format: post.format, caption: post.caption,
    media_paths: post.media_paths, video_path: post.video_path, asset_sha256: post.asset_sha256});
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// One bounded step per minute. Store an intent BEFORE every external write.
// If the process dies after that write, the next run stops instead of resending.
export async function step({post, state, save, api, origin, now = Date.now()}) {
  validatePost(post);
  const due = Date.parse(post.scheduled_at);
  const hash = await fingerprint(post);
  if (state && FINAL.has(state.status)) return state;
  if (state?.fingerprint && (state.fingerprint !== hash || state.scheduled_at !== post.scheduled_at)) {
    const changed = {...state, status: 'uncertain', error: 'content_changed_after_preparation'};
    await save(changed); return changed;
  }
  let s = state ?? {id: post.id, fingerprint: hash, scheduled_at: post.scheduled_at,
    status: 'queued', children: [], created_at: new Date(now).toISOString()};
  const store = async patch => {
    s = {...s, ...patch, updated_at: new Date(now).toISOString()};
    await save(s); return s;
  };
  if (INTENT.has(s.status)) return store({status: 'uncertain', error: 'interrupted_write_do_not_retry'});
  if (now < due - 60 * MINUTE) return s;
  if (!s.media_id && now > due + 15 * MINUTE) return store({status: 'missed', error: 'publishing_window_elapsed'});
  const publicOrigin = new URL(origin);
  if (publicOrigin.protocol !== 'https:' || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash)
    throw new Error('invalid_public_origin');
  try {
    if (s.status === 'queued' || s.status === 'children_ready') {
      await api.identity();
      if (post.format === 'carousel' && s.children.length < post.media_paths.length) {
        await store({status: 'creating_child'});
        const result = await api.create({image_url: new URL(post.media_paths[s.children.length], origin).href,
          is_carousel_item: 'true'});
        if (!result.id) throw new Error('missing_container_id');
        return store({status: 'checking_child', pending_child: result.id});
      }
      await store({status: 'creating_parent'});
      const params = post.format === 'carousel'
        ? {media_type: 'CAROUSEL', children: s.children.join(','), caption: post.caption}
        : {media_type: 'REELS', video_url: new URL(post.video_path, origin).href,
            caption: post.caption, share_to_feed: 'true'};
      const result = await api.create(params);
      if (!result.id) throw new Error('missing_container_id');
      return store({status: 'processing', container_id: result.id});
    }
    if (s.status === 'checking_child' || s.status === 'processing') {
      const result = await api.container(s.pending_child ?? s.container_id);
      if (['ERROR', 'EXPIRED'].includes(result.status_code)) return store({status: 'failed', error: 'container_' + result.status_code});
      if (result.status_code !== 'FINISHED') return s;
      if (s.status === 'checking_child') return store({status: 'children_ready',
        children: [...s.children, s.pending_child], pending_child: null});
      return store({status: 'ready'});
    }
    if (s.status === 'ready' && now >= due) {
      await api.identity();
      await store({status: 'publishing'});
      const result = await api.publish(s.container_id);
      if (!result.id) throw new Error('missing_published_media_id');
      return store({status: 'verifying', media_id: result.id});
    }
    if (s.status === 'verifying') {
      const result = await api.media(s.media_id);
      if (result.id === s.media_id && /^https:\/\/www\.instagram\.com\//.test(result.permalink ?? ''))
        return store({status: 'published', permalink: result.permalink, published_at: result.timestamp ?? null, error: null});
    }
    return s;
  } catch (error) {
    // Any failure after POST intent is ambiguous, including a timeout or missing ID.
    const uncertain = INTENT.has(s.status);
    // Verification can safely be retried; publishing is never repeated.
    if (s.status === 'verifying') return store({error: 'verification_pending', code: error.code ?? null});
    return store({status: uncertain ? 'uncertain' : 'failed',
      error: error.kind ?? 'operation_failed', code: error.code ?? null});
  }
}
