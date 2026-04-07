#!/bin/bash

echo "============================================="
echo "   Iniciando ViralAnalyst (Frontend + API)   "
echo "============================================="

# 1. Checa a chave de API
if ! grep -q "GEMINI_API_KEY=.*" .env; then
  echo "⚠️ AVISO: Adicione sua GEMINI_API_KEY no arquivo .env"
fi

# 2. Configura e Roda o Backend
echo "-> Iniciando backend (Python/FastAPI)..."
cd execution
if [ ! -d "venv" ]; then
    echo "   Criando ambiente virtual (venv)..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Inicia uvicorn no background
uvicorn api:app --host 0.0.0.0 --port 8000 > /dev/null 2>&1 &
BACKEND_PID=$!

# 3. Configura e Roda o Frontend
echo "-> Iniciando frontend (React/Vite)..."
cd ../web-app
npm run dev > /dev/null 2>&1 &
FRONTEND_PID=$!

echo ""
echo "🚀 Servidor rodando!"
echo "➡️  Acesse a interface em: http://localhost:5173"
echo "➡️  API Backend em: http://localhost:8000"
echo ""
echo "Pressione Ctrl+C a qualquer momento para parar os processos."

# Trava terminal e limpa processos ao sair
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
