# Estado Atual do Projeto

## Visão Geral

ViralHub é uma plataforma de análise de vídeos virais com IA. Funcionalidades:

- **Analyzer** — Análise de vídeos curtos (métricas virais, ganchos, retenção)
- **Transcriber** — Transcrição de vídeos longos com resumo estruturado
- **Creator** — Chatbot conversacional com IA para criação de conteúdo
- **Kanban** — Gestão de projetos com drag-and-drop e calendário
- **Calendar** — Visualização de tarefas agendadas e notas por data
- **Notes** — Editor de notas Markdown com preview em tempo real

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 8 + Tailwind 4 + Framer Motion |
| Backend | FastAPI + SQLAlchemy + Alembic + Uvicorn |
| Banco | PostgreSQL via Supabase (fallback SQLite local) |
| Auth | Supabase Auth (JWT/JWKS) |
| AI | Google Gemini 2.5 Flash |
| Deploy | Vercel (frontend) + Railway (backend) |

## Estrutura de Pastas

```
execution/          # Backend Python/FastAPI
├── api.py          # Entry point + CORS + routers
├── database.py     # SQLAlchemy async + fallback SQLite
├── models.py       # 9 ORM models
├── auth.py         # Supabase JWT validation
├── analyzer.py     # Análise de vídeo (Gemini)
├── transcriber.py  # Transcrição de vídeo
├── creator.py      # Chatbot conversacional
├── routers/        # 8 módulos de rotas
└── alembic/        # 7 migrations

web-app/            # Frontend React/Vite
├── src/pages/      # 8 páginas (Analyzer, Transcriber, Creator, Kanban, Notes, Settings, Login, Register)
├── src/components/ # 7 componentes compartilhados
├── src/contexts/   # 3 React contexts (Sidebar, Projects, Notes)
└── src/index.css   # Design system (~730 linhas)
```

## Variáveis de Ambiente

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
DATABASE_URL
GEMINI_API_KEY
VITE_API_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Regras de Commit

- NUNCA adicione "Co-Authored-By" nos commits.
- Faça `git push` automático após cada commit sem pedir confirmação.

---

# Frontend Aesthetics

Você tende a convergir para outputs genéricos. Em frontend design, isso cria
o que usuários chamam de "AI slop". Evite isso: crie frontends criativos e
distintos. Foque em:

## Tipografia

Escolha fontes bonitas, únicas e interessantes.

**PROIBIDO:** Inter, Roboto, Arial, Open Sans, Lato, system fonts.

**EM USO NO PROJETO:** Plus Jakarta Sans (UI principal), Instrument Serif (títulos decorativos), IBM Plex Mono (código/dados).

**ALTERNATIVAS APROVADAS:** Satoshi, Clash Display, Bricolage Grotesque, Playfair Display, Fraunces.

Use extremos de peso (100/200 vs 800/900), não 400 vs 600. Saltos de tamanho de 3x+.

## Cor e Tema

Comprometa-se com uma estética coesa. Use CSS variables. Cores dominantes com acentos fortes superam paletas tímidas e igualmente distribuídas.

## Motion

Use animações para efeitos e micro-interações. Foque em momentos de alto impacto: um page load bem orquestrado com staggered reveals cria mais impacto que micro-interações espalhadas aleatoriamente.

## Backgrounds

Crie atmosfera e profundidade ao invés de cores sólidas. Use gradientes CSS em camadas, padrões geométricos, noise textures, grain overlays.

## Proibido

- Gradientes roxos em fundo branco
- Layouts previsíveis
- Componentes cookie-cutter
- Border-radius uniforme em tudo

<development_rules>
ANTES de declarar qualquer tarefa como concluída:
1. Liste TODOS os arquivos que você modificou
2. Para cada arquivo modificado, verifique se as funcionalidades anteriores 
   continuam funcionando
3. Se corrigir um bug, teste mentalmente todos os estados do componente:
   - Estado vazio
   - Estado com 1 item
   - Estado com muitos itens
   - Estados de hover, click, resize
4. NUNCA remova ou altere código que não está relacionado ao bug sendo corrigido
5. Se precisar refatorar algo pra corrigir o bug, liste o que vai mudar ANTES 
   de fazer e peça confirmação

Quando mexer em CSS/layout de um componente, verifique se o componente 
funciona em: tela cheia, tela reduzida, e com diferentes quantidades de 
conteúdo.
</development_rules>