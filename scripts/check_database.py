"""Verify the configured database and install the app's initial tables."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.main import Base, engine
from sqlalchemy import inspect

try:
    with engine.connect() as connection:
        connection.exec_driver_sql('SELECT 1')
    Base.metadata.create_all(engine)
    names = inspect(engine).get_table_names()
    required = {'users', 'sessions', 'jobs'}
    if not required.issubset(names):
        raise RuntimeError('Required tables were not found')
    print('Neon/PostgreSQL connection verified; users, sessions, jobs tables present.')
except Exception as exc:
    # Do not include the connection string or credentials in diagnostics.
    print('Database verification failed:', type(exc).__name__)
    raise SystemExit(1)
