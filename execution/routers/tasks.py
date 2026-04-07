from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete

from database import get_db
from models import User, ContentTask
from auth import get_current_user_dual as get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str
    content_md: Optional[str] = ""
    tag: Optional[str] = "Nota"
    status: Optional[str] = "todo"
    thumbnail_url: Optional[str] = None
    card_color: Optional[str] = "#1c1c24"
    project_id: Optional[int] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    content_md: Optional[str] = None
    tag: Optional[str] = None
    thumbnail_url: Optional[str] = None
    card_color: Optional[str] = None
    project_id: Optional[int] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None


def _serialize_task(t):
    return {
        "id": t.id,
        "type": "task",
        "user_id": t.user_id,
        "project_id": t.project_id,
        "title": t.title,
        "content_md": t.content_md,
        "tag": t.tag,
        "status": t.status,
        "thumbnail_url": t.thumbnail_url,
        "card_color": t.card_color,
        "scheduled_date": t.scheduled_date,
        "scheduled_time": t.scheduled_time,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }

@router.post("/")
async def create_task(task_in: TaskCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    new_task = ContentTask(
        user_id=current_user.id,
        project_id=task_in.project_id,
        title=task_in.title,
        content_md=task_in.content_md,
        tag=task_in.tag,
        status=task_in.status,
        thumbnail_url=task_in.thumbnail_url,
        card_color=task_in.card_color,
        scheduled_date=task_in.scheduled_date,
        scheduled_time=task_in.scheduled_time,
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return _serialize_task(new_task)

@router.get("/")
async def get_tasks(project_id: int = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(ContentTask).filter(ContentTask.user_id == current_user.id)
    if project_id is not None:
        query = query.filter(ContentTask.project_id == project_id)
    result = await db.execute(query.order_by(ContentTask.created_at.desc()))
    tasks = result.scalars().all()
    return [_serialize_task(t) for t in tasks]

@router.patch("/{task_id}")
async def update_task(task_id: int, task_up: TaskUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Verifica se a tarefa pertence ao usuário
    result = await db.execute(select(ContentTask).filter(ContentTask.id == task_id, ContentTask.user_id == current_user.id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    
    update_data = task_up.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.commit()
    await db.refresh(task)
    return _serialize_task(task)

@router.delete("/{task_id}")
async def delete_task(task_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContentTask).filter(ContentTask.id == task_id, ContentTask.user_id == current_user.id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    
    await db.delete(task)
    await db.commit()
    return {"message": "Tarefa excluída"}
