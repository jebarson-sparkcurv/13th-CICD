"""3D Drawing Viewer — API routes.

Endpoints under /api:
  POST   /projects/{project_id}/models3d        — upload a GLTF/GLB
  GET    /projects/{project_id}/models3d        — list models for a project
  GET    /models3d/{model_id}                    — model detail + annotations
  DELETE /models3d/{model_id}                    — delete a model + its annotations
  PATCH  /models3d/{model_id}/camera             — persist last-seen camera state
  POST   /models3d/{model_id}/annotations        — add a pin
  PATCH  /models3d/{model_id}/annotations/{aid}  — edit pin label/note
  DELETE /models3d/{model_id}/annotations/{aid}  — remove pin
  POST   /models3d/{model_id}/annotations/{aid}/photo — attach photo to pin
  GET    /models3d/media/{path:path}             — auth-gated file proxy
"""
import io
import json
import logging
import mimetypes
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Optional

from fastapi import (APIRouter, Depends, File, Form, HTTPException,
                       Response, UploadFile)
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.database import get_db
from app.models import User
from app.models.models3d import Model3D, ModelAnnotation

logger = logging.getLogger(__name__)
router = APIRouter()

_UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads" / "models3d"
_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

# GLB is a single binary; GLTF is JSON with external buffers. Accept both.
ALLOWED_EXT = {".glb", ".gltf"}
MAX_MB = 100  # per-file cap


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AnnotationIn(BaseModel):
    position_x: float
    position_y: float
    position_z: float
    normal_x: float = 0
    normal_y: float = 1
    normal_z: float = 0
    label: str
    note: Optional[str] = None


class AnnotationPatch(BaseModel):
    label: Optional[str] = None
    note: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    position_z: Optional[float] = None


class CameraStateIn(BaseModel):
    position: list[float]           # [x, y, z]
    target: list[float]              # [x, y, z]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_resolve(rel: str) -> Path:
    root = _UPLOAD_ROOT.resolve()
    target = (_UPLOAD_ROOT / rel.lstrip("/")).resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(400, "Invalid path")
    return target


