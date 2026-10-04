import io
import json
import math
import subprocess
import tempfile
import os
import sys
import threading
from pathlib import Path
import fitz
from PIL import Image, ImageEnhance, ImageOps, ImageDraw
from backend.presets import PRESETS, dimensions

Image.MAX_IMAGE_PIXELS = 16_000_000
_segmentation_lock = threading.Lock()
os.environ.setdefault('U2NET_HOME', str(Path('data/models').resolve()))
os.environ.setdefault('TESSDATA_PREFIX', str(Path('data/tessdata').resolve()))
os.environ.setdefault('OMP_NUM_THREADS', '1')

def remove_background(image):
    # Serialize inference, release ONNX memory after every request, and keep
    # image buffers bounded on Render's 512 MB instances.
    if image.mode == 'RGBA' and image.getchannel('A').getextrema()[0] == 0:
        return image.copy()
    with _segmentation_lock:
        image = image.copy()
        image.thumbnail((3000, 3000), Image.Resampling.LANCZOS)
        with tempfile.TemporaryDirectory() as td:
            source, mask_path = Path(td) / 'input.png', Path(td) / 'mask.png'
            inference = image.convert('RGB')
            inference.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            inference.save(source)
            del inference
            try:
                result = subprocess.run([sys.executable, '-m', 'backend.segmentation_worker', str(source), str(mask_path)], capture_output=True, timeout=90)
            except subprocess.TimeoutExpired:
                raise ValueError('Le détourage a dépassé le délai. Réessayez avec un portrait plus simple.')
            if result.returncode or not mask_path.exists():
                import logging
                logging.getLogger('docuvisa').error('Segmentation exit=%s stderr=%s', result.returncode, result.stderr.decode(errors='replace')[-1500:])
                raise ValueError('Le portrait n’a pas pu être détouré. Utilisez une photo nette où le sujet se distingue du fond.')
            with Image.open(mask_path) as small_mask:
                mask = small_mask.resize(image.size, Image.Resampling.BILINEAR)
            # Respect transparency already supplied by the user; keep soft hair
            # edges rather than thresholding away fine details.
            from PIL import ImageChops
            image = image.convert('RGBA')
            image.putalpha(ImageChops.multiply(mask, image.getchannel('A')))
            return image

def validate_image(path):
    # Inspect the encoded file without keeping a decoded full-size portrait in the API.
    with Image.open(path) as image:
        if image.width * image.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('Image trop grande : maximum 16 millions de pixels.')
        if image.format not in ('JPEG', 'PNG', 'WEBP'):
            raise ValueError('Importez une photo JPG, PNG ou WebP.')
        image.verify()

def load_image(path):
    image = Image.open(path)
    if image.width * image.height > Image.MAX_IMAGE_PIXELS:
        raise ValueError('Image trop grande : maximum 16 millions de pixels.')
    image = ImageOps.exif_transpose(image)
    if image.info.get('icc_profile'):
        from PIL import ImageCms
        try:
            image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(image.info['icc_profile'])), ImageCms.createProfile('sRGB'), outputMode='RGB')
        except Exception:
            raise ValueError('Profil de couleur non reconnu. Importez une image sRGB.')
    return image.convert('RGBA')

def encode_image(image, target, fmt='JPEG', dpi=300, max_kb=None):
    if fmt == 'JPEG':
        if image.mode != 'RGB':
            canvas = Image.new('RGB', image.size, 'white')
            canvas.paste(image, mask=image.getchannel('A') if image.mode == 'RGBA' else None)
            image = canvas
        for quality in range(95, 9, -5):
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=quality, optimize=True, dpi=(dpi, dpi))
            if not max_kb or len(buffer.getvalue()) <= max_kb * 1000:
                target.write_bytes(buffer.getvalue())
                return
        raise ValueError('Cette photo ne peut pas respecter la taille maximale sans trop dégrader la qualité. Essayez un cadrage plus simple.')
    image.save(target, format=fmt, dpi=(dpi, dpi))

