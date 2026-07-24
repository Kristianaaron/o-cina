"""Authentication middleware for O-cina API.

Checks Authorization: Bearer <token> against ApiKey.key_hash (SHA-256).
All routers can optionally depend on get_current_user to protect endpoints.
"""
import hashlib
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiKey, User

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


def hash_token(token: str) -> str:
    """Return SHA-256 hex digest of the token."""
    return hashlib.sha256(token.encode()).hexdigest()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """FastAPI dependency: resolve Bearer token to a User.

    Returns None if no credentials are provided (open access).
    Raises 401 if credentials are present but invalid/revoked.
    """
    if credentials is None:
        return None  # Open access — caller can check for None if needed

    token_hash = hash_token(credentials.credentials)
    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == token_hash, ApiKey.revoked.is_(False))
        .first()
    )
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Touch last_used
    import time
    api_key.last_used = time.time()
    db.commit()

    return api_key.user


def require_user(
    user: User | None = Depends(get_current_user),
) -> User:
    """FastAPI dependency: require a valid authenticated user.

    Raises 401 if no credentials are provided.
    """
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
