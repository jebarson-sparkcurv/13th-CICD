from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.models import Project, Phase, ProgressUpdate


def d(v):
    return v.isoformat() if v else None


def compute_percent(project: Project) -> int:
    if not project.phases:
        return 0
    return round(sum(p.percent_complete for p in project.phases) / len(project.phases))


def has_active_issues(db: Session, project_id: int) -> bool:
    phase_issue = db.query(exists().where(
        Phase.project_id == project_id, Phase.status.in_(["Delayed", "Blocked"]))).scalar()
    if phase_issue:
        return True
    latest = (db.query(ProgressUpdate).filter(ProgressUpdate.project_id == project_id)
              .order_by(ProgressUpdate.update_date.desc(), ProgressUpdate.created_at.desc())
              .first())
    return bool(latest and latest.status_flag in ("Delayed", "Blocked"))


def phase_out(p: Phase) -> dict:
    return {
        "id": p.id, "project_id": p.project_id, "name": p.name,
        "sequence_order": p.sequence_order,
        "planned_start": d(p.planned_start), "planned_end": d(p.planned_end),
        "actual_start": d(p.actual_start), "actual_end": d(p.actual_end),
        "status": p.status, "percent_complete": p.percent_complete,
        "created_at": d(p.created_at), "updated_at": d(p.updated_at),
    }


def update_out(u: ProgressUpdate) -> dict:
    return {
        "id": u.id, "project_id": u.project_id, "phase_id": u.phase_id,
        "phase_name": u.phase.name if u.phase else None,
        "updated_by": u.updated_by,
        "author_name": u.author.name if u.author else None,
        "author_role": u.author.role if u.author else None,
        "update_date": d(u.update_date), "description": u.description,
        "percent_progress": u.percent_progress, "status_flag": u.status_flag,
        "attachments": u.attachments or [], "visible_to_client": u.visible_to_client,
        "created_at": d(u.created_at),
    }


def project_out(db: Session, p: Project, detail: bool = False) -> dict:
    out = {
        "id": p.id, "name": p.name, "client_id": p.client_id,
        "client_name": p.client.name if p.client else None,
        "site_engineer_id": p.site_engineer_id,
        "site_engineer_name": p.site_engineer.name if p.site_engineer else None,
        "location": p.location,
        "project_type": p.project_type,
        "budget": float(p.budget) if p.budget is not None else None,
        "currency": p.currency or "INR",
        "start_date_planned": d(p.start_date_planned), "end_date_planned": d(p.end_date_planned),
        "start_date_actual": d(p.start_date_actual), "end_date_actual": d(p.end_date_actual),
        "status": p.status, "is_archived": p.is_archived,
        "percent_complete": compute_percent(p),
        "has_active_issues": has_active_issues(db, p.id),
        "phase_count": len(p.phases),
        "created_at": d(p.created_at), "updated_at": d(p.updated_at),
    }
    if detail:
        out["phases"] = [phase_out(ph) for ph in p.phases]
        latest = (db.query(ProgressUpdate).filter(ProgressUpdate.project_id == p.id)
                  .order_by(ProgressUpdate.update_date.desc(), ProgressUpdate.created_at.desc())
                  .limit(5).all())
        out["latest_updates"] = [update_out(u) for u in latest]
        from app.models import ProjectSubcontractor
        subs = (db.query(ProjectSubcontractor)
                .filter(ProjectSubcontractor.project_id == p.id)
                .order_by(ProjectSubcontractor.id.asc()).all())
        out["subcontractors"] = [{
            "id": s.id, "project_id": s.project_id,
            "type": s.type, "name": s.name,
            "allocated_amount": float(s.allocated_amount or 0),
            "materials": s.materials or [], "notes": s.notes,
            "created_at": d(s.created_at), "updated_at": d(s.updated_at),
        } for s in subs]
    return out


def client_out(c, project_count: int = None) -> dict:
    out = {"id": c.id, "name": c.name, "company": c.company,
           "email": c.email, "phone": c.phone,
           "address": getattr(c, "address", None), "tax_id": getattr(c, "tax_id", None),
           "notes": getattr(c, "notes", None),
           "is_active": getattr(c, "is_active", True), "created_at": d(c.created_at)}
    if project_count is not None:
        out["project_count"] = project_count
    return out


def milestone_out(m) -> dict:
    return {"id": m.id, "phase_id": m.phase_id, "title": m.title,
            "description": m.description, "due_date": d(m.due_date),
            "completed_at": d(m.completed_at), "status": m.status,
            "sequence_order": m.sequence_order, "created_at": d(m.created_at)}


def document_out(doc) -> dict:
    return {"id": doc.id, "project_id": doc.project_id,
            "document_name": doc.document_name, "file_url": doc.file_url,
            "file_type": doc.file_type, "file_size": doc.file_size,
            "uploaded_by": doc.uploaded_by,
            "uploader_name": doc.uploader.name if doc.uploader else None,
            "category": doc.category or "Other",
            "is_client_visible": doc.is_client_visible,
            "uploaded_at": d(doc.uploaded_at)}
