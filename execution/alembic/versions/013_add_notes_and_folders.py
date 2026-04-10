"""Add note_folders and notes tables.

Creates the backend-backed Notes system:
1. ``note_folders`` — hierarchical folders with icons and ordering.
2. ``notes`` — markdown notes scoped to a folder and workspace.

Revision ID: 013
Revises: 012
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "note_folders",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("workspace_id", sa.Integer, sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("name", sa.String, nullable=False, server_default="Nova Pasta"),
        sa.Column("icon", sa.String, nullable=False, server_default="folder"),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("note_folders.id"), nullable=True),
        sa.Column("order_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "notes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("workspace_id", sa.Integer, sa.ForeignKey("workspaces.id"), nullable=True),
        sa.Column("folder_id", sa.Integer, sa.ForeignKey("note_folders.id"), nullable=True),
        sa.Column("title", sa.String, nullable=False, server_default="Sem título"),
        sa.Column("content_md", sa.Text, nullable=False, server_default=""),
        sa.Column("order_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade():
    op.drop_table("notes")
    op.drop_table("note_folders")