def photo(source, output, options):
    preset = PRESETS[options['preset']]
    if preset.get('no_retouch') and (options.get('remove_bg') or options.get('brightness', 0) != 0):
        raise ValueError('Cette démarche interdit les retouches numériques : utilisez le recadrage sans détourage ni exposition.')
    image = load_image(source)
    if options.get('remove_bg'):
        image = remove_background(image)
    width, height = dimensions(preset)
    background = options.get('background') or preset['background']
    # Inverse canvas transform: same centered scale, clockwise rotation and
    # normalized translation as the browser preview. One resampling prevents
    # rotate(expand=True) rounding from moving the exported crop.
    scale = max(width / image.width, height / image.height) * float(options.get('zoom', 1))
    angle = math.radians(float(options.get('rotation', 0)))
    cos, sin = math.cos(angle) / scale, math.sin(angle) / scale
    center_x = width / 2 + float(options.get('offset_x', 0)) * width
    center_y = height / 2 + float(options.get('offset_y', 0)) * height
    image = image.transform((width, height), Image.Transform.AFFINE,
        (cos, sin, image.width / 2 - cos * center_x - sin * center_y,
         -sin, cos, image.height / 2 + sin * center_x - cos * center_y),
        resample=Image.Resampling.BICUBIC)
    if preset.get('no_retouch') and image.getchannel('A').getextrema()[0] < 255:
        raise ValueError('Le cadrage crée des zones artificielles : recentrez la photo ou augmentez le zoom. Cette démarche exige une photo originale sans modification du fond.')
    if options.get('brightness'):
        alpha = image.getchannel('A')
        image = ImageEnhance.Brightness(image.convert('RGB')).enhance(1 + options['brightness'] / 100).convert('RGBA')
        image.putalpha(alpha)
    canvas = Image.alpha_composite(Image.new('RGBA', (width, height), background), image)
    if options.get('export_type') == 'sheet':
        # Real 10×15 cm PDF page, actual-size images and crop marks.
        count = int(options.get('sheet_count', 4))
        page_width, page_height = 100 / 25.4 * 72, 150 / 25.4 * 72
        pw, ph = preset['width_mm'] / 25.4 * 72, preset['height_mm'] / 25.4 * 72
        cols = 2 if pw * 2 + 12 <= page_width else 1
        rows = math.ceil(count / cols)
        if ph * rows + 12 > page_height:
            raise ValueError('Ce format ne tient pas sur une planche 10 × 15 cm. Réduisez le nombre de photos.')
        doc = fitz.open()
        page = doc.new_page(width=page_width, height=page_height)
        stream = io.BytesIO()
        canvas.convert('RGB').save(stream, 'JPEG', quality=95)
        for i in range(count):
            left = (page_width - cols * pw) / 2 + i % cols * pw
            top = (page_height - rows * ph) / 2 + i // cols * ph
            rect = fitz.Rect(left, top, left + pw, top + ph)
            page.insert_image(rect, stream=stream.getvalue())
            for cx, cy in [(left, top), (left + pw, top), (left, top + ph), (left + pw, top + ph)]:
                page.draw_line((cx - 2, cy), (cx + 2, cy), color=(.5, .5, .5), width=.2)
                page.draw_line((cx, cy - 2), (cx, cy + 2), color=(.5, .5, .5), width=.2)
        doc.save(output)
        doc.close()
    else:
        fmt = options.get('format', 'JPEG')
        if preset.get('max_kb'):
            fmt = 'JPEG'
        encode_image(canvas, output, fmt, preset['dpi'], preset.get('max_kb'))
    return {'width_px': width, 'height_px': height, 'dpi': preset['dpi'], 'preset': preset['label'], 'export_type': options.get('export_type', 'single'), 'status': 'Format exporté — conformité visuelle à vérifier', 'source': preset['source']}

def cutout(source, output, options):
    image = remove_background(load_image(source))
    if options.get('sharpness'):
        image = ImageEnhance.Sharpness(image).enhance(1.3)
    if options.get('exposure'):
        alpha = image.getchannel('A')
        image = ImageOps.autocontrast(image.convert('RGB')).convert('RGBA')
        image.putalpha(alpha)
    if options.get('shadow'):
        image = ImageEnhance.Brightness(image).enhance(1.05)
    background = options.get('background') or 'transparent'
    if background != 'transparent':
        canvas = Image.new('RGBA', image.size, background)
        canvas.alpha_composite(image)
        image = canvas
    encode_image(image, output, 'PNG')
    return {'width_px': image.width, 'height_px': image.height, 'status': 'Fond traité — vérifier les contours', 'background': background}

def convert_isolated(source, output, mode, options):
    # pdf2docx/OpenCV and OCR retain sizeable native allocations. Keep them out
    # of the API process so a later segmentation still fits a 512 MB instance.
    with tempfile.TemporaryDirectory() as td:
        metadata = Path(td) / 'result.json'
        try:
            result = subprocess.run([sys.executable, '-m', 'backend.conversion_worker', str(source.resolve()), str(output.resolve()), mode, str(metadata)], capture_output=True, timeout=420)
        except subprocess.TimeoutExpired:
            raise ValueError('La conversion a dépassé le délai. Divisez votre document en plusieurs fichiers.')
        if result.returncode or not metadata.is_file():
            raise ValueError('La conversion a été interrompue. Réessayez avec un document plus petit.')
        payload = json.loads(metadata.read_text())
        if 'error' in payload:
            raise ValueError(payload['error'])
        return payload['metadata']

