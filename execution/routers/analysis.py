import os
import shutil
import uuid
import json
import asyncio
import io
import zipfile
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Analysis
from auth import get_current_user_dual as get_current_user
from workspace_utils import resolve_workspace, check_permission, workspace_filters, WorkspaceInfo
from analyzer import (
    download_video,
    download_videos_batch,
    extract_zip,
    analyze_single_video,
    cleanup_temp_files,
    extract_thumbnail,
    TMP_DIR
)

router = APIRouter(prefix="/analyze", tags=["analyze"])

# Per-endpoint quantity caps. Kept as module-level constants so the
# frontend and backend can agree on the limits via the error messages.
MAX_LINKS_PER_ANALYSIS = 20
MAX_FILES_PER_ANALYSIS = 30


# Category discriminator — drives which agent directive the analyzer
# loads and which frontend library the result shows up in. "short" keeps
# the legacy Analyzer behavior unchanged; "cinema" uses the
# agente-transcritor-cinematografico directive.
Category = Literal["short", "cinema"]

# Filter variant for listing endpoints. "all" returns both categories
# unfiltered — used by KB pickers and @-mention autocomplete, which are
# intentionally mixed.
CategoryFilter = Literal["short", "cinema", "all"]

# Map a category to the permission module guarded by PermissionGate on
# the frontend — so a user without cinema access gets blocked at the API
# layer even if they bypass the UI. "all" falls back to the legacy
# "analyses" module check so KB/@-mention don't require a new grant.
_CATEGORY_PERMISSION = {
    "short": "analyses",
    "cinema": "cinema",
    "all": "analyses",
}


def _perm_for_category(category: str) -> str:
    return _CATEGORY_PERMISSION.get(category, "analyses")

# Terminal statuses — any task in one of these is considered done and
# cannot be cancelled / resumed / replaced by "active task" logic.
TERMINAL_STATUSES = ("completed", "error", "cancelled")

# Armazenamento de tarefas temporárias em memória
# Shape: { task_id: { progress, logs, status, report, user_id } }
tasks_progress = {}

def _user_has_active_task(user_id: int) -> Optional[str]:
    """Return the first in-progress (queued/processing) task_id owned by user, else None."""
    for task_id, task in tasks_progress.items():
        if task.get("user_id") == user_id and task.get("status") not in TERMINAL_STATUSES:
            return task_id
    return None


def _is_task_cancelled(task_id: str) -> bool:
    """Small helper used as the cancellation callback passed into the
    download/analysis loops. Safe to call even after the task entry is
    gone — a missing entry is treated as cancelled so the worker exits."""
    task = tasks_progress.get(task_id)
    if not task:
        return True
    return task.get("status") == "cancelled"


class AnalyzeLinksRequest(BaseModel):
    links: List[str]

