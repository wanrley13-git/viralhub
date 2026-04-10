"""Workspace resolution utilities for Fase 3 — workspace-scoped data.

Provides:
- ``resolve_workspace`` — FastAPI dependency that reads X-Workspace-Id from
  the request header, validates membership, and returns a WorkspaceInfo.
- ``check_permission`` — raises 403 if the user lacks a module permission
  in a team workspace.
- ``workspace_filters`` — returns SQLAlchemy filter conditions that honour
  the personal-vs-team distinction (personal keeps redundant user_id filter).
"""

import json
from dataclasses import dataclass
from typing import List

from fastapi import Depends, HTTPException, Request
from sqlalchemy import and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Workspace, WorkspaceMember
from auth import get_current_user_dual as get_current_user


@dataclass
class WorkspaceInfo:
    id: int
    is_personal: bool
    role: str           # "owner" | "member"
    permissions: dict   # parsed permissions JSON


async def resolve_workspace(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceInfo:
    """FastAPI dependency: resolve the active workspace from the
    ``X-Workspace-Id`` header. Falls back to the user's personal workspace
    when the header is absent (backwards-compatible)."""

    header_val = request.headers.get("X-Workspace-Id")

    if header_val:
        try:
            ws_id = int(header_val)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="X-Workspace-Id inválido.")

        result = await db.execute(
            select(Workspace, WorkspaceMember)
            .join(
                WorkspaceMember,
                and_(
                    WorkspaceMember.workspace_id == Workspace.id,
                    WorkspaceMember.user_id == current_user.id,
                ),
            )
            .where(Workspace.id == ws_id)
        )
        row = result.first()
        if not row:
            raise HTTPException(
                status_code=403,
                detail="Workspace não encontrado ou sem acesso.",
            )
        ws, member = row
        perms: dict = {}
        try:
            perms = json.loads(member.permissions or "{}")
        except Exception:
            pass
        return WorkspaceInfo(
            id=ws.id,
            is_personal=bool(ws.is_personal),
            role=member.role,
            permissions=perms,
        )

    # No header → fall back to the user's personal workspace
    result = await db.execute(
        select(Workspace, WorkspaceMember)
        .join(
            WorkspaceMember,
            and_(
                WorkspaceMember.workspace_id == Workspace.id,
                WorkspaceMember.user_id == current_user.id,
            ),
        )
        .where(Workspace.is_personal == 1)
    )
    row = result.first()
    if not row:
        raise HTTPException(
            status_code=500,
            detail="Nenhum workspace pessoal encontrado.",
        )
    ws, member = row
    perms = {}
    try:
        perms = json.loads(member.permissions or "{}")
    except Exception:
        pass
    return WorkspaceInfo(
        id=ws.id,
        is_personal=True,
        role=member.role,
        permissions=perms,
    )


def check_permission(ws: WorkspaceInfo, module: str) -> None:
    """Raise 403 if the user lacks permission for *module* in a team
    workspace. Personal workspaces and owners always pass."""
    if ws.is_personal:
        return
    if ws.role == "owner":
        return
    if not ws.permissions.get(module, True):
        raise HTTPException(
            status_code=403,
            detail=f"Você não tem permissão para '{module}' neste workspace.",
        )


def workspace_filters(model_class, ws: WorkspaceInfo, user_id: int) -> List:
    """Return a list of SQLAlchemy filter conditions for workspace scoping.

    - **Personal workspace**: ``workspace_id == ws.id AND user_id == user_id``
      (redundant but safe — belt-and-suspenders).
    - **Team workspace**: ``workspace_id == ws.id`` only (shared data visible
      to all members).
    """
    filters = [model_class.workspace_id == ws.id]
    if ws.is_personal:
        filters.append(model_class.user_id == user_id)
    return filters
