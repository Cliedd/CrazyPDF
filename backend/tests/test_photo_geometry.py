"""Real export geometry: coordinates agree with centered Canvas transforms."""
import math
from pathlib import Path

import fitz
import pytest
from PIL import Image, ImageDraw

from backend.processing import photo
from backend.presets import PRESETS, dimensions


def source_image(path):
    image = Image.new('RGB', (800, 1000), '#888888')
    draw = ImageDraw.Draw(image)
    draw.ellipse((380, 430, 420, 470), fill=(255, 0, 0))
    image.save(path)


@pytest.mark.parametrize('rotation,zoom,offset_x,offset_y', [(0, 1, 0, 0), (12, 1.4, .08, -.06), (-10, 1.7, -.12, .04)])
def test_export_landmark_matches_canvas_transform(tmp_path, rotation, zoom, offset_x, offset_y):
    source, output = tmp_path/'source.png', tmp_path/'output.png'
    source_image(source)
    photo(source, output, dict(preset='fr-visa', format='PNG', rotation=rotation, zoom=zoom, offset_x=offset_x, offset_y=offset_y))
    image = Image.open(output).convert('RGB')
    w, h = dimensions(PRESETS['fr-visa'])
    scale = max(w/800, h/1000)*zoom
    theta = math.radians(rotation)
    # Original landmark is (400, 450): 50 px above source center.
    expected_x = w/2 + offset_x*w + 50*scale*math.sin(theta)
    expected_y = h/2 + offset_y*h - 50*scale*math.cos(theta)
    red = [(x, y) for y in range(h) for x in range(w) if (lambda c: c[0]>220 and c[1]<30 and c[2]<30)(image.getpixel((x,y))) ]
    assert red
    assert abs(sum(x for x,y in red)/len(red)-expected_x)<1.5
    assert abs(sum(y for x,y in red)/len(red)-expected_y)<1.5
    assert image.size == (w,h)


def test_transparent_edges_composite_once(tmp_path):
    source, output = tmp_path/'source.png', tmp_path/'output.png'
    Image.new('RGBA',(800,1000),(255,0,0,128)).save(source)
    photo(source,output,dict(preset='fr-visa',format='PNG'))
    pixel=Image.open(output).getpixel((200,200))
    assert pixel[3]==255  # RGBA paste(mask=image) previously left alpha ~191
    assert abs(pixel[0]-248)<=1 and abs(pixel[1]-122)<=1


@pytest.mark.parametrize('preset_id',PRESETS)
def test_dimensions_dpi_and_weight(tmp_path,preset_id):
    source,output=tmp_path/'source.png',tmp_path/'output.jpg'
    source_image(source)
    photo(source,output,dict(preset=preset_id))
    image=Image.open(output)
    preset=PRESETS[preset_id]
    assert image.size==dimensions(preset)
    assert image.info['dpi']==(preset['dpi'],preset['dpi'])
    if preset.get('max_kb'):assert output.stat().st_size<=preset['max_kb']*1000


def test_original_required_rejects_blank_crop(tmp_path):
    source,output=tmp_path/'source.png',tmp_path/'output.jpg'
    source_image(source)
    with pytest.raises(ValueError,match='zones artificielles'):
        photo(source,output,dict(preset='us-visa',offset_x=1))


def test_print_sheet_actual_size(tmp_path):
    source,output=tmp_path/'source.png',tmp_path/'sheet.pdf'
    source_image(source)
    photo(source,output,dict(preset='fr-visa',export_type='sheet',sheet_count=6))
    with fitz.open(output) as doc:
        page=doc[0]
        assert abs(page.rect.width-100/25.4*72)<.01
        assert abs(page.rect.height-150/25.4*72)<.01
        placements=page.get_image_info()
        assert len(placements)==6
        for item in placements:
            rect=fitz.Rect(item['bbox'])
            assert abs(rect.width-35/25.4*72)<.01
            assert abs(rect.height-45/25.4*72)<.01
