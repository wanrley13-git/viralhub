import os
import json
import uuid
import logging
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, or_
import google.generativeai as genai
from dotenv import load_dotenv

from database import get_db
from models import User, Analysis, Transcription, KnowledgeBase, Tone, ContentIdea
from auth import get_current_user_dual as get_current_user

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])


class GenerateRequest(BaseModel):
    prompt: str
    tone_id: Optional[int] = None
    base_id: Optional[int] = None
    reference_ids: List[int] = []
    quantity: int = 5


class IdeaOut(BaseModel):
    id: int
    title: str
    summary: Optional[str] = None
    status: str
    is_saved: bool = False
    is_dismissed: bool = False
    batch_id: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


def _serialize(idea: ContentIdea) -> IdeaOut:
    return IdeaOut(
        id=idea.id,
        title=idea.title,
        summary=idea.summary,
        status=idea.status or "idea",
        is_saved=bool(idea.is_saved),
        is_dismissed=bool(idea.is_dismissed),
        batch_id=idea.batch_id,
        created_at=idea.created_at.isoformat() if idea.created_at else None,
    )


@router.get("/ideas", response_model=List[IdeaOut])
async def list_ideas(
    tab: str = Query("ideas", regex="^(ideas|history|saved)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ContentIdea).where(ContentIdea.user_id == current_user.id)

    if tab == "ideas":
        # Active ideas (not dismissed)
        query = query.where(or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None)))
    elif tab == "saved":
        query = query.where(ContentIdea.is_saved == 1)
    # history: no extra filter (show all)

    query = query.order_by(desc(ContentIdea.created_at))

    if tab == "history":
        query = query.limit(100)

    result = await db.execute(query)
    ideas = result.scalars().all()
    return [_serialize(i) for i in ideas]


async def _toggle_save_impl(
    idea_id: int,
    db: AsyncSession,
    current_user: User,
):
    logger.info(f"toggle_save called: idea_id={idea_id} user_id={current_user.id}")
    try:
        result = await db.execute(
            select(ContentIdea).where(
                ContentIdea.id == idea_id,
                ContentIdea.user_id == current_user.id,
            )
        )
        idea = result.scalars().first()
        if not idea:
            logger.warning(f"Ideia {idea_id} não encontrada para user {current_user.id}")
            raise HTTPException(status_code=404, detail="Ideia não encontrada.")
        idea.is_saved = 0 if idea.is_saved else 1
        await db.commit()
        await db.refresh(idea)
        return _serialize(idea)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro em toggle_save: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao alternar save: {str(e)}")


@router.patch("/ideas/{idea_id}/save", response_model=IdeaOut)
async def toggle_save_patch(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _toggle_save_impl(idea_id, db, current_user)


# POST alias for clients/proxies that don't support PATCH
@router.post("/ideas/{idea_id}/save", response_model=IdeaOut)
async def toggle_save_post(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _toggle_save_impl(idea_id, db, current_user)


@router.delete("/ideas")
async def clear_ideas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-clear: marks all user ideas as dismissed (hidden from Ideias tab).
    Saved ideas remain accessible in Salvos tab, history keeps them all."""
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.user_id == current_user.id,
            or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None)),
        )
    )
    ideas = result.scalars().all()
    for idea in ideas:
        idea.is_dismissed = 1
    await db.commit()
    return {"ok": True, "dismissed": len(ideas)}


@router.delete("/ideas/{idea_id}")
async def delete_idea(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ContentIdea).where(ContentIdea.id == idea_id, ContentIdea.user_id == current_user.id)
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")
    await db.delete(idea)
    await db.commit()
    return {"ok": True}


@router.post("/generate", response_model=List[IdeaOut])
async def generate_content(
    request: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="O prompt não pode estar vazio.")

    if request.quantity < 1 or request.quantity > 40:
        raise HTTPException(status_code=400, detail="Quantidade deve ser entre 1 e 40.")

    # ── Gather context ──
    tone_text = ""
    base_text = ""
    references_text = ""

    if request.tone_id:
        result = await db.execute(
            select(Tone).where(Tone.id == request.tone_id, Tone.user_id == current_user.id)
        )
        tone = result.scalars().first()
        if tone and tone.tone_md:
            tone_text = tone.tone_md

    if request.base_id:
        result = await db.execute(
            select(KnowledgeBase).where(
                KnowledgeBase.id == request.base_id,
                KnowledgeBase.user_id == current_user.id,
            )
        )
        kb = result.scalars().first()
        if kb and kb.compiled_md:
            base_text = kb.compiled_md

    if request.reference_ids:
        result = await db.execute(
            select(Analysis).where(
                Analysis.id.in_(request.reference_ids),
                Analysis.user_id == current_user.id,
            )
        )
        for a in result.scalars().all():
            references_text += f"\n\n### Análise: {a.title}\n{a.report_md or ''}"

        result = await db.execute(
            select(Transcription).where(
                Transcription.id.in_(request.reference_ids),
                Transcription.user_id == current_user.id,
            )
        )
        for t in result.scalars().all():
            references_text += f"\n\n### Transcrição: {t.title}\n{t.summary or ''}"

    # ── Build Gemini prompt ──
    system_prompt = f"""Você é um especialista em criação de conteúdo viral para redes sociais.
Sua tarefa é gerar ideias de conteúdo criativas, originais e com alto potencial de viralização.

{"## TOM DE VOZ DO CRIADOR" + chr(10) + tone_text if tone_text else "Use tom direto, criativo e acessível."}

{"## BASE DE CONHECIMENTO" + chr(10) + base_text if base_text else ""}

{"## REFERÊNCIAS DE VÍDEOS" + chr(10) + references_text if references_text else ""}

REGRAS:
- Gere exatamente {request.quantity} ideias
- Cada ideia deve ter um título curto, criativo e chamativo (máx 15 palavras)
- Cada ideia deve ter um resumo de 2-3 frases explicando o conceito do conteúdo, como a chamada de uma notícia. O resumo deve fazer o leitor entender rapidamente do que se trata o vídeo.
- Os títulos devem funcionar como ganchos de vídeo viral
- Considere o tom de voz, base de referência e contexto fornecidos
- Retorne APENAS um JSON array válido, sem markdown, sem texto extra
- Formato: [{{"title": "...", "summary": "..."}}, ...]
"""

    user_message = f"Gere {request.quantity} ideias de conteúdo viral sobre: {request.prompt}"

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    try:
        response = model.generate_content(user_message)
        raw = response.text.strip()

        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[: raw.rfind("```")]
        raw = raw.strip()

        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Resposta não é uma lista.")

        # ── Save to DB with shared batch_id ──
        batch_id = str(uuid.uuid4())
        now = datetime.datetime.utcnow()
        saved = []
        for item in parsed[: request.quantity]:
            idea = ContentIdea(
                user_id=current_user.id,
                title=item.get("title", "Sem título"),
                summary=item.get("summary", ""),
                prompt_used=request.prompt,
                tone_id=request.tone_id,
                base_id=request.base_id,
                status="idea",
                is_saved=0,
                is_dismissed=0,
                batch_id=batch_id,
                created_at=now,
            )
            db.add(idea)
            saved.append(idea)

        await db.commit()
        for idea in saved:
            await db.refresh(idea)

        return [_serialize(i) for i in saved]

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON do Gemini: {e}\nRaw: {raw}")
        raise HTTPException(status_code=500, detail="Erro ao processar resposta da IA.")
    except Exception as e:
        logger.error(f"Erro na geração de conteúdo: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na geração: {str(e)}")
