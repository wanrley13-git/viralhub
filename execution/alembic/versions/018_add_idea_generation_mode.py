"""Add generation_mode column to content_ideas.

Adds a generation_mode discriminator ('ideias' | 'roteirista' | 'cinema')
to content_ideas so the /develop endpoint can pick the correct Gemini
directive when the user selects an idea from the library weeks after it
was generated (the library is cross-mode by design, and the localStorage
toggle reflects current intent — not the origin of an old idea).

Backfill strategy (why 'ideias' is the default less prejudicial):
  - server_default = 'ideias' covers all existing rows on column add.
  - A targeted UPDATE promotes rows to 'roteirista' when there's a strong
    signal they went through /develop: status IN ('developing','developed')
    OR developed_content IS NOT NULL. The "Roteirizar" button is only
    exposed in Roteirist mode (see IdeaGenerator.jsx), so any developed
    idea is almost certainly roteirista.
  - Rows without that signal stay as 'ideias'. This is safe because
    /develop falls back to the Roteirist directive when generation_mode
    is anything other than 'cinema' (see routers/ideas.py::develop for
    the explicit compatibility comment). So a pre-018 roteirist idea
    that never got developed and now gets developed post-018 still
    renders identically to how it would have before this migration.
    Only 'cinema' activates the new directive.

ContentGenerator rows (idea_type='content') are unaffected in practice:
their generation_mode is set to 'ideias' but /develop is never called
on them — the column is neutral for that code path.

The column carries a CHECK constraint so a typo at the API layer fails
fast at the DB instead of silently producing an unreachable-directive
idea.

Revision ID: 018
Revises: 017
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa


revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Add the column with a server_default so existing rows backfill
    #    to 'ideias' automatically on the ALTER TABLE.
    op.add_column(
        "content_ideas",
        sa.Column(
            "generation_mode",
            sa.String(length=20),
            nullable=False,
            server_default="ideias",
        ),
    )

    # 2) Intelligent backfill: promote developed/developing rows to
    #    'roteirista'. The Roteirizar button only exists in Roteirist
    #    mode, so any idea with developed_content or a develop-stage
    #    status was almost certainly generated via that directive.
    op.execute(
        """
        UPDATE content_ideas
        SET generation_mode = 'roteirista'
        WHERE idea_type = 'creative'
          AND (
            status IN ('developing', 'developed')
            OR developed_content IS NOT NULL
          )
        """
    )

    # 3) Lock valid values at the DB layer so bad API input can't slip
    #    through and produce an idea that no directive can handle.
    op.create_check_constraint(
        "ck_content_ideas_generation_mode",
        "content_ideas",
        "generation_mode IN ('ideias', 'roteirista', 'cinema')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_content_ideas_generation_mode",
        "content_ideas",
        type_="check",
    )
    op.drop_column("content_ideas", "generation_mode")
