"""AI Design Concept & Cost Estimate — API routes.

Endpoints (all prefixed with /api):
  POST /concepts/upload           — multipart upload of the reference photo
  POST /concepts                  — create a ConceptGeneration and kick off the async job
  GET  /concepts/{id}             — poll: status + lines + urls
  GET  /concepts                  — list recent concepts (staff only) or my concepts (client)
  PATCH /concepts/{id}/lines/{lid} — inline-edit a cost line
  POST /concepts/{id}/lines       — add a new line
  DELETE /concepts/{id}/lines/{lid}
  POST /concepts/{id}/regenerate  — new render with a different style, keep lines
  GET  /concepts/{id}/pdf         — branded PDF export
  GET  /concepts/media/{path:path} — proxy image out of object storage
"""
import asyncio
import io
import logging
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import (APIRouter, BackgroundTasks, Depends, File, HTTPException,
                       Query, Response, UploadFile)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.concept_ai import (COST_CATEGORIES, generate_cost_estimate,
                                    generate_render)
from app.core.object_storage import APP_NAME, get_object, put_object
from app.core.security import get_current_user
from app.database import SessionLocal, get_db
from app.models import User
from app.models.concepts import ConceptCostLine, ConceptGeneration

logger = logging.getLogger(__name__)
router = APIRouter()

SPACE_TYPES = {"LivingRoom", "Bedroom", "Kitchen", "Bathroom", "DiningRoom",
                 "Office", "Exterior", "Garden"}
STYLES = {"Modern", "Scandinavian", "Industrial", "Minimalist", "Farmhouse",
            "Contemporary", "Bohemian", "Traditional", "Mid-Century", "Japandi",
            "Rustic", "Luxury"}
ALLOWED_MIME = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LineIn(BaseModel):
    category: str
    description: str
    quantity: float = 1
    unit: str = "unit"
    rate: float = 0

class LineOut(BaseModel):
    id: int
    category: str
    description: str
    quantity: float
    unit: str
    rate: float
    subtotal: float
    sort_order: int

class ConceptCreate(BaseModel):
    uploaded_photo_path: str  # returned by /concepts/upload
    space_type: str
    style: str
    sqft: float = Field(gt=0)
    region: str = "India"
    client_id: Optional[int] = None

class ConceptOut(BaseModel):
    id: int
    client_id: Optional[int]
    space_type: str
    style: str
    sqft: float
    region: str
    uploaded_photo_url: Optional[str]
    rendered_image_url: Optional[str]
    status: str
    error_message: Optional[str]
    total_estimate: float
    created_at: str
    completed_at: Optional[str]
    lines: list[LineOut] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _media_url(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    return f"/api/concepts/media/{path}"


def _serialize(c: ConceptGeneration) -> dict:
    return {
        "id": c.id,
        "client_id": c.client_id,
        "space_type": c.space_type,
        "style": c.style,
        "sqft": float(c.sqft or 0),
        "region": c.region,
        "uploaded_photo_url": _media_url(c.uploaded_photo_path),
        "rendered_image_url": _media_url(c.rendered_image_path),
        "status": c.status,
        "error_message": c.error_message,
        "total_estimate": float(c.total_estimate or 0),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "completed_at": c.completed_at.isoformat() if c.completed_at else None,
        "lines": [
            {
                "id": li.id,
                "category": li.category,
                "description": li.description,
                "quantity": float(li.quantity or 0),
                "unit": li.unit,
                "rate": float(li.rate or 0),
                "subtotal": float(li.subtotal or 0),
                "sort_order": li.sort_order or 0,
            }
            for li in sorted(c.lines or [], key=lambda l: (l.sort_order or 0, l.id))
        ],
    }


def _recompute_total(db: Session, concept: ConceptGeneration):
    total = sum((Decimal(str(li.subtotal or 0)) for li in concept.lines), Decimal(0))
    concept.total_estimate = total
    db.add(concept)


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------

async def _run_generation(concept_id: int):
    db = SessionLocal()
    try:
        c = db.get(ConceptGeneration, concept_id)
        if not c:
            return
        try:
            ref_bytes, _ = get_object(c.uploaded_photo_path)
            render_task = asyncio.create_task(
                generate_render(ref_bytes, c.space_type, c.style))
            cost_task = asyncio.create_task(
                generate_cost_estimate(c.space_type, c.style, float(c.sqft), c.region))
            render_bytes, cost_lines = await asyncio.gather(render_task, cost_task)

            # Persist render
            render_path = f"{APP_NAME}/concepts/{concept_id}/render-{uuid.uuid4().hex}.png"
            put_object(render_path, render_bytes, "image/png")
            c.rendered_image_path = render_path

            # Persist lines
            db.query(ConceptCostLine).filter(ConceptCostLine.concept_id == c.id).delete()
            for idx, li in enumerate(cost_lines):
                db.add(ConceptCostLine(
                    concept_id=c.id, category=li["category"], description=li["description"],
                    quantity=li["quantity"], unit=li["unit"], rate=li["rate"],
                    subtotal=li["subtotal"], sort_order=idx))
            db.flush()
            db.refresh(c)
            _recompute_total(db, c)

            c.status = "Completed"
            from datetime import datetime, timezone
            c.completed_at = datetime.now(timezone.utc)
            db.add(c)
            db.commit()
            logger.info("Concept %d generation complete", concept_id)
        except Exception as e:
            logger.exception("Concept generation failed: %s", e)
            c.status = "Failed"
            c.error_message = str(e)[:500]
            db.add(c)
            db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/concepts/upload")
async def upload_photo(file: UploadFile = File(...),
                          user: User = Depends(get_current_user)):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, "Only JPEG, PNG, or WEBP images are allowed")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(413, "Image must be under 15 MB")
    ext = ALLOWED_MIME[file.content_type]
    path = f"{APP_NAME}/concepts/uploads/{user.id}/{uuid.uuid4().hex}.{ext}"
    put_object(path, data, file.content_type)
    return {"path": path, "size": len(data), "url": _media_url(path)}


