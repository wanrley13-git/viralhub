# PROJECT_CONTEXT.md — ViralHub

> Documento gerado em 06/04/2026 a partir de análise completa do código-fonte.

---

## 1. VISAO GERAL DO PRODUTO

**ViralHub** é uma plataforma full-stack para criadores de conteúdo que combina análise de vídeos virais com IA, transcrição, geração de conteúdo e gestão de projetos.

### O que faz
- Analisa vídeos curtos (Reels, Shorts, TikTok) usando Google Gemini para extrair padrões de viralidade
- Transcreve vídeos longos do YouTube com resumo automático
- Extrai perfis de tom/voz de criadores a partir de vídeos de referência
- Gera conteúdo via agente conversacional com contexto da biblioteca do usuário
- Gerencia pipeline de produção via Kanban com cards de conteúdo
- Sistema de notas markdown estilo Obsidian com pastas hierárquicas

### Publico alvo
Criadores de conteúdo (YouTube, TikTok, Instagram), estrategistas de conteúdo e equipes de produção de vídeo.

### Problema que resolve
Centraliza o workflow de criação viral: da análise de referências ao planejamento e produção, eliminando a fragmentação entre ferramentas de análise, escrita e gestão de tarefas.

---

## 2. STACK TECNOLOGICA

### Frontend
| Tecnologia | Versão | Uso |
|---|---|---|
| React | 19.2.4 | Framework UI |
| Vite | 8.0.1 | Bundler e dev server |
| React Router DOM | 7.14.0 | Roteamento SPA |
| Tailwind CSS | 4.2.2 | Sistema de estilos utility-first |
| Framer Motion | 12.38.0 | Animações de transição de página |
| Axios | 1.14.0 | Cliente HTTP com interceptor global |
| @hello-pangea/dnd | 18.0.1 | Drag-and-drop no Kanban |
| React Markdown | 10.1.0 | Renderização de markdown |
| Marked | 17.0.6 | Parser markdown para HTML |
| Turndown | 7.2.4 | Conversor HTML para markdown |
| React Dropzone | 15.0.0 | Upload de arquivos com drag |
| Lucide React | 1.7.0 | Biblioteca de ícones (50+ usados) |
| clsx + tailwind-merge | 2.1.1 / 3.5.0 | Merge condicional de classes |
| remark-gfm | 4.0.1 | Suporte GitHub-Flavored Markdown |
| rehype-raw | 7.0.0 | HTML cru em markdown |

### Backend
| Tecnologia | Versão | Uso |
|---|---|---|
| FastAPI | 0.111.0 | Framework web async |
| Uvicorn | 0.30.1 | Servidor ASGI |
| SQLAlchemy (async) | — | ORM com suporte async |
| aiosqlite | — | Driver SQLite assíncrono |
| Google Generative AI | 0.8.2 | Integração Gemini (modelo `gemini-2.5-flash`) |
| yt-dlp | 2024.5.27 | Download de vídeos (YouTube, TikTok, Instagram) |
| bcrypt | — | Hash de senhas |
| PyJWT | — | Geração/validação de tokens JWT |
| OpenCV (cv2) | — | Extração de thumbnails de vídeo |
| python-dotenv | 1.0.1 | Variáveis de ambiente |

### Banco de Dados
- **SQLite** via arquivo `viral_hub.db` (file-based, async com aiosqlite)
- Sem necessidade de servidor de banco de dados externo

---

## 3. ESTRUTURA DO PROJETO

