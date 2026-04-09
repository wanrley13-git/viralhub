import os
import shutil
import uuid
import json
import asyncio
import io
import zipfile
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Analysis
from auth import get_current_user_dual as get_current_user
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

# Armazenamento de tarefas temporárias em memória
# Shape: { task_id: { progress, logs, status, report, user_id } }
tasks_progress = {}

def _user_has_active_task(user_id: int) -> Optional[str]:
    """Return the first in-progress (queued/processing) task_id owned by user, else None."""
    for task_id, task in tasks_progress.items():
        if task.get("user_id") == user_id and task.get("status") not in ("completed", "error"):
            return task_id
    return None


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

            if task.get("status") == "completed" or task.get("status") == "error":
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

async def run_analysis_task(task_id: str, files_or_links: List[str], is_links: bool, user_id: int, db_factory):
    try:
        tasks_progress[task_id]["logs"].append("Iniciando pipeline de análise...")
        
        async def on_progress(message: str, percentage: int):
            tasks_progress[task_id]["progress"] = percentage
            tasks_progress[task_id]["logs"].append(message)
            tasks_progress[task_id]["status"] = "processing"

        local_files = []
        download_failures: list[dict] = []
        if is_links:
            # Batch-aware download: applies inter-download delay on
            # multi-link requests, retries once on rate-limit errors, and
            # keeps going when individual videos fail instead of aborting
            # the whole task. Single-link requests behave exactly like
            # before (no delay).
            dl_results = await download_videos_batch(files_or_links, on_progress)
            local_files = [r["path"] for r in dl_results if r["path"]]
            download_failures = [r for r in dl_results if not r["path"]]
            # Expose per-link outcome to the frontend for the final report
            tasks_progress[task_id]["download_failures"] = download_failures
        else:
            local_files = files_or_links

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
            report_md, ai_title = await analyze_single_video(fp, on_progress, idx+1, total_files)
            
            thumb_url = extract_thumbnail(fp)

            # Salva no Banco de Dados
            async for db in db_factory():
                new_analysis = Analysis(
                    user_id=user_id,
                    title=ai_title,
                    report_md=report_md,
                    thumbnail_url=thumb_url
                )
                db.add(new_analysis)
                await db.commit()
                break
            
            final_reports.append(ai_title)

        # Atualiza a Task para concluída
        tasks_progress[task_id]["report"] = f"Sucesso! Análise individualizada concluída para {len(final_reports)} vídeos."
        tasks_progress[task_id]["status"] = "completed"
        tasks_progress[task_id]["progress"] = 100
        
        cleanup_temp_files(local_files)
        
    except Exception as e:
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
    current_user: User = Depends(get_current_user)
):
    # Reject if user already has an analysis running
    existing = _user_has_active_task(current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="Você já tem uma análise em andamento. Aguarde finalizar para iniciar outra.")

    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None, "user_id": current_user.id}

    background_tasks.add_task(run_analysis_task, task_id, request.links, True, current_user.id, get_db)
    return {"taskId": task_id}

@router.post("/files")
async def analyze_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
):
    existing = _user_has_active_task(current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="Você já tem uma análise em andamento. Aguarde finalizar para iniciar outra.")

    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None, "user_id": current_user.id}

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

            await run_analysis_task(task_id, final_files, False, current_user.id, get_db)
        finally:
            cleanup_temp_files(local_paths)

    background_tasks.add_task(process_files_task)
    return {"taskId": task_id}

@router.get("/history")
async def get_history(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Analysis).filter(Analysis.user_id == current_user.id).order_by(Analysis.created_at.desc()))
    return result.scalars().all()

@router.delete("/{id}")
async def delete_analysis(id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Analysis).filter(Analysis.id == id, Analysis.user_id == current_user.id))
    analysis = result.scalars().first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    
    await db.delete(analysis)
    await db.commit()
    return {"message": "Análise removida com sucesso"}

class ExportRequest(BaseModel):
    analysis_ids: List[int]

@router.post("/export")
async def export_analyses(request: ExportRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Analysis).filter(Analysis.id.in_(request.analysis_ids), Analysis.user_id == current_user.id))
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
