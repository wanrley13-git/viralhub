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
    extract_zip, 
    analyze_single_video, 
    cleanup_temp_files, 
    extract_thumbnail,
    TMP_DIR
)

router = APIRouter(prefix="/analyze", tags=["analyze"])

# Armazenamento de tarefas temporárias em memória
tasks_progress = {}

class AnalyzeLinksRequest(BaseModel):
    links: List[str]

@router.get("/progress/{task_id}")
async def get_progress(task_id: str):
    if task_id not in tasks_progress:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    async def event_generator():
        while True:
            task = tasks_progress.get(task_id)
            if not task:
                break
                
            yield f"data: {json.dumps(task)}\n\n"
            
            if task.get("status") == "completed" or task.get("status") == "error":
                break
                
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

async def run_analysis_task(task_id: str, files_or_links: List[str], is_links: bool, user_id: int, db_factory):
    try:
        tasks_progress[task_id]["logs"].append("Iniciando pipeline de análise...")
        
        async def on_progress(message: str, percentage: int):
            tasks_progress[task_id]["progress"] = percentage
            tasks_progress[task_id]["logs"].append(message)
            tasks_progress[task_id]["status"] = "processing"

        local_files = []
        if is_links:
            for link in files_or_links:
                fp = await download_video(link, on_progress)
                if fp:
                    local_files.append(fp)
        else:
            local_files = files_or_links

        if not local_files:
            tasks_progress[task_id]["status"] = "error"
            tasks_progress[task_id]["logs"].append("Erro: Nenhum vídeo pôde ser processado.")
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

@router.post("/links")
async def analyze_links(
    request: AnalyzeLinksRequest, 
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None}
    
    background_tasks.add_task(run_analysis_task, task_id, request.links, True, current_user.id, get_db)
    return {"taskId": task_id}

@router.post("/files")
async def analyze_files(
    background_tasks: BackgroundTasks, 
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
):
    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None}
    
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
