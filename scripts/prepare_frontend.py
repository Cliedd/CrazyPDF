"""Produce local, production-ready templates from the unmodified Stitch archive."""
import hashlib
import json
import re
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

root = Path('frontend')
(root / 'pages').mkdir(parents=True, exist_ok=True)
assets = root / 'public/assets'
assets.mkdir(parents=True, exist_ok=True)
screens = {'home': '350ae99d04934978913d853cdec62830', 'studio': 'a977a7cbe61d4142a867146abca35926', 'documents': 'f3e34319b9d74d3ea0a33967c994d767', 'background': 'f381bd531bcc48c6b5c6c2a98a3c51f7'}
paths = {'accueil-et-conversion': '/', 'studio-photo-visa': '/studio', 'detourage-ia': '/background', 'mes-documents-et-exports': '/documents', 'connexion-et-compte': '/account'}
replacements = {
    'Chaque millimètre vérifié par règle optique certifiée': 'Les bons formats pour votre démarche',
    'Chiffrement Bancaire 256-bit': 'Accès personnel sécurisé',
    'Toutes les transactions et transferts sont sécurisés avec le protocole TLS 1.3 et chiffrés au repos selon les normes RGPD européennes les plus strictes.': 'La connexion HTTPS protège les transferts. Chaque fichier est accessible uniquement depuis le compte qui l’a importé.',
    'Archivage perpétuel : aucun document n\'est jamais perdu ou détruit': 'Retrouvez vos documents dans votre espace personnel',
    'Validation automatique des formats PDF/A et conformité totale avec les portails Campus France Études en France, VFS Global, TLScontact et CEAC.': 'Les formats sont adaptés à la démarche choisie. Vérifiez les consignes du portail avant de déposer votre dossier.',
    'Espace illimité': 'Historique personnel',
    '100% GRATUIT & ILLIMITÉ': 'GRATUIT · SANS FILIGRANE',
    'Traitement illimité': 'Traitement gratuit',
    'ICАО 9303 Compliant': 'Formats officiels sourcés',
    'ICAO 9303 Compliant': 'Formats officiels sourcés',
    'Usage illimité sans filigrane imposé': 'Exports gratuits sans filigrane',
    'Maintien dpi & métadonnées biométriques': 'Dimensions et résolution adaptées',
    'Précision typographique absolue et conformité biométrique certifiée.': 'Conversions bureautiques et formats photo adaptés à votre démarche.',
    'Détourage IA': 'Détourage', 'IA V4.2': 'local', 'Détourage Neural v4.2': 'Détourage local',
    '98%': '—', '99.4%': '—', '99.8%': '—', '100% Conforme': 'À vérifier',
    'Garantie d’acceptation consulaire': 'Vérification avant dépôt', 'Garantie d\'acceptation consulaire': 'Vérification avant dépôt',
    'Conforme ICAO 9303': 'Formats internationaux', 'Cryptage 256-bit': 'Espace personnel',
    'Chiffrement sécurisé de bout en bout': 'Accès réservé à votre compte',
    'Chiffrement AES-256 au repos et en transit': 'Accès réservé à votre compte connecté',
    'Chiffrement Zero-Knowledge': 'Compte personnel protégé', 'Traitement < 1.2s': 'Traitement local',
    '148,290+': '0 FCFA', '+18% cette semaine': 'Sans frais d’export',
    '0.42 sec': 'Local', 'Zéro Perte Qualité': 'Export haute résolution',
    'certifiée': 'à vérifier', 'certifié': 'à vérifier', 'Conforme 100%': 'Format prêt',
    'Fond blanc certifié': 'Fond à vérifier', '© 2025': '© 2026', 'Suppression auto 1h': 'Historique conservé',
    'Documents académiques et planches visas traités sans aucun rejet administratif signalé.': 'Conversions et exports photo gratuits, sans filigrane.',
    'Notre intelligence artificielle calibre automatiquement la texture de peau sans modifier la biométrie faciale originale, évitant formellement tout rejet consulaire ou Campus France.': 'Vérifiez l’expression, l’éclairage et les exigences de votre démarche avant tout dépôt. Le format seul ne garantit pas l’acceptation.',
    'Générez et validez des photographies d\'identité aux normes consulaires les plus strictes en temps réel. Analyse faciale conforme Campus France, France-Visas, IRCC et DS-160.': 'Choisissez votre pays et votre démarche, importez votre photo puis ajustez le cadrage. Les dimensions et le poids sont appliqués à l’export.',
    'Seul le Blanc Pur #FFFFFF est homologué.': 'Consultez les règles officielles avant de retoucher une photo de visa.',
    'Conformité biométrique à vérifier': 'Vérification visuelle requise',
    'Prêt pour téléversement immédiat': 'Vérifiez les consignes de votre portail',
    'Conforme Campus France': 'Contrôle avant dépôt',
    'Aucune création de compte obligatoire pour convertir immédiatement votre premier document.': 'Connectez-vous gratuitement pour convertir et retrouver tous vos exports.',
}
config_written = False
for name, screen_id in screens.items():
    soup = BeautifulSoup((Path('design/stitch') / screen_id / 'screen.html').read_text(), 'html.parser')
    config = soup.select_one('#tailwind-config')
    if config and not config_written:
        js = config.string.replace('tailwind.config=', 'module.exports=')
        js = js.rstrip().rstrip(';')
        (root / 'tailwind.config.cjs').write_text(js + ';\nmodule.exports.content=["./index.html","./pages/*.html","./src/**/*.{ts,css}"];\n')
        config_written = True
    for script in soup.select('script'):
        script.decompose()
    for element in soup.select('[onclick]'):
        del element['onclick']
    for image in soup.select('img[src]'):
        url = image['src']
        if url.startswith('http'):
            filename = hashlib.sha256(url.encode()).hexdigest()[:16] + '.png'
            target = assets / filename
            if not target.exists():
                try:
                    target.write_bytes(urllib.request.urlopen(url, timeout=45).read())
                except Exception:
                    target.write_bytes((Path('design/stitch/a9678693ab304b88b1be7d76bb882c71/screen.png')).read_bytes())
            image['src'] = '/assets/' + filename
    for link in soup.select('[data-path]'):
        link['href'] = paths.get(link['data-path'], '/')
    for node in list(soup.body.find_all(string=True)):
        value = str(node)
        for before, after in replacements.items():
            value = value.replace(before, after)
        if value != str(node):
            node.replace_with(value)
    for link in soup.select('footer a'):
        text = link.get_text(strip=True)
        link['href'] = '/api/docs' if 'API' in text else '/privacy' if 'Confidentialité' in text else '/legal' if 'Mentions' in text else '/standards'
    # Keep the navigation available on narrow screens.
    nav = soup.select_one('header nav')
    nav['class'] = nav.get('class', []) + ['mobile-navigation']
    nav.attrs.pop('data-active-classes', None)
    for profile in soup.select('header img[alt="Profile"]'):
        profile.parent['data-action'] = 'account'
        profile.parent['role'] = 'button'
        profile.parent['tabindex'] = '0'
    if name == 'studio':
        frame = soup.select_one('#viewport-frame')
        frame.insert_before(BeautifulSoup('<div class="upload-toolbar"><button class="primary" data-action="upload-photo">Importer ma photo</button><span id="photo-name">Portrait de démonstration · importez votre photo</span></div><div class="settings"><label>Démarche<select id="preset-select"></select></label><label>Format<select id="photo-format"><option value="JPEG">JPEG</option><option value="PNG">PNG</option></select></label><label>Planche<select id="sheet-count"><option value="4">4 photos</option><option value="6">6 photos</option></select></label></div><p id="preset-note" class="notice"></p>', 'html.parser'))
        # Canvas drives both the preview and the Python export with the same coordinate system.
        wrapper = soup.select_one('#photo-wrapper')
        wrapper.replace_with(BeautifulSoup('<canvas id="photo-canvas" aria-label="Photo : glissez pour ajuster le cadrage"></canvas>', 'html.parser'))
        for hud_text in soup.select('#biometric-hud span'):
            if 'Tête:' in hud_text.text:
                hud_text.string = 'Repères de cadrage indicatifs'
        for value, default in [('slider-zoom', '100'), ('slider-bright', '0')]:
            soup.select_one('#' + value)['value'] = default
        soup.select_one('#zoom-val').string = '100%'
        soup.select_one('#bright-val').string = '0%'
        soup.select_one('#btn-ai-remove-bg')['data-action'] = 'studio-cutout'
        soup.select_one('#btn-download-photo')['data-action'] = 'export-photo'
        for strong in soup.select('.preset-card strong'):
            if '35 × 45' in strong.text and strong.find_parent(attrs={'data-preset':'france'}):
                strong.string = 'Selon la démarche'
        inspector = soup.select_one('#export-options-group').parent
        panel = soup.select_one('#export-options-group').find_parent(class_='bg-surface-container-lowest')
        boundary = panel.find(string=lambda t: t and 'Options d' in t)
        for child in list(panel.children):
            if getattr(child, 'get_text', None) and 'Options d' in child.get_text():
                break
            child.extract()
        panel.insert(0, BeautifulSoup('<div class="flex items-center justify-between pb-space-sm mb-space-sm border-b border-surface-container"><div><span class="font-caption-mono text-caption-mono uppercase">Contrôle avant dépôt</span><h3 class="font-headline-md text-headline-md">Vérification de la photo</h3></div><span class="material-symbols-outlined text-primary">fact_check</span></div><div class="p-space-md rounded-xl bg-secondary-container/30 mb-space-md"><strong>Format appliqué à l’export</strong><p class="text-body-sm mt-1">La décision finale appartient au service qui reçoit votre dossier.</p></div><div id="live-photo-specs" class="notice"></div><ul class="text-body-md space-y-2 mb-space-md"><li>Pose de face, bouche fermée : à vérifier</li><li>Hauteur de tête : utilisez les repères</li><li>Éclairage et ombres : à vérifier</li><li>Photo récente : selon votre démarche</li></ul>', 'html.parser'))
        for node in soup.find_all(string=lambda t: t and 'Hauteur tête' in t):
            if node.parent.find_parent(class_='preset-card'):
                parent = node.parent
                parent.clear()
                parent.string = '• Démarche et règles précisées ci-dessous'
    if name == 'background':
        first = soup.select_one('#comparisonContainer') or soup.select_one('#sliderControl').parent
        first.insert_before(BeautifulSoup('<div class="upload-toolbar"><button class="primary" data-action="upload-background">Importer des photos</button><span>JPG, PNG, WebP · jusqu’à 20 portraits</span></div><div id="batch-files"></div><p class="notice">Le détourage est un outil de création. Pour les visas USA et les photos de résident permanent canadien, utilisez une photo originale conforme, sans remplacement numérique du fond.</p>', 'html.parser'))
        soup.select_one('#downloadBtn')['data-action'] = 'export-background'
        for button in soup.select('.toggle-btn'):
            label = button.parent.get_text(' ', strip=True)
            button['aria-label'] = label
        for node in soup.find_all(string=True):
            txt = str(node)
            changes = {
                'Nettoyage des ombres faciales': 'Éclaircissement léger',
                'Supprime les ombres portées du nez et du cou': 'Ajuste la luminosité, sans effacer les ombres',
                'Amélioration de netteté HD': 'Renforcement de netteté',
                'Super-résolution neurale sur les yeux et sourcils': 'Filtre léger de netteté, sans génération de détails',
                'Score de Détourage & Conformité': 'Inspection du résultat',
                'Arrière-plan : 100% Homogène': 'Inspectez les cheveux et les contours',
                'Visage : Non Déformé': 'Aucune déformation volontaire du visage',
                'Précision au sous-pixel': 'Segmentation locale',
                '0.4 sec': 'Local',
                'Alph': 'Alph',
                'DÉTOURÉ & CALIBRÉ': 'APERÇU DU RÉSULTAT',
                '2400 x 3000 px (300 DPI)': 'Dimensions conservées à l’export',
                'Matting Transept IA V4': 'U²-Net local',
                'Fond chambre / Ombres portées': 'Photo avant traitement',
            }
            for before, after in changes.items():
                txt = txt.replace(before, after)
            if txt != str(node):
                node.replace_with(txt)
    if name == 'documents':
        listing = soup.select_one('#documentsList')
        listing.clear()
        listing.append(BeautifulSoup('<table><thead class="sr-only"><tr><th>Fichier</th><th>Catégorie</th><th>Format / Taille</th><th>Statut</th><th>Actions</th></tr></thead><tbody></tbody></table>', 'html.parser'))
    fragment = ''.join(str(child) for child in soup.body.contents)
    (root / 'pages' / (name + '.html')).write_text(fragment)
print('Four Stitch templates prepared with local assets.')
