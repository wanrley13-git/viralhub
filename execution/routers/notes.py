"""Notes router — CRUD for note_folders and notes.

Provides:
- GET    /notes/folders      list folders in workspace
- POST   /notes/folders      create folder
- PATCH  /notes/folders/{id} rename / change icon / move
- DELETE /notes/folders/{id} delete folder + children recursively

- GET    /notes/             list notes in workspace
- POST   /notes/             create note
- POST   /notes/bulk         bulk-create notes + folders (localStorage migration)
- PATCH  /notes/{id}         update title / content / folder / order
- DELETE /notes/{id}         delete note
"""

import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, NoteFolder, Note
from auth import get_current_user_dual as get_current_user
from workspace_utils import resolve_workspace, check_permission, workspace_filters, WorkspaceInfo

router = APIRouter(prefix="/notes", tags=["notes"])


# ──────────────────────────── schemas ────────────────────────────

class FolderCreate(BaseModel):
    name: str = "Nova Pasta"
    icon: str = "folder"
    parent_id: Optional[int] = None
    order_index: int = 0


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    parent_id: Optional[int] = -1  # -1 = unchanged, None = root
    order_index: Optional[int] = None


class NoteCreate(BaseModel):
    folder_id: Optional[int] = None
    title: str = "Sem título"
    content_md: str = ""
    order_index: int = 0


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content_md: Optional[str] = None
    folder_id: Optional[int] = -1  # -1 = unchanged, None = remove from folder
    order_index: Optional[int] = None


class BulkFolder(BaseModel):
    temp_id: str          # client-generated ID for mapping
    name: str = "Nova Pasta"
    icon: str = "folder"
    temp_parent_id: Optional[str] = None
    order_index: int = 0


class BulkNote(BaseModel):
    temp_folder_id: Optional[str] = None
    title: str = "Sem título"
    content_md: str = ""
    order_index: int = 0


class BulkImport(BaseModel):
    folders: List[BulkFolder] = []
    notes: List[BulkNote] = []


# ──────────────────────────── serializers ────────────────────────