@router.get("/progress/{task_id}")
async def get_progress(task_id: str):
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    async def event_generator():
        # Keep the SSE alive through intermediaries like Railway's HTTP/2
        # proxy by emitting a comment frame every 15s even when nothing
        # changes — without it, long-running batch downloads (several
        # minutes between state updates) get killed with
        # ERR_HTTP2_PROTOCOL_ERROR. Also hard-cap the generator at 2h
        # so a crashed background task can't keep a stream open forever.
        HEARTBEAT_INTERVAL_S = 15
        MAX_DURATION_S = 2 * 60 * 60
        POLL_INTERVAL_S = 0.5

        loop = asyncio.get_event_loop()
        started_at = loop.time()
        last_heartbeat = started_at

        while True:
            now = loop.time()
            if now - started_at > MAX_DURATION_S:
                break

            task = tasks_progress.get(task_id)
            if not task:
                break

            yield f"data: {json.dumps(task)}\n\n"

            if task.get("status") in TERMINAL_STATUSES:
                break

            await asyncio.sleep(POLL_INTERVAL_S)

            # Emit an SSE comment line (ignored by the EventSource
            # client but travels through the proxy as a real frame) so
            # the connection never sits idle longer than 15s.
            now2 = loop.time()
            if now2 - last_heartbeat >= HEARTBEAT_INTERVAL_S:
                yield ": heartbeat\n\n"
                last_heartbeat = now2

    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def run_analysis_task(task_id: str, files_or_links: List[str], is_links: bool, user_id: int, workspace_id: int, db_factory, category: str = "short"):
    try:
        tasks_progress[task_id]["logs"].append("Iniciando pipeline de análise...")

        async def on_progress(message: str, percentage: int):
            # Don't clobber a terminal status (cancelled/error/completed)
            # with a stray "processing" update from an in-flight callback
            # that fires after cancel was requested.
            task = tasks_progress.get(task_id)
            if not task:
                return
            if task.get("status") in TERMINAL_STATUSES:
                # Still record the message for the log stream but keep
                # the status pinned so the frontend can see the wrap-up.
                task["logs"].append(message)
                return
            task["progress"] = percentage
            task["logs"].append(message)
            task["status"] = "processing"

        def cancelled() -> bool:
            return _is_task_cancelled(task_id)

        local_files = []
        download_failures: list[dict] = []
        if is_links:
            # Batch-aware download: applies inter-download delay on
            # multi-link requests, retries on rate-limit errors, keeps
            # going when individual videos fail, and now respects the
            # task-level cancel flag (partial results on cancel).
            dl_results = await download_videos_batch(
                files_or_links, on_progress, is_cancelled=cancelled
            )
            local_files = [r["path"] for r in dl_results if r["path"]]
            download_failures = [r for r in dl_results if not r["path"]]
            # Expose per-link outcome to the frontend for the final report
            tasks_progress[task_id]["download_failures"] = download_failures
        else:
            local_files = files_or_links

        # ── Early exit on cancellation (download phase) ──
        if cancelled():
            tasks_progress[task_id]["status"] = "cancelled"
            tasks_progress[task_id]["logs"].append(
                "Análise cancelada pelo usuário durante a fase de download."
            )
            # Drop any partial files we already downloaded — they're
            # orphaned because the analyses never ran.
            cleanup_temp_files(local_files)
            return

        if not local_files:
            tasks_progress[task_id]["status"] = "error"
            # Prefer the structured per-link failures over log scraping
            if download_failures:
                detail = (
                    f"Nenhum vídeo pôde ser baixado. "
                    f"Último erro: {download_failures[-1].get('error', 'desconhecido')}"
                )
            else:
                recent_failures = [
                    msg for msg in tasks_progress[task_id]["logs"]
                    if msg.startswith("Falha no download") or msg.startswith("Falha definitiva")
                ]
                detail = recent_failures[-1] if recent_failures else "Nenhum vídeo pôde ser processado."
            tasks_progress[task_id]["logs"].append(f"Erro: {detail}")
            return

        total_files = len(local_files)
        final_reports = []
        for idx, fp in enumerate(local_files):
            # Check cancellation BEFORE firing the next (expensive)
            # Gemini call. We don't interrupt analyze_single_video
            # mid-flight — that would need async-task cancellation and
            # risks leaking uploaded Gemini file handles — but the next
            # one will not start.
            if cancelled():
                tasks_progress[task_id]["status"] = "cancelled"
                tasks_progress[task_id]["logs"].append(
                    f"Análise cancelada pelo usuário ({idx}/{total_files} vídeos processados)."
                )
                # Clean up the videos we haven't analysed yet.
                cleanup_temp_files(local_files[idx:])
                return

            report_md, ai_title = await analyze_single_video(fp, on_progress, idx+1, total_files, category=category)

            thumb_url = extract_thumbnail(fp)

            # Salva no Banco de Dados
            async for db in db_factory():
                new_analysis = Analysis(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    title=ai_title,
                    report_md=report_md,
                    thumbnail_url=thumb_url,
                    category=category,
                )
                db.add(new_analysis)
                await db.commit()
                break

            final_reports.append(ai_title)

        # Final cancel check — if the user clicked cancel during the
        # very last analyze_single_video call, prefer the cancelled
        # state over "completed" since they explicitly asked to stop.
        if cancelled():
            tasks_progress[task_id]["status"] = "cancelled"
            tasks_progress[task_id]["logs"].append(
                f"Análise cancelada pelo usuário ao final ({len(final_reports)}/{total_files} salvos)."
            )
            cleanup_temp_files(local_files)
            return

        # Atualiza a Task para concluída
        tasks_progress[task_id]["report"] = f"Sucesso! Análise individualizada concluída para {len(final_reports)} vídeos."
        tasks_progress[task_id]["status"] = "completed"
        tasks_progress[task_id]["progress"] = 100

        cleanup_temp_files(local_files)

    except Exception as e:
        # Don't mask a user-requested cancellation with a generic error.
        task = tasks_progress.get(task_id)
        if task and task.get("status") == "cancelled":
            task["logs"].append(f"(erro ignorado após cancelamento: {str(e)})")
        else:
            tasks_progress[task_id]["status"] = "error"
            tasks_progress[task_id]["logs"].append(f"Erro fatal: {str(e)}")

@router.get("/active")
async def get_active_task(current_user: User = Depends(get_current_user)):
    """Return the user's currently running analysis task (if any) so the
    frontend can resume the progress listener after navigation."""
    task_id = _user_has_active_task(current_user.id)
    if not task_id:
        return {"taskId": None}
    task = tasks_progress.get(task_id, {})
    return {
        "taskId": task_id,
        "progress": task.get("progress", 0),
        "logs": task.get("logs", []),
        "status": task.get("status", "queued"),
    }


