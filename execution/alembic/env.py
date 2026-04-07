"""
Alembic async env.py
Reads DATABASE_URL from env and runs migrations against Postgres.
Retries connection on transient network errors (e.g. Railway cold start).
"""

import asyncio
import os
import sys
import time

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

# Add execution/ to path so we can import models
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# Import Base and all models so metadata is populated
from database import Base  # noqa: E402
import models  # noqa: E402, F401

target_metadata = Base.metadata

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set in .env")


def run_migrations_offline():
    """Run migrations in 'offline' mode — emits SQL to stdout."""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    """Run migrations in 'online' mode with retry on connection failure."""
    max_retries = 5
    retry_delay = 3

    for attempt in range(1, max_retries + 1):
        try:
            connectable = create_async_engine(
                DATABASE_URL,
                poolclass=pool.NullPool,
                connect_args={"server_settings": {"tcp_keepalives_idle": "30"}},
            )
            async with connectable.connect() as connection:
                await connection.run_sync(do_run_migrations)
            await connectable.dispose()
            return
        except Exception as e:
            if attempt == max_retries:
                print(f"[alembic] Failed to connect after {max_retries} attempts: {e}")
                raise
            print(f"[alembic] Connection attempt {attempt}/{max_retries} failed: {e}")
            print(f"[alembic] Retrying in {retry_delay}s...")
            time.sleep(retry_delay)


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