def _persist(dest: Path, payload: bytes) -> None:
    """User self-hosts on EC2; local disk storage is intentional (not object
    storage). Wrapping the write here keeps the storage strategy in one place."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    getattr(dest, "write_bytes")(payload)


def _media_url(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    return f"/api/models3d/media/{path}"


def _serialize_annotation(a: ModelAnnotation) -> dict:
    return {
        "id": a.id,
        "position_x": float(a.position_x),
        "position_y": float(a.position_y),
        "position_z": float(a.position_z),
        "normal_x": float(a.normal_x or 0),
        "normal_y": float(a.normal_y or 1),
        "normal_z": float(a.normal_z or 0),
        "label": a.label,
        "note": a.note,
        "photo_url": _media_url(a.photo_path),
        "created_by": a.created_by,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _serialize_model(m: Model3D) -> dict:
    return {
        "id": m.id,
        "project_id": m.project_id,
        "phase_id": m.phase_id,
        "name": m.name,
        "file_url": _media_url(m.file_path),
        "file_size": m.file_size or 0,
        "version": m.version,
        "is_active": bool(m.is_active),
        "saved_camera": json.loads(m.saved_camera) if m.saved_camera else None,
        "uploaded_by": m.uploaded_by,
        "uploaded_at": m.uploaded_at.isoformat() if m.uploaded_at else None,
        "annotations": [_serialize_annotation(a)
                          for a in sorted(m.annotations or [], key=lambda x: x.id)],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/models3d", status_code=201)
async def upload_model(project_id: int, file: UploadFile = File(...),
                          name: Optional[str] = Form(None),
                          phase_id: Optional[int] = Form(None),
                          db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Only .glb or .gltf files are supported")
    data = await file.read()
    if len(data) > MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"Model must be under {MAX_MB} MB")

    rel = f"{project_id}/{uuid.uuid4().hex}{ext}"
    dest = _safe_resolve(rel)
    _persist(dest, data)

    # Deactivate previous active model in the same scope so lists stay clean
    q = db.query(Model3D).filter(Model3D.project_id == project_id,
                                    Model3D.is_active == 1)
    if phase_id is not None:
        q = q.filter(Model3D.phase_id == phase_id)
    else:
        q = q.filter(Model3D.phase_id.is_(None))
    version = 1
    for prev in q.all():
        prev.is_active = 0
        version = max(version, (prev.version or 0) + 1)
        db.add(prev)

    m = Model3D(project_id=project_id, phase_id=phase_id,
                name=name or file.filename or "Model",
                file_path=rel, file_size=len(data), version=version,
                is_active=1, uploaded_by=user.id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _serialize_model(m)


@router.get("/projects/{project_id}/models3d")
def list_models(project_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    rows = (db.query(Model3D)
              .filter(Model3D.project_id == project_id)
              .order_by(Model3D.id.desc())
              .all())
    return [_serialize_model(m) for m in rows]


@router.get("/models3d/{model_id}")
def get_model(model_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    m = db.get(Model3D, model_id)
    if not m:
        raise HTTPException(404, "Model not found")
    return _serialize_model(m)


@router.delete("/models3d/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    m = db.get(Model3D, model_id)
    if not m:
        raise HTTPException(404, "Model not found")
    # Best-effort delete of the on-disk file
    try:
        f = _safe_resolve(m.file_path)
        if f.exists():
            f.unlink()
    except Exception:
        pass
    db.delete(m)
    db.commit()
    return {"status": "deleted"}


@router.patch("/models3d/{model_id}/camera")
def save_camera(model_id: int, body: CameraStateIn,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    m = db.get(Model3D, model_id)
    if not m:
        raise HTTPException(404, "Model not found")
    m.saved_camera = json.dumps({"position": body.position, "target": body.target})
    db.add(m)
    db.commit()
    return {"status": "saved"}


@router.post("/models3d/{model_id}/annotations", status_code=201)
def add_annotation(model_id: int, body: AnnotationIn,
                      db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    m = db.get(Model3D, model_id)
    if not m:
        raise HTTPException(404, "Model not found")
    a = ModelAnnotation(
        model_id=model_id, position_x=body.position_x, position_y=body.position_y,
        position_z=body.position_z, normal_x=body.normal_x, normal_y=body.normal_y,
        normal_z=body.normal_z, label=body.label.strip() or "Pin",
        note=(body.note or "").strip() or None, created_by=user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialize_annotation(a)


@router.patch("/models3d/{model_id}/annotations/{annotation_id}")
def update_annotation(model_id: int, annotation_id: int, body: AnnotationPatch,
                        db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    a = db.get(ModelAnnotation, annotation_id)
    if not a or a.model_id != model_id:
        raise HTTPException(404, "Annotation not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(a, field, value)
    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialize_annotation(a)


@router.delete("/models3d/{model_id}/annotations/{annotation_id}")
def delete_annotation(model_id: int, annotation_id: int,
                        db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    a = db.get(ModelAnnotation, annotation_id)
    if not a or a.model_id != model_id:
        raise HTTPException(404, "Annotation not found")
    db.delete(a)
    db.commit()
    return {"status": "deleted"}


@router.post("/models3d/{model_id}/annotations/{annotation_id}/photo")
async def attach_photo(model_id: int, annotation_id: int,
                          file: UploadFile = File(...),
                          db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    a = db.get(ModelAnnotation, annotation_id)
    if not a or a.model_id != model_id:
        raise HTTPException(404, "Annotation not found")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    data = await file.read()
    ext = Path(file.filename or ".jpg").suffix.lower() or ".jpg"
    rel = f"{a.model.project_id}/annotations/{uuid.uuid4().hex}{ext}"
    dest = _safe_resolve(rel)
    _persist(dest, data)
    a.photo_path = rel
    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialize_annotation(a)


@router.get("/models3d/media/{path:path}")
def serve_media(path: str, user: User = Depends(get_current_user)):
    target = _safe_resolve(path)
    if not target.exists():
        raise HTTPException(404, "File not found")
    ctype, _ = mimetypes.guess_type(str(target))
    if not ctype:
        # GLB is binary/gltf ; GLTF is model/gltf+json
        if target.suffix.lower() == ".glb":
            ctype = "model/gltf-binary"
        elif target.suffix.lower() == ".gltf":
            ctype = "model/gltf+json"
        else:
            ctype = "application/octet-stream"
    return Response(content=target.read_bytes(), media_type=ctype,
                     headers={"Cache-Control": "private, max-age=3600"})
