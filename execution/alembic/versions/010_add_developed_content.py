"""Add developed_content column to content_ideas.

Revision ID: 010
Revises: 009
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("content_ideas", sa.Column("developed_content", sa.Text, nullable=True))


def downgrade():
    op.drop_column("content_ideas", "developed_content")
