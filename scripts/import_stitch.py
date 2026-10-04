import base64
import concurrent.futures
import json
import urllib.request
from pathlib import Path

raw = json.load(open('/tmp/stitch-screens.json'))['result']
data = raw.get('structuredContent') or json.loads(raw['content'][0]['text'])
root = Path('design/stitch')
root.mkdir(parents=True, exist_ok=True)
(root / 'manifest.json').write_text(json.dumps(data, indent=2))

def download(screen):
    folder = root / screen['name'].split('/')[-1]
    folder.mkdir(exist_ok=True)
    for key, ext in [('htmlCode', 'html'), ('screenshot', 'png')]:
        url = screen.get(key, {}).get('downloadUrl')
        if not url:
            continue
        content = base64.b64decode(url.split(',', 1)[1]) if url.startswith('data:') else urllib.request.urlopen(url, timeout=60).read()
        (folder / ('screen.' + ext)).write_bytes(content)
    return screen['title']

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    for title in pool.map(download, data['screens']):
        print(title)
