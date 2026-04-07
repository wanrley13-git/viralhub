from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

from database import init_db
from routers.analysis import router as analysis_router
from routers.tasks import router as tasks_router
from auth import router as auth_router
from creator import router as creator_router
from routers.knowledge import router as knowledge_router
from routers.transcription import router as transcription_router
from routers.tone import router as tone_router
from routers.projects import router as projects_router
from routers.uploads import router as uploads_router

app = FastAPI(title="ViralAnalyst Content Hub API")

# Miniaturas estáticas
THUMBS_DIR = os.path.join(os.path.dirname(__file__), ".tmp", "thumbnails")
os.makedirs(THUMBS_DIR, exist_ok=True)
app.mount("/thumbnails", StaticFiles(directory=THUMBS_DIR), name="thumbnails")

# Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusão de Routers
app.include_router(auth_router)
app.include_router(analysis_router)
app.include_router(tasks_router)
app.include_router(creator_router)
app.include_router(knowledge_router)
app.include_router(transcription_router)
app.include_router(tone_router)
app.include_router(projects_router)
app.include_router(uploads_router)

@app.on_event("startup")
async def on_startup():
    await init_db()

@app.get("/")
def read_root():
    return {"status": "ok", "message": "ViralAnalyst Content Hub Backend Running"}

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