@router.post("/links")
async def analyze_links(
    request: AnalyzeLinksRequest,
    background_tasks: BackgroundTasks,
    category: Category = Query("short"),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, _perm_for_category(category))
    # Hard cap on links per request — anything above this reliably
    # trips Instagram/TikTok rate-limits even with the backoff logic.
    if len(request.links) > MAX_LINKS_PER_ANALYSIS:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo de {MAX_LINKS_PER_ANALYSIS} links por análise."
        )

    # Reject if user already has an analysis running
    existing = _user_has_active_task(current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="Você já tem uma análise em andamento. Aguarde finalizar para iniciar outra.")

    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None, "user_id": current_user.id}

    background_tasks.add_task(run_analysis_task, task_id, request.links, True, current_user.id, ws.id, get_db, category)
    return {"taskId": task_id}


@router.delete("/cancel/{task_id}")
async def cancel_analysis(task_id: str, current_user: User = Depends(get_current_user)):
    """Request cancellation of an in-progress analysis task. The actual
    stop happens cooperatively in the worker loops — this endpoint
    only flips the status flag and returns immediately."""
    task = tasks_progress.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if task.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Você não tem permissão para cancelar esta tarefa.")
    if task.get("status") in TERMINAL_STATUSES:
        raise HTTPException(status_code=409, detail=f"Tarefa já finalizada ({task.get('status')}).")

    task["status"] = "cancelled"
    task["logs"].append("Cancelamento solicitado pelo usuário. Encerrando...")
    return {"message": "Análise cancelada"}


@router.post("/files")
async def analyze_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    category: Category = Query("short"),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, _perm_for_category(category))
    if len(files) > MAX_FILES_PER_ANALYSIS:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo de {MAX_FILES_PER_ANALYSIS} arquivos por análise."
        )

    existing = _user_has_active_task(current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="Você já tem uma análise em andamento. Aguarde finalizar para iniciar outra.")

    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None, "user_id": current_user.id}
    ws_id = ws.id

    local_paths = []
    for file in files:
        filepath = os.path.join(TMP_DIR, f"{uuid.uuid4()}_{file.filename}")
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        local_paths.append(filepath)

    async def process_files_task():
        final_files = []
        try:
            for p in local_paths:
                if p.lower().endswith('.zip'):
                    extracted = await extract_zip(p)
                    final_files.extend(extracted)
                else:
                    final_files.append(p)

            await run_analysis_task(task_id, final_files, False, current_user.id, ws_id, get_db, category)
        finally:
            cleanup_temp_files(local_paths)

    background_tasks.add_task(process_files_task)
    return {"taskId": task_id}

@router.get("/history")
async def get_history(
    category: CategoryFilter = Query("short"),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    # Default category is "short" — legacy clients without the param see
    # exactly what they saw pre-migration, and cinema items stay hidden
    # unless the caller opts in explicitly.
    # "all" is the intentional escape hatch used by Knowledge Base pickers
    # and the ContentGenerator @-mention autocomplete, which mix both
    # categories on purpose.
    check_permission(ws, _perm_for_category(category))
    filters = [*workspace_filters(Analysis, ws, current_user.id)]
    if category != "all":
        filters.insert(0, Analysis.category == category)
    result = await db.execute(
        select(Analysis).filter(*filters).order_by(Analysis.created_at.desc())
    )
    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "workspace_id": a.workspace_id,
            "title": a.title,
            "report_preview": (a.report_md or "")[:500],
            "thumbnail_url": a.thumbnail_url,
            "category": a.category,
            "created_at": a.created_at,
        }
        for a in result.scalars().all()
    ]


@router.get("/{analysis_id}")
async def get_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "analyses")
    result = await db.execute(
        select(Analysis).filter(
            Analysis.id == analysis_id,
            *workspace_filters(Analysis, ws, current_user.id),
        )
    )
    analysis = result.scalars().first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    return analysis


@router.delete("/{id}")
async def delete_analysis(
    id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "analyses")
    result = await db.execute(
        select(Analysis).filter(Analysis.id == id, *workspace_filters(Analysis, ws, current_user.id))
    )
    analysis = result.scalars().first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    await db.delete(analysis)
    await db.commit()
    return {"message": "Análise removida com sucesso"}

class ExportRequest(BaseModel):
    analysis_ids: List[int]

@router.post("/export")
async def export_analyses(
    request: ExportRequest,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "analyses")
    result = await db.execute(
        select(Analysis).filter(Analysis.id.in_(request.analysis_ids), *workspace_filters(Analysis, ws, current_user.id))
    )
    analyses = result.scalars().all()
    
    if not analyses:
        raise HTTPException(status_code=404, detail="Nenhuma análise encontrada")
        
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w') as zf:
        for a in analyses:
            safe_title = "".join(x for x in a.title if x.isalnum() or x in " -_").strip()
            zf.writestr(f"{safe_title}_{a.id}.md", a.report_md)
            
    memory_file.seek(0)
    return StreamingResponse(
        memory_file,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=relatorios.zip"}
    )
