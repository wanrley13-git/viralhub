# ViralHub

## Como usar este arquivo

Leia este arquivo **antes** de fazer qualquer mudança no projeto. Ele contém a
verdade sobre stack, estrutura e decisões que não estão documentadas em outro
lugar. Se algo aqui estiver desatualizado em relação ao código, o código vence
— mas me avise pra atualizar.

Complementa (não substitui) `CLAUDE.md` (regras de design/commit) e o
`PROJECT_CONTEXT.md` original (análise mais densa da v0 do projeto).

---

## Visão Geral

**ViralHub** é uma plataforma full‑stack para criadores de conteúdo que combina
análise de vídeos virais com IA, transcrição, geração de ideias/conteúdo,
gestão de projetos em Kanban, calendário e um sistema de notas estilo Obsidian.

Plataforma multi‑tenant via **Workspaces** (cada request injeta
`X-Workspace-Id`) com gating de módulos por permissão (`PermissionGate`).

**Status atual (inferido dos commits de abril/2026):**
- Categoria **Cinema** adicionada ao Hub Analítico em 18/abr (commits `ce68d2e`
  + `3e6d641`) — mesma pipeline do Analyzer (upload/SSE/thumbnail/KB/@) mas
  dirigida pelo `agente-transcritor-cinematografico.md`, que entrega decupagem
  cena a cena com timestamps em vez de análise viral. Rota `/cinema`, módulo
  de permissão `cinema`.
- Produto em iteração ativa sobre o **IdeaGenerator** (modo "Roteirista" com
  restrições de duração/cenas, busca web inline via `[termo]`, botão
  "Ajustar" pra edições cirúrgicas, download/delete/seleção tipo Finder).
- PWA foi removida (commit `5c77ada`); no lugar entrou um wrapper **Electron**
  que aponta pra `https://viralhub-two.vercel.app`.
- Kanban renomeado para "Quadros" na sidebar (commit `dbd2f75`), mas a rota
  continua `/kanban`.

---

## Stack Técnica

### Frontend (`web-app/`)

| Item | Versão | Uso |
|---|---|---|
| React | ^19.2.4 | UI |
| React DOM | ^19.2.4 | Render |
| Vite | ^8.0.1 | Bundler / dev server |
| React Router DOM | ^7.14.0 | Roteamento SPA |
| Tailwind CSS | ^4.2.2 | Estilos (via `@tailwindcss/vite` plugin) |
| Framer Motion | ^12.38.0 | Transições de página |
| @supabase/supabase-js | ^2.101.1 | Auth client |
| Axios | ^1.14.0 | HTTP + interceptor global (`X-Workspace-Id`) |
| @hello-pangea/dnd | ^18.0.1 | Drag-and-drop Kanban |
| React Markdown | ^10.1.0 | Render markdown |
| Marked | ^17.0.6 | Parser markdown |
| Turndown | ^7.2.4 | HTML → markdown |
| React Dropzone | ^15.0.0 | Upload com drag |
| Lucide React | ^1.7.0 | Ícones |
| clsx ^2.1.1 + tailwind-merge ^3.5.0 | — | Merge condicional de classes |
| remark-gfm ^4.0.1 + rehype-raw ^7.0.0 | — | Markdown GFM + HTML cru |
| ESLint | ^9.39.4 | Lint |

### Backend (`execution/`)

| Item | Versão | Uso |
|---|---|---|
| FastAPI | 0.111.0 | Framework async |
| Uvicorn | 0.30.1 | Servidor ASGI |
| SQLAlchemy | 2.0.49 | ORM async |
| aiosqlite | 0.22.1 | Driver SQLite (fallback local) |
| asyncpg | 0.30.0 | Driver PostgreSQL (produção) |
| Alembic | 1.15.2 | Migrations (16 versões) |
| google-generativeai | 0.8.2 | Gemini 2.5 Flash |
| yt-dlp | >=2025.1.15 | Download de vídeos |
| opencv-python-headless | 4.13.0.92 | Thumbnail do primeiro frame |
| PyJWT | 2.12.1 | JWT/JWKS Supabase |
| bcrypt | 5.0.0 | Hash (legacy de users locais) |
| aiofiles | 24.1.0 | I/O assíncrono |
| httpx | 0.28.1 | HTTP client |
| python-multipart | 0.0.9 | Upload |

