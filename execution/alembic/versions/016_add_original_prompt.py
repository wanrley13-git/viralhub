"""Add original_prompt column to content_ideas.

Stores the raw user prompt so that develop/roteirizar endpoints can
propagate duration and scene constraints from the original request.

Revision ID: 016
Revises: 015
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("content_ideas", sa.Column("original_prompt", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("content_ideas", "original_prompt")
