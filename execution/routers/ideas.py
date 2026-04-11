"""Creative-ideas router.

This router is the backend for the IdeaGenerator page. It intentionally
mirrors the shape of routers/content.py so the frontend stays simple, but
it filters every query by ``idea_type == 'creative'`` so ContentGenerator
and IdeaGenerator never see each other's rows.

Supports two generation modes:
- **ideias** (default): uses "Modo ideias (agente de ideias rápidas).md"
  to produce fast, provocative one-liners (title + summary).
- **roteirista**: uses "Modo Roteirista (agente de roteiros).md" FASE 1
  to produce story-driven ideas, and FASE 2 (via ``/develop``) to expand
  a selected idea into a full cinematic screenplay in Markdown.
"""

import os
import json
import uuid
import asyncio
import logging
import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, File, Form, UploadFile
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
from workspace_utils import resolve_workspace, check_permission, workspace_filters, WorkspaceInfo

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content/ideas", tags=["creative-ideas"])

IDEA_TYPE = "creative"


# ──────────────────────────── schemas ────────────────────────────
# NOTE: The /generate endpoint is multipart/form-data (to accept image
# uploads alongside the prompt). Form fields are declared inline on the
# route signature; this dataclass-like record is not used as a pydantic
# body anymore — it only exists to document the shape that the route
# assembles internally before passing to the Gemini pipeline.
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
    developed_content: Optional[str] = None
    is_saved: bool = False
    is_dismissed: bool = False
    batch_id: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class DevelopRequest(BaseModel):
    idea_id: int
    title: str
    summary: Optional[str] = ""
    tone_id: Optional[int] = None
    base_id: Optional[int] = None


class AdjustRequest(BaseModel):
    idea_id: int
    instruction: str


def _serialize(idea: ContentIdea, include_developed: bool = False) -> IdeaOut:
    return IdeaOut(
        id=idea.id,
        title=idea.title,
        summary=idea.summary,
        status=idea.status or "idea",
        developed_content=idea.developed_content if include_developed else None,
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
    path = _find_directive_file("Modo ideias (agente de ideias rápidas).md")
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


_ROTEIRIST_DIRECTIVE_CACHE = None


def _load_roteirist_directive() -> str:
    global _ROTEIRIST_DIRECTIVE_CACHE
    if _ROTEIRIST_DIRECTIVE_CACHE is not None:
        return _ROTEIRIST_DIRECTIVE_CACHE
    path = _find_directive_file("Modo Roteirista (agente de roteiros).md")
    if not path:
        _ROTEIRIST_DIRECTIVE_CACHE = ""
        return _ROTEIRIST_DIRECTIVE_CACHE
    try:
        with open(path, "r", encoding="utf-8") as f:
            _ROTEIRIST_DIRECTIVE_CACHE = f.read()
    except Exception as e:
        logger.error(f"Erro ao ler diretiva roteirista {path}: {e}")
        _ROTEIRIST_DIRECTIVE_CACHE = ""
    return _ROTEIRIST_DIRECTIVE_CACHE


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


def _build_roteirist_system_prompt(base_text: str, tone_text: str) -> str:
    """Inject base/tone into the roteirist directive as ARQUIVO 1 / ARQUIVO 2."""
    directive = _load_roteirist_directive()
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


# ──────────────────────── web search grounding ────────────────────────
async def _search_terms_context(terms: list) -> str:
    """For each search term, call Gemini with google_search_retrieval and
    return a combined context string with grounded web results. Calls run
    in parallel via asyncio.gather; individual failures are non-fatal."""
    if not terms:
        return ""

    async def _search_one(term: str) -> str:
        try:
            model = genai.GenerativeModel(
                "gemini-2.5-flash",
                system_instruction=(
                    "Você é um assistente de pesquisa. Pesquise na web e retorne um resumo "
                    "conciso (máx 3 parágrafos) sobre o termo pesquisado. Foque em informações "
                    "factuais, atuais e relevantes para criação de conteúdo viral."
                ),
            )
            search_tool = genai_protos.Tool(
                google_search_retrieval=genai_protos.GoogleSearchRetrieval()
            )
            response = await asyncio.to_thread(
                model.generate_content,
                f"Pesquise sobre: {term}",
                tools=[search_tool],
                request_options={"timeout": 30},
            )
            text = (getattr(response, "text", None) or "").strip()
            return f"### {term}\n{text}" if text else ""
        except Exception as e:
            logger.warning(f"Pesquisa web falhou para '{term}': {e}")
            return ""

    results = await asyncio.gather(*[_search_one(t) for t in terms])
    context_parts = [r for r in results if r]
    if not context_parts:
        return ""
    return "## CONTEXTO DE PESQUISA WEB\n\n" + "\n\n".join(context_parts)


# ──────────────────────────── endpoints ────────────────────────────
@router.get("/list", response_model=List[IdeaOut])
async def list_creative_ideas(
    tab: str = Query("ideas", regex="^(ideas|history|saved|developed)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, "ideas")
    query = select(ContentIdea).where(
        *workspace_filters(ContentIdea, ws, current_user.id),
        ContentIdea.idea_type == IDEA_TYPE,
    )

    if tab == "ideas":
        query = query.where(
            or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None)),
            or_(
                ContentIdea.status == "idea",
                ContentIdea.status.is_(None),
            ),
        )
    elif tab == "saved":
        query = query.where(ContentIdea.is_saved == 1)
    elif tab == "developed":
        query = query.where(
            or_(ContentIdea.status == "developed", ContentIdea.status == "developing")
        )
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
    ws: WorkspaceInfo,
):
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == idea_id,
            *workspace_filters(ContentIdea, ws, current_user.id),
            ContentIdea.idea_type == IDEA_TYPE,
        )
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")
    idea.is_saved = 0 if idea.is_saved else 1
    await db.commit()
    await db.refresh(idea)
    return _serialize(idea, include_developed=True)


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
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, "ideas")
    return await _toggle_save_impl(idea_id, db, current_user, ws)


