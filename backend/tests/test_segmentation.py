"""Real model regression for transparent masters and exact recoloring."""
from pathlib import Path
from PIL import Image
from backend.processing import cutout


def test_portrait_mask_and_recolor_without_second_inference(tmp_path, monkeypatch):
    source = Path('frontend/public/assets/243d5220011d19a6.png')
    transparent = tmp_path / 'portrait.png'
    cutout(source, transparent, {'background': 'transparent'})
    with Image.open(transparent) as image:
        assert image.size == (512, 279)
        assert image.getchannel('A').getextrema() == (0, 255)
        assert image.getpixel((256, 100))[3] > 240  # Real face retained.
        assert image.getpixel((10, 10))[3] < 10  # Room removed.
        mask = image.getchannel('A').copy()
    # An already-cut-out PNG must keep its mask rather than segmenting a second
    # time, otherwise fine hair disappears and every recolor consumes inference.
    monkeypatch.setenv('U2NET_HOME', '/unavailable-model')
    for color in ('#FFFFFF', '#F1F5F9', '#E0F2FE'):
        result = tmp_path / (color[1:] + '.png')
        cutout(transparent, result, {'background': color})
        with Image.open(result) as image:
            expected = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
            assert image.getpixel((10, 10)) == expected + (255,)
            assert image.getchannel('A').getextrema() == (255, 255)
    again = tmp_path / 'again.png'
    cutout(transparent, again, {})
    with Image.open(again) as image:
        assert image.getchannel('A').tobytes() == mask.tobytes()