```
/
├── .env                          # GEMINI_API_KEY
├── CLAUDE.md                     # Diretrizes de design para o Claude
├── start.sh                      # Script de inicialização (backend + frontend)
├── package.json                  # Dependências raiz (não usadas pelo app)
│
├── directives/                   # Prompts de sistema para a IA
│   ├── prompt-agente-viral-v2.md       # Prompt do analisador de vídeos
│   ├── viral-content-agent.md          # Prompt do agente criador de conteúdo
│   ├── prompt-compilador-base-viral.md # Prompt do compilador de knowledge base
│   └── exemplo-perfil-voz.md           # Template de perfil de tom/voz
│
├── execution/                    # BACKEND (Python/FastAPI)
│   ├── api.py                    # Entry point FastAPI, CORS, routers
│   ├── auth.py                   # Autenticação JWT + rotas /auth
│   ├── database.py               # Config SQLAlchemy async + init_db
│   ├── models.py                 # 9 modelos SQLAlchemy
│   ├── analyzer.py               # Lógica de análise de vídeo com Gemini
│   ├── transcriber.py            # Lógica de transcrição de vídeo
│   ├── tone_analyzer.py          # Extração de perfil de tom/voz
│   ├── creator.py                # Agente conversacional + rotas /creator
│   ├── requirements.txt          # Dependências Python
│   ├── viral_hub.db              # Banco SQLite
│   ├── .tmp/thumbnails/          # Thumbnails gerados
│   └── routers/                  # Módulos de rotas
│       ├── analysis.py           # /analyze/*
│       ├── transcription.py      # /transcribe/*
│       ├── projects.py           # /projects/*
│       ├── tasks.py              # /tasks/*
│       ├── tone.py               # /tone/*
│       ├── knowledge.py          # /knowledge/*
│       └── uploads.py            # /uploads/*
│
├── web-app/                      # FRONTEND (React/Vite)
│   ├── vite.config.js
│   ├── tailwind.config.js        # Design tokens customizados
│   ├── index.html
│   └── src/
│       ├── main.jsx              # Mount React + interceptor axios 401
│       ├── App.jsx               # Router + ProtectedRoute
│       ├── index.css             # Design system CSS (~730 linhas)
│       ├── pages/                # 8 páginas
│       │   ├── Analyzer.jsx      # Análise de vídeos curtos (607 linhas)
│       │   ├── Transcriber.jsx   # Transcrição de vídeos longos (519 linhas)
│       │   ├── Creator.jsx       # Agente de criação AI (1.630 linhas)
│       │   ├── Kanban.jsx        # Gestão de projetos (556 linhas)
│       │   ├── Notes.jsx         # Sistema de notas (1.491 linhas)
│       │   ├── Settings.jsx      # Configurações do usuário (546 linhas)
│       │   ├── Login.jsx         # Login (125 linhas)
│       │   └── Register.jsx      # Cadastro (139 linhas)
│       ├── components/           # 4 componentes reutilizáveis
│       │   ├── Sidebar.jsx       # Navegação lateral (391 linhas)
│       │   ├── KanbanBoard.jsx   # Board drag-and-drop (302 linhas)
│       │   ├── TaskEditor.jsx    # Editor de cards markdown (1.012 linhas)
│       │   └── ImageLightbox.jsx # Visualizador de imagem (135 linhas)
│       └── contexts/             # 3 contextos React
│           ├── SidebarContext.jsx     # Estado collapsed da sidebar
│           ├── NotesContext.jsx       # CRUD de notas/pastas (localStorage)
│           └── ProjectsContext.jsx    # CRUD de projetos (API)
│
└── .agents/skills/               # Skills do Claude Code
    ├── design-taste-frontend/
    ├── frontend-design/
    ├── high-end-visual-design/
    └── redesign-existing-projects/
```

---

## 4. ARQUITETURA

### Fluxo de dados

```
[Usuário] → [React SPA] → [Axios + Bearer Token] → [FastAPI] → [SQLAlchemy] → [SQLite]
                                                         ↓
                                                   [Google Gemini API]
                                                         ↓
                                                   [SSE Progress Stream]
                                                         ↓
                                                   [React EventSource]
```

### Gerenciamento de estado
- **Context API** (sem Redux): 3 providers (Sidebar, Notes, Projects)
- **useState/useRef** por página para estado local
- **localStorage** para persistência de notas, preferências e token
- **API REST** para dados de negócio (análises, projetos, tarefas, sessões de chat)

