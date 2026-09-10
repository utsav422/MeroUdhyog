from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session_dependency
from app.core.security import decode_token

settings = get_settings()


async def get_db() -> AsyncSession:
    async for session in get_session_dependency():
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user_id(
    request: Request,
    access_token: str | None = Cookie(default=None, alias="access_token"),
) -> UUID:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not access_token:
        raise credentials_exception

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise credentials_exception

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise credentials_exception

    try:
        return UUID(user_id_str)
    except ValueError:
        raise credentials_exception from None


async def get_current_tenant_id(
    request: Request,
    access_token: str | None = Cookie(default=None, alias="access_token"),
) -> UUID:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    tenant_id_str = payload.get("tenant_id")
    if not tenant_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant not found in token",
        )

    try:
        return UUID(tenant_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid tenant ID",
        ) from None


async def verify_csrf_token(
    request: Request,
    x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> None:
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    session_csrf = request.cookies.get("csrf_token")
    if not session_csrf or not x_csrf_token or session_csrf != x_csrf_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token validation failed",
        )


CurrentUserId = Annotated[UUID, Depends(get_current_user_id)]
CurrentTenantId = Annotated[UUID, Depends(get_current_tenant_id)]
CSRFProtected = Annotated[None, Depends(verify_csrf_token)]