@router.delete("/clear")
async def clear_creative_ideas(
    scope: str = Query("active", regex="^(active|history)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Same two-mode clear as content.py, but scoped to creative ideas."""
    check_permission(ws, "ideas")
    if scope == "active":
        result = await db.execute(
            select(ContentIdea).where(
                *workspace_filters(ContentIdea, ws, current_user.id),
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
            *workspace_filters(ContentIdea, ws, current_user.id),
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
    prompt: str = Form(...),
    tone_id: Optional[int] = Form(None),
    base_id: Optional[int] = Form(None),
    reference_ids: str = Form("[]"),
    quantity: int = Form(5),
    # IMPORTANT: must be `List[UploadFile] = File(default=[])`, not
    # `Optional[List[UploadFile]] = File(None)`. In FastAPI 0.111 the
    # Optional variant makes Pydantic v2 reject a single uploaded file
    # with a `list_type` 422 ("Input should be a valid list") because
    # the form parser passes one UploadFile instead of wrapping it.
    # The plain `List[UploadFile]` with `File(default=[])` correctly
    # collects 0..N files under the same field name.
    mode: str = Form("ideias"),
    search_terms: str = Form("[]"),
    images: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Multipart endpoint. `reference_ids` is a JSON-stringified array of
    ints (so the frontend can send it as a single form field); `images`
    is an optional list of uploaded files piped into Gemini as visual
    context. When no images are sent the call behaves exactly like the
    old JSON-only version.

    The ``mode`` field selects the generation agent:
    - ``ideias`` (default): fast creative one-liners.
    - ``roteirista``: story-driven ideas via FASE 1 of the roteirist agent.
    """
    check_permission(ws, "ideas")
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="O prompt não pode estar vazio.")

    if quantity < 1 or quantity > 40:
        raise HTTPException(status_code=400, detail="Quantidade deve ser entre 1 e 40.")

    # Parse reference_ids from the JSON-stringified form field.
    try:
        parsed_ref_ids = json.loads(reference_ids) if reference_ids else []
        if not isinstance(parsed_ref_ids, list):
            raise ValueError("reference_ids deve ser um array JSON.")
        parsed_ref_ids = [int(x) for x in parsed_ref_ids]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"reference_ids inválido (esperado JSON array de inteiros): {e}",
        )

    # Read uploaded image bytes into Gemini Part dicts once, up front, so
    # both the refiner and the creative agent can reuse the same list
    # without re-reading the UploadFile streams.
    image_parts: List[dict] = []
    for img_file in (images or []):
        img_bytes = await img_file.read()
        if not img_bytes:
            continue
        mime = img_file.content_type or "image/png"
        image_parts.append({"mime_type": mime, "data": img_bytes})
    if image_parts:
        logger.info(f"Creative generate: {len(image_parts)} imagem(ns) anexada(s)")

    # ── Gather optional context ──
    tone_text = ""
    base_text = ""
    references_text = ""

    if tone_id:
        result = await db.execute(
            select(Tone).where(Tone.id == tone_id, *workspace_filters(Tone, ws, current_user.id))
        )
        tone = result.scalars().first()
        if tone and tone.tone_md:
            tone_text = tone.tone_md

    if base_id:
        result = await db.execute(
            select(KnowledgeBase).where(
                KnowledgeBase.id == base_id,
                *workspace_filters(KnowledgeBase, ws, current_user.id),
            )
        )
        kb = result.scalars().first()
        if kb and kb.compiled_md:
            base_text = kb.compiled_md

    if parsed_ref_ids:
        result = await db.execute(
            select(Analysis).where(
                Analysis.id.in_(parsed_ref_ids),
                *workspace_filters(Analysis, ws, current_user.id),
            )
        )
        for a in result.scalars().all():
            references_text += f"\n\n### Análise: {a.title}\n{a.report_md or ''}"

        result = await db.execute(
            select(Transcription).where(
                Transcription.id.in_(parsed_ref_ids),
                *workspace_filters(Transcription, ws, current_user.id),
            )
        )
        for t in result.scalars().all():
            references_text += f"\n\n### Transcrição: {t.title}\n{t.summary or ''}"

    # ── Build system prompt from the selected directive ──
    is_roteirist = mode == "roteirista"
    if is_roteirist:
        system_prompt = _build_roteirist_system_prompt(base_text, tone_text)
    else:
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

    # ── Web search context (replaces the old refiner) ──
    # If the frontend sent search_terms (from inline [term] chips), run
    # grounded Gemini calls in parallel to gather fresh web context.
    parsed_search_terms: list[str] = []
    try:
        parsed_search_terms = json.loads(search_terms) if search_terms else []
        if not isinstance(parsed_search_terms, list):
            parsed_search_terms = []
        parsed_search_terms = [str(t).strip() for t in parsed_search_terms if str(t).strip()]
    except Exception:
        parsed_search_terms = []

    search_context = ""
    if parsed_search_terms:
        search_context = await _search_terms_context(parsed_search_terms)
        logger.info(f"Search context ({len(parsed_search_terms)} termos): {len(search_context)} chars")

    # ── Build user_message ──
    if is_roteirist:
        user_message = (
            "Com base no briefing a seguir, execute a FASE 1 — GERAÇÃO DE IDEIAS COM HISTÓRIA. "
            f"Gere exatamente {quantity} ideias. "
            "Cada ideia deve ter título evocativo e resumo com arco narrativo (setup, virada, payoff). "
            "Retorne APENAS um JSON array válido, sem markdown, sem texto extra. "
            'Formato: [{"title": "...", "summary": "..."}, ...]'
            f"\n\nPedido do usuário: {prompt}"
            + (f"\n\n{search_context}" if search_context else "")
        )
    else:
        user_message = (
            "Com base no briefing a seguir, gere as ideias criativas. "
            f"Gere exatamente {quantity} ideias. "
            "Para cada ideia, retorne um título provocativo e uma frase explicativa. "
            "Retorne APENAS um JSON array válido, sem markdown, sem texto extra. "
            'Formato: [{"title": "...", "summary": "..."}, ...]'
            f"\n\nPedido do usuário: {prompt}"
            + (f"\n\n{search_context}" if search_context else "")
        )

    # Inject reference context directly into user_message so Gemini
    # treats it as high-priority user input, not just background system info.
    if references_text:
        user_message = (
            "IMPORTANTE: O usuário marcou vídeos de referência. Suas ideias DEVEM ser "
            "inspiradas e baseadas no conteúdo desses vídeos. Use os elementos, temas, "
            "estilo e conceitos presentes nas análises referenciadas como ponto de partida "
            "para as ideias.\n\n"
            f"Vídeos de referência marcados pelo usuário:\n{references_text}\n\n"
            + user_message
        )

    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    raw = ""
    try:
        # Multimodal creative agent: briefing text + same image parts so
        # Gemini can ground the generated ideas on what the user sees.
        creative_contents = [user_message, *image_parts]
        response = await asyncio.to_thread(
            model.generate_content,
            creative_contents,
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
        for item in parsed[:quantity]:
            idea = ContentIdea(
                user_id=current_user.id,
                workspace_id=ws.id,
                title=item.get("title", "Sem título"),
                summary=item.get("summary", ""),
                prompt_used=prompt,
                tone_id=tone_id,
                base_id=base_id,
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


@router.post("/develop", response_model=IdeaOut)
async def develop_creative_idea(
    request: DevelopRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Run FASE 2 of the roteirist agent over a selected creative idea and
    store the generated screenplay markdown on the idea row."""
    check_permission(ws, "ideas")
    # Fetch the idea and verify ownership / workspace access + type
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == request.idea_id,
            *workspace_filters(ContentIdea, ws, current_user.id),
            ContentIdea.idea_type == IDEA_TYPE,
        )
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")

    # Mark as developing
    idea.status = "developing"
    await db.commit()

    # Gather context
    tone_text = ""
    base_text = ""

    tone_id = request.tone_id or idea.tone_id
    base_id = request.base_id or idea.base_id

    if tone_id:
        r = await db.execute(
            select(Tone).where(Tone.id == tone_id, *workspace_filters(Tone, ws, current_user.id))
        )
        tone = r.scalars().first()
        if tone and tone.tone_md:
            tone_text = tone.tone_md

    if base_id:
        r = await db.execute(
            select(KnowledgeBase).where(
                KnowledgeBase.id == base_id,
                *workspace_filters(KnowledgeBase, ws, current_user.id),
            )
        )
        kb = r.scalars().first()
        if kb and kb.compiled_md:
            base_text = kb.compiled_md

    # Build prompts — always use the roteirist directive for develop
    system_prompt = _build_roteirist_system_prompt(base_text, tone_text)

    title = request.title or idea.title or ""
    summary = request.summary or idea.summary or ""
    user_message = (
        "Desenvolva o roteiro completo para a seguinte ideia, "
        "executando a FASE 2 — DESENVOLVIMENTO DE ROTEIRO:\n\n"
        f"Título: {title}\n\n"
        f"Resumo: {summary}"
    )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    try:
        response = await asyncio.to_thread(
            model.generate_content,
            user_message,
            request_options={"timeout": 180},
        )
        content_md = (getattr(response, "text", None) or "").strip()

        if not content_md:
            raise ValueError("Resposta vazia do modelo.")

        logger.info(f"developed_content length: {len(content_md)}")

        # Persist
        idea.developed_content = content_md
        idea.status = "developed"
        await db.commit()
        await db.refresh(idea)

        return _serialize(idea, include_developed=True)

    except Exception as e:
        logger.error(f"Erro em develop_creative_idea: {e}", exc_info=True)
        # Roll back status so user can retry
        idea.status = "idea"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao desenvolver roteiro: {str(e)}")


# ────────────────────── adjust (surgical edit) ──────────────────────

_ADJUST_SYSTEM = (
    "Você é um editor de conteúdo. Seu trabalho é fazer AJUSTES CIRÚRGICOS em conteúdos já criados.\n\n"
    "REGRAS ABSOLUTAS:\n"
    "1. Modifique APENAS o que o usuário pediu. Todo o resto deve permanecer EXATAMENTE igual.\n"
    "2. Mantenha o mesmo formato (se era JSON com title/summary, retorne JSON com title/summary. Se era Markdown, retorne Markdown).\n"
    "3. Mantenha o mesmo tom, estilo e nível de detalhe do conteúdo original.\n"
    "4. Não adicione comentários, explicações ou texto extra fora do conteúdo ajustado.\n"
    "5. Retorne o conteúdo COMPLETO com o ajuste aplicado, não apenas o trecho modificado."
)


@router.post("/adjust", response_model=IdeaOut)
async def adjust_creative_idea(
    request: AdjustRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Apply a surgical adjustment to a creative idea or its developed screenplay."""
    check_permission(ws, "ideas")

    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == request.idea_id,
            *workspace_filters(ContentIdea, ws, current_user.id),
            ContentIdea.idea_type == IDEA_TYPE,
        )
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")

    # Build the user message depending on status
    if idea.status == "developed" and idea.developed_content:
        current_content = idea.developed_content
        content_format = "markdown"
    else:
        current_content = json.dumps({"title": idea.title or "", "summary": idea.summary or ""}, ensure_ascii=False)
        content_format = "json"

    user_message = (
        f"Conteúdo atual:\n{current_content}\n\n"
        f"Ajuste solicitado pelo usuário:\n{request.instruction}\n\n"
        "Retorne o conteúdo completo com o ajuste aplicado. Mantenha tudo que não foi mencionado exatamente igual."
    )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=_ADJUST_SYSTEM)

    try:
        response = await asyncio.to_thread(
            model.generate_content,
            user_message,
            request_options={"timeout": 180},
        )
        raw = (getattr(response, "text", None) or "").strip()
        if not raw:
            raise ValueError("Resposta vazia do modelo.")

        if content_format == "json":
            # Parse JSON — strip markdown fences
            cleaned = raw
            if cleaned.startswith("```"):
                cleaned = "\n".join(cleaned.split("\n")[1:])
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
            parsed = json.loads(cleaned)
            idea.title = parsed.get("title", idea.title)
            idea.summary = parsed.get("summary", idea.summary)
        else:
            idea.developed_content = raw

        await db.commit()
        await db.refresh(idea)
        return _serialize(idea, include_developed=True)

    except json.JSONDecodeError as e:
        logger.error(f"Erro ao parsear JSON de ajuste: {e}\nRaw: {raw}")
        raise HTTPException(status_code=500, detail="Erro ao processar resposta da IA.")
    except Exception as e:
        logger.error(f"Erro em adjust_creative_idea: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao ajustar conteúdo: {str(e)}")