### Autenticação
1. Login via `POST /auth/login` → recebe JWT (expira em 7 dias)
2. Token armazenado em `localStorage('token')`
3. Todas as requisições autenticadas via header `Authorization: Bearer {token}`
4. Interceptor global no axios captura 401 e redireciona para `/login`
5. `ProtectedRoute` em `App.jsx` verifica existência do token

### Processamento assíncrono (análise, transcrição, tom)
1. Cliente envia request `POST` → recebe `{ taskId }`
2. Backend processa em background task
3. Cliente conecta via `EventSource` (SSE) em `/progress/{taskId}`
4. Backend envia stream de `{ progress, logs, status }` até `completed` ou `error`
5. Progresso armazenado em dicionário in-memory no backend

### Pipeline de vídeo
1. Download via `yt-dlp` (links) ou recebe upload direto
2. Extrai primeiro frame como thumbnail via OpenCV
3. Faz upload do arquivo para Gemini API
4. Envia prompt de sistema + vídeo para análise multimodal
5. Recebe relatório markdown estruturado
6. Salva no SQLite + retorna via SSE
7. Limpa arquivos temporários

---

## 5. FEATURES IMPLEMENTADAS

### Hub Analítico
- [x] Upload de vídeos (arquivos ou links YouTube/TikTok/Instagram)
- [x] Análise de viralidade via Gemini com relatório markdown completo
- [x] Progresso em tempo real via SSE com barra animada
- [x] Biblioteca de análises com busca, filtros e cards ajustáveis (3 tamanhos)
- [x] Exportação em lote como ZIP
- [x] Extração automática de thumbnails
- [x] Suporte a ZIP de vídeos no upload

### Transcrição
- [x] Transcrição de vídeos longos do YouTube via Gemini
- [x] Resumo automático + transcrição completa
- [x] Biblioteca de transcrições com busca
- [x] Exportação em lote como ZIP
- [x] Progresso SSE em tempo real

### Criação AI (Agente Conversacional)
- [x] Chat com Gemini usando prompts especializados de criação viral
- [x] Sessões de conversa com histórico persistente
- [x] Citação de vídeos via `@` (curtos e longos) com popup
- [x] Modal expandido "Ver mais" para seleção de vídeos
- [x] Integração com Knowledge Bases e Tons de Voz
- [x] Sugestão automática de cards Kanban a partir do chat
- [x] Upload de imagem no chat
- [x] Favoritar sessões
- [x] Renomear e deletar sessões

### Knowledge Bases
- [x] Criar bases selecionando até 30 análises
- [x] Compilar base via Gemini em documento unificado
- [x] Marcar como stale quando seleção muda
- [x] Usar como contexto no agente de criação

### Tom de Voz
- [x] Analisar tom a partir de vídeos (upload ou links)
- [x] Gerar perfil de vocabulário, estrutura, ritmo e personalidade
- [x] Usar como guia de estilo no agente de criação
- [x] Exportar como markdown

### Kanban
- [x] Múltiplos projetos com boards independentes
- [x] Colunas customizáveis (adicionar, renomear, deletar)
- [x] Drag-and-drop de cards entre colunas
- [x] Cards com título, conteúdo markdown, tag, cor e thumbnail
- [x] Paleta de 8 cores por card
- [x] Tags: Reels, Carrossel, Post, Vídeo Longo, Nota, Ideia
- [x] Editor de cards com toolbar completa (TaskEditor)
- [x] Colunas vazias visíveis com drop zone sutil

