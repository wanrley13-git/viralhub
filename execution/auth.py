import os
import logging
from dotenv import load_dotenv
import jwt
from jwt import PyJWKClient
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

import datetime

from database import get_db
from models import User, Profile, Workspace, WorkspaceMember, _DEFAULT_PERMISSIONS

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'), override=True)

# Supabase JWKS
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_jwks_client = None
if SUPABASE_URL:
    _jwks_client = PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True)

logger = logging.getLogger("auth")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    """Validate a Supabase JWT via JWKS and return the matching Profile."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not _jwks_client:
        raise credentials_exception
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
        supabase_id = payload.get("sub")
        if not supabase_id:
            raise credentials_exception
        result = await db.execute(
            select(Profile).filter(Profile.supabase_id == supabase_id)
        )
        profile = result.scalars().first()
        if profile:
            return profile
        # Auto-create profile + personal workspace for new Supabase users
        email = payload.get("email")
        if not email:
            raise credentials_exception
        new_profile = Profile(supabase_id=supabase_id, email=email)
        db.add(new_profile)
        await db.flush()  # get new_profile.id before creating workspace

        ws = Workspace(
            name="Meu Workspace",
            owner_id=new_profile.id,
            is_personal=1,
            created_at=datetime.datetime.utcnow(),
        )
        db.add(ws)
        await db.flush()

        db.add(WorkspaceMember(
            workspace_id=ws.id,
            user_id=new_profile.id,
            role="owner",
            permissions=_DEFAULT_PERMISSIONS,
            joined_at=datetime.datetime.utcnow(),
        ))
        await db.commit()
        await db.refresh(new_profile)
        return new_profile
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception


# Keep alias so routers that import get_current_user_dual still work
get_current_user_dual = get_current_user


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email}
