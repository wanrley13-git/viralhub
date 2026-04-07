"""Add content_ideas table.

Revision ID: 008
Revises: 007
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "content_ideas",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("profiles.id")),
        sa.Column("title", sa.String),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("prompt_used", sa.Text, nullable=True),
        sa.Column("tone_id", sa.Integer, nullable=True),
        sa.Column("base_id", sa.Integer, nullable=True),
        sa.Column("status", sa.String, default="idea"),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_content_ideas_id", "content_ideas", ["id"])


def downgrade():
    op.drop_table("content_ideas")
