"""
Authentication & Authorization Service
JWT-based auth with role support: 'admin' | 'user'

Environment variables (set in render.yaml / Render dashboard):
  JWT_SECRET      — random secret key for signing tokens (required in prod)
  JWT_ALGORITHM   — default HS256
  JWT_EXPIRE_MIN  — token lifetime in minutes (default 480 = 8h)
  SMTP_HOST       — SMTP server host (e.g. smtp.gmail.com)
  SMTP_PORT       — SMTP server port (default 587)
  SMTP_USER       — SMTP username / sender address
  SMTP_PASSWORD   — SMTP password or app-password
  SMTP_FROM       — sender display address (defaults to SMTP_USER)
  APP_BASE_URL    — public URL of the app (for reset links)
"""
import os
import secrets
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

SMTP_HOST     = os.getenv("SMTP_HOST", "")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", "") or SMTP_USER
APP_BASE_URL  = os.getenv("APP_BASE_URL", "https://dev.dufour.app")

RESET_TOKEN_EXPIRE_MIN = int(os.getenv("RESET_TOKEN_EXPIRE_MIN", "30"))  # 30 min

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ── Password helpers ──────────────────────────────────────────────────────────

def _truncate_for_bcrypt(password: str) -> str:
    """Bcrypt only uses the first 72 bytes; truncate to avoid errors with bcrypt ≥ 4.1."""
    return password.encode("utf-8")[:72].decode("utf-8", errors="ignore")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(_truncate_for_bcrypt(plain), hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(_truncate_for_bcrypt(plain))


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


# ── Password reset helpers ────────────────────────────────────────────────────

def _get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Lookup a user by email address."""
    from database.connection import db
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT id, username, email, password_hash, role, is_active "
                 "FROM users WHERE LOWER(email) = LOWER(:e)"),
            {"e": email}
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


def generate_reset_token(user_id: str) -> str:
    """
    Generate a cryptographically secure reset token,
    store it in DB, return the raw token string.
    """
    from database.connection import db
    token = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MIN)
    with db.get_engine().connect() as conn:
        # Invalidate any previous unused tokens for this user
        conn.execute(
            text("UPDATE password_reset_tokens SET used = true "
                 "WHERE user_id = :uid AND used = false"),
            {"uid": user_id}
        )
        conn.execute(
            text("INSERT INTO password_reset_tokens (user_id, token, expires_at) "
                 "VALUES (:uid, :tok, :exp)"),
            {"uid": user_id, "tok": token, "exp": expires_at}
        )
        conn.commit()
    logger.info(f"Reset token generated for user {user_id}, expires at {expires_at}")
    return token


def verify_reset_token(token: str) -> Dict[str, Any]:
    """
    Validate a reset token. Returns the user dict if valid.
    Raises HTTP 400 on invalid/expired/used token.
    """
    from database.connection import db
    with db.get_engine().connect() as conn:
        row = conn.execute(
            text("SELECT user_id, expires_at, used "
                 "FROM password_reset_tokens WHERE token = :tok"),
            {"tok": token}
        ).fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Token di reset non valido")
    if row[2]:  # used
        raise HTTPException(status_code=400, detail="Token già utilizzato")
    if row[1] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token scaduto")

    user = _get_user_by_id(str(row[0]))
    if not user or not user["is_active"]:
        raise HTTPException(status_code=400, detail="Utente non trovato o disabilitato")
    return user


def mark_token_used(token: str):
    """Mark a reset token as used after successful password change."""
    from database.connection import db
    with db.get_engine().connect() as conn:
        conn.execute(
            text("UPDATE password_reset_tokens SET used = true WHERE token = :tok"),
            {"tok": token}
        )
        conn.commit()


def reset_user_password(user_id: str, new_password: str):
    """Update the user's password_hash in the DB."""
    from database.connection import db
    hashed = hash_password(new_password)
    with db.get_engine().connect() as conn:
        conn.execute(
            text("UPDATE users SET password_hash = :ph WHERE id = :uid"),
            {"ph": hashed, "uid": user_id}
        )
        conn.commit()
    logger.info(f"Password reset for user {user_id}")


def send_reset_email(email: str, username: str, token: str) -> bool:
    """
    Send a password-reset email via SMTP.
    Returns True on success, False on failure (non-blocking).
    """
    if not SMTP_HOST or not SMTP_USER:
        logger.error("SMTP not configured — cannot send reset email. "
                     "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD env vars.")
        return False

    reset_url = f"{APP_BASE_URL}/admin?reset_token={token}"

    subject = "Dufour.app — Reimposta la tua password"
    html_body = f"""\
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;
                background:#1a1e23;color:#e2e8f0;border-radius:12px;">
        <h2 style="color:#7cb9e8;margin-top:0;">🗺 Dufour.app</h2>
        <p>Ciao <strong>{username}</strong>,</p>
        <p>Hai richiesto il reset della password. Clicca il pulsante qui sotto per scegliere una nuova password:</p>
        <p style="text-align:center;margin:28px 0;">
            <a href="{reset_url}"
               style="display:inline-block;padding:12px 28px;background:#2563eb;
                      color:#fff;border-radius:8px;text-decoration:none;
                      font-weight:600;font-size:15px;">
                Reimposta password
            </a>
        </p>
        <p style="font-size:13px;color:#9ba3af;">
            Il link è valido per <strong>{RESET_TOKEN_EXPIRE_MIN} minuti</strong>.<br>
            Se non hai richiesto tu il reset, ignora questa email.
        </p>
        <hr style="border:none;border-top:1px solid #353a42;margin:20px 0;">
        <p style="font-size:11px;color:#6b7280;">
            Link diretto: <a href="{reset_url}" style="color:#7cb9e8;">{reset_url}</a>
        </p>
    </div>
    """

    text_body = (
        f"Ciao {username},\n\n"
        f"Hai richiesto il reset della password su Dufour.app.\n"
        f"Clicca il link seguente per scegliere una nuova password:\n\n"
        f"  {reset_url}\n\n"
        f"Il link è valido per {RESET_TOKEN_EXPIRE_MIN} minuti.\n"
        f"Se non hai richiesto tu il reset, ignora questa email.\n"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_FROM
    msg["To"]      = email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [email], msg.as_string())
        logger.info(f"Reset email sent to {email}")
        return True
    except Exception as exc:
        logger.error(f"Failed to send reset email to {email}: {exc}")
        return False
