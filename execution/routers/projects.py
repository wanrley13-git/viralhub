import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Project, ContentTask
from auth import get_current_user_dual as get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])

DEFAULT_COLUMNS = json.dumps([
    {"id": "todo", "title": "Nova tarefa", "accent": "bg-cyan-500"},
    {"id": "doing", "title": "Produzindo", "accent": "bg-green-500"},
    {"id": "done", "title": "Concluído", "accent": "bg-amber-500"},
])


class ProjectCreate(BaseModel):
    name: str = "Novo Projeto"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    columns_json: Optional[str] = None


def serialize_project(p):
    return {
        "id": p.id,
        "user_id": p.user_id,
        "name": p.name,
        "columns_json": p.columns_json,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.post("/")
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        user_id=current_user.id,
        name=body.name,
        columns_json=DEFAULT_COLUMNS,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return serialize_project(project)


@router.get("/")
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    return [serialize_project(p) for p in result.scalars().all()]


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).filter(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return serialize_project(project)


@router.patch("/{project_id}")
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).filter(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    update_data = body.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    await db.commit()
    await db.refresh(project)
    return serialize_project(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).filter(Project.id == project_id, Project.user_id == current_user.id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    # Deletar tasks do projeto antes de deletar o projeto
    tasks_result = await db.execute(
        select(ContentTask).filter(ContentTask.project_id == project_id)
    )
    for task in tasks_result.scalars().all():
        await db.delete(task)

    await db.delete(project)
    await db.commit()
    return {"message": "Projeto excluído"}
