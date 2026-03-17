"""
Authentication & Authorization Service
JWT-based auth with role support: 'admin' | 'user'

Environment variables (set in render.yaml / Render dashboard):
  JWT_SECRET      — random secret key for signing tokens (required in prod)
  JWT_ALGORITHM   — default HS256
  JWT_EXPIRE_MIN  — token lifetime in minutes (default 480 = 8h)
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import text

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
JWT_SECRET    = os.getenv("JWT_SECRET", "dufour-change-me-in-production-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MIN = int(os.getenv("JWT_EXPIRE_MIN", "480"))  # 8 h

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ── Password helpers ──────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(data: Dict[str, Any]) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=JWT_EXPIRE_MIN)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    from database.connection import db
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT id, username, email, password_hash, role, is_active "
                 "FROM users WHERE username = :u"),
            {"u": username}
        ).fetchone()
    if row is None:
        return None
    return {
        "id":            str(row[0]),
        "username":      row[1],
        "email":         row[2],
        "password_hash": row[3],
        "role":          row[4],
        "is_active":     row[5],
    }


def _get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    from database.connection import db
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT id, username, email, role, is_active "
                 "FROM users WHERE id = :i"),
            {"i": user_id}
        ).fetchone()
    if row is None:
        return None
    return {
        "id":        str(row[0]),
        "username":  row[1],
        "email":     row[2],
        "role":      row[3],
        "is_active": row[4],
    }


# ── Login ─────────────────────────────────────────────────────────────────────

def authenticate_user(username: str, password: str) -> Dict[str, Any]:
    """
    Validate credentials.  Returns the user dict on success.
    Raises HTTP 401 on failure.
    """
    user = _get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid username or password")
    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Account disabled")
    if not user["password_hash"] or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid username or password")
    return user


# ── FastAPI dependency helpers ────────────────────────────────────────────────

def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """Dependency: any authenticated user."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid token payload")
    user = _get_user_by_id(user_id)
    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User not found or disabled")
    return user


def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Dependency: admin role required."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin role required")
    return current_user