@router.post("/concepts", status_code=201)
def create_concept(body: ConceptCreate, background: BackgroundTasks,
                     db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    if body.space_type not in SPACE_TYPES:
        raise HTTPException(400, f"space_type must be one of {sorted(SPACE_TYPES)}")
    if body.style not in STYLES:
        raise HTTPException(400, f"style must be one of {sorted(STYLES)}")

    c = ConceptGeneration(
        client_id=body.client_id, user_id=user.id,
        space_type=body.space_type, style=body.style, sqft=body.sqft,
        region=body.region or "India",
        uploaded_photo_path=body.uploaded_photo_path,
        status="Generating",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    background.add_task(asyncio.run, _run_generation(c.id))
    return _serialize(c)


@router.get("/concepts/{concept_id}")
def get_concept(concept_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    c = db.get(ConceptGeneration, concept_id)
    if not c:
        raise HTTPException(404, "Concept not found")
    return _serialize(c)


@router.get("/concepts")
def list_concepts(db: Session = Depends(get_db),
                     user: User = Depends(get_current_user),
                     client_id: Optional[int] = Query(None)):
    q = db.query(ConceptGeneration).order_by(ConceptGeneration.id.desc())
    if user.role == "Client":
        q = q.filter(ConceptGeneration.user_id == user.id)
    elif client_id:
        q = q.filter(ConceptGeneration.client_id == client_id)
    return [_serialize(c) for c in q.limit(50).all()]


@router.patch("/concepts/{concept_id}/lines/{line_id}")
def update_line(concept_id: int, line_id: int, body: LineIn,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    li = db.get(ConceptCostLine, line_id)
    if not li or li.concept_id != concept_id:
        raise HTTPException(404, "Line not found")
    li.category = body.category
    li.description = body.description
    li.quantity = body.quantity
    li.unit = body.unit
    li.rate = body.rate
    li.subtotal = round(body.quantity * body.rate, 2)
    db.add(li)
    db.flush()
    concept = db.get(ConceptGeneration, concept_id)
    db.refresh(concept)
    _recompute_total(db, concept)
    db.commit()
    return _serialize(concept)


@router.post("/concepts/{concept_id}/lines", status_code=201)
def add_line(concept_id: int, body: LineIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    concept = db.get(ConceptGeneration, concept_id)
    if not concept:
        raise HTTPException(404, "Concept not found")
    li = ConceptCostLine(
        concept_id=concept_id, category=body.category, description=body.description,
        quantity=body.quantity, unit=body.unit, rate=body.rate,
        subtotal=round(body.quantity * body.rate, 2),
        sort_order=(max([l.sort_order or 0 for l in concept.lines], default=-1) + 1),
    )
    db.add(li)
    db.flush()
    db.refresh(concept)
    _recompute_total(db, concept)
    db.commit()
    return _serialize(concept)


@router.delete("/concepts/{concept_id}/lines/{line_id}")
def delete_line(concept_id: int, line_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    li = db.get(ConceptCostLine, line_id)
    if not li or li.concept_id != concept_id:
        raise HTTPException(404, "Line not found")
    db.delete(li)
    db.flush()
    concept = db.get(ConceptGeneration, concept_id)
    db.refresh(concept)
    _recompute_total(db, concept)
    db.commit()
    return _serialize(concept)


@router.post("/concepts/{concept_id}/regenerate")
def regenerate(concept_id: int, background: BackgroundTasks,
                  body: dict, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    c = db.get(ConceptGeneration, concept_id)
    if not c:
        raise HTTPException(404, "Concept not found")
    new_style = body.get("style")
    if new_style and new_style in STYLES:
        c.style = new_style
    c.status = "Generating"
    c.error_message = None
    c.rendered_image_path = None
    db.add(c)
    db.commit()
    background.add_task(asyncio.run, _run_generation(c.id))
    return _serialize(c)


@router.get("/concepts/media/{path:path}")
def proxy_media(path: str, user: User = Depends(get_current_user)):
    """Proxy a stored image out of object storage (auth required)."""
    try:
        data, ctype = get_object(path)
    except Exception:
        raise HTTPException(404, "Media not found")
    return Response(content=data, media_type=ctype)


@router.get("/concepts/{concept_id}/pdf")
def export_pdf(concept_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    from app.core.concept_pdf import render_concept_pdf
    c = db.get(ConceptGeneration, concept_id)
    if not c:
        raise HTTPException(404, "Concept not found")
    pdf_bytes = render_concept_pdf(c)
    return Response(content=pdf_bytes, media_type="application/pdf",
                     headers={"Content-Disposition":
                              f'attachment; filename="sitera-concept-{c.id}.pdf"'})
