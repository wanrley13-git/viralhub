# ViralHub

Plataforma de criacao de conteudo viral com analise de video por IA, transcricao, gerador de conteudo e kanban de projetos.

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Backend**: Python / FastAPI
- **Banco**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth (JWT via JWKS)
- **IA**: Google Gemini 2.5 Flash

## Requisitos

- Python 3.11+
- Node.js 18+
- Conta no [Supabase](https://supabase.com) (projeto com Auth habilitado)
- Chave da [API Gemini](https://ai.google.dev)

## Setup

### 1. Clonar e configurar variaveis de ambiente

```bash
git clone <repo-url> && cd viralhub

# Raiz — chave Gemini
cp .env.example .env
# Edite .env e preencha GEMINI_API_KEY

# Backend
cp .env.example execution/.env
# Edite execution/.env e preencha DATABASE_URL e SUPABASE_URL

# Frontend
cp .env.example web-app/.env
# Edite web-app/.env e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
```

Consulte `.env.example` para ver todas as variaveis necessarias.

### 2. Backend

```bash
cd execution
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Aplicar schema no banco
alembic upgrade head

# Iniciar
uvicorn api:app --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd web-app
npm install
npm run dev
```

### 4. Acesso

- Frontend: http://localhost:5173
- API: http://localhost:8000

### Inicio rapido (script)

```bash
./start.sh
```

## Estrutura

```
.
├── execution/          # Backend FastAPI
│   ├── api.py          # Entry point
│   ├── auth.py         # Supabase Auth (JWKS)
│   ├── database.py     # SQLAlchemy async + Postgres
│   ├── models.py       # 9 modelos ORM
│   ├── routers/        # Endpoints da API
│   └── alembic/        # Migrations
├── web-app/            # Frontend React
│   └── src/
│       ├── pages/      # 8 paginas
│       ├── components/ # Componentes reutilizaveis
│       └── contexts/   # State management
├── directives/         # Prompts do agente IA
├── .env.example        # Template de variaveis
└── start.sh            # Script de inicio
```

## Variaveis de ambiente

| Variavel | Onde | Descricao |
|----------|------|-----------|
| `GEMINI_API_KEY` | `.env` (raiz) | Chave da API Google Gemini |
| `DATABASE_URL` | `execution/.env` | Connection string Postgres (Supabase) |
| `SUPABASE_URL` | `execution/.env` | URL do projeto Supabase |
| `VITE_API_URL` | `web-app/.env` | URL do backend (default: http://localhost:8000) |
| `VITE_SUPABASE_URL` | `web-app/.env` | URL do Supabase (mesmo que SUPABASE_URL) |
| `VITE_SUPABASE_ANON_KEY` | `web-app/.env` | Chave publica (anon) do Supabase |