### Infraestrutura

| Camada | Tecnologia |
|---|---|
| Banco (produção) | PostgreSQL via **Supabase Pooler** (porta 5432, session mode) |
| Banco (local) | SQLite file-based (`execution/viral_hub.db`) |
| Auth | Supabase Auth (JWT validado via JWKS em `auth.py`) |
| Storage | Supabase Storage (upload com `SUPABASE_SERVICE_KEY`) |
| Deploy backend | **Railway** via `nixpacks.toml` (`python312` + `ffmpeg`) |
| Deploy frontend | **Vercel** (`viralhub-two.vercel.app`) |
| Desktop wrapper | **Electron 35** (macOS, DMG via electron-builder) |

---

## Estrutura de Pastas

```
/
├── CLAUDE.md                  # Regras de design/commit (LEIA SEMPRE)
├── CONTEXT.md                 # Este arquivo
├── PROJECT_CONTEXT.md         # Contexto histórico (v0, pode ter drift)
├── README.md                  # Setup rápido
├── .env.example               # Template de variáveis
├── start.sh                   # Script que sobe backend + frontend local
├── nixpacks.toml              # Build Railway
├── railway.json               # Config deploy Railway
│
├── directives/                # Prompts de sistema pros agentes Gemini
│   ├── prompt-agente-viral-v2.md        # Analisador de vídeo curto
│   ├── viral-content-agent.md           # Agente criador de conteúdo
│   ├── agente-criativo-prompt.md        # Prompt do Roteirista
│   ├── Modo ideias (agente de ideias rápidas).md
│   ├── Modo Roteirista (agente de roteiros).md
│   ├── prompt-compilador-base-viral.md  # Compila knowledge base
│   └── exemplo-perfil-voz.md            # Template de perfil de tom
│
├── execution/                 # Backend FastAPI
│   ├── api.py                 # Entry point, CORS, registra 13 routers
│   ├── auth.py                # Supabase Auth (JWKS) + rotas /auth legacy
│   ├── database.py            # SQLAlchemy async + fallback SQLite
│   ├── models.py              # 15 modelos ORM
│   ├── analyzer.py            # Análise de vídeo curto (Gemini)
│   ├── transcriber.py         # Transcrição de vídeo longo (Gemini)
│   ├── tone_analyzer.py       # Extração de perfil de tom/voz
│   ├── creator.py             # Agente conversacional + rotas /creator
│   ├── storage.py             # Upload Supabase Storage
│   ├── migrate_data.py        # Script de migração SQLite → Postgres
│   ├── sync_db.py             # Utilitário auxiliar
│   ├── requirements.txt
│   ├── alembic/               # 16 migrations (001 → 016)
│   └── routers/               # 12 módulos de rota
│
├── web-app/                   # Frontend React/Vite
│   ├── index.html             # Importa Google Fonts + SVG noise filter
│   ├── vite.config.js         # Vite + @tailwindcss/vite
│   ├── tailwind.config.js     # Tokens custom (cores, fontes, shadows)
│   ├── eslint.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx            # Router + providers + ProtectedRoute + lazy
│       ├── index.css          # Design system (~730 linhas)
│       ├── supabaseClient.js
│       ├── lib/axiosSetup.js  # Interceptor X-Workspace-Id + 403 event
│       ├── pages/             # 9 páginas (lazy-loaded)
│       ├── components/        # 10 componentes
│       └── contexts/          # 4 providers React
│
└── electron/                  # Wrapper desktop macOS
    ├── main.js                # Carrega APP_URL (vercel) em BrowserWindow
    ├── preload.js
    └── package.json           # electron ^35, electron-builder ^26
```

---

## Arquivos-Chave

### Backend

