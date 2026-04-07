import os
import logging
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logger = logging.getLogger("database")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Fallback para SQLite local (rollback)
    DB_PATH = os.path.join(os.path.dirname(__file__), "viral_hub.db")
    DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

_is_postgres = DATABASE_URL.startswith("postgresql")

# Log de diagnóstico (sem expor senha)
if _is_postgres:
    _safe_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "???"
    logger.info(f"[database] Connecting to PostgreSQL: ...@{_safe_url}")
else:
    logger.info("[database] Using SQLite (local)")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    **({
        "pool_size": 5,
        "max_overflow": 10,
        "pool_timeout": 30,
        "pool_recycle": 1800,
    } if _is_postgres else {}),
)

# SQLite precisa de PRAGMA foreign_keys; Postgres não
if not _is_postgres:
    from sqlalchemy import event
    def _enable_fk(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    event.listen(engine.sync_engine, "connect", _enable_fk)

AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Migração SQLite legada (ignorada no Postgres — Alembic gerencia o schema)
    if not _is_postgres:
        async with engine.begin() as conn:
            try:
                await conn.execute(
                    __import__('sqlalchemy').text(
                        "ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id)"
                    )
                )
                print("[migration] Coluna project_id adicionada à tabela tasks")
            except Exception:
                pass
