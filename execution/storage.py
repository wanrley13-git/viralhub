"""
Supabase Storage helper — uploads files to a public bucket
and returns the public URL.
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
BUCKET = "thumbnails"


def _public_url(path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


def upload_file(file_bytes: bytes, filename: str, content_type: str = "image/jpeg") -> str | None:
    """Upload a file to Supabase Storage and return the public URL.
    Returns None if upload fails or Supabase is not configured.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return None
    try:
        url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{filename}"
        resp = httpx.post(
            url,
            content=file_bytes,
            headers={
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "apikey": SUPABASE_SERVICE_KEY,
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            timeout=30,
        )
        if resp.status_code in (200, 201):
            return _public_url(filename)
        print(f"[storage] Upload failed ({resp.status_code}): {resp.text[:200]}")
        return None
    except Exception as e:
        print(f"[storage] Upload error: {e}")
        return None
