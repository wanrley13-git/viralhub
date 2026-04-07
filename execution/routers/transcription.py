import uuid
import json
import asyncio
import io
import zipfile
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Transcription
from auth import get_current_user_dual as get_current_user
from transcriber import (
    get_youtube_title,
    download_youtube_video,
    transcribe_video,
    extract_thumbnail,
    cleanup_temp_files,
)

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

tasks_progress = {}


class TranscribeRequest(BaseModel):
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
            if task.get("status") in ("completed", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


async def run_transcription_task(task_id: str, links: List[str], user_id: int, db_factory):
    try:
        tasks_progress[task_id]["logs"].append("Iniciando pipeline de transcrição...")

        async def on_progress(message: str, percentage: int):
            tasks_progress[task_id]["progress"] = percentage
            tasks_progress[task_id]["logs"].append(message)
            tasks_progress[task_id]["status"] = "processing"

        total = len(links)
        for idx, link in enumerate(links):
            base_pct = int((idx / total) * 100)

            async def scoped_progress(msg, pct, _base=base_pct, _total=total):
                scaled = _base + int(pct / _total)
                await on_progress(msg, min(scaled, 99))

            await scoped_progress(f"Extraindo título do vídeo [{idx+1}/{total}]...", 2)
            title = await get_youtube_title(link)
            await scoped_progress(f"Título: {title}", 5)

            fp = await download_youtube_video(link, scoped_progress)
            if not fp:
                await on_progress(f"Erro ao baixar vídeo: {link}", base_pct + 20)
                continue

            thumb_url = extract_thumbnail(fp)

            transcription, summary = await transcribe_video(fp, scoped_progress)

            cleanup_temp_files([fp])

            # Salva no banco
            async for db in db_factory():
                new_transcription = Transcription(
                    user_id=user_id,
                    title=title,
                    summary=summary,
                    transcription_md=transcription,
                    thumbnail_url=thumb_url,
                )
                db.add(new_transcription)
                await db.commit()
                break

        tasks_progress[task_id]["status"] = "completed"
        tasks_progress[task_id]["progress"] = 100
        tasks_progress[task_id]["logs"].append("Transcrição finalizada com sucesso!")

    except Exception as e:
        tasks_progress[task_id]["status"] = "error"
        tasks_progress[task_id]["logs"].append(f"Erro fatal: {str(e)}")


@router.post("/links")
async def transcribe_links(
    request: TranscribeRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    task_id = str(uuid.uuid4())
    tasks_progress[task_id] = {"progress": 0, "logs": [], "status": "queued", "report": None}
    background_tasks.add_task(run_transcription_task, task_id, request.links, current_user.id, get_db)
    return {"taskId": task_id}


@router.get("/history")
async def get_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transcription)
        .filter(Transcription.user_id == current_user.id)
        .order_by(Transcription.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{id}")
async def delete_transcription(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transcription).filter(Transcription.id == id, Transcription.user_id == current_user.id)
    )
    t = result.scalars().first()
    if not t:
        raise HTTPException(status_code=404, detail="Transcrição não encontrada")
    await db.delete(t)
    await db.commit()
    return {"message": "Transcrição removida com sucesso"}


class ExportRequest(BaseModel):
    transcription_ids: List[int]


@router.post("/export")
async def export_transcriptions(
    request: ExportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transcription).filter(
            Transcription.id.in_(request.transcription_ids),
            Transcription.user_id == current_user.id,
        )
    )
    items = result.scalars().all()
    if not items:
        raise HTTPException(status_code=404, detail="Nenhuma transcrição encontrada")

    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, "w") as zf:
        for t in items:
            safe_title = "".join(x for x in t.title if x.isalnum() or x in " -_").strip()
            content = f"-------------------\n{t.title}\n- {t.summary or ''}\n-------------------\n\n{t.transcription_md}"
            zf.writestr(f"{safe_title}_{t.id}.md", content)
    memory_file.seek(0)
    return StreamingResponse(
        memory_file,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=transcricoes.zip"},
    )
