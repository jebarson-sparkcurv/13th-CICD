from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Client, Project, ProgressUpdate
from app.core.security import get_current_user, require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope
from app.crud import project_out, update_out, client_out

router = APIRouter(tags=["clients"])


def check_client_access(user: User, client_id: int):
    if user.role == "Client" and user.client_id != client_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this client")


@router.get("/clients")
def list_clients(db: Session = Depends(get_db),
                 user: User = Depends(require_roles("Admin", "SiteEngineer", "Accountant"))):
    from sqlalchemy import func
    from app.models.finance import Invoice
    billed = dict(db.query(Invoice.client_id,
                           func.sum(Invoice.amount + func.coalesce(Invoice.tax_amount, 0)))
                  .group_by(Invoice.client_id).all())
    clients = tenant_scope(db.query(Client), Client, user).order_by(Client.created_at.desc(), Client.id.desc()).all()
    result = []
    for c in clients:
        count = db.query(Project).filter(Project.client_id == c.id,
                                         Project.is_archived == False).count()  # noqa: E712
        o = client_out(c, count)
        o["total_billed"] = float(billed.get(c.id) or 0)
        result.append(o)
    return result


@router.post("/clients", status_code=201)
def create_client(body: dict, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("Admin"))):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Client name is required")
    c = Client(name=name, company=body.get("company"), email=body.get("email"),
               phone=body.get("phone"), address=body.get("address"),
               tax_id=body.get("tax_id"), notes=body.get("notes"))
    ensure_tenant_owned(c, user)
    db.add(c); db.commit(); db.refresh(c)
    return client_out(c)


@router.patch("/clients/{client_id}")
def patch_client(client_id: int, body: dict, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("Admin"))):
    c = db.get(Client, client_id)
    assert_same_tenant(c, user, "client")
    for k in ("name", "company", "email", "phone", "address", "tax_id", "notes", "is_active"):
        if k in body:
            setattr(c, k, body[k])
    db.commit(); db.refresh(c)
    return client_out(c)


@router.delete("/clients/{client_id}")
def deactivate_client(client_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("Admin"))):
    c = db.get(Client, client_id)
    assert_same_tenant(c, user, "client")
    active = db.query(Project).filter(Project.client_id == client_id,
                                      Project.is_archived == False,  # noqa: E712
                                      Project.status.in_(["Planning", "Ongoing", "OnHold"])).count()
    if active:
        raise HTTPException(status_code=409, detail=f"Client has {active} active project(s) — archive them first")
    c.is_active = False
    db.commit()
    return client_out(c)


@router.get("/clients/{client_id}/documents")
def client_all_documents(client_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    check_client_access(user, client_id)
    from app.models import ProjectDocument
    from app.crud import document_out
    project_ids = [p.id for p in db.query(Project).filter(Project.client_id == client_id).all()]
    q = db.query(ProjectDocument).filter(ProjectDocument.project_id.in_(project_ids or [0]))
    if user.role == "Client":
        q = q.filter(ProjectDocument.is_client_visible == True)  # noqa: E712
    return [document_out(doc) for doc in q.order_by(ProjectDocument.uploaded_at.desc()).all()]


@router.get("/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    check_client_access(user, client_id)
    client = db.get(Client, client_id)
    assert_same_tenant(client, user, "client")
    return client_out(client)


@router.get("/clients/{client_id}/projects")
def client_projects(client_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    check_client_access(user, client_id)
    client = db.get(Client, client_id)
    assert_same_tenant(client, user, "client")
    projects = (db.query(Project).filter(Project.client_id == client_id,
                                         Project.is_archived == False)  # noqa: E712
                .order_by(Project.created_at.desc()).all())
    return [project_out(db, p) for p in projects]


@router.get("/clients/{client_id}/projects/{project_id}/updates")
def client_project_updates(client_id: int, project_id: int, db: Session = Depends(get_db),
                           user: User = Depends(get_current_user),
                           limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    check_client_access(user, client_id)
    project = db.get(Project, project_id)
    if not project or project.is_archived or project.client_id != client_id:
        raise HTTPException(status_code=404, detail="Project not found for this client")
    q = db.query(ProgressUpdate).filter(ProgressUpdate.project_id == project_id,
                                        ProgressUpdate.visible_to_client == True)  # noqa: E712
    total = q.count()
    items = (q.order_by(ProgressUpdate.update_date.desc(), ProgressUpdate.created_at.desc())
             .offset(offset).limit(limit).all())
    return {"items": [update_out(u) for u in items],
            "total": total, "limit": limit, "offset": offset}


@router.get("/users")
def list_users(db: Session = Depends(get_db), role: str = None,
               user: User = Depends(require_roles("Admin", "SiteEngineer"))):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    return [{"id": u.id, "name": u.name, "email": u.email, "role": u.role} for u in q.all()]


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.routers.projects import scope_by_role
    q = db.query(Project).filter(Project.is_archived == False)  # noqa: E712
    q = scope_by_role(q, db, user)
    projects = q.all()
    by_status = {}
    issues = 0
    total_budget = 0.0
    for p in projects:
        by_status[p.status] = by_status.get(p.status, 0) + 1
        from app.crud import has_active_issues
        if has_active_issues(db, p.id):
            issues += 1
        if p.budget:
            total_budget += float(p.budget)
    return {"total_projects": len(projects), "by_status": by_status,
            "projects_with_issues": issues, "total_budget": total_budget}