| Arquivo | Papel |
|---|---|
| `execution/api.py` | Entry FastAPI. Registra 13 routers; `content_router` **antes** de `ideas_router` por design (ideas sobrescreve rotas específicas). |
| `execution/auth.py` | Validação JWT Supabase via JWKS + rotas de auth legacy. |
| `execution/database.py` | `DATABASE_URL` → asyncpg/aiosqlite; expõe `get_db` dependency. |
| `execution/models.py` | 15 tabelas ORM (Profile, Workspace, WorkspaceMember, Analysis, Transcription, Tone, Project, ContentTask, CalendarNote, KnowledgeBase, ContentIdea, NoteFolder, Note, ChatSession, ChatMessage). `Analysis.category` discrimina short/cinema com CHECK constraint `ck_analyses_category`. |
| `execution/analyzer.py` | Pipeline yt-dlp → OpenCV thumbnail → upload Gemini → prompt → relatório MD. Parametrizado por `category` (`"short"` carrega `prompt-agente-viral-v2.md`, `"cinema"` carrega `agente-transcritor-cinematografico.md`); o agente extra vive em `_CATEGORY_PROMPT_FILES`. |
| `execution/creator.py` | Chat conversacional com histórico em `chat_sessions` + `chat_messages`. |
| `execution/storage.py` | Helpers Supabase Storage. |

### Frontend

| Arquivo | Papel |
|---|---|
| `web-app/src/App.jsx` | Routes, providers (`Sidebar`/`Workspace`/`Projects`/`Notes`), `ProtectedRoute`, `PermissionGate`, code-splitting por rota. |
| `web-app/src/lib/axiosSetup.js` | Interceptor: injeta `X-Workspace-Id` em toda request + dispara `api-permission-denied` em 403 de permissão. |
| `web-app/src/index.css` | Design system: glass, btn-primary/white/ghost, lift, stagger, input-field, tab-group, noise overlay. |
| `web-app/src/components/Sidebar.jsx` | Menu lateral (Vídeos curtos / longos / Conteúdos / Ideias / Notas / Quadros / Settings). |
| `web-app/src/components/PermissionGate.jsx` | Gating por módulo (`analyses`, `transcriptions`, `content`, `ideas`, `notes`, `kanban`). |
| `web-app/src/components/TaskEditor.jsx` | Editor modal de cards Kanban (rich text → markdown). |
| `web-app/src/contexts/WorkspaceContext.jsx` | Workspace ativo persistido em `localStorage('activeWorkspaceId')`. |

---

## Features Implementadas

- **Analyzer** — Análise de vídeos curtos (Reels/Shorts/TikTok) via Gemini, com biblioteca, progresso SSE, exportação ZIP, upload de arquivo/link/ZIP, thumbnails via OpenCV.
- **Cinema** — Decupagem cinematográfica cena a cena (timestamps `[m:ss - m:ss]`, visão geral + áudio geral + cenas com descrição visual objetiva, falas literais e áudio). Mesma pipeline do Analyzer parametrizada por `category` — rota `/cinema`, módulo `cinema`, biblioteca separada mas KB/@ misturam shorts+cinema por design.
- **Transcriber** — Transcrição de vídeos longos (YouTube), resumo automático, biblioteca com busca.
- **ContentGenerator** (`/creator`) — Chatbot conversacional com sessões persistentes, citação `@` de vídeos, knowledge bases, tons de voz, upload de imagem, favoritar/renomear/deletar sessões, sugestão de cards Kanban.
- **IdeaGenerator** (`/ideas`) — Modo "Ideias rápidas" + modo "Roteirista" com restrições de duração/cenas, busca web inline via `[termo]`, botão "Ajustar" pra edições cirúrgicas, delete/download, seleção tipo Finder (shift/ctrl-click).
- **Knowledge Bases** — Seleção de até 30 análises, compilação unificada via Gemini, marcação stale, uso como contexto no chat.
- **Tom de Voz** — Extração de perfil (vocabulário, estrutura, ritmo, personalidade) a partir de vídeos.
- **Kanban/Quadros** — Múltiplos projetos, colunas customizáveis, drag-and-drop, cards com cor (8 opções), tag, thumbnail, editor markdown completo.
- **Calendário** — Tasks agendadas por data + notas de calendário com horário.
- **Notas** — Pastas hierárquicas com ícones, editor rich-text contentEditable ↔ markdown, wiki-links `[[nome]]`, upload/resize de imagens, auto-save debounced, drag-drop pra mover.
- **Settings** — Nome, avatar (base64 em localStorage), senha, suporte via WhatsApp.
- **Workspaces** — Multi-tenant com membership, header `X-Workspace-Id` em todas as requests, gating de módulos por permissão.

