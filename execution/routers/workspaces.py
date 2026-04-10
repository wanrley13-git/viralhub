"""Workspaces router — basic CRUD for the multi-workspace system.

Provides:
- GET  /workspaces/         list workspaces the current user belongs to
- POST /workspaces/         create a new workspace (creator becomes owner)
- GET  /workspaces/{id}     workspace details + member list
"""

import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Workspace, WorkspaceMember, _DEFAULT_PERMISSIONS
from auth import get_current_user_dual as get_current_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


# ──────────────────────────── schemas ────────────────────────────
class WorkspaceCreate(BaseModel):
    name: str = "Novo Workspace"


class MemberOut(BaseModel):
    id: int
    user_id: int
    email: Optional[str] = None
    role: str
    permissions: Optional[str] = None
    joined_at: Optional[str] = None

    class Config:
        from_attributes = True


class WorkspaceOut(BaseModel):
    id: int
    name: str
    owner_id: int
    is_personal: bool
    created_at: Optional[str] = None
    member_count: Optional[int] = None

    class Config:
        from_attributes = True


class WorkspaceDetailOut(WorkspaceOut):
    members: List[MemberOut] = []


# ──────────────────────────── helpers ────────────────────────────
def _serialize_workspace(ws: Workspace, member_count: int = 0) -> WorkspaceOut:
    return WorkspaceOut(
        id=ws.id,
        name=ws.name,
        owner_id=ws.owner_id,
        is_personal=bool(ws.is_personal),
        created_at=ws.created_at.isoformat() if ws.created_at else None,
        member_count=member_count,
    )


def _serialize_member(m: WorkspaceMember, email: Optional[str] = None) -> MemberOut:
    return MemberOut(
        id=m.id,
        user_id=m.user_id,
        email=email,
        role=m.role,
        permissions=m.permissions,
        joined_at=m.joined_at.isoformat() if m.joined_at else None,
    )


# ──────────────────────────── endpoints ──────────────────────────
@router.get("/", response_model=List[WorkspaceOut])
async def list_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List every workspace the current user is a member of."""
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.user_id == current_user.id,
        )
    )
    memberships = result.scalars().all()
    ws_ids = [m.workspace_id for m in memberships]
    if not ws_ids:
        return []

    result = await db.execute(
        select(Workspace)
        .where(Workspace.id.in_(ws_ids))
        .options(selectinload(Workspace.members))
    )
    workspaces = result.scalars().unique().all()

    return [
        _serialize_workspace(ws, member_count=len(ws.members))
        for ws in workspaces
    ]


@router.post("/", response_model=WorkspaceOut, status_code=201)
async def create_workspace(
    body: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new workspace. The creator is added as owner automatically."""
    ws = Workspace(
        name=body.name.strip() or "Novo Workspace",
        owner_id=current_user.id,
        is_personal=0,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(ws)
    await db.flush()  # get ws.id before creating the member row

    member = WorkspaceMember(
        workspace_id=ws.id,
        user_id=current_user.id,
        role="owner",
        permissions=_DEFAULT_PERMISSIONS,
        joined_at=datetime.datetime.utcnow(),
    )
    db.add(member)
    await db.commit()
    await db.refresh(ws)

    return _serialize_workspace(ws, member_count=1)


@router.get("/{workspace_id}", response_model=WorkspaceDetailOut)
async def get_workspace(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Workspace details + full member list. Only accessible to members."""
    # Verify membership
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")

    # Fetch workspace with members eagerly loaded
    result = await db.execute(
        select(Workspace)
        .where(Workspace.id == workspace_id)
        .options(selectinload(Workspace.members))
    )
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")

    # Resolve emails for each member
    user_ids = [m.user_id for m in ws.members]
    email_map = {}
    if user_ids:
        from models import Profile
        result = await db.execute(
            select(Profile).where(Profile.id.in_(user_ids))
        )
        for p in result.scalars().all():
            email_map[p.id] = p.email

    members_out = [
        _serialize_member(m, email=email_map.get(m.user_id))
        for m in ws.members
    ]

    return WorkspaceDetailOut(
        id=ws.id,
        name=ws.name,
        owner_id=ws.owner_id,
        is_personal=bool(ws.is_personal),
        created_at=ws.created_at.isoformat() if ws.created_at else None,
        member_count=len(members_out),
        members=members_out,
    )
