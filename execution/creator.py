import os
import json
import google.generativeai as genai
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import User, Analysis, ContentTask, ChatSession, ChatMessage, KnowledgeBase, Tone
from auth import get_current_user_dual as get_current_user
from analyzer import configure_genai
from workspace_utils import resolve_workspace, check_permission, workspace_filters, WorkspaceInfo

AGENT_PROMPT_FILE = os.path.join(os.path.dirname(__file__), '..', 'directives', 'viral-content-agent.md')

def get_agent_instruction():
    if os.path.exists(AGENT_PROMPT_FILE):
        with open(AGENT_PROMPT_FILE, 'r', encoding='utf-8') as f:
            return f.read()
    return "Você é o Viral Content Machine. Crie conteúdos virais."

router = APIRouter(prefix="/creator", tags=["creator"])

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[int] = None
    analysis_ids: Optional[List[int]] = []
    knowledge_base_id: Optional[int] = None
    tone_id: Optional[int] = None

class ChatResponse(BaseModel):
    response: str
    suggested_task: Optional[dict] = None # Se a IA sugerir criar um card

@router.get("/sessions")
async def get_sessions(
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "content")
    result = await db.execute(
        select(ChatSession)
        .filter(*workspace_filters(ChatSession, ws, current_user.id))
        .order_by(ChatSession.created_at.desc())
    )
    return result.scalars().all()

@router.get("/sessions/{session_id}")
async def get_session_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "content")
    # Valida dono/workspace
    result = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, *workspace_filters(ChatSession, ws, current_user.id))
    )
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    msg_result = await db.execute(select(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()))
    return msg_result.scalars().all()

class RenameSessionRequest(BaseModel):
    title: str

@router.patch("/sessions/{session_id}")
async def rename_session(
    session_id: int,
    request: RenameSessionRequest,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "content")
    result = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, *workspace_filters(ChatSession, ws, current_user.id))
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    session.title = request.title
    await db.commit()
    return {"ok": True}

@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "content")
    result = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, *workspace_filters(ChatSession, ws, current_user.id))
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    # Delete messages first
    msgs = await db.execute(select(ChatMessage).filter(ChatMessage.session_id == session_id))
    for msg in msgs.scalars().all():
        await db.delete(msg)
    await db.delete(session)
    await db.commit()
    return {"ok": True}

