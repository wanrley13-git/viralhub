import json
import logging
import traceback
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import google.generativeai as genai

from database import get_db
from models import User, Analysis, KnowledgeBase
from auth import get_current_user_dual as get_current_user
from analyzer import configure_genai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# ── Schemas ──────────────────────────────────────────

class KBCreate(BaseModel):
    name: str = "Nova Base"

class KBUpdate(BaseModel):
    name: Optional[str] = None
    selected_ids: Optional[List[int]] = None
    compiled_md: Optional[str] = None

class KBSetSelection(BaseModel):
    selected_ids: List[int]


# ── Helpers ──────────────────────────────────────────

def kb_to_dict(kb):
    return {
        "id": kb.id,
        "user_id": kb.user_id,
        "name": kb.name,
        "selected_ids": json.loads(kb.selected_ids or "[]"),
        "compiled_md": kb.compiled_md,
        "is_stale": kb.is_stale,
        "created_at": kb.created_at.isoformat() if kb.created_at else None,
    }


# ── CRUD ─────────────────────────────────────────────

@router.get("/")
async def list_knowledge_bases(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase)
        .filter(KnowledgeBase.user_id == current_user.id)
        .order_by(KnowledgeBase.created_at.desc())
    )
    return [kb_to_dict(kb) for kb in result.scalars().all()]


@router.post("/")
async def create_knowledge_base(body: KBCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    kb = KnowledgeBase(
        user_id=current_user.id,
        name=body.name,
        selected_ids="[]",
        is_stale=1,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return kb_to_dict(kb)


@router.get("/{kb_id}")
async def get_knowledge_base(kb_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")
    return kb_to_dict(kb)


@router.patch("/{kb_id}")
async def update_knowledge_base(kb_id: int, body: KBUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")

    if body.name is not None:
        kb.name = body.name
    if body.selected_ids is not None:
        kb.selected_ids = json.dumps(body.selected_ids)
        kb.is_stale = 1  # selection changed → needs recompile
    if body.compiled_md is not None:
        kb.compiled_md = body.compiled_md

    await db.commit()
    await db.refresh(kb)
    return kb_to_dict(kb)


@router.delete("/{kb_id}")
async def delete_knowledge_base(kb_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")
    await db.delete(kb)
    await db.commit()
    return {"ok": True}


# ── Selection ────────────────────────────────────────

@router.put("/{kb_id}/selection")
async def set_selection(kb_id: int, body: KBSetSelection, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if len(body.selected_ids) > 30:
        raise HTTPException(status_code=400, detail="Máximo de 30 vídeos por base")

    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")

    old_ids = json.loads(kb.selected_ids or "[]")
    kb.selected_ids = json.dumps(body.selected_ids)

    # Mark stale only if selection actually changed
    if set(old_ids) != set(body.selected_ids):
        kb.is_stale = 1

    await db.commit()
    await db.refresh(kb)
    return kb_to_dict(kb)


# ── Compile ──────────────────────────────────────────

@router.post("/{kb_id}/compile")
async def compile_knowledge_base(kb_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    logger.info(f"compile_knowledge_base: kb_id={kb_id} user_id={current_user.id}")

    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == current_user.id)
    )
    kb = result.scalars().first()
    if not kb:
        logger.warning(f"KB {kb_id} não encontrada para user {current_user.id}")
        raise HTTPException(status_code=404, detail="Base não encontrada")

    selected_ids = json.loads(kb.selected_ids or "[]")
    if not selected_ids:
        raise HTTPException(status_code=400, detail="Nenhum vídeo selecionado. Adicione vídeos à base antes de compilar.")

    # Fetch all selected analyses
    analysis_result = await db.execute(
        select(Analysis).filter(Analysis.id.in_(selected_ids), Analysis.user_id == current_user.id)
    )
    analyses = analysis_result.scalars().all()

    if not analyses:
        raise HTTPException(status_code=400, detail="Nenhuma análise encontrada para os IDs selecionados. Os vídeos podem ter sido removidos.")

    logger.info(f"compile_knowledge_base: compiling {len(analyses)} analyses")

    # Build the raw content for the compiler agent
    raw_content = ""
    for a in analyses:
        raw_content += f"\n{'='*60}\nANÁLISE: {a.title} (ID: {a.id})\n{'='*60}\n{a.report_md or ''}\n"

    # Load compiler agent prompt from directives file
    import os
    directives_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "directives", "prompt-compilador-base-viral.md")
    try:
        with open(directives_path, "r", encoding="utf-8") as f:
            compiler_prompt = f.read()
    except FileNotFoundError:
        logger.error(f"Diretiva do compilador não encontrada em {directives_path}")
        raise HTTPException(status_code=500, detail="Arquivo de diretiva do compilador não encontrado no servidor")

    api_key = configure_genai()
    if not api_key:
        logger.error("GEMINI_API_KEY não configurada")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada no servidor")

    try:
        model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=compiler_prompt)
        response = model.generate_content(
            f"Compile as seguintes {len(analyses)} análises em uma base de conhecimento unificada:\n\n{raw_content}"
        )
        compiled = getattr(response, "text", None)

        if not compiled or not compiled.strip():
            logger.error(f"compile_knowledge_base: resposta vazia do Gemini para kb_id={kb_id}")
            raise HTTPException(status_code=500, detail="A IA retornou uma resposta vazia. Tente novamente.")

        kb.compiled_md = compiled
        kb.is_stale = 0
        await db.commit()
        await db.refresh(kb)

        logger.info(f"compile_knowledge_base: success kb_id={kb_id} ({len(compiled)} chars)")
        return kb_to_dict(kb)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao compilar base {kb_id}: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erro na compilação: {str(e)[:200]}")
