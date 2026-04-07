"""
Migrate data from SQLite (read-only) to Supabase Postgres.
Inserts in FK order, preserves original IDs, resets Postgres sequences.
Does NOT modify any existing project files.
"""

import asyncio
import json
import os
import sqlite3
from datetime import datetime

import asyncpg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SQLITE_PATH = os.path.join(os.path.dirname(__file__), "viral_hub.db")
PG_URL = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

# FK-safe insertion order
TABLES_ORDERED = [
    "users",
    "analyses",
    "transcriptions",
    "tones",
    "projects",
    "tasks",
    "knowledge_bases",
    "chat_sessions",
    "chat_messages",
]


def read_sqlite():
    """Read all tables from SQLite in read-only mode."""
    conn = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    data = {}
    for table in TABLES_ORDERED:
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
        data[table] = [dict(row) for row in rows]
    conn.close()
    return data


async def insert_into_postgres(data):
    """Insert data into Postgres, preserving IDs and resetting sequences."""
    conn = await asyncpg.connect(PG_URL)

    summary = {}

    for table in TABLES_ORDERED:
        rows = data[table]
        if not rows:
            summary[table] = 0
            continue

        columns = list(rows[0].keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(columns)))
        col_names = ", ".join(f'"{c}"' for c in columns)
        insert_sql = f'INSERT INTO {table} ({col_names}) VALUES ({placeholders})'

        inserted = 0
        for row in rows:
            values = []
            for col in columns:
                val = row[col]
                # Convert datetime strings to Python datetime
                if col == "created_at" and val is not None:
                    if isinstance(val, str):
                        # Try common formats
                        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
                            try:
                                val = datetime.strptime(val, fmt)
                                break
                            except ValueError:
                                continue
                values.append(val)

            await conn.execute(insert_sql, *values)
            inserted += 1

        summary[table] = inserted

        # Reset the sequence so next INSERT gets an ID after the max
        max_id = await conn.fetchval(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
        seq_name = f"{table}_id_seq"
        await conn.execute(f"SELECT setval('{seq_name}', {max_id})")

    await conn.close()
    return summary


async def validate(sqlite_data):
    """Compare record counts between SQLite and Postgres."""
    conn = await asyncpg.connect(PG_URL)

    print("\n=== Validação: SQLite vs Postgres ===")
    all_ok = True
    for table in TABLES_ORDERED:
        sqlite_count = len(sqlite_data[table])
        pg_count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
        match = "OK" if sqlite_count == pg_count else "MISMATCH"
        if match != "OK":
            all_ok = False
        print(f"  {table:20s}  SQLite={sqlite_count:4d}  Postgres={pg_count:4d}  [{match}]")

    await conn.close()
    print(f"\nResultado: {'TODOS OK' if all_ok else 'FALHA'}")
    return all_ok


async def main():
    # 1. Read from SQLite
    print("Lendo dados do SQLite (read-only)...")
    data = read_sqlite()
    for table in TABLES_ORDERED:
        print(f"  {table}: {len(data[table])} registros")

    # 2. Check Postgres tables are empty before inserting
    conn = await asyncpg.connect(PG_URL)
    for table in TABLES_ORDERED:
        count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
        if count > 0:
            print(f"\n  ERRO: tabela '{table}' já contém {count} registros no Postgres.")
            print("  Abortando para evitar duplicidade.")
            print("  Para re-rodar, limpe as tabelas primeiro.")
            await conn.close()
            return
    await conn.close()

    # 3. Insert into Postgres
    print("\nInserindo no Postgres (ordem de FK)...")
    summary = await insert_into_postgres(data)
    for table, count in summary.items():
        print(f"  {table}: {count} inseridos")

    # 4. Validate
    await validate(data)


if __name__ == "__main__":
    asyncio.run(main())
