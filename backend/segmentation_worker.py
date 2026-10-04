"""Memory-bounded CPU U²-Net inference, isolated from the API process.

Uses the pinned rembg u2netp model and its normalization directly. Importing
rembg also imports optional matting/JIT packages that are unnecessary here.
"""
import os
import sys
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image


def segment(source, target):
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    session = ort.InferenceSession(str(Path(os.environ['U2NET_HOME']) / 'u2netp.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
    with Image.open(source) as image:
        pixels = np.asarray(image.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
    pixels /= max(float(pixels.max()), 1e-6)
    pixels = (pixels - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    prediction = session.run(None, {session.get_inputs()[0].name: pixels.transpose(2, 0, 1)[None]})[0][0, 0]
    lo, hi = float(prediction.min()), float(prediction.max())
    if hi - lo < 1e-6:
        raise ValueError('Aucun sujet identifiable. Utilisez un portrait net avec un contraste suffisant.')
    mask = np.clip((prediction - lo) / (hi - lo), 0, 1)
    # Suppress low-confidence background haze, preserve a continuous feathered
    # transition for hair, and restore opaque foreground interiors.
    mask = np.clip((mask - .06) / .88, 0, 1)
    Image.fromarray(np.round(mask * 255).astype(np.uint8)).save(target)


if __name__ == '__main__':
    segment(sys.argv[1], sys.argv[2])
