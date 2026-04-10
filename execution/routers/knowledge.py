import asyncio
import json
import logging
import os
import traceback
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import google.generativeai as genai

from database import get_db
from models import User, Analysis, KnowledgeBase
from auth import get_current_user_dual as get_current_user
from analyzer import configure_genai
from workspace_utils import resolve_workspace, check_permission, workspace_filters, WorkspaceInfo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

# Hard caps, mirrored in ContentGenerator.jsx / IdeaGenerator.jsx.
MAX_VIDEOS_PER_KB = 50
# Upload de base pronta: 500 KB de texto aguenta ~80k palavras, o que
# já é muito mais do que qualquer base compilada realista precisa.
MAX_UPLOAD_BYTES = 500 * 1024


def _find_directive_file(filename: str) -> Optional[str]:
    """Locate a file inside the directives/ folder.

    The directives are kept in TWO locations inside the repo:
      - execution/directives/ (colocated with the backend — always deployed)
      - directives/           (project root, mirror for visibility)
    This helper prefers execution/directives/ because that's the only path
    guaranteed to exist regardless of Railway's "Root Directory" setting.
    It still checks fallbacks so local dev works with just the root copy.
    """
    this_file = os.path.abspath(__file__)
    routers_dir = os.path.dirname(this_file)          # .../execution/routers
    execution_dir = os.path.dirname(routers_dir)      # .../execution
    project_root = os.path.dirname(execution_dir)     # .../project-root

    candidates = [
        # 1. Co-located with the backend — works on Railway no matter what
        os.path.join(execution_dir, "directives", filename),
        # 2. Project root mirror (local dev)
        os.path.join(project_root, "directives", filename),
        # 3. Railway/Docker default app dir
        os.path.join("/app", "directives", filename),
        os.path.join("/app", "execution", "directives", filename),
        # 4. CWD-relative fallbacks
        os.path.join(os.getcwd(), "directives", filename),
        os.path.join(os.getcwd(), "..", "directives", filename),
    ]
    for p in candidates:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            logger.info(f"directive resolved: {filename} -> {abs_p}")
            return abs_p

    logger.error(
        f"directive not found for {filename}. Candidates tried:\n"
        + "\n".join(os.path.abspath(c) for c in candidates)
    )
    return None


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


# ── Debug ────────────────────────────────────────────

@router.get("/_debug/directives")
async def debug_directives(current_user: User = Depends(get_current_user)):
    """Introspect where the backend is looking for directive files.
    Returns the first matching path for each known directive + all
    candidates so we can diagnose deploy issues."""
    files = [
        "prompt-compilador-base-viral.md",
        "viral-content-agent.md",
        "prompt-agente-viral-v2.md",
    ]
    result = {
        "cwd": os.getcwd(),
        "__file__": os.path.abspath(__file__),
        "directives": {},
    }
    this_file = os.path.abspath(__file__)
    routers_dir = os.path.dirname(this_file)
    execution_dir = os.path.dirname(routers_dir)
    project_root = os.path.dirname(execution_dir)

    for name in files:
        candidates = [
            os.path.join(execution_dir, "directives", name),
            os.path.join(project_root, "directives", name),
            os.path.join("/app", "directives", name),
            os.path.join("/app", "execution", "directives", name),
            os.path.join(os.getcwd(), "directives", name),
            os.path.join(os.getcwd(), "..", "directives", name),
        ]
        candidate_status = [
            {"path": os.path.abspath(c), "exists": os.path.exists(os.path.abspath(c))}
            for c in candidates
        ]
        found = next((c["path"] for c in candidate_status if c["exists"]), None)
        result["directives"][name] = {"found": found, "candidates": candidate_status}

    return result


# ── CRUD ─────────────────────────────────────────────

