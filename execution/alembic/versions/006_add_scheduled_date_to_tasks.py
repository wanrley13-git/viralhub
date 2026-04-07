"""Add scheduled_date column to tasks for calendar view.

Revision ID: 006
Revises: 005
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("scheduled_date", sa.String, nullable=True))


def downgrade():
    op.drop_column("tasks", "scheduled_date")
