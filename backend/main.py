import asyncio
import hashlib
import hmac
import io
import json
import logging
import os
import secrets
import time
import uuid
import zipfile
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlencode
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env', override=False)

import httpx
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse, JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, String, Text, Integer, Float, ForeignKey, LargeBinary, select, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from backend.presets import PRESETS
from backend import processing

logging.basicConfig(level=logging.INFO)
log = logging.getLogger('docuvisa')
STORAGE = Path(os.getenv('STORAGE_DIR', './data/files')).resolve()
STORAGE.mkdir(parents=True, exist_ok=True)
db_url = os.getenv('DATABASE_URL', 'sqlite:///./data/docuvisa.db')
if os.getenv('RENDER') == 'true' and not db_url.startswith(('postgres://', 'postgresql://', 'postgresql+psycopg://')):
    raise RuntimeError('DATABASE_URL PostgreSQL est requis sur Render pour conserver les comptes et les sessions.')
if db_url.startswith(('postgres://', 'postgresql://')):
    db_url = db_url.replace('postgres://', 'postgresql+psycopg://', 1).replace('postgresql://', 'postgresql+psycopg://', 1)
engine = create_engine(db_url, connect_args={'check_same_thread': False} if db_url.startswith('sqlite') else {}, pool_pre_ping=True)
log.info('Database backend: %s', engine.dialect.name)
Session = sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password: Mapped[str] = mapped_column(Text)
    created: Mapped[float] = mapped_column(Float, default=time.time)

class LoginSession(Base):
    __tablename__ = 'sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    expires: Mapped[float] = mapped_column(Float)

class Job(Base):
    __tablename__ = 'jobs'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    mode: Mapped[str] = mapped_column(String(30))
    filename: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(Text)
    output: Mapped[str] = mapped_column(Text)
    options: Mapped[str] = mapped_column(Text, default='{}')
    metadata_json: Mapped[str] = mapped_column(Text, default='{}')
    status: Mapped[str] = mapped_column(String(20), default='queued', index=True)
    error: Mapped[str] = mapped_column(Text, default='')
    size: Mapped[int] = mapped_column(Integer, default=0)
    created: Mapped[float] = mapped_column(Float, default=time.time, index=True)