### Notas
- [x] Pastas hierárquicas com ícones customizáveis (20 opções SVG)
- [x] Editor rich-text contentEditable com conversão MD bidirecional
- [x] Formatação: H1-H3, bold, italic, strikethrough, listas, quotes, code, tabelas
- [x] Links entre notas via sintaxe `[[nome da nota]]`
- [x] Upload e redimensionamento inline de imagens
- [x] Busca em títulos e conteúdo
- [x] Drag-and-drop para reordenar notas e mover entre pastas
- [x] Preview markdown (modo leitura)
- [x] Auto-save com debounce de 600ms
- [x] Persistência em localStorage

### Configurações
- [x] Edição de nome do usuário (sincronizado com o app)
- [x] Upload de foto de perfil (base64 em localStorage)
- [x] Alteração de senha com validação inline
- [x] Barra de força de senha (fraca/boa/forte)
- [x] Campo de email readonly com indicador de cadeado
- [x] Aba de suporte com link WhatsApp
- [x] Toast notifications (sucesso/erro)

### UI/UX
- [x] Design system dark premium com glassmorphismo
- [x] Sidebar colapsável com estado persistente
- [x] Submenus accordion (apenas um aberto por vez)
- [x] Animações staggered, fade-in, scale-in
- [x] Noise texture overlay no body
- [x] Transições de página via Framer Motion
- [x] Lightbox com zoom, pan e atalhos de teclado
- [x] Scrollbars customizados (4px)

---

## 6. COMPONENTES PRINCIPAIS

### Páginas

| Componente | Linhas | Responsabilidade |
|---|---|---|
| `Creator.jsx` | 1.630 | Agente AI: chat, sessões, KBs, tons, menções, sugestões de cards |
| `Notes.jsx` | 1.491 | Sistema de notas: editor, pastas, drag-drop, preview, links entre notas |
| `Analyzer.jsx` | 607 | Análise de vídeos: upload, progresso SSE, biblioteca, exportação |
| `Kanban.jsx` | 556 | Gestão de projetos: CRUD projetos, colunas, integração com KanbanBoard |
| `Settings.jsx` | 546 | Perfil: nome, avatar, senha, suporte |
| `Transcriber.jsx` | 519 | Transcrição: links YouTube, progresso SSE, biblioteca |
| `Register.jsx` | 139 | Cadastro com redirect automático |
| `Login.jsx` | 125 | Login com token JWT |

### Componentes

| Componente | Linhas | Responsabilidade |
|---|---|---|
| `TaskEditor.jsx` | 1.012 | Editor modal de cards: toolbar, markdown, cores, tags, imagens, resize |
| `Sidebar.jsx` | 391 | Navegação: menus accordion, projetos, logout, collapse responsivo |
| `KanbanBoard.jsx` | 302 | Board: colunas droppable, cards draggable, menu de coluna, paleta de cores |
| `ImageLightbox.jsx` | 135 | Visualizador: zoom 0.5x-5x, pan, scroll, teclado, double-click |

### Contextos

| Contexto | Responsabilidade | Persistência |
|---|---|---|
| `NotesContext` | CRUD notas/pastas, reorder, busca, links | localStorage (`viralhub_notes`) |
| `ProjectsContext` | CRUD projetos via API | Backend (SQLite) |
| `SidebarContext` | Estado collapsed | localStorage (`sidebar_collapsed`) |

---

## 7. ROTAS / PAGINAS

### Públicas
| Rota | Página | Função |
|---|---|---|
| `/login` | `Login.jsx` | Autenticação com email/senha |
| `/register` | `Register.jsx` | Criação de conta |

### Protegidas (requerem token JWT)
| Rota | Página | Função |
|---|---|---|
| `/` | `Analyzer.jsx` | Análise de vídeos curtos |
| `/transcriber` | `Transcriber.jsx` | Transcrição de vídeos longos |
| `/creator` | `Creator.jsx` | Agente de criação de conteúdo AI |
| `/notes` | `Notes.jsx` | Notas markdown com pastas |
| `/kanban` | `Kanban.jsx` | Lista de projetos Kanban |
| `/kanban/:projectId` | `Kanban.jsx` | Board de um projeto específico |
| `/settings` | `Settings.jsx` | Configurações do usuário |

