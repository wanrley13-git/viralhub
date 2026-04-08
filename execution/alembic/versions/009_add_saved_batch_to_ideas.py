"""Add is_saved, is_dismissed, batch_id to content_ideas.

Revision ID: 009
Revises: 008
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("content_ideas", sa.Column("is_saved", sa.Integer, server_default="0"))
    op.add_column("content_ideas", sa.Column("is_dismissed", sa.Integer, server_default="0"))
    op.add_column("content_ideas", sa.Column("batch_id", sa.String, nullable=True))
    op.create_index("ix_content_ideas_batch_id", "content_ideas", ["batch_id"])


def downgrade():
    op.drop_index("ix_content_ideas_batch_id", table_name="content_ideas")
    op.drop_column("content_ideas", "batch_id")
    op.drop_column("content_ideas", "is_dismissed")
    op.drop_column("content_ideas", "is_saved")
