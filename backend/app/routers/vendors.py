import uuid
from datetime import date, timedelta
from pathlib import Path as FSPath

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.models.procurement import Vendor, VendorDocument
from app.schemas.procurement import VendorCreate, VendorUpdate, VendorDocPatch
from app.core.security import get_current_user, require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope
from app.crud.procurement import vendor_out, vdoc_out
from app.routers.uploads import UPLOAD_DIR

router = APIRouter(tags=["vendors"])
STAFF = require_roles("Admin", "SiteEngineer")


@router.post("/vendors", status_code=201)
def create_vendor(body: VendorCreate, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    if body.insurance_expiry and body.insurance_expiry < date.today():
        raise HTTPException(status_code=422, detail="Insurance expiry date cannot be in the past")
    v = Vendor(**body.model_dump())
    ensure_tenant_owned(v, user)
    db.add(v)
    db.commit()
    db.refresh(v)
    return vendor_out(v, db)


@router.get("/vendors")
def list_vendors(db: Session = Depends(get_db), user: User = Depends(STAFF),
                 trade: str = None, status: str = None, prequalified: bool = None,
                 expiring_insurance: bool = None, search: str = None):
    q = tenant_scope(db.query(Vendor), Vendor, user)
    if trade:
        q = q.filter(Vendor.trade.ilike(f"%{trade}%"))
    if status:
        q = q.filter(Vendor.status == status)
    if prequalified is not None:
        q = q.filter(Vendor.prequalified == prequalified)
    if search:
        q = q.filter(Vendor.name.ilike(f"%{search}%"))
    vendors = q.order_by(Vendor.name).all()
    if expiring_insurance:
        cutoff = date.today() + timedelta(days=30)
        vendors = [v for v in vendors if v.insurance_expiry and v.insurance_expiry <= cutoff]
    return [vendor_out(v, db) for v in vendors]


@router.get("/vendors/{vendor_id}")
def get_vendor(vendor_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    v = db.get(Vendor, vendor_id)
    assert_same_tenant(v, user, "vendor")
    out = vendor_out(v, db)
    docs = db.query(VendorDocument).filter(VendorDocument.vendor_id == vendor_id).all()
    out["documents"] = [vdoc_out(doc) for doc in docs]
    return out


@router.patch("/vendors/{vendor_id}")
def patch_vendor(vendor_id: int, body: VendorUpdate, db: Session = Depends(get_db),
                 user: User = Depends(STAFF)):
    v = db.get(Vendor, vendor_id)
    assert_same_tenant(v, user, "vendor")
    for k, val in body.model_dump(exclude_unset=True).items():
        setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return vendor_out(v, db)


@router.post("/vendors/{vendor_id}/documents", status_code=201)
async def upload_vendor_doc(vendor_id: int, file: UploadFile = File(...),
                            document_name: str = Form(None), category: str = Form("Other"),
                            expiry_date: str = Form(None),
                            db: Session = Depends(get_db), user: User = Depends(STAFF)):
    v = db.get(Vendor, vendor_id)
    assert_same_tenant(v, user, "vendor")
    ext = FSPath(file.filename or "file").suffix.lower()
    content = await file.read()
    fname = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / fname).write_bytes(content)
    doc = VendorDocument(vendor_id=vendor_id,
                         document_name=(document_name or "").strip() or file.filename or fname,
                         file_url=f"/api/uploads/{fname}", file_type=ext.lstrip("."),
                         category=category or "Other",
                         expiry_date=date.fromisoformat(expiry_date) if expiry_date else None,
                         uploaded_by=user.id)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return vdoc_out(doc)


@router.get("/vendors/{vendor_id}/documents")
def list_vendor_docs(vendor_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    docs = db.query(VendorDocument).filter(VendorDocument.vendor_id == vendor_id).all()
    return [vdoc_out(doc) for doc in docs]


@router.patch("/vendor-documents/{doc_id}")
def patch_vendor_doc(doc_id: int, body: VendorDocPatch, db: Session = Depends(get_db),
                     user: User = Depends(STAFF)):
    doc = db.get(VendorDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    db.commit()
    db.refresh(doc)
    return vdoc_out(doc)


@router.delete("/vendor-documents/{doc_id}", status_code=204)
def delete_vendor_doc(doc_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("Admin"))):
    doc = db.get(VendorDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc)
    db.commit()
