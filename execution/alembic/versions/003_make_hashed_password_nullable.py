"""Make hashed_password nullable for Supabase Auth users.

Revision ID: 003
Revises: 002
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("profiles", "hashed_password", existing_type=sa.String, nullable=True)


def downgrade():
    op.alter_column("profiles", "hashed_password", existing_type=sa.String, nullable=False)