### Fallback
| Rota | Destino |
|---|---|
| `/*` | Redirect para `/` |

---

## 8. INTEGRACOES

### Google Gemini API
- **Modelo**: `gemini-2.5-flash` (multimodal — aceita vídeo, imagem e texto)
- **SDK**: `google-generativeai` (Python)
- **Uso**: Análise de vídeo, transcrição, extração de tom, chat de criação, compilação de KB
- **Autenticação**: API key via `.env` (`GEMINI_API_KEY`)
- **Upload de arquivos**: SDK faz upload para Gemini, aguarda processamento, depois deleta

### yt-dlp
- Download de vídeos de YouTube, TikTok, Instagram
- Extração de títulos e metadados
- User-Agent spoofing para compatibilidade

### OpenCV (cv2)
- Extração de primeiro frame de vídeos para thumbnail
- Redimensionamento para 480px de largura

### Variáveis de ambiente
| Variável | Arquivo | Uso |
|---|---|---|
| `GEMINI_API_KEY` | `.env` (raiz) | Autenticação com Google Gemini |
| `SECRET_KEY` | `auth.py` (hardcoded default) | Assinatura JWT |

### localStorage (frontend)
| Chave | Tipo | Uso |
|---|---|---|
| `token` | String | JWT de autenticação |
| `sidebar_collapsed` | Boolean | Estado da sidebar |
| `viralhub_notes` | JSON | Dados completos de notas e pastas |
| `viralhub_user_name` | String | Nome de exibição do usuário |
| `viralhub_user_avatar` | String (base64) | Foto de perfil |
| `viralhub_fav_sessions` | JSON (array) | IDs de sessões favoritadas |

---

## 9. PADROES E CONVENCOES

### Código
- **Componentes**: Functional components com hooks (sem classes)
- **Estado**: useState + useRef + useCallback em todos os componentes
- **Estilo**: Tailwind utility classes inline, sem CSS modules
- **Classes condicionais**: `cn()` wrapper sobre `clsx` + `tailwind-merge`
- **API calls**: Axios com pattern try/catch/finally, token extraído de localStorage
- **Nomes**: camelCase para variáveis/funções, PascalCase para componentes
- **Idioma**: Interface em português brasileiro, código em inglês

### Design System (CSS)
- **Fundo**: Escala de pretos (`#08080A` → `#1F1F26`)
- **Primária**: Verde `#37B24D` com variantes de opacidade
- **Glassmorphismo**: `backdrop-filter: blur(40px)` com bordas sutis `rgba(255,255,255,0.06)`
- **Labels de dados**: IBM Plex Mono, 10px, uppercase, tracking 0.15em
- **Botões**: `.btn-primary` (verde com glow), `.btn-white`, `.btn-ghost`, `.btn-magnetic`
- **Inputs**: `.input-field` com fundo `#18181D` e focus ring verde
- **Border-radius**: 2xl (16px) para inputs/botões, 3xl (24px) para cards
- **Sombras customizadas**: `glow-sm/md/lg`, `card`, `card-hover`, `modal`
- **Animações**: `fadeIn`, `fadeUp`, `slideInToast`, `scaleIn`, stagger por nth-child
- **Noise overlay**: SVG `feTurbulence` com opacity 0.04 sobre tudo

### Fontes
- **Sans**: Plus Jakarta Sans (display e body)
- **Serif**: Instrument Serif (textos decorativos)
- **Mono**: IBM Plex Mono (dados, labels, código)

---

## 10. PROBLEMAS E DIVIDA TECNICA

### Segurança
- `SECRET_KEY` do JWT está hardcoded como fallback em `auth.py` (`"viralhub_super_secret_key_default_123"`)
- CORS configurado com `allow_origins=["*"]` — deve ser restrito em produção
- Token JWT em localStorage é vulnerável a XSS (padrão comum em SPAs, mas relevante)

