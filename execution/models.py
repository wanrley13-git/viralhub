import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
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

# Alias para compatibilidade — todos os routers importam "User"
User = Profile

class Analysis(Base) :
    __tablename__ = "analyses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    title = Column(String)
    report_md = Column(Text)
    thumbnail_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner = relationship("Profile", back_populates="analyses")

class Transcription(Base):
    __tablename__ = "transcriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    title = Column(String)
    summary = Column(Text, nullable=True)
    transcription_md = Column(Text)
    thumbnail_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="transcriptions")

class Tone(Base):
    __tablename__ = "tones"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    name = Column(String, default="Novo Tom")
    tone_md = Column(Text, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    video_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="tones")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    name = Column(String, default="Novo Projeto")
    columns_json = Column(Text, nullable=True)  # JSON das colunas do board
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="projects")
    tasks = relationship("ContentTask", back_populates="project", cascade="all, delete-orphan")

class ContentTask(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
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


class CalendarNote(Base):
    __tablename__ = "calendar_notes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
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


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    name = Column(String, default="Nova Base")
    selected_ids = Column(Text, default="[]")  # JSON list of analysis IDs
    compiled_md = Column(Text, nullable=True)   # The distilled document
    is_stale = Column(Integer, default=1)       # 1=needs recompile, 0=up to date
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("Profile", back_populates="knowledge_bases")

class ContentIdea(Base):
    __tablename__ = "content_ideas"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
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


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("profiles.id"))
    title = Column(String, default="Novo Chat")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner = relationship("Profile", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

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