class ArtifactChunk(Base):
    __tablename__ = 'artifact_chunks'
    job_id: Mapped[str] = mapped_column(ForeignKey('jobs.id'), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[bytes] = mapped_column(LargeBinary)

def archive_file(session, job_id, kind, path):
    # Bounded chunks keep archives durable even on Render's ephemeral free disk.
    with Path(path).open('rb') as source:
        position = 0
        while content := source.read(1024 * 1024):
            session.merge(ArtifactChunk(job_id=job_id, kind=kind, position=position, content=content))
            position += 1

def restore_file(job, kind):
    path = Path(job.source if kind == 'source' else job.output)
    if path.is_file():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.' + uuid.uuid4().hex + '.partial')
    count = 0
    try:
        with Session() as session, temporary.open('wb') as target:
            statement = select(ArtifactChunk.content).where(ArtifactChunk.job_id == job.id, ArtifactChunk.kind == kind).order_by(ArtifactChunk.position).execution_options(yield_per=1)
            for content in session.scalars(statement):
                target.write(content)
                count += 1
        if not count:
            raise ValueError('Archive introuvable dans la base de données.')
        temporary.replace(path)
        return path
    finally:
        temporary.unlink(missing_ok=True)

pool = ThreadPoolExecutor(max_workers=int(os.getenv('WORKER_COUNT', '1')))
inflight = set()

def work(job_id):
    try:
        with Session() as session:
            job = session.get(Job, job_id)
            if not job or job.status != 'queued':
                return
            job.status = 'processing'
            session.commit()
            source, output, mode, options = restore_file(job, 'source'), Path(job.output), job.mode, json.loads(job.options)
        result = processing.photo(source, output, options) if mode == 'photo' else processing.cutout(source, output, options) if mode == 'cutout' else processing.convert_isolated(source, output, mode, options)
        with Session() as session:
            job = session.get(Job, job_id)
            job.metadata_json = json.dumps(result)
            job.size = output.stat().st_size
            archive_file(session, job.id, 'output', output)
            job.status = 'completed'
            session.commit()
    except Exception as exc:
        log.exception('Processing failed: %s', job_id)
        with Session() as session:
            job = session.get(Job, job_id)
            job.status = 'failed'
            job.error = str(exc) if isinstance(exc, ValueError) else 'Le traitement a échoué. Vérifiez votre fichier puis réessayez.'
            session.commit()
    finally:
        inflight.discard(job_id)

async def scheduler():
    while True:
        try:
            await run_in_threadpool(schedule_pending_jobs)
        except Exception:
            log.exception('Job scheduler will retry after a database error')
            await asyncio.sleep(2)
        await asyncio.sleep(1)

def schedule_pending_jobs():
    with Session() as session:
        capacity = int(os.getenv('WORKER_COUNT', '1')) - len(inflight)
        if capacity > 0:
            for job in session.scalars(select(Job).where(Job.status == 'queued').order_by(Job.created).limit(capacity)):
                if job.id not in inflight:
                    inflight.add(job.id)
                    pool.submit(work, job.id)

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    # One Python service instance with a persistent disk; restart unfinished work.
    with Session() as session:
        for job in session.scalars(select(Job).where(Job.status == 'processing')):
            job.status = 'queued'
        session.commit()
    task = asyncio.create_task(scheduler())
    yield
    task.cancel()
    pool.shutdown(wait=True)

app = FastAPI(title='DocuVisa.AI', version='1.0.0', lifespan=lifespan, docs_url='/api/docs', openapi_url='/api/openapi.json')
attempts = defaultdict(deque)

@app.middleware('http')
async def guard(request: Request, call_next):
    expected = os.getenv('INTERNAL_API_TOKEN', 'local-development')
    if request.url.path != '/api/health' and not hmac.compare_digest(request.headers.get('x-internal-token', ''), expected):
        return JSONResponse({'detail': 'Accès via la passerelle requis'}, status_code=403)
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        allowed = {value.rstrip('/') for value in (os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000'), os.getenv('RENDER_EXTERNAL_URL', '')) if value}
        if origin and origin not in allowed:
            return JSONResponse({'detail': 'Origine non autorisée'}, status_code=403)
    return await call_next(request)

def limit_auth(request, email):
    # Nest is the peer for every request; a shared proxy bucket would lock out
    # every user after twenty attempts by unrelated accounts.
    peer = request.client.host if request.client else 'unknown'
    key = (peer, hashlib.sha256(email.strip().lower().encode()).hexdigest())
    now = time.monotonic()
    entries = attempts[key]
    while entries and entries[0] < now - 60:
        entries.popleft()
    if len(entries) >= 20:
        raise HTTPException(429, 'Trop de tentatives. Réessayez dans une minute.')
    entries.append(now)

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return salt + ':' + value

def issue_session(user, response):
    token = secrets.token_urlsafe(48)
    with Session() as session:
        session.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires=time.time() + 30 * 86400))
        session.commit()
    response.headers['Cache-Control'] = 'no-store, private'
    response.set_cookie('docuvisa_session', token, httponly=True, secure=os.getenv('COOKIE_SECURE', 'false') == 'true', samesite='lax', max_age=30 * 86400, path='/')

def current_user(request: Request):
    token = request.cookies.get('docuvisa_session', '')
    with Session() as session:
        login = session.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())
        if not login or login.expires < time.time():
            raise HTTPException(401, 'Connectez-vous pour utiliser votre espace gratuit.')
        user = session.get(User, login.user_id)
        if not user:
            raise HTTPException(401, 'Session invalide.')
        return user

def user_json(user):
    return {'id': user.id, 'email': user.email, 'name': user.name}

class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default='', max_length=100)

    @field_validator('email')
    @classmethod
    def validate_email(cls, value):
        value = value.strip().lower()
        if '@' not in value or '.' not in value.split('@')[-1] or any(c.isspace() for c in value):
            raise ValueError('Adresse email invalide.')
        return value

@app.get('/api/health')
def health():
    with engine.connect() as connection:
        connection.exec_driver_sql('SELECT 1')
    return {'status': 'ok', 'service': 'DocuVisa.AI'}

