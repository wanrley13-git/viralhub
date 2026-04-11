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

router = APIRouter(prefix="/content", tags=["content"])

import re as _re

def _append_duration_scene_constraints(user_message: str, prompt: str) -> str:
    """Detect duration/scene constraints in the user prompt and append them
    explicitly to the user_message so Gemini respects them."""
    dur_match = _re.search(r'(\d+)\s*(?:segundos?|segs?|s\b)', prompt, _re.IGNORECASE)
    min_match = _re.search(r'(\d+)\s*(?:minutos?|mins?)\b', prompt, _re.IGNORECASE)
    scene_match = _re.search(r'(\d+)\s*(?:cenas?)\b', prompt, _re.IGNORECASE)

    duration_secs = None
    if dur_match:
        duration_secs = int(dur_match.group(1))
    elif min_match:
        duration_secs = int(min_match.group(1)) * 60

    num_scenes = int(scene_match.group(1)) if scene_match else None

    if duration_secs is None and num_scenes is None:
        return user_message

    lines = ["\n\nRESTRIÇÕES OBRIGATÓRIAS DO USUÁRIO (respeite à risca, não extrapole):"]
    if duration_secs is not None:
        lines.append(f"- Duração total: {duration_secs} segundos")
    if num_scenes is not None:
        lines.append(f"- Número de cenas: {num_scenes} cenas")
    if duration_secs is not None:
        lines.append(f"- A soma das durações de todas as cenas DEVE ser igual a {duration_secs} segundos")

    return user_message + "\n".join(lines)


# NOTE: POST /content/generate is multipart/form-data (so the prompt bar
# can attach images alongside the text prompt). Form fields are declared
# inline on the route signature; this pydantic model is kept only as
# documentation of the shape the route assembles before calling Gemini.
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


def _find_directive_file(filename: str) -> Optional[str]:
    """Locate a file inside the directives/ folder. Prefers
    execution/directives/ (co-located with the backend, always deployed)
    and falls back to the project-root mirror for local dev."""
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
            logger.info(f"directive resolved: {filename} -> {abs_p}")
            return abs_p

    logger.error(
        f"directive not found for {filename}. Tried:\n"
        + "\n".join(os.path.abspath(c) for c in candidates)
    )
    return None


# Cache the agent directive file so it's read once per process
_AGENT_DIRECTIVE_CACHE = None
def _load_agent_directive() -> str:
    global _AGENT_DIRECTIVE_CACHE
    if _AGENT_DIRECTIVE_CACHE is not None:
        return _AGENT_DIRECTIVE_CACHE
    path = _find_directive_file("viral-content-agent.md")
    if not path:
        _AGENT_DIRECTIVE_CACHE = ""
        return _AGENT_DIRECTIVE_CACHE
    try:
        with open(path, "r", encoding="utf-8") as f:
            _AGENT_DIRECTIVE_CACHE = f.read()
    except Exception as e:
        logger.error(f"Erro ao ler diretiva {path}: {e}")
        _AGENT_DIRECTIVE_CACHE = ""
    return _AGENT_DIRECTIVE_CACHE


def _build_develop_system_prompt(base_text: str, tone_text: str) -> str:
    """Inject base and tone into the agent directive as ARQUIVO 1 / ARQUIVO 2 sections."""
    directive = _load_agent_directive()
    injection = f"""

---

## ARQUIVO 1 — DATABASE DE VIRAIS

{base_text if base_text else "Nenhuma base de conhecimento selecionada."}

---

## ARQUIVO 2 — TOM DO USUÁRIO

{tone_text if tone_text else "Nenhum tom fornecido. Use tom direto, profissional mas acessível."}

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


@router.get("/ideas", response_model=List[IdeaOut])
async def list_ideas(
    tab: str = Query("ideas", regex="^(ideas|history|saved|developed)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, "content")
    query = select(ContentIdea).where(*workspace_filters(ContentIdea, ws, current_user.id))

    if tab == "ideas":
        # Active ideas (not dismissed)
        query = query.where(or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None)))
    elif tab == "saved":
        query = query.where(ContentIdea.is_saved == 1)
    elif tab == "developed":
        query = query.where(ContentIdea.status == "developed")
    # history: no extra filter (show all)

    query = query.order_by(desc(ContentIdea.created_at))

    if tab == "history":
        query = query.limit(100)

    result = await db.execute(query)
    ideas = result.scalars().all()
    return [_serialize(i) for i in ideas]


@router.get("/ideas/detail/{idea_id}")
async def get_idea_detail(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == idea_id,
            *workspace_filters(ContentIdea, ws, current_user.id),
        )
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")
    return _serialize(idea, include_developed=True)


async def _toggle_save_impl(
    idea_id: int,
    db: AsyncSession,
    current_user: User,
    ws: WorkspaceInfo,
):
    logger.info(f"toggle_save called: idea_id={idea_id} user_id={current_user.id}")
    try:
        result = await db.execute(
            select(ContentIdea).where(
                ContentIdea.id == idea_id,
                *workspace_filters(ContentIdea, ws, current_user.id),
            )
        )
        idea = result.scalars().first()
        if not idea:
            logger.warning(f"Ideia {idea_id} não encontrada para user {current_user.id}")
            raise HTTPException(status_code=404, detail="Ideia não encontrada.")
        idea.is_saved = 0 if idea.is_saved else 1
        await db.commit()
        await db.refresh(idea)
        return _serialize(idea, include_developed=True)
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
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, "content")
    return await _toggle_save_impl(idea_id, db, current_user, ws)


# POST alias for clients/proxies that don't support PATCH
@router.post("/ideas/{idea_id}/save", response_model=IdeaOut)
async def toggle_save_post(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, "content")
    return await _toggle_save_impl(idea_id, db, current_user, ws)


@router.delete("/ideas")
async def clear_ideas(
    scope: str = Query("active", regex="^(active|history)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Clear ideas with two modes:
    - scope=active (default): soft-dismiss current ideas view. Saved ideas stay
      bookmarked, history keeps them all.
    - scope=history: hard-delete ALL ideas that are not favorited. Favorites
      are preserved. Clears history + ideias view in one shot.
    """
    check_permission(ws, "content")
    if scope == "active":
        result = await db.execute(
            select(ContentIdea).where(
                *workspace_filters(ContentIdea, ws, current_user.id),
                or_(ContentIdea.is_dismissed == 0, ContentIdea.is_dismissed.is_(None)),
            )
        )
        ideas = result.scalars().all()
        for idea in ideas:
            idea.is_dismissed = 1
        await db.commit()
        return {"ok": True, "dismissed": len(ideas)}

    # scope == "history": hard-delete non-favorited
    result = await db.execute(
        select(ContentIdea).where(
            *workspace_filters(ContentIdea, ws, current_user.id),
            or_(ContentIdea.is_saved == 0, ContentIdea.is_saved.is_(None)),
        )
    )
    ideas = result.scalars().all()
    count = len(ideas)
    for idea in ideas:
        await db.delete(idea)
    await db.commit()
    return {"ok": True, "deleted": count}


