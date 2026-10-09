import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.core.security import require_roles

router = APIRouter(tags=["uploads"])

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"}


@router.post("/upload", status_code=201)
async def upload_file(file: UploadFile = File(...),
                      user=Depends(require_roles("Admin", "SiteEngineer", "Accountant", "ProcurementOfficer"))):
    ext = Path(file.filename or "file").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=422, detail=f"File type {ext} not allowed")
    fname = f"{uuid.uuid4().hex}{ext}"
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 10MB)")
    (UPLOAD_DIR / fname).write_bytes(content)
    return {"url": f"/api/uploads/{fname}", "filename": file.filename}