def office_to_pdf(source, output):
    with tempfile.TemporaryDirectory() as td:
        result = subprocess.run([os.getenv('LIBREOFFICE_BIN', 'libreoffice'), '-env:UserInstallation=file://' + td + '/profile', '--headless', '--convert-to', 'pdf', '--outdir', td, str(source.resolve())], capture_output=True, timeout=120)
        pdf = Path(td) / (source.stem + '.pdf')
        if result.returncode or not pdf.exists():
            import logging
            logging.getLogger('docuvisa').error('LibreOffice exit=%s stdout=%s stderr=%s', result.returncode, result.stdout.decode(errors='replace')[:1000], result.stderr.decode(errors='replace')[:1000])
            raise ValueError('LibreOffice ne peut pas convertir ce document. Vérifiez qu’il est valide et non protégé.')
        output.write_bytes(pdf.read_bytes())
    with fitz.open(output) as doc:
        return {'pages': len(doc), 'status': 'Converti avec succès'}

def convert(source, output, mode, options):
    if mode in ('word-pdf', 'pptx-pdf'):
        return office_to_pdf(source, output)
    if mode == 'pdf-word':
        from pdf2docx import Converter
        with fitz.open(source) as document:
            if document.needs_pass:
                raise ValueError('PDF protégé : fournissez une copie déverrouillée.')
            if len(document) > 200:
                raise ValueError('Maximum 200 pages par conversion.')
            scans = any(not page.get_text().strip() for page in document)
        actual = source
        with tempfile.TemporaryDirectory() as td:
            if scans:
                from docx import Document
                result = Document()
                with fitz.open(source) as document:
                    for index, page in enumerate(document):
                        if index:
                            result.add_page_break()
                        if page.get_text().strip():
                            text = page.get_text()
                        else:
                            tp = page.get_textpage_ocr(language='fra+eng', dpi=200, full=True, tessdata=os.environ['TESSDATA_PREFIX'])
                            text = page.get_text(textpage=tp)
                        for paragraph in text.split('\n'):
                            if paragraph.strip():
                                result.add_paragraph(paragraph.strip())
                result.save(output)
                return {'status': 'Texte OCR modifiable', 'ocr': True, 'note': 'Reconnaissance Tesseract français/anglais. Relisez le texte ; la mise en page des scans est reconstruite simplement.'}
            converter = Converter(str(actual))
            try:
                converter.convert(str(output), multi_processing=False)
            finally:
                converter.close()
        return {'status': 'Document Word modifiable', 'ocr': scans, 'note': 'Vérifiez les tableaux, formules et la mise en page après conversion.'}
    if mode == 'pdf-pptx':
        from pptx import Presentation
        from pptx.util import Inches
        presentation = Presentation()
        with fitz.open(source) as document:
            if document.needs_pass:
                raise ValueError('PDF protégé : fournissez une copie déverrouillée.')
            if len(document) > 200 or len(document) == 0:
                raise ValueError('Le PDF doit contenir entre 1 et 200 pages.')
            first = document[0].rect
            # PowerPoint supports sides from 1 to 56 inches. Keep the PDF's
            # proportions where possible, including large-format drawings.
            slide_scale = min(1, 56 * 72 / max(first.width, first.height))
            if min(first.width, first.height) * slide_scale < 72:
                raise ValueError('Les proportions de ce PDF ne sont pas compatibles avec une diapositive PowerPoint.')
            presentation.slide_width = Inches(first.width * slide_scale / 72)
            presentation.slide_height = Inches(first.height * slide_scale / 72)
            image_bytes_total = 0
            for page in document:
                slide = presentation.slides.add_slide(presentation.slide_layouts[6])
                # Bound raster memory for unusually large PDF pages. A4 keeps
                # its usual 144 dpi rendering; larger pages stay under 4 MP.
                render_scale = min(2, math.sqrt(4_000_000 / (page.rect.width * page.rect.height)))
                pixmap = page.get_pixmap(matrix=fitz.Matrix(render_scale, render_scale), alpha=False)
                image_bytes = pixmap.tobytes('png')
                image_bytes_total += len(image_bytes)
                if image_bytes_total > 64 * 1024 * 1024:
                    raise ValueError('Ce PDF contient trop d’images pour une seule conversion. Divisez-le en plusieurs documents puis réessayez.')
                placement_scale = min(presentation.slide_width / page.rect.width, presentation.slide_height / page.rect.height)
                width = round(page.rect.width * placement_scale)
                height = round(page.rect.height * placement_scale)
                slide.shapes.add_picture(io.BytesIO(image_bytes), (presentation.slide_width - width) // 2, (presentation.slide_height - height) // 2, width=width, height=height)
            presentation.save(output)
            return {'pages': len(document), 'status': 'Converti en diapositives', 'note': 'Chaque page devient une image haute résolution dans une diapositive ; les textes ne sont pas modifiables.'}
    raise ValueError('Conversion inconnue.')