# IMPORTANT: This route MUST stay declared BEFORE `DELETE /ideas/{idea_id}`
# below. FastAPI matches routes in registration order, and since
# content_router is registered before ideas_router in api.py, a request to
# `DELETE /content/ideas/clear` would otherwise be caught by the int-typed
# `/ideas/{idea_id}` handler and fail with
#   "idea_id: Input should be a valid integer, unable to parse string as an integer"
# IdeaGenerator's frontend hits this endpoint to clear creative ideas; the
# scoped clear handler in routers/ideas.py (DELETE /content/ideas/clear)
# is shadowed by `/ideas/{idea_id}` here, so we mirror its creative-scoped
# behaviour at this level to keep the precedence correct.
@router.delete("/ideas/clear")
async def clear_creative_ideas_scoped(
    scope: str = Query("active", regex="^(active|history)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Clear creative ideas (idea_type='creative') for the current user.

    Mirrors the two-mode behaviour of `DELETE /content/ideas`:
    - scope=active: soft-dismiss active creative ideas (keeps favorites and
      history intact).
    - scope=history: hard-delete all non-favorited creative ideas (keeps
      is_saved=1 rows intact).
    """
    check_permission(ws, "ideas")
    CREATIVE_TYPE = "creative"
    if scope == "active":
        result = await db.execute(
            select(ContentIdea).where(
                *workspace_filters(ContentIdea, ws, current_user.id),
                ContentIdea.idea_type == CREATIVE_TYPE,
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
            ContentIdea.idea_type == CREATIVE_TYPE,
            or_(ContentIdea.is_saved == 0, ContentIdea.is_saved.is_(None)),
        )
    )
    ideas = result.scalars().all()
    count = len(ideas)
    for idea in ideas:
        await db.delete(idea)
    await db.commit()
    return {"ok": True, "deleted": count}


@router.delete("/ideas/{idea_id}")
async def delete_idea(
    idea_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    check_permission(ws, "content")
    result = await db.execute(
        select(ContentIdea).where(ContentIdea.id == idea_id, *workspace_filters(ContentIdea, ws, current_user.id))
    )
    idea = result.scalars().first()
    if not idea:
        raise HTTPException(status_code=404, detail="Ideia não encontrada.")
    await db.delete(idea)
    await db.commit()
    return {"ok": True}


@router.post("/develop", response_model=IdeaOut)
async def develop_content(
    request: DevelopRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Run MODO 4 of Viral Content Machine over a selected idea and store the
    generated markdown on the idea row."""
    check_permission(ws, "content")
    # Fetch the idea and verify ownership / workspace access
    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == request.idea_id,
            *workspace_filters(ContentIdea, ws, current_user.id),
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

    # Build prompts
    system_prompt = _build_develop_system_prompt(base_text, tone_text)

    title = request.title or idea.title or ""
    summary = request.summary or idea.summary or ""
    user_message = (
        f"Crie um conteúdo viral completo no formato Reels sobre o seguinte tema: "
        f"{title}"
        + (f"\n\nResumo: {summary}" if summary else "")
        + "\n\nUse o MODO 4 (Criador de Conteúdo). Entregue o briefing completo "
          "seguindo exatamente o formato de saída para Reels definido na sua diretiva, "
          "com ganchos, takes, legenda e notas de produção."
    )
    user_message = _append_duration_scene_constraints(user_message, f"{title} {summary}")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    try:
        # Run the blocking Gemini call in a worker thread so we don't freeze
        # the FastAPI event loop. Pass a 180s per-request timeout to the
        # transport layer so hung connections fail fast.
        response = await asyncio.to_thread(
            model.generate_content,
            user_message,
            request_options={"timeout": 180},
        )
        content_md = (getattr(response, "text", None) or "").strip()

        if not content_md:
            raise ValueError("Resposta vazia do modelo.")

        # Persist
        idea.developed_content = content_md
        idea.status = "developed"
        await db.commit()
        await db.refresh(idea)

        return _serialize(idea, include_developed=True)

    except Exception as e:
        logger.error(f"Erro em develop_content: {e}", exc_info=True)
        # Roll back status so user can retry
        idea.status = "idea"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao desenvolver conteúdo: {str(e)}")


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
async def adjust_content_idea(
    request: AdjustRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Apply a surgical adjustment to a content idea or its developed content."""
    check_permission(ws, "content")

    result = await db.execute(
        select(ContentIdea).where(
            ContentIdea.id == request.idea_id,
            *workspace_filters(ContentIdea, ws, current_user.id),
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
        logger.error(f"Erro em adjust_content_idea: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao ajustar conteúdo: {str(e)}")


@router.post("/generate", response_model=List[IdeaOut])
async def generate_content(
    prompt: str = Form(...),
    tone_id: Optional[int] = Form(None),
    base_id: Optional[int] = Form(None),
    reference_ids: str = Form("[]"),
    quantity: int = Form(5),
    search_terms: str = Form("[]"),
    # IMPORTANT: must be `List[UploadFile] = File(default=[])`, not
    # `Optional[List[UploadFile]] = File(None)`. In FastAPI 0.111 the
    # Optional variant makes Pydantic v2 reject a single uploaded file
    # with a `list_type` 422 ("Input should be a valid list") because
    # the form parser passes one UploadFile instead of wrapping it.
    # The plain `List[UploadFile]` with `File(default=[])` correctly
    # collects 0..N files under the same field name.
    images: List[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
):
    """Multipart endpoint. `reference_ids` is a JSON-stringified array of
    ints (so the frontend can send it as a single form field); `images`
    is an optional list of uploaded files piped into Gemini as visual
    context. When no images are sent the call behaves exactly like the
    old JSON-only version."""
    check_permission(ws, "content")
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
    # the generative model can consume them as visual context alongside
    # the text prompt.
    image_parts: List[dict] = []
    for img_file in (images or []):
        img_bytes = await img_file.read()
        if not img_bytes:
            continue
        mime = img_file.content_type or "image/png"
        image_parts.append({"mime_type": mime, "data": img_bytes})
    if image_parts:
        logger.info(f"Content generate: {len(image_parts)} imagem(ns) anexada(s)")

    # ── Gather context ──
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

    # ── Build Gemini prompt ──
    system_prompt = f"""Você é um especialista em criação de conteúdo viral para redes sociais.
Sua tarefa é gerar ideias de conteúdo criativas, originais e com alto potencial de viralização.

{"## TOM DE VOZ DO CRIADOR" + chr(10) + tone_text if tone_text else "Use tom direto, criativo e acessível."}

{"## BASE DE CONHECIMENTO" + chr(10) + base_text if base_text else ""}

{"## REFERÊNCIAS DE VÍDEOS" + chr(10) + references_text if references_text else ""}

REGRAS:
- Gere exatamente {quantity} ideias
- Cada ideia deve ter um título curto, criativo e chamativo (máx 15 palavras)
- Cada ideia deve ter um resumo de 2-3 frases explicando o conceito do conteúdo, como a chamada de uma notícia. O resumo deve fazer o leitor entender rapidamente do que se trata o vídeo.
- Os títulos devem funcionar como ganchos de vídeo viral
- Considere o tom de voz, base de referência e contexto fornecidos
- Retorne APENAS um JSON array válido, sem markdown, sem texto extra
- Formato: [{{"title": "...", "summary": "..."}}, ...]
"""

    # ── Web search context ──
    # If the frontend sent search_terms (from inline [term] chips), run
    # grounded Gemini calls in parallel to gather fresh web context.
    parsed_search_terms: list = []
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
        logger.info(f"Search context content:\n{search_context}")

    user_message = f"Gere {quantity} ideias de conteúdo viral sobre: {prompt}"
    if search_context:
        user_message += f"\n\n{search_context}"

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

    user_message = _append_duration_scene_constraints(user_message, prompt)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)

    raw = ""
    try:
        # Multimodal content list: prompt text + any uploaded images so
        # Gemini can ground the generated ideas on the attached visuals.
        generate_contents = [user_message, *image_parts]
        response = await asyncio.to_thread(
            model.generate_content,
            generate_contents,
            request_options={"timeout": 180},
        )
        raw = (getattr(response, "text", None) or "").strip()

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
