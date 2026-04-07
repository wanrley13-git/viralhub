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

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    content_md: Optional[str] = None
    tag: Optional[str] = None
    thumbnail_url: Optional[str] = None
    card_color: Optional[str] = None
    project_id: Optional[int] = None

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
        card_color=task_in.card_color
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return {
        "id": new_task.id,
        "user_id": new_task.user_id,
        "project_id": new_task.project_id,
        "title": new_task.title,
        "content_md": new_task.content_md,
        "tag": new_task.tag,
        "status": new_task.status,
        "thumbnail_url": new_task.thumbnail_url,
        "card_color": new_task.card_color,
        "created_at": new_task.created_at.isoformat() if new_task.created_at else None,
    }

@router.get("/")
async def get_tasks(project_id: int = None, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(ContentTask).filter(ContentTask.user_id == current_user.id)
    if project_id is not None:
        query = query.filter(ContentTask.project_id == project_id)
    result = await db.execute(query.order_by(ContentTask.created_at.desc()))
    tasks = result.scalars().all()
    return [{
        "id": t.id,
        "user_id": t.user_id,
        "project_id": t.project_id,
        "title": t.title,
        "content_md": t.content_md,
        "tag": t.tag,
        "status": t.status,
        "thumbnail_url": t.thumbnail_url,
        "card_color": t.card_color,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    } for t in tasks]

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
    return {
        "id": task.id,
        "user_id": task.user_id,
        "title": task.title,
        "content_md": task.content_md,
        "tag": task.tag,
        "status": task.status,
        "thumbnail_url": task.thumbnail_url,
        "card_color": task.card_color,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }

@router.delete("/{task_id}")
async def delete_task(task_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ContentTask).filter(ContentTask.id == task_id, ContentTask.user_id == current_user.id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    
    await db.delete(task)
    await db.commit()
    return {"message": "Tarefa excluída"}
