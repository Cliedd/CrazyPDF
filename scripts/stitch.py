import json
import sys
import tomllib
import urllib.request
from pathlib import Path

config = tomllib.load(open('/home/ryzen/.codex/config.toml', 'rb'))['mcp_servers']['stitch']
headers = dict(config.get('http_headers', {}))
headers.update({'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
method = sys.argv[1]
params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
payload = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode()
with urllib.request.urlopen(urllib.request.Request(config['url'], data=payload, headers=headers), timeout=90) as response:
    result = json.load(response)
if len(sys.argv) > 3:
    target = Path(sys.argv[3])
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2))
else:
    print(json.dumps(result))
