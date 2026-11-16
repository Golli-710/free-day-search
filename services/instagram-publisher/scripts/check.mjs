import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validatePost, fingerprint} from '../src/engine.js';
const root = new URL('../', import.meta.url);
const queue = JSON.parse(await readFile(new URL('queue.json', root)));
const ids = new Set(), hashes = new Set(), times = new Set();
if (!Array.isArray(queue.posts) || queue.posts.length > 30) throw new Error('Invalid/bloated queue');
for (const post of queue.posts) {
  if (ids.has(post.id)) throw new Error('Duplicate ID');
  ids.add(post.id);
  if (post.approved) {
    validatePost(post);
    if (Date.parse(post.scheduled_at) <= Date.now()) throw new Error('Approved schedule is in the past; archive published entries first');
    const hash = await fingerprint(post);
    if (hashes.has(hash)) throw new Error('Duplicate approved content');
    hashes.add(hash);
    if (times.has(post.scheduled_at)) throw new Error('Overlapping schedule');
    times.add(post.scheduled_at);
  }
  const paths = post.format === 'carousel' ? post.media_paths : [post.video_path];
  if (!paths?.length || paths.length !== post.asset_sha256?.length) throw new Error('Missing asset hashes');
  for (let i = 0; i < paths.length; i++) {
    if (!/^\/media\/[a-z0-9/-]+\.(jpg|mp4)$/.test(paths[i]) || paths[i].includes('..')) throw new Error('Invalid asset path');
    const bytes = await readFile(new URL('public' + paths[i], root));
    if (createHash('sha256').update(bytes).digest('hex') !== post.asset_sha256[i]) throw new Error('Asset changed; review and update manifest');
    if (paths[i].endsWith('.jpg') && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.length > 8 * 1024 * 1024))
      throw new Error('Invalid JPEG');
  }
}
console.log(`Queue valid: ${queue.posts.length} candidates, ${hashes.size} approved. No API writes performed.`);
