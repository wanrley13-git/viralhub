import os
import uuid
import json
import shutil
import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Tone
from auth import get_current_user_dual as get_current_user
from analyzer import (
    download_video,
    extract_zip,
    cleanup_temp_files,
    extract_thumbnail,
    TMP_DIR,
)
from tone_analyzer import analyze_tone

router = APIRouter(prefix="/tone", tags=["tone"])

tasks_progress = {}


class ToneLinksRequest(BaseModel):
    links: List[str]
    name: str = "Novo Tom"
    notes: str = ""


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
            if task.get("status") in ("completed", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


async def run_tone_task(task_id: str, video_paths: List[str], name: str, notes: str, user_id: int, db_factory):
    try:
        tasks_progress[task_id]["logs"].append("Iniciando análise de tom...")

        async def on_progress(message: str, percentage: int):
            tasks_progress[task_id]["progress"] = percentage
            tasks_progress[task_id]["logs"].append(message)
            tasks_progress[task_id]["status"] = "processing"

        if not video_paths:
            tasks_progress[task_id]["status"] = "error"
            tasks_progress[task_id]["logs"].append("Erro: Nenhum vídeo pôde ser processado.")
            return

        # Extrair thumbnail do primeiro vídeo
        thumb_url = extract_thumbnail(video_paths[0])

        # Analisar tom usando todos os vídeos
        tone_md = await analyze_tone(video_paths, on_progress, notes=notes)

        # Salvar no banco
        async for db in db_factory():
            new_tone = Tone(
                user_id=user_id,
                name=name,
                tone_md=tone_md,
                thumbnail_url=thumb_url,
                video_count=len(video_paths),
            )
            db.add(new_tone)
            await db.commit()
            break

        tasks_progress[task_id]["status"] = "completed"
        tasks_progress[task_id]["progress"] = 100
        tasks_progress[task_id]["logs"].append("Tom analisado com sucesso!")

        cleanup_temp_files(video_paths)

    except Exception as e:
        tasks_progress[task_id]["status"] = "error"
        tasks_progress[task_id]["logs"].append(f"Erro fatal: {str(e)}")


@router.post("/links")
async def tone_from_links(
    request: ToneLinksRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None}

    async def download_and_process():
        local_files = []
        async def on_progress(msg, pct):
            tasks_progress[task_id]["progress"] = pct
            tasks_progress[task_id]["logs"].append(msg)
            tasks_progress[task_id]["status"] = "processing"

        for link in request.links:
            fp = await download_video(link, on_progress)
            if fp:
                local_files.append(fp)

        await run_tone_task(task_id, local_files, request.name, request.notes, current_user.id, get_db)

    background_tasks.add_task(download_and_process)
    return {"taskId": task_id}


@router.post("/files")
async def tone_from_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    name: str = Form("Novo Tom"),
    notes: str = Form(""),
    current_user: User = Depends(get_current_user),
):
    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None}

    local_paths = []
    for file in files:
        filepath = os.path.join(TMP_DIR, f"{uuid.uuid4()}_{file.filename}")
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        local_paths.append(filepath)

    async def process_files():
        final_files = []
        try:
            for p in local_paths:
                if p.lower().endswith('.zip'):
                    extracted = await extract_zip(p)
                    final_files.extend(extracted)
                else:
                    final_files.append(p)
            await run_tone_task(task_id, final_files, name, notes, current_user.id, get_db)
        finally:
            cleanup_temp_files(local_paths)

    background_tasks.add_task(process_files)
    return {"taskId": task_id}


@router.get("/")
async def list_tones(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tone).filter(Tone.user_id == current_user.id).order_by(Tone.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{id}")
async def delete_tone(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tone).filter(Tone.id == id, Tone.user_id == current_user.id)
    )
    tone = result.scalars().first()
    if not tone:
        raise HTTPException(status_code=404, detail="Tom não encontrado")
    await db.delete(tone)
    await db.commit()
    return {"message": "Tom removido com sucesso"}
