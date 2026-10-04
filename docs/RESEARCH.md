# DocuVisa.AI — sources, moteurs et limites

Recherche et vérification : 3 octobre 2026. Les sources primaires sont liées ci-dessous. Les consignes du dossier et de l’ambassade restent prioritaires ; aucune bibliothèque ne peut garantir une décision consulaire.

## Photos : pays ET démarche

| Démarche | Exigence publiée | Choix appliqué | Source primaire |
|---|---|---|---|
| Études en France, guide Rwanda | Environ 26 × 32 mm, 300 DPI | 307 × 378 px, JPEG, < 50 Ko avec marge | [Guide Campus France Rwanda](https://www.rwanda.campusfrance.org/system/files/medias/documents/2024-10/Guidelines%20application%20student.pdf) |
| Campus France Cameroun | Photo 4 × 4, 50 Ko maximum | 40 × 40 mm, 472 × 472 px à 300 DPI, JPEG ≤ 50 000 octets | [Guide candidature local](https://www.cameroun.campusfrance.org/system/files/medias/documents/2023-11/Guide%20candidature.pdf) |
| Campus France USA | JPEG/PNG, moins de 50 Ko ; pas de dimension physique unique imposée par la FAQ | La limite est documentée ; utiliser le guide correspondant à son espace local | [FAQ officielle](https://www.usa.campusfrance.org/faq/how-do-i-upload-documents-in-an-etudes-en-france-application) |
| Identité française | 35 × 45 mm, tête 32–36 mm, fond clair uni, blanc interdit | 413 × 531 px à 300 DPI ; repères manuels, sans certification automatique | [Service Public](https://www.service-public.gouv.fr/particuliers/vosdroits/F10619) |
| Visa français/Schengen | Photo récente, largeur 35–40 mm, visage 70–80 %, fond clair | Format pratique 35 × 45 mm ; vérifier les consignes du poste | [France-Visas FAQ](https://france-visas.gouv.fr/fr/faq), [fiche officielle](https://france-visas.gouv.fr/documents/d/france-visas/iso_iec_normes_photos_fr) |
| Allemagne, visa à Yaoundé | 35 × 45 mm, biométrique, visage de face, sans retouche, fond clair uni | 413 × 531 px à 300 DPI ; détourage et exposition désactivés | [Ambassade d’Allemagne à Yaoundé](https://jaunde.diplo.de/cm-de/service/checkliste-schengen-2444244) |
| Canada, visa temporaire | Cadre au moins 35 × 45 mm, tête 31–36 mm | 413 × 531 px à 300 DPI ; aucune limite de poids arbitraire présentée comme officielle | [IRCC visa temporaire](https://www.canada.ca/fr/immigration-refugies-citoyennete/services/demande/formulaires-demande-guides/demande-visa-resident-temporaire-specifications-photographie.html) |
| Canada, résidence permanente, dépôt numérique | JPEG, 715 × 1000 à 2000 × 2800 px, ≤ 4 Mo ; original professionnel, sans retouche | 1000 × 1400 px, JPEG ≤ 4 000 000 octets ; détourage/exposition interdits | [IRCC, section numérique](https://www.canada.ca/en/immigration-refugees-citizenship/services/permanent-residents/card/photos.html) |
| Canada, résidence permanente, papier | 50 × 70 mm, tête 31–36 mm ; photographe et mentions au verso | 591 × 827 px à 300 DPI ; planche à dimensions réelles, ne remplace pas le photographe | [Même source, section papier](https://www.canada.ca/en/immigration-refugees-citizenship/services/permanent-residents/card/photos.html) |
| États-Unis, DS-160/visa | Carré 600–1200 px, JPEG sRGB 24 bits, ≤ 240 Ko, compression ≤ 20:1 | 600 × 600 px ; détourage/exposition interdits ; recadrage autorisé avec vérification des zones artificielles | [Digital Image Requirements](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos/digital-image-requirements.html), [Photo Requirements](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html) |

Les valeurs en pixels issues des millimètres sont des valeurs calculées, pas des normes supplémentaires : `arrondi(mm / 25,4 × DPI)`. Les guides anciens sont datés dans leurs URL : vérifier les instructions visibles dans le portail au moment du dépôt. Un code ePhoto français ou un QR/transfert de photographe agréé allemand n’est pas généré par l’application.

L’inspection visuelle de la pose, de l’expression et de la hauteur de tête reste nécessaire. Les scores « 98 % », « certification ICAO » et « acceptation garantie » de Stitch ne constituent pas des mesures réelles et sont retirés de l’interface fonctionnelle.

## Bibliothèques et API examinées

| Fonction | Moteur retenu | Pourquoi et limites | Documentation |
|---|---|---|---|
| DOC/DOCX → PDF | LibreOffice headless, piloté par `subprocess` Python | Moteur bureautique réel ; profil isolé par travail, délai limité. Les polices disponibles et certains éléments Office peuvent modifier le rendu. | [Filtres de conversion](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html) |
| PPT/PPTX → PDF | LibreOffice Impress headless | Préserve mieux le rendu qu’une reconstruction manuelle ; animations non conservées dans le PDF. | [Même documentation](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html) |
| PDF textuel → DOCX | `pdf2docx` + PyMuPDF + `python-docx` | Reconstruit un DOCX éditable. Tableaux complexes/formules peuvent changer ; le projet pdf2docx n’est plus activement maintenu par Artifex, donc version testée et tests de non-régression nécessaires. | [Dépôt primaire](https://github.com/ArtifexSoftware/pdf2docx), [documentation](https://pdf2docx.readthedocs.io/en/latest/) |
| PDF numérisé → DOCX | Tesseract intégré à PyMuPDF + modèles `tessdata_fast` français/anglais | OCR réel local, sans API payante ; les scans sont reconstruits en paragraphes modifiables avec sauts de page, sans promesse de mise en page identique. OCRmyPDF a aussi été étudié ; il ajoute notamment des dépendances système et n’est pas requis dans ce chemin. | [PyMuPDF OCR](https://pymupdf.readthedocs.io/en/latest/recipes-ocr.html), [modèles officiels](https://github.com/tesseract-ocr/tessdata_fast) |
| PDF → PPTX | Rendu PyMuPDF + `python-pptx` | Chaque page devient une image haute résolution sur une diapositive. Le texte à l’intérieur de cette image n’est pas éditable ; annoncé dans l’outil. | [python-pptx](https://python-pptx.readthedocs.io/en/latest/) |
| Recadrage/redimensionnement/rotation | Pillow, Lanczos, correction EXIF, profils sRGB | Transformation à dimensions exactes, DPI, compression mesurée, alpha PNG. Une augmentation de pixels ne crée pas de vrais détails. | [ImageOps](https://pillow.readthedocs.io/en/stable/reference/ImageOps.html), [ImageCms](https://pillow.readthedocs.io/en/stable/reference/ImageCms.html) |
| Suppression de fond | `rembg`, U²-Net léger `u2netp`, ONNX Runtime CPU | Segmentation locale. C’est un modèle de vision, même si appelé depuis Python ; aucune API générative ou payante. Cheveux et contours doivent être inspectés. Pas de promesse de résultat parfait ni d’effacement des ombres du visage. | [rembg](https://github.com/danielgatis/rembg), [U²-Net](https://github.com/xuebinqin/U-2-Net) |
| Planches d’impression | PyMuPDF | PDF 100 × 150 mm avec placement en dimensions physiques et traits de coupe. 4/6 photos selon le format et la place disponible. | [Page API](https://pymupdf.readthedocs.io/en/latest/page.html) |

Les API SaaS de conversion ne sont pas nécessaires pour cette version : éviter le coût par document et l’envoi des pièces à un fournisseur de conversion externe. `python-docx` et `python-pptx` créent/modifient les documents, mais ne sont pas des moteurs de rendu Office vers PDF à elles seules.

## Licences

LibreOffice, Pillow, python-docx, python-pptx et rembg ont des licences disponibles dans leurs distributions/dépôts. Le modèle U²-Net choisi est documenté dans son dépôt ; un modèle rembg différent peut avoir d’autres conditions. Ne pas adopter automatiquement le modèle par défaut d’une nouvelle version.

PyMuPDF est proposé sous AGPL ou licence commerciale : [conditions de l’éditeur](https://pymupdf.io/licensing). Le statut MIT de pdf2docx ne supprime pas les conditions de sa dépendance PyMuPDF. Le choix de publication du code et de licence de DocuVisa doit être établi avant lancement public ; ne pas présenter le moteur comme libre de toute obligation.

## Performance et conservation

Un travail est exécuté à la fois sur le service Render gratuit. La file, les statuts et des morceaux de 1 Mo contenant les fichiers sont persistés dans Neon ; une copie éphémère sert pendant le traitement. Les données consomment le quota de Neon : elles ne sont pas illimitées, et l’interface ne fournit pas de bouton pour supprimer un document. Prévoir un stockage objet avec une politique de conservation avant une ouverture à grande échelle.

Le service gratuit pour l’utilisateur n’implique pas un hébergement gratuit : disque persistant, CPU/RAM, stockage et sauvegardes ont un coût pour l’exploitant. Ne pas promettre un archivage illimité à vie sur le disque de 10 Go proposé pour le premier déploiement.

Pas de route de suppression de travaux. Les sessions peuvent être révoquées à la déconnexion. L’exploitant doit définir la durée de conservation, les sauvegardes, son contact et le traitement des demandes relatives aux données personnelles avant ouverture publique. La confidentialité reste une page provisoire tant que ces informations manquent.
