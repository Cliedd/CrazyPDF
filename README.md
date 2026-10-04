# DocuVisa.AI

Plateforme gratuite de conversion Word/PDF/PPTX, édition de photos administratives et détourage, issue des sept écrans du projet Stitch « VisaReady Document Studio ».

## Démarrage local

Il faut Python 3.11, Node.js 24, LibreOffice Writer et Impress, Tesseract et PostgreSQL (ou SQLite en développement).

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm ci
python3 scripts/download_models.py
cp .env.example .env
npm run build
```

Renseigner `DATABASE_URL` dans `.env`, puis lancer l’API et la passerelle dans deux terminaux :

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
npm start
```

L’interface est sur http://localhost:3000. Les modèles OCR français/anglais et U²-Net sont téléchargés par le script, sans clé d’API. Les commandes de vérification sont `node scripts/check_fsd.mjs` et `.venv/bin/python -m pytest -q`.

Les parcours complets se testent sur une instance en cours d’exécution :

```bash
npm run test:gateway
TEST_ORIGIN=http://localhost:3000 npm run test:browser
TEST_ORIGIN=http://localhost:3000 .venv/bin/python scripts/test_document_api.py
TEST_ORIGIN=http://localhost:3000 node scripts/check_persistent_session.mjs
```

Le navigateur vérifie l’inscription, la session, les uploads, le détourage réel, les fonds, le transfert au studio et les téléchargements privés. Il conserve son cookie technique dans `/tmp/docuvisa-browser-state.json` pour vérifier la persistance après remplacement de l’instance. Ces essais créent des comptes de vérification et leurs exports. Ils nécessitent Chromium (chemin configurable avec `CHROMIUM_PATH`).

## Render

Le service existant est [CrazyPDF](https://crazypdf-g2bc.onrender.com), dans l’Ohio. Le dépôt requiert désormais Docker car l’application combine NestJS, FastAPI, LibreOffice Writer/Impress, les modèles OCR et U²-Net. Le Dockerfile, le point de santé `/api/health` et les réglages du forfait gratuit sont fournis. Le stockage persistant utilise la base Neon donnée à Render : les fichiers sont fractionnés en blocs de 1 Mo dans la table `artifact_chunks`. Une tâche est traitée à la fois.

Après publication du dépôt, dans les paramètres du service Render existant, sélectionner la branche publiée, choisir **Docker** comme runtime et `./Dockerfile` comme fichier. Garder la variable `DATABASE_URL` déjà configurée, puis enregistrer et déployer. L’image démarre NestJS et FastAPI ensemble. L’URL publique reste `https://crazypdf-g2bc.onrender.com`.

Sur Render, `DATABASE_URL` doit désigner PostgreSQL : le démarrage échoue si elle manque, pour éviter la perte de comptes sur SQLite éphémère. `PUBLIC_ORIGIN` doit correspondre à l’URL publique. Les imports et conversions n’effacent pas les sessions ; le cookie reste valide 30 jours sauf déconnexion ou expiration.

Le forfait gratuit de Neon a une capacité finie. Les exports restent accessibles après le redéploiement, tant que la base conserve leur contenu ; aucun archivage illimité ou sauvegarde à vie n’est fourni. Le service gratuit Render est limité en mémoire et CPU ; les conversions de gros fichiers peuvent être lentes ou dépasser ces ressources.

## Fonctionnalités et limites

- Inscription, connexion par email, profil, sessions privées et historique sans action de suppression.
- DOC/DOCX vers PDF et PPT/PPTX vers PDF par LibreOffice.
- PDF textuel vers DOCX, OCR français/anglais pour les scans, PDF vers PPTX image par page.
- Recadrage et export photo aux formats des démarches documentées en France, Allemagne, Canada et États-Unis ; détourage local U²-Net et planches PDF physiques.
- Les dimensions et poids sont appliqués automatiquement. La posture, la hauteur du visage et l’acceptation restent à contrôler auprès du portail officiel.
- Les diapositives issues d’un PDF sont des images ; le texte n’est pas éditable dans PowerPoint.
- OAuth Google est optionnel et nécessite les identifiants du propriétaire. Le compte email fonctionne sans cela.

Les sources officielles, les choix de dimensions et les licences des moteurs sont dans [docs/RESEARCH.md](docs/RESEARCH.md). PyMuPDF est distribué sous AGPL ou licence commerciale ; sa licence et celle de l’application doivent être établies avant l’exploitation publique.
