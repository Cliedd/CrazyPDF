FROM node:24-bookworm-slim AS frontend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-bs4 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY frontend/package.json frontend/package.json
COPY gateway/package.json gateway/package.json
RUN npm ci
COPY frontend frontend
COPY gateway gateway
COPY scripts/prepare_frontend.py scripts/prepare_frontend.py
COPY design design
RUN npm run build

FROM python:3.11-slim-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-impress fonts-dejavu fonts-liberation fontconfig libglib2.0-0 libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend /app/node_modules node_modules
COPY --from=frontend /app/gateway/dist gateway/dist
COPY --from=frontend /app/frontend/dist frontend/dist
COPY backend backend
COPY scripts/download_models.py scripts/download_models.py
RUN python scripts/download_models.py
COPY scripts/start.sh scripts/start.sh
RUN useradd --create-home --uid 10001 docuvisa && mkdir -p /var/docuvisa/files && chown -R docuvisa:docuvisa /app /var/docuvisa
USER docuvisa
ENV PORT=10000 STORAGE_DIR=/var/docuvisa/files PYTHON_API_URL=http://127.0.0.1:8000 COOKIE_SECURE=true NODE_ENV=production OMP_NUM_THREADS=1
EXPOSE 10000
CMD ["bash", "scripts/start.sh"]
