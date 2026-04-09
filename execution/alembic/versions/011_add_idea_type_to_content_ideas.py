"""Add idea_type column to content_ideas.

Distinguishes rows created by the Viral Content agent (ContentGenerator,
"content") from rows created by the Creative agent (IdeaGenerator,
"creative"). Existing rows are backfilled to "content" via the server
default so the ContentGenerator keeps seeing the same data.

Revision ID: 011
Revises: 010
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "content_ideas",
        sa.Column(
            "idea_type",
            sa.String(length=20),
            nullable=False,
            server_default="content",
        ),
    )
    op.create_index(
        "ix_content_ideas_idea_type",
        "content_ideas",
        ["idea_type"],
    )


def downgrade():
    op.drop_index("ix_content_ideas_idea_type", table_name="content_ideas")
    op.drop_column("content_ideas", "idea_type")