---

## Rotas / Páginas

### Públicas

| Rota | Página |
|---|---|
| `/login` | `Login.jsx` — Supabase Auth |
| `/register` | `Register.jsx` |

### Protegidas (requerem sessão Supabase)

| Rota | Página | Módulo (PermissionGate) |
|---|---|---|
| `/` | `Analyzer.jsx` (`category="short"`) | `analyses` |
| `/cinema` | `Analyzer.jsx` (`category="cinema"`) | `cinema` |
| `/transcriber` | `Transcriber.jsx` | `transcriptions` |
| `/creator` | `ContentGenerator.jsx` | `content` |
| `/ideas` | `IdeaGenerator.jsx` | `ideas` |
| `/notes` | `Notes.jsx` | `notes` |
| `/kanban` | `Kanban.jsx` | `kanban` |
| `/kanban/:projectId` | `Kanban.jsx` | `kanban` |
| `/settings` | `Settings.jsx` | — |
| `/*` | → redirect para `/` | — |

### Endpoints backend (routers registrados em `api.py`)

`/auth/*`, `/analyze/*`, `/transcribe/*`, `/tasks/*`, `/projects/*`,
`/tones/*`, `/knowledge/*`, `/uploads/*`, `/calendar/*`, `/content/*`,
`/content/ideas/*` (creative-scoped — **atenção**: `content_router` é
incluído antes do `ideas_router` de propósito), `/workspaces/*`, `/notes/*`,
`/health/db`.

---

## Integrações Externas

| Serviço | Como é usado | Onde |
|---|---|---|
| **Google Gemini** (`gemini-2.5-flash`) | Multimodal — análise de vídeo, transcrição, tom, chat, compilação KB, ideias, roteiros | `analyzer.py`, `transcriber.py`, `tone_analyzer.py`, `creator.py`, routers `content.py`/`ideas.py`/`knowledge.py` |
| **Supabase Auth** | JWT via JWKS (anon) + sessão no frontend | `auth.py`, `supabaseClient.js` |
| **Supabase Storage** | Upload de arquivos com service key | `storage.py` |
| **Supabase Postgres** | Pooler (porta 5432, session mode) via asyncpg | `database.py` |
| **yt-dlp** | Download de YouTube/TikTok/Instagram com UA spoofing | `analyzer.py`, `transcriber.py` |
| **OpenCV** | Primeiro frame → thumbnail 480px | `analyzer.py` |

### localStorage (frontend)

| Chave | Uso |
|---|---|
| `activeWorkspaceId` | ID do workspace ativo (injetado em todas as requests) |
| `token` | JWT legacy (sessão Supabase assume o papel) |
| `sidebar_collapsed` | Estado da sidebar |
| `viralhub_notes` | Dados completos de notas/pastas |
| `viralhub_user_name` / `viralhub_user_avatar` | Perfil local |
| `viralhub_fav_sessions` | Array de IDs de sessões favoritadas |

---

## Padrões Visuais

### Paleta (de `tailwind.config.js`)

| Token | Hex/RGBA |
|---|---|
| `background` | `#08080A` |
| `surface` | `#111114` |
| `surface-flat` | `#18181D` |
| `surface-raised` | `#1F1F26` |
| `primary` | `#37B24D` (verde) |
| `primary-hover` | `#2F9E44` |
| `primary-glow` | `rgba(55,178,77,0.12)` |
| `accent` | `#69DB7C` |
| `accent-muted` | `rgba(105,219,124,0.1)` |
| `border-subtle` | `rgba(255,255,255,0.06)` |
| `border-hover` | `rgba(255,255,255,0.12)` |

### Tipografia (Google Fonts importadas em `index.html`)

- **Sans / display**: `Plus Jakarta Sans` (pesos 300–800 + itálicos)
- **Serif decorativa**: `Instrument Serif`
- **Mono**: `IBM Plex Mono` (300/400/500/600) — usado em labels de dados 10px uppercase tracking 0.15em

### Estilo geral