def serialize_folder(f: NoteFolder) -> dict:
    return {
        "id": f.id,
        "user_id": f.user_id,
        "workspace_id": f.workspace_id,
        "name": f.name,
        "icon": f.icon,
        "parent_id": f.parent_id,
        "order_index": f.order_index,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


def serialize_note(n: Note) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "workspace_id": n.workspace_id,
        "folder_id": n.folder_id,
        "title": n.title,
        "content_md": n.content_md,
        "order_index": n.order_index,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


# ──────────────────────────── folders ────────────────────────────

@router.get("/folders")
async def list_folders(
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    result = await db.execute(
        select(NoteFolder)
        .filter(*workspace_filters(NoteFolder, ws, current_user.id))
        .order_by(NoteFolder.order_index)
    )
    return [serialize_folder(f) for f in result.scalars().all()]


@router.post("/folders", status_code=201)
async def create_folder(
    body: FolderCreate,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    folder = NoteFolder(
        user_id=current_user.id,
        workspace_id=ws.id,
        name=body.name,
        icon=body.icon,
        parent_id=body.parent_id,
        order_index=body.order_index,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return serialize_folder(folder)


@router.patch("/folders/{folder_id}")
async def update_folder(
    folder_id: int,
    body: FolderUpdate,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    result = await db.execute(
        select(NoteFolder).filter(
            NoteFolder.id == folder_id,
            *workspace_filters(NoteFolder, ws, current_user.id),
        )
    )
    folder = result.scalars().first()
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    if body.name is not None:
        folder.name = body.name
    if body.icon is not None:
        folder.icon = body.icon
    if body.parent_id != -1:
        folder.parent_id = body.parent_id
    if body.order_index is not None:
        folder.order_index = body.order_index

    await db.commit()
    await db.refresh(folder)
    return serialize_folder(folder)


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    """Delete a folder and all nested sub-folders + their notes recursively."""
    check_permission(ws, "notes")
    result = await db.execute(
        select(NoteFolder).filter(
            NoteFolder.id == folder_id,
            *workspace_filters(NoteFolder, ws, current_user.id),
        )
    )
    folder = result.scalars().first()
    if not folder:
        raise HTTPException(status_code=404, detail="Pasta não encontrada.")

    # Collect all descendant folder IDs
    ids_to_delete = {folder_id}
    all_folders_result = await db.execute(
        select(NoteFolder).filter(
            *workspace_filters(NoteFolder, ws, current_user.id),
        )
    )
    all_folders = all_folders_result.scalars().all()
    changed = True
    while changed:
        changed = False
        for f in all_folders:
            if f.parent_id in ids_to_delete and f.id not in ids_to_delete:
                ids_to_delete.add(f.id)
                changed = True

    # Delete notes in all collected folders
    notes_result = await db.execute(
        select(Note).filter(Note.folder_id.in_(ids_to_delete))
    )
    for note in notes_result.scalars().all():
        await db.delete(note)

    # Delete folders (children first doesn't matter since we collected all)
    for f in all_folders:
        if f.id in ids_to_delete:
            await db.delete(f)
    # Also delete the root folder itself if not in all_folders already
    await db.delete(folder)

    await db.commit()
    return {"ok": True}


# ──────────────────────────── notes ──────────────────────────────

@router.get("/")
async def list_notes(
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    result = await db.execute(
        select(Note)
        .filter(*workspace_filters(Note, ws, current_user.id))
        .order_by(Note.order_index)
    )
    return [serialize_note(n) for n in result.scalars().all()]


@router.post("/", status_code=201)
async def create_note(
    body: NoteCreate,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    now = datetime.datetime.utcnow()
    note = Note(
        user_id=current_user.id,
        workspace_id=ws.id,
        folder_id=body.folder_id,
        title=body.title,
        content_md=body.content_md,
        order_index=body.order_index,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return serialize_note(note)


@router.patch("/{note_id}")
async def update_note(
    note_id: int,
    body: NoteUpdate,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    result = await db.execute(
        select(Note).filter(
            Note.id == note_id,
            *workspace_filters(Note, ws, current_user.id),
        )
    )
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")

    if body.title is not None:
        note.title = body.title
    if body.content_md is not None:
        note.content_md = body.content_md
    if body.folder_id != -1:
        note.folder_id = body.folder_id
    if body.order_index is not None:
        note.order_index = body.order_index
    note.updated_at = datetime.datetime.utcnow()

    await db.commit()
    await db.refresh(note)
    return serialize_note(note)


@router.delete("/{note_id}")
async def delete_note_endpoint(
    note_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "notes")
    result = await db.execute(
        select(Note).filter(
            Note.id == note_id,
            *workspace_filters(Note, ws, current_user.id),
        )
    )
    note = result.scalars().first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")

    await db.delete(note)
    await db.commit()
    return {"ok": True}


# ──────────────────────────── bulk import ────────────────────────

@router.post("/bulk", status_code=201)
async def bulk_import(
    body: BulkImport,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-import folders and notes from a localStorage migration.

    Accepts temporary client-generated IDs (``temp_id``, ``temp_parent_id``,
    ``temp_folder_id``) and returns a mapping of old→new IDs so the client
    can clean up.
    """
    check_permission(ws, "notes")
    now = datetime.datetime.utcnow()

    # Phase 1: create all folders, mapping temp_id → real ID.
    # We need to handle parent references, so we create in topological order.
    temp_to_real_folder: dict[str, int] = {}

    # Sort folders: roots first (no parent), then children
    remaining = list(body.folders)
    created_count = -1
    while remaining and created_count != 0:
        created_count = 0
        still_remaining = []
        for bf in remaining:
            parent_real_id = None
            if bf.temp_parent_id:
                if bf.temp_parent_id in temp_to_real_folder:
                    parent_real_id = temp_to_real_folder[bf.temp_parent_id]
                else:
                    still_remaining.append(bf)
                    continue

            folder = NoteFolder(
                user_id=current_user.id,
                workspace_id=ws.id,
                name=bf.name,
                icon=bf.icon,
                parent_id=parent_real_id,
                order_index=bf.order_index,
                created_at=now,
            )
            db.add(folder)
            await db.flush()
            temp_to_real_folder[bf.temp_id] = folder.id
            created_count += 1

        remaining = still_remaining

    # Phase 2: create all notes with resolved folder IDs
    temp_to_real_note: dict[str, int] = {}
    for bn in body.notes:
        real_folder_id = None
        if bn.temp_folder_id and bn.temp_folder_id in temp_to_real_folder:
            real_folder_id = temp_to_real_folder[bn.temp_folder_id]

        note = Note(
            user_id=current_user.id,
            workspace_id=ws.id,
            folder_id=real_folder_id,
            title=bn.title,
            content_md=bn.content_md,
            order_index=bn.order_index,
            created_at=now,
            updated_at=now,
        )
        db.add(note)

    await db.commit()
    return {
        "ok": True,
        "folders_created": len(temp_to_real_folder),
        "notes_created": len(body.notes),
        "folder_id_map": temp_to_real_folder,
    }
