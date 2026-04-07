"""Initial schema — all 9 tables from SQLAlchemy models.

Revision ID: 001
Revises:
Create Date: 2026-04-06
"""

from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # 1. users (no FK dependencies)
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.String, unique=True, index=True, nullable=False),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime),
    )

    # 2. analyses (FK → users)
    op.create_table(
        "analyses",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("title", sa.String),
        sa.Column("report_md", sa.Text),
        sa.Column("thumbnail_url", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_analyses_id", "analyses", ["id"])

    # 3. transcriptions (FK → users)
    op.create_table(
        "transcriptions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("title", sa.String),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("transcription_md", sa.Text),
        sa.Column("thumbnail_url", sa.String, nullable=True),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_transcriptions_id", "transcriptions", ["id"])

    # 4. tones (FK → users)
    op.create_table(
        "tones",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("name", sa.String),
        sa.Column("tone_md", sa.Text, nullable=True),
        sa.Column("thumbnail_url", sa.String, nullable=True),
        sa.Column("video_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_tones_id", "tones", ["id"])

    # 5. projects (FK → users)
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("name", sa.String),
        sa.Column("columns_json", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_projects_id", "projects", ["id"])

    # 6. tasks (FK → users, FK → projects)
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("title", sa.String),
        sa.Column("content_md", sa.Text),
        sa.Column("tag", sa.String),
        sa.Column("status", sa.String, default="todo"),
        sa.Column("thumbnail_url", sa.String, nullable=True),
        sa.Column("card_color", sa.String, default="#1c1c24"),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_tasks_id", "tasks", ["id"])

    # 7. knowledge_bases (FK → users)
    op.create_table(
        "knowledge_bases",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("name", sa.String),
        sa.Column("selected_ids", sa.Text, default="[]"),
        sa.Column("compiled_md", sa.Text, nullable=True),
        sa.Column("is_stale", sa.Integer, default=1),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_knowledge_bases_id", "knowledge_bases", ["id"])

    # 8. chat_sessions (FK → users)
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id")),
        sa.Column("title", sa.String),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_chat_sessions_id", "chat_sessions", ["id"])

    # 9. chat_messages (FK → chat_sessions)
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer, sa.ForeignKey("chat_sessions.id")),
        sa.Column("role", sa.String),
        sa.Column("content", sa.Text),
        sa.Column("has_suggestion", sa.Integer, default=0),
        sa.Column("suggestion_json", sa.Text, nullable=True),
        sa.Column("task_added", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime),
    )
    op.create_index("ix_chat_messages_id", "chat_messages", ["id"])


def downgrade():
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("knowledge_bases")
    op.drop_table("tasks")
    op.drop_table("projects")
    op.drop_table("tones")
    op.drop_table("transcriptions")
    op.drop_table("analyses")
    op.drop_table("users")
