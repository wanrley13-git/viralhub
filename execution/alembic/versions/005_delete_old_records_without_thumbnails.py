"""Delete old analyses, transcriptions and tones that have no thumbnail.

These are legacy records from before Supabase Storage migration.
Their thumbnails pointed to local filesystem paths that no longer exist.

Revision ID: 005
Revises: 004
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade():
    # Delete chat_messages from sessions owned by users with old data
    # (not needed — chat_messages are independent of analyses)

    # Delete in order: analyses, transcriptions, tones where thumbnail is NULL
    for table in ["analyses", "transcriptions", "tones"]:
        op.execute(
            sa.text(f"DELETE FROM {table} WHERE thumbnail_url IS NULL")
        )


def downgrade():
    # Cannot restore deleted records
    pass
