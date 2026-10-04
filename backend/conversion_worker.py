"""Release office/OCR/parser memory after each document conversion."""
import json
import sys
from pathlib import Path
from backend.processing import convert

if __name__ == '__main__':
    source, output, mode, result_path = sys.argv[1:]
    try:
        result = {'metadata': convert(Path(source), Path(output), mode, {})}
    except Exception as error:
        result = {'error': str(error) if isinstance(error, ValueError) else 'La conversion a échoué. Vérifiez votre document puis réessayez.'}
    Path(result_path).write_text(json.dumps(result), encoding='utf-8')
