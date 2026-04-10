"""Add workspaces and workspace_members tables.

Creates the multi-workspace infrastructure:
1. ``workspaces`` table — each user gets an auto-created personal workspace.
2. ``workspace_members`` — join table with role + per-module permissions.
3. ``workspace_id`` nullable FK on the 9 content tables so every row can
   be scoped to a workspace.

The data migration backfills:
- One personal workspace per existing profile.
- An "owner" membership row for each.
- ``workspace_id`` on every existing row in all 9 tables.

After backfill the FK constraints are added.

Revision ID: 012
Revises: 011
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

DEFAULT_PERMISSIONS = (
    '{"analyses":true,"transcriptions":true,"content":true,"ideas":true,'
    '"kanban":true,"notes":true,"calendar":true,"knowledge":true,"tones":true}'
)

# Tables that receive a workspace_id column.
_CONTENT_TABLES = [
    "analyses",
    "transcriptions",
    "tones",
    "projects",
    "tasks",
    "calendar_notes",
    "knowledge_bases",
    "content_ideas",
    "chat_sessions",
]


def upgrade():
    # ── 1. Create workspaces table ──────────────────────────────────
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String, nullable=False, server_default="Meu Workspace"),
        sa.Column("owner_id", sa.Integer, sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("is_personal", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # ── 2. Create workspace_members table ───────────────────────────
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("workspace_id", sa.Integer, sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("role", sa.String, nullable=False, server_default="member"),
        sa.Column("permissions", sa.Text, nullable=False, server_default=DEFAULT_PERMISSIONS),
        sa.Column("invited_by", sa.Integer, sa.ForeignKey("profiles.id"), nullable=True),
        sa.Column("joined_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # ── 3. Add workspace_id (nullable, no FK yet) to content tables ─
    for table in _CONTENT_TABLES:
        op.add_column(table, sa.Column("workspace_id", sa.Integer, nullable=True))

    # ── 4. Data migration — backfill personal workspaces ────────────
    conn = op.get_bind()

    # 4a. Create one personal workspace per user
    conn.execute(sa.text(
        "INSERT INTO workspaces (name, owner_id, is_personal, created_at) "
        "SELECT 'Meu Workspace', id, 1, CURRENT_TIMESTAMP FROM profiles"
    ))

    # 4b. Create owner membership for each personal workspace
    conn.execute(sa.text(
        "INSERT INTO workspace_members (workspace_id, user_id, role, permissions, joined_at) "
        "SELECT w.id, w.owner_id, 'owner', :perms, CURRENT_TIMESTAMP "
        "FROM workspaces w WHERE w.is_personal = 1"
    ), {"perms": DEFAULT_PERMISSIONS})

    # 4c. Backfill workspace_id on every existing row
    for table in _CONTENT_TABLES:
        conn.execute(sa.text(
            f"UPDATE {table} SET workspace_id = ("
            f"  SELECT w.id FROM workspaces w"
            f"  WHERE w.owner_id = {table}.user_id AND w.is_personal = 1"
            f")"
        ))

    # ── 5. Now add FK constraints ───────────────────────────────────
    for table in _CONTENT_TABLES:
        op.create_foreign_key(
            f"fk_{table}_workspace_id",
            table,
            "workspaces",
            ["workspace_id"],
            ["id"],
        )


def downgrade():
    # Drop FK constraints first
    for table in _CONTENT_TABLES:
        op.drop_constraint(f"fk_{table}_workspace_id", table, type_="foreignkey")

    # Drop workspace_id columns
    for table in _CONTENT_TABLES:
        op.drop_column(table, "workspace_id")

    # Drop tables (members first due to FK)
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