- Dark premium com glassmorphismo (`backdrop-filter: blur(40px) saturate(1.2)`).
- Noise SVG (`feTurbulence`) sobre tudo com opacity 0.04 / mix-blend overlay.
- Border-radius: 2xl (16px) para inputs/botões, 3xl (24px) para cards.
- Shadows customizadas: `glow-sm/md/lg`, `card`, `card-hover`, `modal`.
- Animações: `fadeIn`, `fadeUp`, `slideInRight`, `scaleIn`, `glowPulse`, stagger por nth-child.
- Botões: `.btn-primary` (verde com glow), `.btn-white`, `.btn-ghost`, `.btn-magnetic`.
- Scrollbars 6px custom.

---

## Padrões de Código

- **React**: functional components apenas, hooks (`useState`/`useRef`/`useCallback`/`useEffect`/`useMemo`). Sem classes. Sem Redux — Context API (`Sidebar`, `Workspace`, `Projects`, `Notes`).
- **Code-splitting**: páginas grandes (Analyzer, Creator, Notes, etc.) via `lazy()` + `Suspense` em `App.jsx`.
- **Estilo**: Tailwind utility inline. Classes condicionais via `cn()` sobre `clsx` + `tailwind-merge`. Sem CSS modules.
- **HTTP**: Axios com token Bearer de Supabase. Interceptor global em `lib/axiosSetup.js` injeta `X-Workspace-Id` automaticamente — **não adicionar manualmente em calls novas**.
- **Analyzer category param**: `/analyze/files`, `/analyze/links` e `/analyze/history` aceitam `?category=short|cinema`. Default é `short` quando ausente (protege clientes cacheados do Analyzer). `/history` também aceita `?category=all` — **esse é o escape hatch usado pelo KB picker (`IdeaGenerator.jsx`) e pelo @-mention (`ContentGenerator.jsx`)** pra mostrar ambas categorias juntas. POST endpoints NÃO aceitam `all` (criar análise exige categoria específica).
- **Idioma**: Interface e strings em **pt-BR**; código, nomes de variáveis, commits em inglês.
- **Nomes**: camelCase para variáveis/funções, PascalCase para componentes.
- **Backend**: routers separados por domínio em `execution/routers/`. Models centralizados em `models.py`. Alembic para schema (sempre gerar nova migration, nunca editar existente).
- **Processamento pesado** (análise, transcrição, tom): background task + SSE em `/progress/{taskId}` consumido via `EventSource`.
- **Módulos protegidos**: sempre envolver a página com `<PermissionGate module="xxx">`.

### Convenções de commit (de `CLAUDE.md`)

- **NUNCA** adicionar `Co-Authored-By` em commits.
- Fazer `git push` automático após cada commit, sem pedir confirmação.
- Prefixos usados nos últimos commits: `feat:`, `fix:`, `refactor:`, `update:`.

---

## Débitos Técnicos / Pontos de Atenção

### Arquitetura
- **Progresso de tasks in-memory**: dict no processo — perde estado em restart, não escala pra múltiplos workers.
- **Ordem de registro de routers importa**: `content_router` **antes** de `ideas_router` em `api.py` (comentário explícito). Se inverter, rotas de ideas sobrescrevem handlers de content.
- **SECRET_KEY JWT legacy**: `auth.py` ainda tem fallback hardcoded (deveria ser obrigatório via env).
- **CORS**: Default `"*"` em `.env.example` — restringir em produção.

### Frontend
- **Componentes gigantes**: `Creator.jsx` (~1.630 linhas), `Notes.jsx` (~1.491 linhas), `TaskEditor.jsx` (~1.012 linhas) — candidatos óbvios a split.
- **Sem error boundaries** no React.
- **Sem testes** (nem Jest, nem Vitest, nem pytest).
- **Notas em localStorage apenas** (pasta `notes` do backend existe — sync ainda não está completo).
- **API_URL**: continua sendo lida como `VITE_API_URL` via env, mas verificar se algum arquivo ainda tem `http://localhost:8000` hardcoded.

### Backend
- **Sem rate limiting** em endpoints de IA.
- **Arquivos temporários** dependem de cleanup em `finally` — acumulam se crashar.
- **Sem paginação** em endpoints de listagem (`/analyze/history`, `/transcribe/history`).

