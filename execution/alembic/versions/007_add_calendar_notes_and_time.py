"""Add calendar_notes table and scheduled_time to tasks.

Revision ID: 007
Revises: 006
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade():
    # Add time field to tasks
    op.add_column("tasks", sa.Column("scheduled_time", sa.String, nullable=True))

    # Create calendar_notes table
    op.create_table(
        "calendar_notes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("profiles.id")),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("title", sa.String),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("scheduled_date", sa.String),
        sa.Column("start_time", sa.String),
        sa.Column("end_time", sa.String),
        sa.Column("color", sa.String, default="#3b82f6"),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_calendar_notes_id", "calendar_notes", ["id"])


def downgrade():
    op.drop_table("calendar_notes")
    op.drop_column("tasks", "scheduled_time")
