import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

from storage import upload_file as upload_to_storage

router = APIRouter(prefix="/uploads", tags=["uploads"])

THUMBS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".tmp", "thumbnails")
os.makedirs(THUMBS_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB

MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


@router.post("/image")
async def upload_image(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Formato de imagem não suportado.")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx 10 MB).")

    filename = f"img_{uuid.uuid4().hex}{ext}"
    content_type = MIME_MAP.get(ext, "application/octet-stream")

    # Try Supabase Storage first
    public_url = upload_to_storage(data, filename, content_type)
    if public_url:
        return {"url": public_url}

    # Fallback: save locally
    filepath = os.path.join(THUMBS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(data)
    return {"url": f"/thumbnails/{filename}"}
