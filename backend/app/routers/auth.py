from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import LoginIn, RegisterIn
from app.core.security import (hash_password, verify_password, create_access_token,
                               create_refresh_token, set_auth_cookies,
                               get_current_user, require_roles, user_out)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if getattr(user, "status", "Active") == "Disabled":
        raise HTTPException(status_code=403, detail="Account disabled. Contact your administrator.")
    from datetime import datetime, timezone
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    access = create_access_token(user.id, user.email)
    refresh = create_refresh_token(user.id)
    set_auth_cookies(response, access, refresh)
    return {"user": user_out(user), "access_token": access}


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db),
             admin: User = Depends(require_roles("Admin"))):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=email, password_hash=hash_password(body.password),
                name=body.name, role=body.role, client_id=body.client_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.post("/logout")
def logout(response: Response, user: User = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}
