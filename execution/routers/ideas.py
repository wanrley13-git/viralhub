"""Creative-ideas router.

This router is the backend for the IdeaGenerator page. It intentionally
mirrors the shape of routers/content.py so the frontend stays simple, but
it filters every query by ``idea_type == 'creative'`` so ContentGenerator
and IdeaGenerator never see each other's rows.

Generation uses a different system prompt (``agente-criativo-prompt.md``)
and runs FASE 2 of that agent to produce provocative one-liners, not the
full Viral Content Machine briefings from routers/content.py.
"""

import os
import json
import uuid
import asyncio
import logging
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, or_
import google.generativeai as genai
from google.generativeai import protos as genai_protos
from dotenv import load_dotenv

from database import get_db
from models import User, Analysis, Transcription, KnowledgeBase, Tone, ContentIdea
from auth import get_current_user_dual as get_current_user

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content/ideas", tags=["creative-ideas"])

IDEA_TYPE = "creative"


# ──────────────────────────── schemas ────────────────────────────
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


# ──────────────────────── directive loading ────────────────────────
def _find_directive_file(filename: str) -> Optional[str]:
    """Locate a file inside the directives/ folder. Mirrors the resolver
    in routers/content.py so Railway and local dev both find it."""
    this_file = os.path.abspath(__file__)
    routers_dir = os.path.dirname(this_file)
    execution_dir = os.path.dirname(routers_dir)
    project_root = os.path.dirname(execution_dir)

    candidates = [
        os.path.join(execution_dir, "directives", filename),
        os.path.join(project_root, "directives", filename),
        os.path.join("/app", "directives", filename),
        os.path.join("/app", "execution", "directives", filename),
        os.path.join(os.getcwd(), "directives", filename),
        os.path.join(os.getcwd(), "..", "directives", filename),
    ]
    for p in candidates:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            logger.info(f"creative directive resolved: {filename} -> {abs_p}")
            return abs_p

    logger.error(
        f"creative directive not found for {filename}. Tried:\n"
        + "\n".join(os.path.abspath(c) for c in candidates)
    )
    return None


_CREATIVE_DIRECTIVE_CACHE = None


def _load_creative_directive() -> str:
    global _CREATIVE_DIRECTIVE_CACHE
    if _CREATIVE_DIRECTIVE_CACHE is not None:
        return _CREATIVE_DIRECTIVE_CACHE
    path = _find_directive_file("agente-criativo-prompt.md")
    if not path:
        _CREATIVE_DIRECTIVE_CACHE = ""
        return _CREATIVE_DIRECTIVE_CACHE
    try:
        with open(path, "r", encoding="utf-8") as f:
            _CREATIVE_DIRECTIVE_CACHE = f.read()
    except Exception as e:
        logger.error(f"Erro ao ler diretiva criativa {path}: {e}")
        _CREATIVE_DIRECTIVE_CACHE = ""
    return _CREATIVE_DIRECTIVE_CACHE


def _build_creative_system_prompt(base_text: str, tone_text: str) -> str:
    """Inject base/tone into the creative directive as ARQUIVO 1 / ARQUIVO 2."""
    directive = _load_creative_directive()
    injection = f"""

---

## ARQUIVO 1 — DATABASE DE VIRAIS

{base_text if base_text else "Nenhuma base de conhecimento selecionada."}

---

## ARQUIVO 2 — TOM DO USUÁRIO

{tone_text if tone_text else "Nenhum tom fornecido. Use tom direto, provocador e com personalidade forte."}

---
"""
    return directive + injection


# ──────────────────────────── endpoints ────────────────────────────
@router.get("/list", response_model=List[IdeaOut])
async def list_creative_ideas(
    tab: str = Query("ideas", regex="^(ideas|history|saved)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ContentIdea).where(
        ContentIdea.user_id == current_user.id,
        ContentIdea.idea_type == IDEA_TYPE,
    )

    if tab == "ideas":
        query = query.where(
            or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None))
        )
    elif tab == "saved":
        query = query.where(ContentIdea.is_saved == 1)
    # history: no extra filter

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
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == idea_id,
            ContentIdea.user_id == current_user.id,
            ContentIdea.idea_type == IDEA_TYPE,
        )
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")
    idea.is_saved = 0 if idea.is_saved else 1
    await db.commit()
    await db.refresh(idea)
    return _serialize(idea)