### Cinema — validação pendente

A migration 017 (`017_add_analysis_category`) rodou em produção em 18/abr/2026
junto com o deploy do commit `ce68d2e`. O backfill de `workspace_members.permissions`
foi testado end-to-end em SQLite (upgrade + downgrade + CHECK constraint), mas
o caminho PermissionGate → backend → tela "Acesso restrito" **não foi validado
end-to-end em produção** (testes 6.2 e 6.3 do roteiro foram pulados).

**Quando houver oportunidade, rode estas queries no Postgres de produção
(Supabase SQL Editor):**

```sql
-- 1) Confirmar que TODOS os workspace_members têm a chave "cinema" = true
--    (o backfill da 017 deveria ter adicionado em todas as linhas existentes).
--    Expected: 0 linhas retornadas.
SELECT id, workspace_id, user_id, permissions
FROM workspace_members
WHERE NOT (permissions::jsonb ? 'cinema')
   OR (permissions::jsonb ->> 'cinema') <> 'true';
```

```sql
-- 2) Simular revogação de permissão pra um membro específico e testar
--    que PermissionGate bloqueia. Substitua <MEMBER_ID> pelo id real.
UPDATE workspace_members
SET permissions = jsonb_set(permissions::jsonb, '{cinema}', 'false'::jsonb)::text
WHERE id = <MEMBER_ID>;

-- Login como esse membro → /cinema deve mostrar "Acesso restrito".
-- API check direto (substituir <JWT> e <WS_ID>):
--   curl -H "Authorization: Bearer <JWT>" -H "X-Workspace-Id: <WS_ID>" \
--        "https://<backend>/analyze/history?category=cinema"
--   → esperado HTTP 403 com detail="Acesso negado ao módulo cinema"
```

```sql
-- 3) Liberar novamente
UPDATE workspace_members
SET permissions = jsonb_set(permissions::jsonb, '{cinema}', 'true'::jsonb)::text
WHERE id = <MEMBER_ID>;
```

Se alguma das queries 1-3 não produzir o resultado esperado, o backfill
dialeto-específico da 017 falhou em Postgres (só foi validado em SQLite local)
e precisa de patch. A lógica do backfill é dialeto-agnóstica (Python puro
round-trip do JSON via `json.loads`/`json.dumps`), então a probabilidade de
falha é baixa, mas merece validação.

### Gambiarras conhecidas
- Nenhum `TODO`/`FIXME` relevante no código-fonte (só ocorrências de "TODO" em prompts de agente em português, como "TODOS os elementos").

---

## Atividade Recente (últimos commits)

| Hash | Mensagem |
|---|---|
| `ec9f980` | fix: persist `original_prompt` so develop endpoints respect duration/scene constraints |
| `b1d96a0` | feat: enforce duration and scene count constraints in `user_message` |
| `c37aeb0` | feat: delete cards, download content, and Finder-like click selection |
| `3aac276` | fix: roteirista must respect exact duration and scene count from user prompt |
| `20b52b8` | fix: reset prompt bar — restore original placeholder + fix textarea width |
| `007617c` | fix: revert prompt bar to simple textarea — remove search segments |
| `6fadf49` | fix: prompt bar text overflow — constrain textarea within container |
| `5b54543` | fix: replace search pill/badge with inline blue text |
| `f1a5a1c` | fix: search chip inline flow + add debug log for search context |
| `1ded6cf` | feat: inline `[search term]` web search system replacing the old refiner |
| `809d06b` | update: roteirist directive — enforce prompt relevance and scope fidelity |
| `3c9f1b1` | fix: hide "Roteirizar" button outside the Ideas tab |
| `3afa442` | fix: close adjust popup immediately, show skeleton on card while processing |
| `722d0ec` | fix: tighten markdown spacing and show spinner while loading developed content |
| `77b6d9d` | feat: add "Ajustar" button for surgical AI edits on ideas and content |
| `5c77ada` | refactor: remove PWA (manifest, service worker, install tab) |
| `02d76fa` | feat: add Electron app for macOS desktop |
| `b3602d8` | feat: transform ViralHub into a Progressive Web App (PWA) — **revertido** |
| `89691fd` | refactor: move 'Todos os projetos' below recent projects in sidebar |
| `dbd2f75` | refactor: reorder sidebar menu and rename Kanban to Quadros |

