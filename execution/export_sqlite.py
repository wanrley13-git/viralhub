"""
Export all SQLite tables to JSON files for backup/migration.
Opens the database in READ-ONLY mode — no writes are performed.
"""

import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "viral_hub.db")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "backups", "json_export")

TABLES = [
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


def export():
    # Open in read-only mode (URI)
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    summary = {}

    for table in TABLES:
        cursor = conn.execute(f"SELECT * FROM {table}")  # noqa: S608
        rows = [dict(row) for row in cursor.fetchall()]
        summary[table] = len(rows)

        output_path = os.path.join(OUTPUT_DIR, f"{table}.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2, default=str)

    conn.close()

    print("=== Export concluído ===")
    for table, count in summary.items():
        print(f"  {table}: {count} registros")
    print(f"\nArquivos salvos em: {OUTPUT_DIR}")


if __name__ == "__main__":
    export()