@router.get("/")
async def list_knowledge_bases(
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    result = await db.execute(
        select(KnowledgeBase)
        .filter(*workspace_filters(KnowledgeBase, ws, current_user.id))
        .order_by(KnowledgeBase.created_at.desc())
    )
    return [kb_to_dict(kb) for kb in result.scalars().all()]


@router.post("/")
async def create_knowledge_base(
    body: KBCreate,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    kb = KnowledgeBase(
        user_id=current_user.id,
        workspace_id=ws.id,
        name=body.name,
        selected_ids="[]",
        is_stale=1,
    )
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return kb_to_dict(kb)


@router.get("/{kb_id}")
async def get_knowledge_base(
    kb_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, *workspace_filters(KnowledgeBase, ws, current_user.id))
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")
    return kb_to_dict(kb)


@router.patch("/{kb_id}")
async def update_knowledge_base(
    kb_id: int,
    body: KBUpdate,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, *workspace_filters(KnowledgeBase, ws, current_user.id))
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
async def delete_knowledge_base(
    kb_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, *workspace_filters(KnowledgeBase, ws, current_user.id))
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")
    await db.delete(kb)
    await db.commit()
    return {"ok": True}


# ── Selection ────────────────────────────────────────

@router.put("/{kb_id}/selection")
async def set_selection(
    kb_id: int,
    body: KBSetSelection,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    if len(body.selected_ids) > MAX_VIDEOS_PER_KB:
        raise HTTPException(status_code=400, detail=f"Máximo de {MAX_VIDEOS_PER_KB} vídeos por base")

    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, *workspace_filters(KnowledgeBase, ws, current_user.id))
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


# ── Upload (base pronta) ─────────────────────────────

@router.post("/{kb_id}/upload")
async def upload_knowledge_base(
    kb_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    """Importa uma base de conhecimento já compilada a partir de um arquivo.

    Aceita .txt e .md em UTF-8, até MAX_UPLOAD_BYTES. O conteúdo é salvo
    direto em `compiled_md` e a base é marcada como não-stale (já pronta
    pra ser usada pelos agentes). Não mexe em `selected_ids` — a base
    importada vive independente dos vídeos do analyzer.
    """
    check_permission(ws, "knowledge")
    # 1. Ownership / workspace check
    result = await db.execute(
        select(KnowledgeBase).filter(
            KnowledgeBase.id == kb_id,
            *workspace_filters(KnowledgeBase, ws, current_user.id),
        )
    )
    kb = result.scalars().first()
    if not kb:
        raise HTTPException(status_code=404, detail="Base não encontrada")

    # 2. Extension check — only .txt / .md
    filename = (file.filename or "").lower()
    if not (filename.endswith(".txt") or filename.endswith(".md")):
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Envie um arquivo .txt ou .md.",
        )

    # 3. Read + size validation
    try:
        raw = await file.read()
    except Exception as e:
        logger.error(f"upload_knowledge_base: erro ao ler upload: {e}")
        raise HTTPException(status_code=400, detail="Não foi possível ler o arquivo enviado.")

    if not raw:
        raise HTTPException(status_code=400, detail="O arquivo enviado está vazio.")

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo muito grande. Limite: {MAX_UPLOAD_BYTES // 1024} KB.",
        )

    # 4. Decode as UTF-8 (reject binaries / wrong encodings with a clear msg)
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Arquivo não está em UTF-8. Salve o arquivo como UTF-8 e tente novamente.",
        )

    if not content.strip():
        raise HTTPException(status_code=400, detail="O conteúdo do arquivo está vazio.")

    # 5. Persist
    kb.compiled_md = content
    kb.is_stale = 0
    await db.commit()
    await db.refresh(kb)

    logger.info(
        f"upload_knowledge_base: kb_id={kb_id} user={current_user.id} "
        f"file={filename} size={len(raw)}B"
    )
    return kb_to_dict(kb)


# ── Compile ──────────────────────────────────────────

@router.post("/{kb_id}/compile")
async def compile_knowledge_base(
    kb_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "knowledge")
    logger.info(f"compile_knowledge_base: kb_id={kb_id} user_id={current_user.id}")

    result = await db.execute(
        select(KnowledgeBase).filter(KnowledgeBase.id == kb_id, *workspace_filters(KnowledgeBase, ws, current_user.id))
    )
    kb = result.scalars().first()
    if not kb:
        logger.warning(f"KB {kb_id} não encontrada para user {current_user.id}")
        raise HTTPException(status_code=404, detail="Base não encontrada")

    selected_ids = json.loads(kb.selected_ids or "[]")
    if not selected_ids:
        raise HTTPException(status_code=400, detail="Nenhum vídeo selecionado. Adicione vídeos à base antes de compilar.")

    # Fetch all selected analyses (scoped to workspace)
    analysis_result = await db.execute(
        select(Analysis).filter(Analysis.id.in_(selected_ids), *workspace_filters(Analysis, ws, current_user.id))
    )
    analyses = analysis_result.scalars().all()

    if not analyses:
        raise HTTPException(status_code=400, detail="Nenhuma análise encontrada para os IDs selecionados. Os vídeos podem ter sido removidos.")

    logger.info(f"compile_knowledge_base: compiling {len(analyses)} analyses")

    # Build the raw content for the compiler agent
    raw_content = ""
    for a in analyses:
        raw_content += f"\n{'='*60}\nANÁLISE: {a.title} (ID: {a.id})\n{'='*60}\n{a.report_md or ''}\n"

    # Load compiler agent prompt from directives file (robust path resolution)
    directives_path = _find_directive_file("prompt-compilador-base-viral.md")
    if not directives_path:
        raise HTTPException(
            status_code=500,
            detail="Arquivo de diretiva do compilador não encontrado no servidor. Verifique o deploy."
        )
    try:
        with open(directives_path, "r", encoding="utf-8") as f:
            compiler_prompt = f.read()
    except Exception as e:
        logger.error(f"Erro ao ler diretiva {directives_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo de diretiva: {str(e)[:150]}")

    api_key = configure_genai()
    if not api_key:
        logger.error("GEMINI_API_KEY não configurada")
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY não configurada no servidor")

    try:
        model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=compiler_prompt)
        response = await asyncio.to_thread(
            model.generate_content,
            f"Compile as seguintes {len(analyses)} análises em uma base de conhecimento unificada:\n\n{raw_content}",
            request_options={"timeout": 180},
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
