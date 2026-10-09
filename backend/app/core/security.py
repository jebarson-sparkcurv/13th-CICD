import os
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from fastapi import Request, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: int, email: str) -> str:
    payload = {"sub": str(user_id), "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    payload = {"sub": str(user_id),
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token: str, refresh_token: str):
    response.set_cookie("access_token", access_token, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = db.get(User, int(payload["sub"]))
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles):
    def dep(user: User = Depends(get_current_user)) -> User:
        # SuperAdmin bypasses role checks (they see every tenant's data).
        if user.role == "SuperAdmin":
            return user
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Not authorized for this action")
        return user
    return dep


def user_out(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name,
            "role": user.role, "client_id": user.client_id,
            "tenant_id": getattr(user, "tenant_id", None),
            "linked_vendor_id": getattr(user, "linked_vendor_id", None),
            "status": getattr(user, "status", "Active"),
            "effective_modules": _effective_modules(user)}


def _effective_modules(user: User) -> list[str]:
    """Modules this user can actually see = intersect(user.allowed_modules or full,
    tenant.allowed_modules).

    * SuperAdmin: sees every possible module (returns None so the frontend
      treats it as unrestricted).
    * No tenant: returns [] (locked out).
    * user.allowed_modules empty/None: inherits the full tenant set.
    """
    if user.role == "SuperAdmin":
        return None  # unrestricted
    from app.database import SessionLocal
    from app.models.tenant import Tenant
    tid = getattr(user, "tenant_id", None)
    if not tid:
        return []
    db = SessionLocal()
    try:
        t = db.get(Tenant, tid)
        tenant_allowed = list(t.allowed_modules or []) if t else []
    finally:
        db.close()
    user_allowed = list(getattr(user, "allowed_modules", None) or [])
    if not user_allowed:
        return tenant_allowed
    return [m for m in user_allowed if m in tenant_allowed]