### Arquitetura
- **Progresso in-memory**: Dicionários `tasks_progress` vivem em memória do processo — perdem-se em restart, não escalam para múltiplos workers
- **SQLite em produção**: Não suporta escritas concorrentes; adequado para uso single-user mas limitante para múltiplos usuários simultâneos
- **API URL hardcoded**: `const API_URL = 'http://localhost:8000'` em todos os arquivos do frontend, deveria ser variável de ambiente
- **Sem paginação**: Endpoints de listagem (`/analyze/history`, `/transcribe/history`) retornam todos os registros sem limit/offset

### Frontend
- **Creator.jsx com 1.630 linhas**: Componente monolítico que deveria ser dividido em subcomponentes (chat, sidebar de sessões, popup de KB/Tom, modal de menção)
- **Notes.jsx com 1.491 linhas**: Mesmo problema — editor, sidebar de notas e componentes de item misturados em um único arquivo
- **TaskEditor.jsx com 1.012 linhas**: Editor rico complexo com muita lógica inline
- **Sem error boundaries**: Erros de render crasham o app inteiro
- **Sem testes**: Nenhum teste unitário ou de integração no frontend
- **Notas apenas em localStorage**: Dados de notas podem ser perdidos se o usuário limpar o browser; não há sync com backend

### Backend
- **Sem rate limiting**: Endpoints de IA podem ser abusados
- **Sem validação de tamanho em links**: Número de links não é limitado consistentemente
- **Arquivos temporários**: Dependem de cleanup manual em finally blocks — podem acumular em caso de crash
- **requirements.txt incompleto**: Não lista sqlalchemy, aiosqlite, bcrypt, pyjwt, opencv-python explicitamente

---

## 11. O QUE FALTA / PROXIMOS PASSOS

### Prioridade Alta
- [ ] Mover API_URL para variável de ambiente (`.env` do Vite)
- [ ] Adicionar paginação nos endpoints de listagem
- [ ] Implementar sync de notas com o backend (atualmente só localStorage)
- [ ] Adicionar error boundaries no React
- [ ] Dividir Creator.jsx e Notes.jsx em subcomponentes menores

### Prioridade Média
- [ ] Migrar de SQLite para PostgreSQL para suporte multiusuário
- [ ] Adicionar rate limiting no backend
- [ ] Implementar refresh token (atualmente token expira em 7 dias sem renovação)
- [ ] Adicionar testes (Jest + React Testing Library + pytest)
- [ ] Restringir CORS para domínio de produção
- [ ] Extrair SECRET_KEY para variável de ambiente obrigatória
- [ ] Completar requirements.txt com todas as dependências

### Prioridade Baixa
- [ ] PWA / modo offline para notas
- [ ] Notificações push quando análise/transcrição finalizar
- [ ] Modo colaborativo (compartilhar projetos entre usuários)
- [ ] Dashboard com métricas de uso
- [ ] Tema claro (atualmente dark-only)
- [ ] Internacionalização (atualmente pt-BR only)

---

## 12. COMO RODAR O PROJETO

### Pré-requisitos
- Node.js 18+
- Python 3.10+
- Chave de API do Google Gemini

### Setup rápido (via script)
```bash
# 1. Criar .env na raiz com sua chave Gemini
echo "GEMINI_API_KEY=sua_chave_aqui" > .env

# 2. Rodar o script de inicialização
chmod +x start.sh
./start.sh
```

O script `start.sh`:
- Cria virtualenv Python se necessário
- Instala dependências do backend
- Inicia o backend na porta 8000
- Instala dependências do frontend
- Inicia o frontend na porta 5173

### Setup manual

**Backend:**
```bash
cd execution
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd web-app
npm install
npm run dev
```

### Acessar
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

### Build para produção
```bash
cd web-app
npm run build
# Arquivos estáticos gerados em web-app/dist/
```
