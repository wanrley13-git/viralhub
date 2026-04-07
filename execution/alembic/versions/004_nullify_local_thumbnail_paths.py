"""Nullify thumbnail_url fields that point to local filesystem paths.

These paths (/thumbnails/...) referenced files on the local filesystem
that no longer exist after migrating to Railway. Setting them to NULL
makes the frontend show a placeholder icon instead of broken images.

Revision ID: 004
Revises: 003
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None

TABLES = ["analyses", "transcriptions", "tones", "tasks"]


def upgrade():
    for table in TABLES:
        op.execute(
            sa.text(
                f"UPDATE {table} SET thumbnail_url = NULL "
                f"WHERE thumbnail_url LIKE '/thumbnails/%'"
            )
        )


def downgrade():
    # Cannot restore original paths — files no longer exist
    pass
