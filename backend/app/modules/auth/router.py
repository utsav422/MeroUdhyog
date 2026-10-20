from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.core.config import get_settings
from app.core.dependencies import get_current_user_id, get_db
from app.core.security import generate_csrf_token
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenInfoResponse,
    TokenResponse,
    VerifyEmailRequest,
)
from app.modules.auth.service import (
    PURPOSE_RESET,
    PURPOSE_VERIFY,
    AuthService,
)

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, access: str, refresh: str, csrf: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


async def _token_payload(tokens: dict, response: Response) -> TokenResponse:
    csrf = generate_csrf_token()
    _set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"], csrf)
    return TokenResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user_id=tokens["user_id"],
        tenant_id=tokens["tenant_id"],
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, response: Response, db=Depends(get_db)):
    service = AuthService(db)
    tokens = await service.register(data)
    return await _token_payload(tokens, response)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, response: Response, db=Depends(get_db)):
    service = AuthService(db)
    tokens = await service.login(data)
    return await _token_payload(tokens, response)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db=Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    service = AuthService(db)
    tokens = await service.refresh(token)
    return await _token_payload(tokens, response)


@router.post("/logout", status_code=204)
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    response.delete_cookie("csrf_token")


@router.get("/me", response_model=MeResponse)
async def me(user_id=Depends(get_current_user_id), db=Depends(get_db)):
    from sqlalchemy import select

    from app.modules.users.models import User

    row = await db.execute(select(User).where(User.id == user_id))
    user = row.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return MeResponse(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_superadmin=user.is_superadmin,
        is_email_verified=user.is_email_verified,
    )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(data: ForgotPasswordRequest, db=Depends(get_db)):
    service = AuthService(db)
    await service.forgot_password(data.email)
    return MessageResponse(
        detail="If that email is registered, a reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(data: ResetPasswordRequest, db=Depends(get_db)):
    service = AuthService(db)
    await service.reset_password(data.token, data.new_password)
    return MessageResponse(
        detail="Password updated. You can now sign in with your new password."
    )


@router.get("/reset-password/validate", response_model=TokenInfoResponse)
async def validate_reset_token(
    token: str = Query(min_length=10, max_length=512), db=Depends(get_db)
):
    service = AuthService(db)
    email = await service.email_token_info(token, PURPOSE_RESET)
    return TokenInfoResponse(valid=email is not None, email=email)


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    service = AuthService(db)
    await service.change_password(user_id, data.current_password, data.new_password)
    return MessageResponse(
        detail="Password changed. Please sign in again on your other devices."
    )


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(data: VerifyEmailRequest, db=Depends(get_db)):
    service = AuthService(db)
    await service.verify_email(data.token)
    return MessageResponse(detail="Email verified successfully.")


@router.get("/verify-email/validate", response_model=TokenInfoResponse)
async def validate_verify_token(
    token: str = Query(min_length=10, max_length=512), db=Depends(get_db)
):
    service = AuthService(db)
    email = await service.email_token_info(token, PURPOSE_VERIFY)
    return TokenInfoResponse(valid=email is not None, email=email)


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(data: ResendVerificationRequest, db=Depends(get_db)):
    service = AuthService(db)
    await service.resend_verification(data.email)
    return MessageResponse(
        detail="If that email needs verification, a new link has been sent."
    )