@app.get('/api/config')
def config():
    return {'google_enabled': bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET')), 'max_upload_mb': int(os.getenv('MAX_UPLOAD_MB', '100'))}

@app.post('/api/auth/register')
def register(data: Credentials, request: Request, response: Response):
    limit_auth(request, data.email)
    if not data.name.strip():
        raise HTTPException(422, 'Indiquez votre nom.')
    with Session() as session:
        if session.scalar(select(User).where(User.email == data.email)):
            raise HTTPException(409, 'Cette adresse possède déjà un compte.')
        user = User(id=str(uuid.uuid4()), email=data.email, name=data.name.strip(), password=hash_password(data.password))
        session.add(user)
        session.commit()
    issue_session(user, response)
    return user_json(user)

@app.post('/api/auth/login')
def login(data: Credentials, request: Request, response: Response):
    limit_auth(request, data.email)
    with Session() as session:
        user = session.scalar(select(User).where(User.email == data.email))
    salt = user.password.split(':')[0] if user and ':' in user.password else 'invalid-login-salt'
    candidate = hash_password(data.password, salt)
    if not user or not hmac.compare_digest(candidate, user.password):
        raise HTTPException(401, 'Adresse email ou mot de passe incorrect.')
    issue_session(user, response)
    return user_json(user)

@app.get('/api/auth/me')
def me(response: Response, user=Depends(current_user)):
    response.headers['Cache-Control'] = 'no-store, private'
    return user_json(user)

@app.get('/api/auth/session')
def session_status(request: Request, response: Response):
    # Missing sessions are normal on the public homepage, not a failed login.
    response.headers['Cache-Control'] = 'no-store, private'
    try:
        return {'user': user_json(current_user(request))}
    except HTTPException as error:
        if error.status_code != 401:
            raise
        return {'user': None}

class Profile(BaseModel):
    name: str = Field(min_length=1, max_length=100)

@app.patch('/api/auth/me')
def profile(data: Profile, user=Depends(current_user)):
    if not data.name.strip():
        raise HTTPException(422, 'Indiquez votre nom.')
    with Session() as session:
        stored = session.get(User, user.id)
        stored.name = data.name.strip()
        session.commit()
        return user_json(stored)

@app.post('/api/auth/logout')
def logout(request: Request, response: Response):
    with Session() as session:
        stored = session.get(LoginSession, hashlib.sha256(request.cookies.get('docuvisa_session', '').encode()).hexdigest())
        if stored:
            session.delete(stored)
            session.commit()
    response.delete_cookie('docuvisa_session', path='/')
    return {'status': 'ok'}

@app.get('/api/auth/google')
def google_start():
    if not os.getenv('GOOGLE_CLIENT_ID') or not os.getenv('GOOGLE_CLIENT_SECRET'):
        raise HTTPException(503, 'Connexion Google non configurée. Utilisez votre email.')
    state = secrets.token_urlsafe(32)
    origin = os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000')
    url = 'https://accounts.google.com/o/oauth2/v2/auth?' + urlencode({'client_id': os.environ['GOOGLE_CLIENT_ID'], 'redirect_uri': origin + '/api/auth/google/callback', 'response_type': 'code', 'scope': 'openid email profile', 'state': state})
    response = RedirectResponse(url)
    response.set_cookie('oauth_state', state, httponly=True, secure=os.getenv('COOKIE_SECURE') == 'true', samesite='lax', max_age=600)
    return response

@app.get('/api/auth/google/callback')
async def google_callback(request: Request):
    state = request.query_params.get('state', '')
    if not state or not hmac.compare_digest(state, request.cookies.get('oauth_state', '')):
        raise HTTPException(400, 'Session Google invalide.')
    if request.query_params.get('error'):
        return RedirectResponse('/?auth=cancelled')
    async with httpx.AsyncClient(timeout=20) as client:
        result = await client.post('https://oauth2.googleapis.com/token', data={'client_id': os.environ['GOOGLE_CLIENT_ID'], 'client_secret': os.environ['GOOGLE_CLIENT_SECRET'], 'code': request.query_params.get('code'), 'grant_type': 'authorization_code', 'redirect_uri': os.getenv('PUBLIC_ORIGIN', 'http://localhost:3000') + '/api/auth/google/callback'})
        if result.status_code != 200:
            raise HTTPException(401, 'Connexion Google échouée.')
        result = await client.get('https://openidconnect.googleapis.com/v1/userinfo', headers={'Authorization': 'Bearer ' + result.json()['access_token']})
        account = result.json()
        if not account.get('email_verified'):
            raise HTTPException(401, 'Adresse Google non vérifiée.')
    with Session() as session:
        user = session.scalar(select(User).where(User.email == account['email'].lower()))
        if not user:
            user = User(id=str(uuid.uuid4()), email=account['email'].lower(), name=account.get('name', 'Utilisateur'), password='google-only')
            session.add(user)
            session.commit()
    response = RedirectResponse('/documents')
    response.delete_cookie('oauth_state')
    issue_session(user, response)
    return response

@app.get('/api/presets')
def presets():
    return PRESETS

class Options(BaseModel):
    preset: str = 'campus-cm'
    zoom: float = Field(default=1, ge=1, le=3)
    rotation: float = Field(default=0, ge=-15, le=15)
    brightness: float = Field(default=0, ge=-30, le=30)
    offset_x: float = Field(default=0, ge=-1, le=1)
    offset_y: float = Field(default=0, ge=-1, le=1)
    remove_bg: bool = False
    background: str = ''
    format: str = 'JPEG'
    export_type: str = 'single'
    sheet_count: int = 4
    shadow: bool = False
    sharpness: bool = False
    exposure: bool = False

    @field_validator('background')
    @classmethod
    def valid_background(cls, value):
        if value not in ('', '#ffffff', '#FFFFFF', '#f1f5f9', '#F1F5F9', '#E0F2FE', 'transparent'):
            raise ValueError('Fond invalide.')
        return value

    @field_validator('format')
    @classmethod
    def valid_format(cls, value):
        if value not in ('JPEG', 'PNG'):
            raise ValueError('Format invalide.')
        return value

    @field_validator('export_type')
    @classmethod
    def valid_export(cls, value):
        if value not in ('single', 'sheet'):
            raise ValueError('Export invalide.')
        return value

    @field_validator('sheet_count')
    @classmethod
    def valid_count(cls, value):
        if value not in (4, 6):
            raise ValueError('Choisissez 4 ou 6 photos.')
        return value

def job_json(job):
    return {'id': job.id, 'filename': job.filename, 'mode': job.mode, 'status': job.status, 'error': job.error, 'size': job.size, 'created': job.created, 'metadata': json.loads(job.metadata_json), 'download_url': '/api/jobs/' + job.id + '/download' if job.status == 'completed' else None}

def validate_uploaded_file(source, mode, ext):
    if mode in ('photo', 'cutout'):
        processing.validate_image(source)
    elif ext == '.pdf':
        with processing.fitz.open(source) as doc:
            if doc.needs_pass or len(doc) > 200 or not len(doc):
                raise ValueError('PDF protégé, vide ou de plus de 200 pages.')
    elif ext in ('.docx', '.pptx'):
        with zipfile.ZipFile(source) as archive:
            if sum(e.file_size for e in archive.infolist()) > 500 * 1024 * 1024:
                raise ValueError('Archive bureautique décompressée trop volumineuse.')
            expected = 'word/document.xml' if ext == '.docx' else 'ppt/presentation.xml'
            if expected not in archive.namelist():
                raise ValueError('Document bureautique invalide.')

def persist_uploaded_job(job):
    with Session() as session:
        session.add(job)
        session.flush()
        archive_file(session, job.id, 'source', job.source)
        session.commit()
        return job_json(job)

@app.post('/api/jobs', status_code=202)
async def create_job(file: UploadFile = File(...), mode: str = Form(...), options: str = Form('{}'), user=Depends(current_user)):
    extensions = {'word-pdf': ['.docx', '.doc'], 'pdf-word': ['.pdf'], 'pptx-pdf': ['.pptx', '.ppt'], 'pdf-pptx': ['.pdf'], 'photo': ['.jpg', '.jpeg', '.png', '.webp'], 'cutout': ['.jpg', '.jpeg', '.png', '.webp']}
    filename = Path((file.filename or '').replace('\\', '/')).name[:200]
    ext = Path(filename).suffix.lower()
    if mode not in extensions or ext not in extensions[mode]:
        raise HTTPException(422, 'Ce format de fichier ne correspond pas à l’outil choisi.')
    try:
        opts = Options.model_validate_json(options).model_dump()
    except Exception:
        raise HTTPException(422, 'Réglages de traitement invalides.')
    if mode == 'photo' and opts['preset'] not in PRESETS:
        raise HTTPException(422, 'Démarche inconnue.')
    if mode == 'photo' and PRESETS[opts['preset']].get('no_retouch') and (opts['remove_bg'] or opts['brightness']):
        raise HTTPException(422, 'Les retouches sont interdites pour cette démarche. Désactivez le détourage et l’exposition.')
    with Session() as session:
        active = list(session.scalars(select(Job).where(Job.user_id == user.id, Job.status.in_(['queued', 'processing']))))
        if len(active) >= 20:
            raise HTTPException(429, '20 travaux sont déjà en cours. Attendez leur fin.')
    job_id = str(uuid.uuid4())
    directory = STORAGE / user.id / job_id
    directory.mkdir(parents=True)
    source = directory / ('original' + ext)
    total = 0
    max_size = int(os.getenv('MAX_UPLOAD_MB', '100')) * 1024 * 1024
    try:
        with source.open('wb') as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_size:
                    raise HTTPException(413, 'Fichier trop volumineux (100 Mo maximum).')
                target.write(chunk)
        if not total:
            raise HTTPException(422, 'Fichier vide.')
        await run_in_threadpool(validate_uploaded_file, source, mode, ext)
    except HTTPException:
        source.unlink(missing_ok=True)
        raise
    except Exception:
        source.unlink(missing_ok=True)
        raise HTTPException(422, 'Fichier invalide, protégé ou trop volumineux après décompression.')
    finally:
        await file.close()
    output_ext = '.pdf' if mode in ('word-pdf', 'pptx-pdf') or (mode == 'photo' and opts['export_type'] == 'sheet') else '.docx' if mode == 'pdf-word' else '.pptx' if mode == 'pdf-pptx' else '.png' if mode == 'cutout' or (opts['format'] == 'PNG' and not PRESETS[opts['preset']].get('max_kb')) else '.jpg'
    job = Job(id=job_id, user_id=user.id, mode=mode, filename=filename, source=str(source), output=str(directory / ('export' + output_ext)), options=json.dumps(opts))
    return await run_in_threadpool(persist_uploaded_job, job)

@app.get('/api/jobs')
def list_jobs(user=Depends(current_user)):
    with Session() as session:
        return [job_json(job) for job in session.scalars(select(Job).where(Job.user_id == user.id).order_by(Job.created.desc()))]

def owned_job(job_id, user):
    with Session() as session:
        job = session.get(Job, job_id)
        if not job or job.user_id != user.id:
            raise HTTPException(404, 'Document introuvable.')
        return job

@app.get('/api/jobs/export.zip')
def export_all(user=Depends(current_user)):
    with Session() as session:
        jobs = list(session.scalars(select(Job).where(Job.user_id == user.id, Job.status == 'completed')))
    if not jobs:
        raise HTTPException(404, 'Aucun export disponible.')
    # Disk-backed ZIP avoids loading all of a user's archive into memory.
    import tempfile
    temporary = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
    temporary.close()
    with zipfile.ZipFile(temporary.name, 'w', zipfile.ZIP_DEFLATED) as archive:
        for job in jobs:
            archive.write(restore_file(job, 'output'), Path(job.filename).stem + '-' + job.id[:8] + Path(job.output).suffix)
    from starlette.background import BackgroundTask
    return FileResponse(temporary.name, filename='DocuVisa-exports.zip', background=BackgroundTask(Path(temporary.name).unlink))

@app.get('/api/jobs/{job_id}')
def get_job(job_id: str, user=Depends(current_user)):
    return job_json(owned_job(job_id, user))

@app.get('/api/jobs/{job_id}/download')
def download_job(job_id: str, inline: bool = False, user=Depends(current_user)):
    job = owned_job(job_id, user)
    if job.status != 'completed':
        raise HTTPException(409, 'Le document n’est pas encore prêt.')
    path = restore_file(job, 'output')
    if not path.is_file():
        raise HTTPException(503, 'Le fichier archivé est temporairement inaccessible.')
    return FileResponse(path, filename=Path(job.filename).stem + '-DocuVisa' + path.suffix, content_disposition_type='inline' if inline else 'attachment')

@app.post('/api/jobs/{job_id}/retry', status_code=202)
def retry_job(job_id: str, user=Depends(current_user)):
    job = owned_job(job_id, user)
    if job.status != 'failed':
        raise HTTPException(409, 'Seuls les traitements échoués peuvent être relancés.')
    with Session() as session:
        stored = session.get(Job, job.id)
        stored.status, stored.error = 'queued', ''
        session.commit()
        return job_json(stored)