# NOTE on route precedence:
# routers/content.py already owns PATCH/POST /content/ideas/{idea_id}/save
# (via prefix=/content, path=/ideas/{idea_id}/save). FastAPI matches routes
# in registration order, and api.py registers content_router BEFORE this
# one, so content.py's handler wins. That is intentional — its handler
# doesn't filter by idea_type, so it toggles creative ideas correctly too.
# We still define the PATCH handler here to match the spec and keep the
# behaviour creative-scoped if the registration order is ever flipped.
@router.patch("/{idea_id}/save", response_model=IdeaOut)
async def toggle_save_patch(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _toggle_save_impl(idea_id, db, current_user)


@router.delete("/clear")
async def clear_creative_ideas(
    scope: str = Query("active", regex="^(active|history)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Same two-mode clear as content.py, but scoped to creative ideas."""
    if scope == "active":
        result = await db.execute(
            select(ContentIdea).where(
                ContentIdea.user_id == current_user.id,
                ContentIdea.idea_type == IDEA_TYPE,
                or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None)),
            )
        )
        ideas = result.scalars().all()
        for idea in ideas:
            idea.is_dismissed = 1
        await db.commit()
        return {"ok": True, "dismissed": len(ideas)}

    # scope == "history": hard-delete non-favorited creative ideas
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.user_id == current_user.id,
            ContentIdea.idea_type == IDEA_TYPE,
            or_(ContentIdea.is_saved == 0, ContentIdea.is_saved.is_(None)),
        )
    )
    ideas = result.scalars().all()
    count = len(ideas)
    for idea in ideas:
        await db.delete(idea)
    await db.commit()
    return {"ok": True, "deleted": count}


