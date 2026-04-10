"""Add indexes on foreign-key columns used in WHERE/JOIN clauses.

Every workspace-scoped query filters by workspace_id and/or user_id,
but none of these FK columns had database indexes, causing full table
scans.  This migration adds individual and composite indexes to all
frequently-filtered columns.

Revision ID: 015
Revises: 014
Create Date: 2026-04-10
"""

from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    # workspace_members — queried on EVERY request via resolve_workspace
    op.create_index("ix_workspace_members_workspace_id", "workspace_members", ["workspace_id"])
    op.create_index("ix_workspace_members_user_id", "workspace_members", ["user_id"])
    op.create_index("ix_workspace_members_ws_user", "workspace_members", ["workspace_id", "user_id"])

    # analyses
    op.create_index("ix_analyses_workspace_id", "analyses", ["workspace_id"])
    op.create_index("ix_analyses_user_id", "analyses", ["user_id"])

    # transcriptions
    op.create_index("ix_transcriptions_workspace_id", "transcriptions", ["workspace_id"])
    op.create_index("ix_transcriptions_user_id", "transcriptions", ["user_id"])

    # tones
    op.create_index("ix_tones_workspace_id", "tones", ["workspace_id"])
    op.create_index("ix_tones_user_id", "tones", ["user_id"])

    # projects
    op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"])
    op.create_index("ix_projects_user_id", "projects", ["user_id"])

    # tasks
    op.create_index("ix_tasks_workspace_id", "tasks", ["workspace_id"])
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])

    # calendar_notes
    op.create_index("ix_calendar_notes_workspace_id", "calendar_notes", ["workspace_id"])
    op.create_index("ix_calendar_notes_user_id", "calendar_notes", ["user_id"])
    op.create_index("ix_calendar_notes_project_id", "calendar_notes", ["project_id"])

    # knowledge_bases
    op.create_index("ix_knowledge_bases_workspace_id", "knowledge_bases", ["workspace_id"])
    op.create_index("ix_knowledge_bases_user_id", "knowledge_bases", ["user_id"])

    # content_ideas
    op.create_index("ix_content_ideas_workspace_id", "content_ideas", ["workspace_id"])
    op.create_index("ix_content_ideas_user_id", "content_ideas", ["user_id"])

    # note_folders
    op.create_index("ix_note_folders_workspace_id", "note_folders", ["workspace_id"])
    op.create_index("ix_note_folders_user_id", "note_folders", ["user_id"])

    # notes
    op.create_index("ix_notes_workspace_id", "notes", ["workspace_id"])
    op.create_index("ix_notes_user_id", "notes", ["user_id"])
    op.create_index("ix_notes_folder_id", "notes", ["folder_id"])

    # chat_sessions
    op.create_index("ix_chat_sessions_workspace_id", "chat_sessions", ["workspace_id"])
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])

    # chat_messages
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])


def downgrade():
    op.drop_index("ix_chat_messages_session_id")
    op.drop_index("ix_chat_sessions_user_id")
    op.drop_index("ix_chat_sessions_workspace_id")
    op.drop_index("ix_notes_folder_id")
    op.drop_index("ix_notes_user_id")
    op.drop_index("ix_notes_workspace_id")
    op.drop_index("ix_note_folders_user_id")
    op.drop_index("ix_note_folders_workspace_id")
    op.drop_index("ix_content_ideas_user_id")
    op.drop_index("ix_content_ideas_workspace_id")
    op.drop_index("ix_knowledge_bases_user_id")
    op.drop_index("ix_knowledge_bases_workspace_id")
    op.drop_index("ix_calendar_notes_project_id")
    op.drop_index("ix_calendar_notes_user_id")
    op.drop_index("ix_calendar_notes_workspace_id")
    op.drop_index("ix_tasks_project_id")
    op.drop_index("ix_tasks_user_id")
    op.drop_index("ix_tasks_workspace_id")
    op.drop_index("ix_projects_user_id")
    op.drop_index("ix_projects_workspace_id")
    op.drop_index("ix_tones_user_id")
    op.drop_index("ix_tones_workspace_id")
    op.drop_index("ix_transcriptions_user_id")
    op.drop_index("ix_transcriptions_workspace_id")
    op.drop_index("ix_analyses_user_id")
    op.drop_index("ix_analyses_workspace_id")
    op.drop_index("ix_workspace_members_ws_user")
    op.drop_index("ix_workspace_members_user_id")
    op.drop_index("ix_workspace_members_workspace_id")
