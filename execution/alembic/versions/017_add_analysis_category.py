"""Add category column to analyses + seed cinema permission.

Adds a category discriminator ('short' | 'cinema') to the analyses
table so the Analyzer pipeline can serve two user-facing entry points
(Videos Curtos and Cinema) from a single code path. Existing rows are
backfilled to 'short' to preserve the current library's contents.

Also seeds "cinema": true in workspace_members.permissions for every
existing membership so users who had full default permissions keep
full access when the new module lights up.

The column carries a CHECK constraint so a typo like ?category=shrot
fails fast at the DB layer instead of silently producing an Analysis
that never matches any library filter.

Both steps are dialect-aware: the JSON backfill reads/writes the
permissions text column with Python, so it works identically on
SQLite (local dev) and PostgreSQL (Railway/Supabase).

Revision ID: 017
Revises: 016
Create Date: 2026-04-18
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def _backfill_permissions(connection, add_cinema: bool) -> None:
    """Walk every workspace_members.permissions JSON blob and either
    add or remove the "cinema" key. Dialect-agnostic — no jsonb_set,
    no SQLite TEXT surgery — just plain Python round-tripping."""
    rows = connection.execute(
        sa.text("SELECT id, permissions FROM workspace_members")
    ).fetchall()
    for row in rows:
        raw = row.permissions or "{}"
        try:
            data = json.loads(raw)
        except Exception:
            data = {}
        changed = False
        if add_cinema:
            if "cinema" not in data:
                data["cinema"] = True
                changed = True
        else:
            if "cinema" in data:
                del data["cinema"]
                changed = True
        if changed:
            connection.execute(
                sa.text(
                    "UPDATE workspace_members SET permissions = :p WHERE id = :id"
                ),
                {"p": json.dumps(data), "id": row.id},
            )


def upgrade() -> None:
    # 1) Add the discriminator column. server_default='short' makes
    #    the NOT NULL safe even with existing rows — they backfill
    #    automatically to the legacy value.
    op.add_column(
        "analyses",
        sa.Column(
            "category",
            sa.String(length=20),
            nullable=False,
            server_default="short",
        ),
    )

    # 2) Enforce the enum at the DB layer. batch_alter_table makes
    #    this work on SQLite (which can't ALTER ADD CONSTRAINT) by
    #    transparently recreating the table; on PostgreSQL it falls
    #    through to a plain ADD CONSTRAINT.
    with op.batch_alter_table("analyses") as batch_op:
        batch_op.create_check_constraint(
            "ck_analyses_category",
            "category IN ('short', 'cinema')",
        )

    # 3) Seed "cinema": true for every existing workspace membership.
    _backfill_permissions(op.get_bind(), add_cinema=True)


def downgrade() -> None:
    # Reverse order: strip cinema from permissions, drop the CHECK,
    # then drop the column. Every step is destructive in the sense
    # that data added under category='cinema' becomes meaningless,
    # but the schema returns to exactly what migration 016 left.
    _backfill_permissions(op.get_bind(), add_cinema=False)

    with op.batch_alter_table("analyses") as batch_op:
        batch_op.drop_constraint("ck_analyses_category", type_="check")

    op.drop_column("analyses", "category")