@router.post("/generate", response_model=List[IdeaOut])
async def generate_creative_ideas(
    request: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="O prompt não pode estar vazio.")

    if request.quantity < 1 or request.quantity > 40:
        raise HTTPException(status_code=400, detail="Quantidade deve ser entre 1 e 40.")

    # ── Gather optional context ──
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

    # ── Build system prompt from the creative directive ──
    system_prompt = _build_creative_system_prompt(base_text, tone_text)
    if references_text:
        system_prompt += (
            "\n\n## REFERÊNCIAS DE VÍDEOS\n"
            + references_text
            + "\n\n---\n"
        )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)

    # ── Step 1: Refine the prompt with Google Search grounding ──
    # A short Gemini call with google_search_retrieval enabled turns raw
    # user input (which may mention tools, releases or techniques the base
    # model doesn't know with certainty) into a structured briefing backed
    # by web results. This step is intentionally NON-FATAL: if it fails for
    # ANY reason (timeout, SDK version without the tools kwarg, grounding
    # disabled for the API key, rate limits, …) we fall back to the
    # original prompt so the creative agent always runs.
    #
    # NOTE on the tool form: google-generativeai 0.8.2 does NOT accept the
    # string shorthand ``tools='google_search_retrieval'`` — only
    # ``'code_execution'`` is accepted as a string. The working form in
    # this SDK version is the explicit proto Tool below. Newer SDK
    # releases accept the shorthand; both live paths fail-safely via the
    # surrounding try/except.
    refined_prompt = request.prompt
    try:
        refiner_model = genai.GenerativeModel(
            "gemini-2.5-flash",
            system_instruction=(
                "Você é um refinador de briefings para criação de conteúdo com vídeos gerados por IA. "
                "Seu trabalho é receber o pedido do usuário, entender EXATAMENTE quais ferramentas e features ele menciona, "
                "e retornar um briefing claro e contextualizado.\n\n"
                "CONTEXTO ESSENCIAL — Ferramentas de IA para geração de vídeo:\n"
                "Estas são ferramentas que GERAM VÍDEOS a partir de prompts de texto e/ou imagens de referência. "
                "NÃO são ferramentas de dança, performance ou arte corporal.\n"
                "- Seedance 2.0 (ByteDance): modelo de geração de vídeo com IA. 'Multi-referências' = usar múltiplas imagens como input (ex: rosto + roupa + cenário) para a IA combinar tudo num vídeo coerente.\n"
                "- Kling (Kuaishou): modelo de geração de vídeo com IA. Suporta referências de imagem e motion.\n"
                "- Runway (Gen-3/4): modelo de geração de vídeo com IA. Foco em movimento realista e controle de câmera.\n"
                "- Sora (OpenAI): modelo de geração de vídeo com IA. Simula física realista.\n"
                "- Veo (Google): modelo de geração de vídeo com IA. Renderização detalhada.\n"
                "- Wan (Alibaba): modelo de geração de vídeo com IA open-source.\n"
                "- Hailuo/MiniMax: modelo de geração de vídeo com IA.\n\n"
                "REGRAS:\n"
                "1. Se o usuário mencionar qualquer ferramenta acima ou similar, USE o conhecimento fornecido. Pesquise na web para complementar com informações atualizadas sobre features e capacidades específicas.\n"
                "2. Se o usuário mencionar uma ferramenta ou feature que você não conhece E que não está listada acima, pesquise na web antes de contextualizar.\n"
                "3. Retorne um briefing claro e estruturado que explique o que o usuário quer, qual ferramenta vai usar, e quais features/capacidades específicas estão envolvidas.\n"
                "4. Não invente capacidades que a ferramenta não tem. Se não encontrar informação confirmada, diga o que sabe e sinalize o que não confirmou.\n"
                "5. Não gere ideias. Apenas refine e enriqueça o pedido original."
            ),
        )
        search_tool = genai_protos.Tool(
            google_search_retrieval=genai_protos.GoogleSearchRetrieval()
        )
        refine_response = await asyncio.to_thread(
            refiner_model.generate_content,
            request.prompt,
            tools=[search_tool],
            request_options={"timeout": 30},
        )
        refined_text = (getattr(refine_response, "text", None) or "").strip()
        if refined_text:
            refined_prompt = refined_text
    except Exception as refine_err:
        logger.warning(
            f"Refinador com Google Search falhou, usando prompt original: {refine_err}"
        )

    logger.info(f"Prompt original: {request.prompt}")
    logger.info(f"Prompt refinado: {refined_prompt}")

    # ── Step 2: Build the user_message for the creative agent with the
    # refined briefing substituting the raw prompt ──
    user_message = (
        "Com base no briefing a seguir, execute a FASE 2 — RAJADA DE IDEIAS. "
        f"Gere exatamente {request.quantity} ideias. "
        "Para cada ideia, retorne um título provocativo e uma frase explicativa. "
        "Retorne APENAS um JSON array válido, sem markdown, sem texto extra. "
        'Formato: [{"title": "...", "summary": "..."}, ...]'
        f"\n\nBriefing: {refined_prompt}"
    )

    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    raw = ""
    try:
        response = await asyncio.to_thread(
            model.generate_content,
            user_message,
            request_options={"timeout": 180},
        )
        raw = (getattr(response, "text", None) or "").strip()

        # Gemini sometimes wraps JSON in ```json fences despite instructions
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[: raw.rfind("```")]
        raw = raw.strip()

        parsed = json.loads(raw)
        if not isinstance(parsed, list):
            raise ValueError("Resposta não é uma lista.")

        # ── Persist ──
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
                idea_type=IDEA_TYPE,
                created_at=now,
            )
            db.add(idea)
            saved.append(idea)

        await db.commit()
        for idea in saved:
            await db.refresh(idea)

        return [_serialize(i) for i in saved]

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON do Gemini (creative): {e}\nRaw: {raw}")
        raise HTTPException(status_code=500, detail="Erro ao processar resposta da IA.")
    except Exception as e:
        logger.error(f"Erro na geração criativa: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro na geração: {str(e)}")