**Direção**: foco recente está todo no **IdeaGenerator/Roteirista** — prompt bar, constraints de duração/cenas, busca web inline, edições cirúrgicas ("Ajustar"), seleção/download/delete em lote. Migração desktop via Electron em vez de PWA.

---

## Regras Para Futuras Sessões

1. **Leia CONTEXT.md, CLAUDE.md e PROJECT_CONTEXT.md** antes de tocar em qualquer coisa.
2. **Siga os padrões visuais documentados** — paleta `#08080A`/`#37B24D`, fontes Plus Jakarta Sans / Instrument Serif / IBM Plex Mono. **Nada de Inter/Roboto/Arial/Open Sans/Lato**.
3. **Não invente paletas**. Se precisar de uma cor nova, justifique em relação às variáveis Tailwind existentes.
4. **Componentes** seguem o padrão: functional + hooks, Tailwind inline, `cn()` pra classes condicionais.
5. **API calls novas**: não injete `X-Workspace-Id` manualmente — o interceptor em `lib/axiosSetup.js` já faz. Só se preocupe com o Bearer token.
6. **Páginas novas**: envelope em `<PermissionGate module="xxx">` e adicione à sidebar se fizer sentido.
7. **Schema do banco**: sempre gerar nova migration Alembic — nunca editar versions existentes. A head atual é `017_add_analysis_category`.
8. **Ordem de routers** em `api.py`: não alterar sem entender o comentário sobre `content_router` vir antes de `ideas_router`.
9. **Commits**: em inglês, prefixados (`feat:`/`fix:`/`refactor:`/`update:`), **sem** `Co-Authored-By`. Push automático após commit.
10. **Não adicionar dependências novas** sem avisar. A stack está estabilizada em React 19 + Vite 8 + Tailwind 4 + FastAPI 0.111 + SQLAlchemy 2.
11. **Testes**: projeto não tem suite ainda. Se criar testes, combinar estrutura antes.
12. **Desktop (Electron)**: `electron/main.js` aponta pra produção (`viralhub-two.vercel.app`). Se mudar URL, sincronizar.

### Regras de desenvolvimento (do CLAUDE.md, reforçar)

Antes de declarar qualquer tarefa como concluída:
1. Listar todos os arquivos modificados.
2. Verificar se features anteriores continuam funcionando.
3. Testar mentalmente estados: vazio, 1 item, muitos itens, hover/click/resize.
4. Nunca remover ou alterar código não relacionado ao bug.
5. Se precisar refatorar pra corrigir, listar mudanças antes e pedir confirmação.
6. CSS/layout: verificar em tela cheia, tela reduzida, e com diferentes quantidades de conteúdo.

---

## Perguntas em Aberto

- **Sync de notas com backend**: existe o router `notes.py` e tabelas `notes`/`note_folders` (migration 013). `NotesContext` ainda usa `localStorage` — não descobri se o sync é parcial, se só lê, ou se a migration ficou pendente. **Verificar com o usuário.**
- **Deploy do Electron**: tem script `electron-builder --mac` e `directories.output: "dist"`, mas não vi pipeline CI/CD. Presumivelmente build local + DMG manual. **Confirmar.**
- **`SECRET_KEY` JWT**: `auth.py` valida Supabase via JWKS, mas ainda há resquícios de JWT local. Não sei se há usuários legados que ainda usam isso ou se pode ser removido.
- **`PROJECT_CONTEXT.md`**: documento antigo (abril 2026) que menciona SQLite como banco de produção, 9 modelos, sem workspaces. Está **defasado** em vários pontos — decidir se apaga, mantém como histórico ou reescreve.

---

## Última atualização

**2026-04-18** — (1) versão inicial gerada automaticamente por varredura do código. (2) Cinema category adicionada (commits `ce68d2e` + `3e6d641`, migration head `017_add_analysis_category`). Débito de validação do PermissionGate em produção listado em Débitos Técnicos → Cinema.
