"""Rename users → profiles, add supabase_id column.

Revision ID: 002
Revises: 001
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Rename table (preserves data and PKs)
    op.rename_table("users", "profiles")

    # 2. Add supabase_id column (nullable for now)
    op.add_column("profiles", sa.Column("supabase_id", sa.String, nullable=True))
    op.create_index("ix_profiles_supabase_id", "profiles", ["supabase_id"], unique=True)

    # 3. Update foreign keys in all child tables
    #    Drop old FK → create new FK pointing to profiles.id
    for table in [
        "analyses",
        "transcriptions",
        "tones",
        "projects",
        "tasks",
        "knowledge_bases",
        "chat_sessions",
    ]:
        # Drop old FK constraint (naming convention: {table}_user_id_fkey)
        op.drop_constraint(f"{table}_user_id_fkey", table, type_="foreignkey")
        # Create new FK pointing to profiles
        op.create_foreign_key(
            f"{table}_user_id_fkey", table, "profiles", ["user_id"], ["id"]
        )


def downgrade():
    # Reverse FK changes
    for table in [
        "analyses",
        "transcriptions",
        "tones",
        "projects",
        "tasks",
        "knowledge_bases",
        "chat_sessions",
    ]:
        op.drop_constraint(f"{table}_user_id_fkey", table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_user_id_fkey", table, "users", ["user_id"], ["id"]
        )

    op.drop_index("ix_profiles_supabase_id", table_name="profiles")
    op.drop_column("profiles", "supabase_id")
    op.rename_table("profiles", "users")
