import uuid
from pathlib import Path as FSPath

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Project, ProjectDocument
from app.core.security import get_current_user, require_roles
from app.crud import document_out
from app.schemas import DocumentPatch
from app.routers.projects import get_project_or_404, check_write_access, check_read_access
from app.routers.uploads import UPLOAD_DIR

router = APIRouter(tags=["documents"])

DOC_ALLOWED = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".doc", ".docx",
               ".xls", ".xlsx", ".csv", ".txt", ".dwg", ".zip"}
MAX_DOC_SIZE = 20 * 1024 * 1024


@router.post("/projects/{project_id}/documents", status_code=201)
async def upload_document(project_id: int, file: UploadFile = File(...),
                          document_name: str = Form(None), category: str = Form(None),
                          is_client_visible: bool = Form(True),
                          db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id)
    check_write_access(user, project)
    ext = FSPath(file.filename or "file").suffix.lower()
    if ext not in DOC_ALLOWED:
        raise HTTPException(status_code=422, detail=f"File type {ext} not allowed")
    content = await file.read()
    if len(content) > MAX_DOC_SIZE:
        raise HTTPException(status_code=422, detail="File too large (max 20MB)")
    fname = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / fname).write_bytes(content)
    name = (document_name or "").strip() or (file.filename or fname)
    doc = ProjectDocument(project_id=project_id, document_name=name,
                          file_url=f"/api/uploads/{fname}", file_type=ext.lstrip("."),
                          file_size=len(content), uploaded_by=user.id,
                          category=category or "Other",
                          is_client_visible=is_client_visible)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return document_out(doc)


@router.get("/projects/{project_id}/documents")
def list_documents(project_id: int, category: str = None, search: str = None,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id)
    check_read_access(user, project)
    q = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id)
    if user.role == "Client":
        q = q.filter(ProjectDocument.is_client_visible == True)  # noqa: E712
    if category:
        q = q.filter(ProjectDocument.category == category)
    if search:
        q = q.filter(ProjectDocument.document_name.ilike(f"%{search}%"))
    docs = q.order_by(ProjectDocument.uploaded_at.desc()).all()
    return [document_out(d) for d in docs]


@router.get("/documents/{document_id}")
def get_document(document_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    doc = db.get(ProjectDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    check_read_access(user, doc.project)
    if user.role == "Client" and not doc.is_client_visible:
        raise HTTPException(status_code=404, detail="Document not found")
    out = document_out(doc)
    out["download_url"] = doc.file_url
    return out


@router.patch("/documents/{document_id}")
def patch_document(document_id: int, body: DocumentPatch,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    doc = db.get(ProjectDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    check_write_access(user, doc.project)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    db.commit()
    db.refresh(doc)
    return document_out(doc)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: int, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("Admin"))):
    doc = db.get(ProjectDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()


@router.get("/clients/{client_id}/projects/{project_id}/documents")
def client_project_documents(client_id: int, project_id: int,
                             category: str = None, search: str = None,
                             db: Session = Depends(get_db),
                             user: User = Depends(get_current_user)):
    if user.role == "Client" and user.client_id != client_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this client")
    project = db.get(Project, project_id)
    if not project or project.is_archived or project.client_id != client_id:
        raise HTTPException(status_code=404, detail="Project not found for this client")
    q = db.query(ProjectDocument).filter(ProjectDocument.project_id == project_id,
                                         ProjectDocument.is_client_visible == True)  # noqa: E712
    if category:
        q = q.filter(ProjectDocument.category == category)
    if search:
        q = q.filter(ProjectDocument.document_name.ilike(f"%{search}%"))
    return [document_out(d) for d in q.order_by(ProjectDocument.uploaded_at.desc()).all()]
