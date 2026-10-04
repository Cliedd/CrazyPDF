"""Download the official local segmentation and OCR resources once."""
import hashlib
import urllib.request
import urllib.error
from pathlib import Path

files = {
    'data/tessdata/eng.traineddata': 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata',
    'data/tessdata/fra.traineddata': 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/fra.traineddata',
    'data/models/u2netp.onnx': 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
}
for filename, url in files.items():
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                content = response.read()
        except urllib.error.HTTPError:
            if not filename.endswith('u2netp.onnx'):
                raise
            # Byte-identical pinned mirror, checked against rembg's official checksum.
            mirror = 'https://huggingface.co/tomjackson2023/rembg/resolve/cd3a3d6767a7859efea31ef0f2f373582cf06d82/u2netp.onnx'
            with urllib.request.urlopen(mirror, timeout=90) as response:
                content = response.read()
        if filename.endswith('u2netp.onnx') and hashlib.md5(content).hexdigest() != '8e83ca70e441ab06c318d82300c84806':
            raise ValueError('Model checksum does not match the official rembg release.')
        path.write_bytes(content)
    print(filename, path.stat().st_size, hashlib.sha256(path.read_bytes()).hexdigest())
