from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Notification
from app.core.security import get_current_user

router = APIRouter(tags=["notifications"])


def notify_flag(db: Session, project, actor: User, ntype: str, title: str,
                message: str, phase_id: int = None):
    recipients = {u.id for u in db.query(User).filter(User.role == "Admin",
                                                      User.status != "Disabled").all()}
    if project.site_engineer_id:
        recipients.add(project.site_engineer_id)
    recipients.discard(actor.id)
    for uid in recipients:
        db.add(Notification(user_id=uid, type=ntype, title=title, message=message,
                            project_id=project.id, phase_id=phase_id))
    db.commit()


def notification_out(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "message": n.message,
            "project_id": n.project_id, "phase_id": n.phase_id,
            "link": getattr(n, "link", None), "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None}


@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user),
                       unread_only: bool = False, limit: int = Query(20, ge=1, le=100)):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)  # noqa: E712
    return [notification_out(n) for n in q.order_by(Notification.created_at.desc()).limit(limit).all()]


@router.get("/notifications/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"count": db.query(Notification).filter(Notification.user_id == user.id,
                                                   Notification.is_read == False).count()}  # noqa: E712


@router.post("/notifications/{notif_id}/read")
def mark_read(notif_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, notif_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return notification_out(n)


@router.post("/notifications/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == user.id,
                                  Notification.is_read == False).update({"is_read": True})  # noqa: E712
    db.commit()
    return {"ok": True}
