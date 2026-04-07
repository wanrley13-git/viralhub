from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, CalendarNote
from auth import get_current_user_dual as get_current_user

router = APIRouter(prefix="/calendar", tags=["calendar"])


class NoteCreate(BaseModel):
    title: str
    description: Optional[str] = None
    scheduled_date: str       # YYYY-MM-DD
    start_time: str           # HH:MM
    end_time: str             # HH:MM
    color: Optional[str] = "#3b82f6"
    project_id: Optional[int] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    color: Optional[str] = None


def _serialize(n):
    return {
        "id": n.id,
        "type": "note",
        "user_id": n.user_id,
        "project_id": n.project_id,
        "title": n.title,
        "description": n.description,
        "scheduled_date": n.scheduled_date,
        "start_time": n.start_time,
        "end_time": n.end_time,
        "color": n.color,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.post("/notes")
async def create_note(body: NoteCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    note = CalendarNote(
        user_id=current_user.id,
        project_id=body.project_id,
        title=body.title,
        description=body.description,
        scheduled_date=body.scheduled_date,
        start_time=body.start_time,
        end_time=body.end_time,
        color=body.color,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return _serialize(note)


@router.get("/notes")
async def list_notes(project_id: int = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(CalendarNote).filter(CalendarNote.user_id == current_user.id)
    if project_id is not None:
        query = query.filter(CalendarNote.project_id == project_id)
    result = await db.execute(query.order_by(CalendarNote.scheduled_date, CalendarNote.start_time))
    return [_serialize(n) for n in result.scalars().all()]


@router.patch("/notes/{note_id}")
async def update_note(note_id: int, body: NoteUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CalendarNote).filter(CalendarNote.id == note_id, CalendarNote.user_id == current_user.id))
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    for key, value in body.dict(exclude_unset=True).items():
        setattr(note, key, value)
    await db.commit()
    await db.refresh(note)
    return _serialize(note)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CalendarNote).filter(CalendarNote.id == note_id, CalendarNote.user_id == current_user.id))
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada")
    await db.delete(note)
    await db.commit()
    return {"message": "Nota excluída"}
