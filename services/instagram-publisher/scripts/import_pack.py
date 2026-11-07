"""Convert an existing reviewed SNS kit into unapproved Instagram API drafts.
No network, tokens, account permissions or publish calls are used.
"""
import argparse, hashlib, json, re
from pathlib import Path
from PIL import Image

def import_pack(manifest_path, output):
    manifest_path = Path(manifest_path).resolve()
    output = Path(output).resolve()
    manifest = json.loads(manifest_path.read_text())
    queue_path = output / 'queue.json'
    queue = json.loads(queue_path.read_text()) if queue_path.exists() else {'version': 1, 'posts': []}
    existing = {p['id'] for p in queue['posts']}
    added = []
    for post in manifest['posts']:
        if post.get('channel') != 'instagram':
            continue
        source_id = post['id']
        # Source filenames can contain Japanese; the URL ID is a stable digest.
        pid = 'fds-' + hashlib.sha256(source_id.encode()).hexdigest()[:24]
        if pid in existing:
            raise ValueError('Already imported: ' + source_id)
        if len(post.get('assets', [])) not in range(2, 11):
            raise ValueError('Expected 2-10 carousel images')
        paths, hashes, images = [], [], []
        for index, asset in enumerate(post['assets'], 1):
            if Path(asset).name != asset or not asset.endswith('.png'):
                raise ValueError('Invalid kit asset path')
            source = (manifest_path.parent / source_id / asset).resolve()
            if not source.is_relative_to(manifest_path.parent):
                raise ValueError('Kit asset outside manifest directory')
            with Image.open(source) as image:
                ratio = image.width / image.height
                if not 0.8 <= ratio <= 1.91:
                    raise ValueError('Unsupported Instagram image ratio')
                import io
                buffer = io.BytesIO()
                image.convert('RGB').save(buffer, 'JPEG', quality=94)
                data = buffer.getvalue()
            if len(data) > 8 * 1024 * 1024:
                raise ValueError('JPEG too large')
            path = f'/media/{pid}/{index:02}.jpg'
            images.append((output / ('public' + path), data))
            paths.append(path)
            hashes.append(hashlib.sha256(data).hexdigest())
        caption = post['text']
        if not caption.strip() or len(caption) > 2200:
            raise ValueError('Invalid Instagram caption')
        draft = dict(id=pid, source_id=source_id, approved=False, approval_reference=None,
                     scheduled_at=post['scheduled_at'], format='carousel', caption=caption,
                     media_paths=paths, asset_sha256=hashes)
        # All validation precedes writes for this post; no draft is ever auto-approved.
        for destination, data in images:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        added.append(draft)
        existing.add(pid)
    if len(queue['posts']) + len(added) > 30:
        raise ValueError('Queue exceeds 30; archive old entries first')
    queue['posts'].extend(added)
    output.mkdir(parents=True, exist_ok=True)
    queue_path.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + '\n')
    return len(added)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest')
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args()
    print(f'{import_pack(args.manifest, args.output)} drafts imported; approval and posting remain disabled')
