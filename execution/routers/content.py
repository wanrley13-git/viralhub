import os
import json
import logging
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc
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
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/ideas", response_model=List[IdeaOut])
async def list_ideas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ContentIdea)
        .where(ContentIdea.user_id == current_user.id)
        .order_by(desc(ContentIdea.created_at))
    )
    ideas = result.scalars().all()
    return [
        IdeaOut(
            id=i.id,
            title=i.title,
            summary=i.summary,
            status=i.status,
            created_at=i.created_at.isoformat() if i.created_at else None,
        )
        for i in ideas
    ]


@router.delete("/ideas")
async def clear_all_ideas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ContentIdea).where(ContentIdea.user_id == current_user.id)
    )
    ideas = result.scalars().all()
    for idea in ideas:
        await db.delete(idea)
    await db.commit()
    return {"ok": True, "deleted": len(ideas)}


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
        raise HTTPException(status_code=400, detail="Quantidade deve ser entre 1 e 20.")

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

    # ── Call Gemini ──
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    try:
        response = model.generate_content(user_message)
        raw = response.text.strip()

        # Strip markdown fences
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[: raw.rfind("```")]
        raw = raw.strip()

        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Resposta não é uma lista.")

        # ── Save to DB ──
        saved = []
        now = datetime.datetime.utcnow()
        for item in parsed[: request.quantity]:
            idea = ContentIdea(
                user_id=current_user.id,
                title=item.get("title", "Sem título"),
                summary=item.get("summary", ""),
                prompt_used=request.prompt,
                tone_id=request.tone_id,
                base_id=request.base_id,
                status="idea",
                created_at=now,
            )
            db.add(idea)
            saved.append(idea)

        await db.commit()
        for idea in saved:
            await db.refresh(idea)

        return [
            IdeaOut(
                id=i.id,
                title=i.title,
                summary=i.summary,
                status=i.status,
                created_at=i.created_at.isoformat() if i.created_at else None,
            )
            for i in saved
        ]

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON do Gemini: {e}\nRaw: {raw}")
        raise HTTPException(status_code=500, detail="Erro ao processar resposta da IA.")
    except Exception as e:
        logger.error(f"Erro na geração de conteúdo: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na geração: {str(e)}")
