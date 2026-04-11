"""Workspaces router — CRUD + invite/member management.

Provides:
- GET    /workspaces/                    list workspaces the user belongs to
- POST   /workspaces/                    create a new workspace
- GET    /workspaces/{id}                workspace details + members
- PATCH  /workspaces/{id}                rename workspace
- DELETE /workspaces/{id}                delete workspace (non-personal only)
- POST   /workspaces/{id}/invite         invite a user by email
- PATCH  /workspaces/{id}/members/{uid}  update member permissions
- DELETE /workspaces/{id}/members/{uid}  remove a member
"""

import json
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from database import get_db
from models import Profile, User, Workspace, WorkspaceMember, _DEFAULT_PERMISSIONS
from auth import get_current_user_dual as get_current_user

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


# ──────────────────────────── schemas ────────────────────────────
class WorkspaceCreate(BaseModel):
    name: str = "Novo Workspace"


class WorkspaceUpdate(BaseModel):
    name: str


class InviteRequest(BaseModel):
    email: str
    permissions: Optional[dict] = None


class PermissionsUpdate(BaseModel):
    permissions: dict


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
    my_permissions: Optional[dict] = None

    class Config:
        from_attributes = True


class WorkspaceDetailOut(WorkspaceOut):
    members: List[MemberOut] = []


# ──────────────────────────── helpers ────────────────────────────
def _serialize_workspace(
    ws: Workspace,
    member_count: int = 0,
    my_permissions: dict | None = None,
) -> WorkspaceOut:
    return WorkspaceOut(
        id=ws.id,
        name=ws.name,
        owner_id=ws.owner_id,
        is_personal=bool(ws.is_personal),
        created_at=ws.created_at.isoformat() if ws.created_at else None,
        member_count=member_count,
        my_permissions=my_permissions,
    )


def _extract_my_permissions(
    ws: Workspace, membership: WorkspaceMember | None
) -> dict | None:
    """Return the member's permission dict, or None if unrestricted
    (personal workspace or owner role)."""
    if ws.is_personal:
        return None
    if not membership or membership.role == "owner":
        return None
    try:
        return json.loads(membership.permissions or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}


def _serialize_member(m: WorkspaceMember, email: Optional[str] = None) -> MemberOut:
    return MemberOut(
        id=m.id,
        user_id=m.user_id,
        email=email,
        role=m.role,
        permissions=m.permissions,
        joined_at=m.joined_at.isoformat() if m.joined_at else None,
    )


async def _require_membership(
    workspace_id: int,
    user_id: int,
    db: AsyncSession,
) -> WorkspaceMember:
    """Return the membership row or raise 404."""
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    return membership


async def _require_owner(
    workspace_id: int,
    user_id: int,
    db: AsyncSession,
) -> WorkspaceMember:
    """Return the membership row if the user is owner, otherwise raise 403."""
    membership = await _require_membership(workspace_id, user_id, db)
    if membership.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Apenas o owner do workspace pode realizar esta ação.",
        )
    return membership


async def _get_workspace(workspace_id: int, db: AsyncSession) -> Workspace:
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    return ws


async def _build_email_map(user_ids: List[int], db: AsyncSession) -> dict:
    if not user_ids:
        return {}
    result = await db.execute(
        select(Profile).where(Profile.id.in_(user_ids))
    )
    return {p.id: p.email for p in result.scalars().all()}


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

    memberships_map = {m.workspace_id: m for m in memberships}

    result = await db.execute(
        select(Workspace)
        .where(Workspace.id.in_(ws_ids))
        .options(selectinload(Workspace.members))
    )
    workspaces = result.scalars().unique().all()

    # Personal workspace first, then alphabetical
    workspaces.sort(key=lambda w: (0 if w.is_personal else 1, w.name))

    return [
        _serialize_workspace(
            ws,
            member_count=len(ws.members),
            my_permissions=_extract_my_permissions(ws, memberships_map.get(ws.id)),
        )
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
    await db.flush()

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
    await _require_membership(workspace_id, current_user.id, db)

    result = await db.execute(
        select(Workspace)
        .where(Workspace.id == workspace_id)
        .options(selectinload(Workspace.members))
    )
    ws = result.scalars().first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")

    email_map = await _build_email_map(
        [m.user_id for m in ws.members], db
    )

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


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: int,
    body: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename a workspace. Any member can rename, but personal workspaces
    cannot be renamed."""
    await _require_membership(workspace_id, current_user.id, db)
    ws = await _get_workspace(workspace_id, db)

    if ws.is_personal:
        raise HTTPException(
            status_code=400,
            detail="O workspace pessoal não pode ser renomeado.",
        )

    ws.name = body.name.strip() or ws.name
    await db.commit()
    await db.refresh(ws)

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    count = len(result.scalars().all())

    return _serialize_workspace(ws, member_count=count)


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a workspace and all its memberships. Personal workspaces
    cannot be deleted. Content rows are NOT deleted — they become orphaned."""
    await _require_owner(workspace_id, current_user.id, db)
    ws = await _get_workspace(workspace_id, db)

    if ws.is_personal:
        raise HTTPException(
            status_code=400,
            detail="O workspace pessoal não pode ser deletado.",
        )

    # Delete all membership rows
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    for m in result.scalars().all():
        await db.delete(m)

    await db.delete(ws)
    await db.commit()
    return {"ok": True}


@router.post("/{workspace_id}/invite", response_model=MemberOut)
async def invite_member(
    workspace_id: int,
    body: InviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invite a user to the workspace by email. Only the owner can invite."""
    await _require_owner(workspace_id, current_user.id, db)
    ws = await _get_workspace(workspace_id, db)

    if ws.is_personal:
        raise HTTPException(
            status_code=400,
            detail="Não é possível convidar membros para o workspace pessoal.",
        )

    # Find user by email
    email = body.email.strip().lower()
    result = await db.execute(
        select(Profile).where(Profile.email == email)
    )
    target_user = result.scalars().first()
    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Usuário não encontrado. Ele precisa criar uma conta primeiro.",
        )

    # Check if already a member
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == target_user.id,
        )
    )
    if result.scalars().first():
        raise HTTPException(
            status_code=409,
            detail="Este usuário já faz parte do workspace.",
        )

    # Build permissions JSON
    if body.permissions:
        perms_str = json.dumps(body.permissions)
    else:
        perms_str = _DEFAULT_PERMISSIONS

    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=target_user.id,
        role="member",
        permissions=perms_str,
        invited_by=current_user.id,
        joined_at=datetime.datetime.utcnow(),
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    return _serialize_member(member, email=target_user.email)


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberOut)
async def update_member_permissions(
    workspace_id: int,
    user_id: int,
    body: PermissionsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a member's permissions. Only the owner can do this."""
    await _require_owner(workspace_id, current_user.id, db)

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")

    member.permissions = json.dumps(body.permissions)
    await db.commit()
    await db.refresh(member)

    email_map = await _build_email_map([member.user_id], db)
    return _serialize_member(member, email=email_map.get(member.user_id))


@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(
    workspace_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from the workspace. Only the owner can do this,
    and the owner cannot remove themselves."""
    await _require_owner(workspace_id, current_user.id, db)

    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="O owner não pode se remover do próprio workspace.",
        )

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado.")

    await db.delete(member)
    await db.commit()
    return {"ok": True}