@router.post("/chat")
async def chat_with_agent(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    ws: WorkspaceInfo = Depends(resolve_workspace),
    db: AsyncSession = Depends(get_db),
):
    check_permission(ws, "content")
    configure_genai()

    # 1. Gerenciar a Sessão no DB
    session_id = request.session_id
    if not session_id:
        title = request.message[:30] + "..." if len(request.message) > 30 else request.message
        new_session = ChatSession(user_id=current_user.id, workspace_id=ws.id, title=title)
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        session_id = new_session.id
    else:
        result = await db.execute(
            select(ChatSession).filter(ChatSession.id == session_id, *workspace_filters(ChatSession, ws, current_user.id))
        )
        if not result.scalars().first():
            raise HTTPException(status_code=404, detail="Sessão inválida")

    # 2. Salvar mensagem do usuário no Banco
    user_msg_db = ChatMessage(session_id=session_id, role="user", content=request.message)
    db.add(user_msg_db)
    
    # Busca histórico do DB para o Gemini (apenas dessa sessão atual)
    msg_result = await db.execute(select(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()))
    hist_messages = msg_result.scalars().all()
    
    chat_history = []
    for msg in hist_messages:
        # Pula a mensagem atual que acabamos de salvar na lista
        if msg.id == user_msg_db.id: continue
        chat_history.append({"role": msg.role, "parts": [msg.content]})
        
    # ── Build context: compiled KB or raw analyses ──
    context_text = ""
    thumbnail_url = None
    context_source = "nenhum"

    # 1. Try compiled knowledge base first
    if request.knowledge_base_id:
        import json as _json
        kb_result = await db.execute(
            select(KnowledgeBase).filter(
                KnowledgeBase.id == request.knowledge_base_id,
                *workspace_filters(KnowledgeBase, ws, current_user.id),
            )
        )
        kb = kb_result.scalars().first()
        if kb and kb.compiled_md and kb.is_stale == 0:
            context_text = kb.compiled_md
            context_source = f"base compilada '{kb.name}'"
            # Get a thumbnail from one of the selected analyses
            selected_ids = _json.loads(kb.selected_ids or "[]")
            if selected_ids:
                thumb_result = await db.execute(
                    select(Analysis).filter(Analysis.id.in_(selected_ids), Analysis.thumbnail_url.isnot(None)).limit(1)
                )
                thumb_a = thumb_result.scalars().first()
                if thumb_a:
                    thumbnail_url = thumb_a.thumbnail_url

    # 2. Fallback: raw analyses (if no KB selected)
    if not context_text:
        analysis_result = await db.execute(
            select(Analysis).filter(*workspace_filters(Analysis, ws, current_user.id))
            .order_by(Analysis.created_at.desc()).limit(50)
        )
        analyses = analysis_result.scalars().all()
        for a in analyses:
            context_text += f"\n--- ID_{a.id}: {a.title} ---\n{a.report_md}\n"
            if not thumbnail_url and a.thumbnail_url:
                thumbnail_url = a.thumbnail_url
        if analyses:
            context_source = f"{len(analyses)} análises brutas"

    # ── Mention support: inject specific analysis on @ID ──
    mention_context = ""
    if "@" in request.message:
        import re
        mention_ids = re.findall(r'@(\d+)', request.message)
        if mention_ids:
            for mid in mention_ids:
                m_result = await db.execute(
                    select(Analysis).filter(Analysis.id == int(mid), *workspace_filters(Analysis, ws, current_user.id))
                )
                m_analysis = m_result.scalars().first()
                if m_analysis:
                    mention_context += f"\n--- ANÁLISE MENCIONADA ID_{m_analysis.id}: {m_analysis.title} ---\n{m_analysis.report_md}\n"
                    if not thumbnail_url and m_analysis.thumbnail_url:
                        thumbnail_url = m_analysis.thumbnail_url

    # ── Build tone context ──
    tone_text = ""
    if request.tone_id:
        tone_result = await db.execute(
            select(Tone).filter(Tone.id == request.tone_id, *workspace_filters(Tone, ws, current_user.id))
        )
        tone = tone_result.scalars().first()
        if tone and tone.tone_md:
            tone_text = tone.tone_md

    # Prompt do Sistema — Viral Content Machine
    agent_instruction = get_agent_instruction()

    system_prompt = f"""{agent_instruction}

---

## ARQUIVO 1 — DATABASE DE VIRAIS ({context_source})

{context_text if context_text else "Nenhuma análise ou base disponível no momento."}

{f"ANÁLISES MENCIONADAS PELO USUÁRIO:{mention_context}" if mention_context else ""}

---

## ARQUIVO 2 — TOM DO USUÁRIO

{tone_text if tone_text else "Nenhum tom fornecido. Use tom direto, profissional mas acessível."}

---

INSTRUÇÃO ADICIONAL DO SISTEMA:
O usuário pode citar uma análise específica usando "@ID" (ex: @12). Se ele fizer isso, foque prioritariamente naquele relatório.
SEMPRE encerre suas sugestões de conteúdo com um bloco JSON especial (no final da mensagem) se você criar um roteiro completo.

BLOCO JSON OBRIGATÓRIO PARA CARDS:
```json
{{
  "action": "create_task",
  "title": "Título Curto do Conteúdo",
  "tag": "Reels",
  "content": "Conteúdo gerado aqui"
}}
```
Tags: "Reels", "Carrossel", "Post", "Vídeo Longo".
"""

    model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system_prompt)
        
    try:
        chat = model.start_chat(history=chat_history)
        response = chat.send_message(request.message)
        response_text = response.text
        
        # Tenta extrair sugestão de task
        suggested_task = None
        has_suggest = 0
        json_str = None
        
        if "```json" in response_text:
            try:
                json_part = response_text.split("```json")[1].split("```")[0].strip()
                suggested_task = json.loads(json_part)
                # Tenta associar a thumb da análise citada ou da mais recente
                if thumbnail_url:
                    suggested_task["thumbnail_url"] = thumbnail_url
                has_suggest = 1
                json_str = json.dumps(suggested_task)
            except:
                pass
                
        # Salva Resposta do Model no DB
        ai_msg_db = ChatMessage(
            session_id=session_id, 
            role="model", 
            content=response_text,
            has_suggestion=has_suggest,
            suggestion_json=json_str
        )
        db.add(ai_msg_db)
        await db.commit()
        
        return {
            "session_id": session_id,
            "response": response_text, 
            "suggested_task": suggested_task
        }
        
    except Exception as e:
        print(f"Erro no Chat Gemini: {e}")
        # Mesmo se falhar, tenta salvar a mensagem do user que adicionamos antes
        await db.commit() 
        raise HTTPException(status_code=500, detail=f"Erro na conexão com a IA Studio: {str(e)}")
