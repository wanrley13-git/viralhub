import datetime
from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    supabase_id = Column(String, unique=True, nullable=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    analyses = relationship("Analysis", back_populates="owner")
    transcriptions = relationship("Transcription", back_populates="owner")
    tones = relationship("Tone", back_populates="owner")
    tasks = relationship("ContentTask", back_populates="owner")
    projects = relationship("Project", back_populates="owner")
    knowledge_bases = relationship("KnowledgeBase", back_populates="owner")
    chat_sessions = relationship("ChatSession", back_populates="owner")
    workspace_memberships = relationship(
        "WorkspaceMember",
        foreign_keys="[WorkspaceMember.user_id]",
        back_populates="user",
    )

# Alias para compatibilidade — todos os routers importam "User"
User = Profile


_DEFAULT_PERMISSIONS = (
    '{"analyses":true,"transcriptions":true,"content":true,"ideas":true,'
    '"kanban":true,"notes":true,"calendar":true,"knowledge":true,"tones":true}'
)


class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Meu Workspace")
    owner_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    is_personal = Column(Integer, default=0)  # 1 = workspace pessoal (auto-criado, não deletável)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", foreign_keys=[owner_id])
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    role = Column(String, default="member")       # "owner", "member"
    permissions = Column(Text, default=_DEFAULT_PERMISSIONS)
    invited_by = Column(Integer, ForeignKey("profiles.id"), nullable=True)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("Profile", foreign_keys=[user_id], back_populates="workspace_memberships")
    inviter = relationship("Profile", foreign_keys=[invited_by])

class Analysis(Base) :
    __tablename__ = "analyses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    title = Column(String)
    report_md = Column(Text)
    thumbnail_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="analyses")
    workspace = relationship("Workspace")

class Transcription(Base):
    __tablename__ = "transcriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    title = Column(String)
    summary = Column(Text, nullable=True)
    transcription_md = Column(Text)
    thumbnail_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="transcriptions")
    workspace = relationship("Workspace")

class Tone(Base):
    __tablename__ = "tones"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    name = Column(String, default="Novo Tom")
    tone_md = Column(Text, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    video_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="tones")
    workspace = relationship("Workspace")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    name = Column(String, default="Novo Projeto")
    columns_json = Column(Text, nullable=True)  # JSON das colunas do board
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="projects")
    tasks = relationship("ContentTask", back_populates="project", cascade="all, delete-orphan")
    workspace = relationship("Workspace")

class ContentTask(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String)
    content_md = Column(Text)
    tag = Column(String) # Reels, Carousel, Post, etc.
    status = Column(String, default="todo") # todo, doing, done
    thumbnail_url = Column(String, nullable=True)
    card_color = Column(String, default="#1c1c24")
    scheduled_date = Column(String, nullable=True)  # YYYY-MM-DD
    scheduled_time = Column(String, nullable=True)  # HH:MM (24h)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="tasks")
    project = relationship("Project", back_populates="tasks")
    workspace = relationship("Workspace")


class CalendarNote(Base):
    __tablename__ = "calendar_notes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String)
    description = Column(Text, nullable=True)
    scheduled_date = Column(String)       # YYYY-MM-DD
    start_time = Column(String)           # HH:MM
    end_time = Column(String)             # HH:MM
    color = Column(String, default="#3b82f6")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile")
    project = relationship("Project")
    workspace = relationship("Workspace")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    name = Column(String, default="Nova Base")
    selected_ids = Column(Text, default="[]")  # JSON list of analysis IDs
    compiled_md = Column(Text, nullable=True)   # The distilled document
    is_stale = Column(Integer, default=1)       # 1=needs recompile, 0=up to date
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="knowledge_bases")
    workspace = relationship("Workspace")

class ContentIdea(Base):
    __tablename__ = "content_ideas"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    title = Column(String)
    summary = Column(Text, nullable=True)
    prompt_used = Column(Text, nullable=True)
    tone_id = Column(Integer, nullable=True)
    base_id = Column(Integer, nullable=True)
    status = Column(String, default="idea")          # idea, developing, developed
    developed_content = Column(Text, nullable=True)  # markdown content after MODO 4 generation
    is_saved = Column(Integer, default=0)            # 1 if bookmarked
    is_dismissed = Column(Integer, default=0)        # 1 if cleared from Ideias view (still in history)
    batch_id = Column(String, nullable=True)         # groups ideas generated together
    # "content" = ContentGenerator (viral-content-agent directive),
    # "creative" = IdeaGenerator (agente-criativo directive).
    # Column exists in ORM with a server_default so SELECTs don't break even
    # if the DB column hasn't been migrated yet.
    idea_type = Column(String(20), nullable=False, server_default="content")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile")
    workspace = relationship("Workspace")


class NoteFolder(Base):
    __tablename__ = "note_folders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    name = Column(String, default="Nova Pasta")
    icon = Column(String, default="folder")
    parent_id = Column(Integer, ForeignKey("note_folders.id"), nullable=True)
    order_index = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile")
    workspace = relationship("Workspace")
    parent = relationship("NoteFolder", remote_side="NoteFolder.id")
    notes = relationship("Note", back_populates="folder", cascade="all, delete-orphan")


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    folder_id = Column(Integer, ForeignKey("note_folders.id"), nullable=True)
    title = Column(String, default="Sem título")
    content_md = Column(Text, default="")
    order_index = Column(BigInteger, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    owner = relationship("Profile")
    workspace = relationship("Workspace")
    folder = relationship("NoteFolder", back_populates="notes")


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    title = Column(String, default="Novo Chat")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    workspace = relationship("Workspace")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    role = Column(String) # 'user' ou 'model'
    content = Column(Text)
    has_suggestion = Column(Integer, default=0) # 0 False, 1 True
    suggestion_json = Column(Text, nullable=True) # Guarda o JSON stringificado da sugestão
    task_added = Column(Integer, default=0) # 0 False, 1 True (ajuda na UI de envio pro kanban)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    session = relationship("ChatSession", back_populates="messages")
