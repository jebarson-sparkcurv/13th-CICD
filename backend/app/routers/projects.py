from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (User, Client, Project, Phase, ProgressUpdate, Milestone,
                        ProjectSubcontractor)
from app.schemas import (ProjectCreate, ProjectUpdate, PhaseCreate, PhaseUpdate,
                         ProgressUpdateCreate, PhaseReorder, MilestoneCreate, MilestoneUpdate,
                         SubcontractorItem, SubcontractorUpdate)
from app.core.security import get_current_user, require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope
from app.crud import project_out, phase_out, update_out, milestone_out, has_active_issues
from datetime import date, datetime, timezone

router = APIRouter(tags=["projects"])


def get_project_or_404(db: Session, project_id: int, include_archived=False,
                         user: User = None) -> Project:
    project = db.get(Project, project_id)
    if not project or (project.is_archived and not include_archived):
        raise HTTPException(status_code=404, detail="Project not found")
    if user is not None:
        assert_same_tenant(project, user, "project")
    return project


def check_write_access(user: User, project: Project):
    if user.role == "Admin":
        return
    if user.role == "SiteEngineer" and project.site_engineer_id == user.id:
        return
    raise HTTPException(status_code=403, detail="Not authorized to modify this project")


def check_read_access(user: User, project: Project):
    if user.role == "Client" and user.client_id != project.client_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this project")


@router.post("/projects", status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("Admin"))):
    client = db.get(Client, body.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    assert_same_tenant(client, user, "client")
    data = body.model_dump()
    subs = data.pop("subcontractors", []) or []
    project = Project(**data)
    ensure_tenant_owned(project, user)
    db.add(project)
    db.flush()
    for item in subs:
        sc = ProjectSubcontractor(
            project_id=project.id,
            type=item["type"],
            name=item.get("name"),
            allocated_amount=item["allocated_amount"],
            materials=item.get("materials") or [],
            notes=item.get("notes"),
        )
        ensure_tenant_owned(sc, user)
        db.add(sc)
    db.commit()
    db.refresh(project)
    return project_out(db, project, detail=True)


def scope_by_role(q, db, user):
    q = tenant_scope(q, Project, user)
    if user.role == "Client":
        return q.filter(Project.client_id == user.client_id)
    if user.role == "SiteEngineer":
        from app.models.finance import ProjectAssignment
        assigned = [a.project_id for a in db.query(ProjectAssignment).filter_by(user_id=user.id).all()]
        return q.filter(or_(Project.site_engineer_id == user.id, Project.id.in_(assigned or [0])))
    return q


@router.get("/projects")
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user),
                  client_id: int = None, status: str = None, site_engineer_id: int = None,
                  search: str = None, has_issues: bool = None,
                  start_date: date = None, end_date: date = None,
                  limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    q = db.query(Project).filter(Project.is_archived == False)  # noqa: E712
    q = scope_by_role(q, db, user)
    if client_id is not None:
        q = q.filter(Project.client_id == client_id)
    if status:
        q = q.filter(Project.status == status)
    if site_engineer_id is not None:
        q = q.filter(Project.site_engineer_id == site_engineer_id)
    if search:
        q = q.filter(or_(Project.name.ilike(f"%{search}%"), Project.location.ilike(f"%{search}%")))
    if start_date:
        q = q.filter(Project.start_date_planned >= start_date)
    if end_date:
        q = q.filter(Project.end_date_planned <= end_date)
    q = q.order_by(Project.created_at.desc())
    if has_issues is not None:
        matched = [p for p in q.all() if has_active_issues(db, p.id) == has_issues]
        total = len(matched)
        items = matched[offset:offset + limit]
    else:
        total = q.count()
        items = q.offset(offset).limit(limit).all()
    return {"items": [project_out(db, p) for p in items],
            "total": total, "limit": limit, "offset": offset}


@router.get("/projects/dashboard-summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Project).filter(Project.is_archived == False)  # noqa: E712
    q = scope_by_role(q, db, user)
    projects = q.all()
    return {
        "total_projects": len(projects),
        "ongoing": sum(1 for p in projects if p.status == "Ongoing"),
        "completed": sum(1 for p in projects if p.status == "Completed"),
        "with_issues": sum(1 for p in projects if has_active_issues(db, p.id)),
        "total_budget": float(sum(p.budget or 0 for p in projects)),
    }


@router.get("/projects/dashboard-charts")
def dashboard_charts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from app.crud import compute_percent
    today = date.today()
    q = db.query(Project).filter(Project.is_archived == False)  # noqa: E712
    q = scope_by_role(q, db, user)
    projects = q.order_by(Project.start_date_planned).all()
    pids = [p.id for p in projects]

    timeline, variance, stage_counts = [], [], {}
    pcts = []
    for p in projects:
        pct = compute_percent(p)
        pcts.append(pct)
        timeline.append({"id": p.id, "name": p.name, "status": p.status,
                         "planned_start": p.start_date_planned.isoformat() if p.start_date_planned else None,
                         "planned_end": p.end_date_planned.isoformat() if p.end_date_planned else None,
                         "percent_complete": pct})
        if p.start_date_planned and p.end_date_planned and p.end_date_planned > p.start_date_planned:
            elapsed = (today - p.start_date_planned).days
            total = (p.end_date_planned - p.start_date_planned).days
            expected = round(max(0, min(100, elapsed / total * 100)))
            variance.append({"id": p.id, "name": p.name, "expected_pct": expected,
                             "actual_pct": pct, "variance": pct - expected})
        phases = sorted(p.phases, key=lambda ph: ph.sequence_order)
        current = next((ph.name for ph in phases if ph.status != "Completed"), None)
        stage = current or ("Completed" if phases else "No Phases")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1

    milestones = (db.query(Milestone).join(Phase, Milestone.phase_id == Phase.id)
                  .filter(Phase.project_id.in_(pids)).all()) if pids else []
    ms_completed = sum(1 for m in milestones if m.status == "Completed")
    ms_overdue = sum(1 for m in milestones if m.status != "Completed" and m.due_date and m.due_date < today)
    ms_pending = len(milestones) - ms_completed - ms_overdue
    upcoming = sorted([m for m in milestones if m.status != "Completed" and m.due_date],
                      key=lambda m: m.due_date)[:5]
    proj_by_phase = {ph.id: ph.project_id for p in projects for ph in p.phases}
    name_by_id = {p.id: p.name for p in projects}

    return {
        "portfolio_progress": {"avg_pct": round(sum(pcts) / len(pcts)) if pcts else 0,
                               "total": len(projects),
                               "completed": sum(1 for p in projects if p.status == "Completed")},
        "timeline": timeline,
        "schedule_variance": variance,
        "stages": [{"stage": k, "count": v} for k, v in sorted(stage_counts.items(), key=lambda x: -x[1])],
        "milestones": {"completed": ms_completed, "pending": ms_pending, "overdue": ms_overdue,
                       "total": len(milestones),
                       "upcoming": [{"id": m.id, "title": m.title,
                                     "project": name_by_id.get(proj_by_phase.get(m.phase_id), ""),
                                     "due_date": m.due_date.isoformat(),
                                     "overdue": m.due_date < today} for m in upcoming]},
    }


@router.get("/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id, user=user)
    check_read_access(user, project)
    out = project_out(db, project, detail=True)
    if "phases" in out:
        notes = phase_notes_map(db, project_id)
        for ph in out["phases"]:
            ph["notes"] = notes.get(ph["id"], [])
    return out


@router.patch("/projects/{project_id}")
@router.put("/projects/{project_id}")
def update_project(project_id: int, body: ProjectUpdate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id, user=user)
    check_write_access(user, project)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project_out(db, project)


@router.delete("/projects/{project_id}", status_code=204)
def archive_project(project_id: int, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("Admin"))):
    project = get_project_or_404(db, project_id, user=user)
    project.is_archived = True
    db.commit()


@router.post("/projects/{project_id}/archive")
def archive_project_post(project_id: int, db: Session = Depends(get_db),
                         user: User = Depends(require_roles("Admin"))):
    project = get_project_or_404(db, project_id, user=user)
    project.is_archived = True
    db.commit()
    db.refresh(project)
    return project_out(db, project)


@router.post("/projects/{project_id}/phases/reorder")
def reorder_phases(project_id: int, body: PhaseReorder, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id)
    check_write_access(user, project)
    phases = {p.id: p for p in project.phases}
    if set(body.phase_ids) != set(phases.keys()):
        raise HTTPException(status_code=422, detail="phase_ids must include every phase of this project exactly once")
    for i, pid in enumerate(body.phase_ids):
        phases[pid].sequence_order = 1000 + i
    db.flush()
    for i, pid in enumerate(body.phase_ids):
        phases[pid].sequence_order = i + 1
    db.commit()
    return [phase_out(phases[pid]) for pid in body.phase_ids]


def record_phase_note(db, phase, project, user, text):
    from app.models import PhaseNote
    from app.routers.notifications import notify_flag
    note = PhaseNote(phase_id=phase.id, project_id=project.id, text=text.strip(), created_by=user.id)
    db.add(note)
    db.commit()
    notify_flag(db, project, user, "PhaseNote",
                f"Phase note: {phase.name}",
                f"{user.name} added a description on phase '{phase.name}' ({project.name}): {text.strip()[:180]}",
                phase_id=phase.id)


def phase_notes_map(db, project_id):
    from app.models import PhaseNote
    users = {u.id: u.name for u in db.query(User).all()}
    by_phase = {}
    for n in (db.query(PhaseNote).filter(PhaseNote.project_id == project_id)
              .order_by(PhaseNote.created_at.desc()).all()):
        by_phase.setdefault(n.phase_id, []).append({
            "id": n.id, "text": n.text, "by": users.get(n.created_by),
            "date": n.created_at.date().isoformat() if n.created_at else None})
    return by_phase


@router.post("/projects/{project_id}/phases", status_code=201)
def add_phase(project_id: int, body: PhaseCreate, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id)
    check_write_access(user, project)
    data = body.model_dump()
    description = (data.pop("description", None) or "").strip()
    dup = db.query(Phase).filter(Phase.project_id == project_id,
                                 Phase.sequence_order == body.sequence_order).first()
    if dup:
        raise HTTPException(status_code=409, detail="sequence_order already used in this project")
    phase = Phase(project_id=project_id, **data)
    db.add(phase)
    db.commit()
    db.refresh(phase)
    if description:
        record_phase_note(db, phase, project, user, description)
    out = phase_out(phase)
    out["notes"] = phase_notes_map(db, project_id).get(phase.id, [])
    return out


@router.get("/projects/{project_id}/phases")
def list_phases(project_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id)
    check_read_access(user, project)
    phases = (db.query(Phase).filter(Phase.project_id == project_id)
              .order_by(Phase.sequence_order.asc()).all())
    notes = phase_notes_map(db, project_id)
    out = []
    for p in phases:
        o = phase_out(p)
        o["notes"] = notes.get(p.id, [])
        out.append(o)
    return out


@router.patch("/phases/{phase_id}")
@router.put("/phases/{phase_id}")
def update_phase(phase_id: int, body: PhaseUpdate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    phase = db.get(Phase, phase_id)
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_write_access(user, phase.project)
    data = body.model_dump(exclude_unset=True)
    description = (data.pop("description", None) or "").strip()
    old_status = phase.status
    if "sequence_order" in data and data["sequence_order"] != phase.sequence_order:
        dup = db.query(Phase).filter(Phase.project_id == phase.project_id,
                                     Phase.sequence_order == data["sequence_order"],
                                     Phase.id != phase.id).first()
        if dup:
            raise HTTPException(status_code=409, detail="sequence_order already used in this project")
    for k, v in data.items():
        setattr(phase, k, v)
    db.commit()
    db.refresh(phase)
    if description:
        record_phase_note(db, phase, phase.project, user, description)
    if phase.status in ("Blocked", "Delayed") and phase.status != old_status:
        from app.routers.notifications import notify_flag
        notify_flag(db, phase.project, user, f"Phase{phase.status}",
                    f"Phase {phase.status}: {phase.name}",
                    f"{user.name} set phase '{phase.name}' to {phase.status} on {phase.project.name}.",
                    phase_id=phase.id)
    out = phase_out(phase)
    out["notes"] = phase_notes_map(db, phase.project_id).get(phase.id, [])
    return out


@router.delete("/phases/{phase_id}", status_code=204)
def delete_phase(phase_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    phase = db.get(Phase, phase_id)
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_write_access(user, phase.project)
    from app.models import PhaseNote
    db.query(PhaseNote).filter(PhaseNote.phase_id == phase_id).delete()
    db.delete(phase)
    db.commit()


@router.post("/projects/{project_id}/updates", status_code=201)
def post_update(project_id: int, body: ProgressUpdateCreate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id)
    check_write_access(user, project)
    if body.phase_id is not None:
        phase = db.get(Phase, body.phase_id)
        if not phase or phase.project_id != project_id:
            raise HTTPException(status_code=422, detail="phase_id does not belong to this project")
    upd = ProgressUpdate(project_id=project_id, updated_by=user.id,
                         update_date=body.update_date or date.today(),
                         **body.model_dump(exclude={"update_date"}))
    db.add(upd)
    if body.phase_id is not None and body.percent_progress is not None:
        phase = db.get(Phase, body.phase_id)
        phase.percent_complete = body.percent_progress
        if phase.status == "NotStarted" and body.percent_progress > 0:
            phase.status = "InProgress"
        if body.percent_progress == 100:
            phase.status = "Completed"
    db.commit()
    db.refresh(upd)
    if upd.status_flag in ("Blocked", "Delayed"):
        from app.routers.notifications import notify_flag
        phase_name = None
        if upd.phase_id:
            ph = db.get(Phase, upd.phase_id)
            phase_name = ph.name if ph else None
        where = f" ({phase_name})" if phase_name else ""
        notify_flag(db, project, user, f"Update{upd.status_flag}",
                    f"{upd.status_flag} update on {project.name}",
                    f"{user.name} flagged progress as {upd.status_flag}{where}: {(upd.description or '')[:120]}",
                    phase_id=upd.phase_id)
    return update_out(upd)


@router.get("/projects/{project_id}/updates")
def list_updates(project_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user),
                 limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    project = get_project_or_404(db, project_id)
    check_read_access(user, project)
    q = db.query(ProgressUpdate).filter(ProgressUpdate.project_id == project_id)
    if user.role == "Client":
        q = q.filter(ProgressUpdate.visible_to_client == True)  # noqa: E712
    total = q.count()
    items = (q.order_by(ProgressUpdate.update_date.desc(), ProgressUpdate.created_at.desc())
             .offset(offset).limit(limit).all())
    return {"items": [update_out(u) for u in items],
            "total": total, "limit": limit, "offset": offset}


@router.patch("/updates/{update_id}")
def edit_update(update_id: int, body: ProgressUpdateCreate, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    upd = db.get(ProgressUpdate, update_id)
    if not upd:
        raise HTTPException(status_code=404, detail="Update not found")
    check_write_access(user, upd.project)
    if body.phase_id is not None:
        phase = db.get(Phase, body.phase_id)
        if not phase or phase.project_id != upd.project_id:
            raise HTTPException(status_code=422, detail="phase_id does not belong to this project")
    upd.phase_id = body.phase_id
    upd.description = body.description
    upd.percent_progress = body.percent_progress
    upd.status_flag = body.status_flag
    upd.attachments = body.attachments
    upd.visible_to_client = body.visible_to_client
    if body.update_date:
        upd.update_date = body.update_date
    if body.phase_id is not None and body.percent_progress is not None:
        phase = db.get(Phase, body.phase_id)
        phase.percent_complete = body.percent_progress
        if phase.status == "NotStarted" and body.percent_progress > 0:
            phase.status = "InProgress"
        if body.percent_progress == 100:
            phase.status = "Completed"
    db.commit()
    db.refresh(upd)
    return update_out(upd)


@router.delete("/updates/{update_id}", status_code=204)
def delete_update(update_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    upd = db.get(ProgressUpdate, update_id)
    if not upd:
        raise HTTPException(status_code=404, detail="Update not found")
    check_write_access(user, upd.project)
    db.delete(upd)
    db.commit()


@router.get("/phases/{phase_id}/milestones")
def list_milestones(phase_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    phase = db.get(Phase, phase_id)
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_read_access(user, phase.project)
    ms = (db.query(Milestone).filter(Milestone.phase_id == phase_id)
          .order_by(Milestone.sequence_order.asc()).all())
    return [milestone_out(m) for m in ms]


@router.post("/phases/{phase_id}/milestones", status_code=201)
def add_milestone(phase_id: int, body: MilestoneCreate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    phase = db.get(Phase, phase_id)
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_write_access(user, phase.project)
    m = Milestone(phase_id=phase_id, **body.model_dump())
    if m.status == "Done":
        m.completed_at = datetime.now(timezone.utc)
    db.add(m)
    db.commit()
    db.refresh(m)
    return milestone_out(m)


@router.patch("/milestones/{milestone_id}")
def update_milestone(milestone_id: int, body: MilestoneUpdate, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    m = db.get(Milestone, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    check_write_access(user, m.phase.project)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(m, k, v)
    if "status" in data:
        m.completed_at = datetime.now(timezone.utc) if data["status"] == "Done" else None
    db.commit()
    db.refresh(m)
    return milestone_out(m)



# ============================================================================
# Sub-Contractors (project-level lightweight allocation)
# ============================================================================

def subcontractor_out(s: ProjectSubcontractor) -> dict:
    return {
        "id": s.id, "project_id": s.project_id,
        "type": s.type, "name": s.name,
        "allocated_amount": float(s.allocated_amount or 0),
        "materials": s.materials or [],
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


@router.get("/projects/{project_id}/subcontractors")
def list_project_subcontractors(project_id: int, db: Session = Depends(get_db),
                                user: User = Depends(get_current_user)):
    project = get_project_or_404(db, project_id, user=user)
    check_read_access(user, project)
    rows = (db.query(ProjectSubcontractor)
            .filter(ProjectSubcontractor.project_id == project_id)
            .order_by(ProjectSubcontractor.id.asc()).all())
    return [subcontractor_out(s) for s in rows]


@router.post("/projects/{project_id}/subcontractors", status_code=201)
def add_project_subcontractor(project_id: int, body: SubcontractorItem,
                              db: Session = Depends(get_db),
                              user: User = Depends(require_roles("Admin"))):
    project = get_project_or_404(db, project_id, user=user)
    check_write_access(user, project)
    sc = ProjectSubcontractor(
        project_id=project_id,
        type=body.type, name=body.name,
        allocated_amount=body.allocated_amount,
        materials=body.materials, notes=body.notes,
    )
    ensure_tenant_owned(sc, user)
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return subcontractor_out(sc)


@router.patch("/subcontractors/{sc_id}")
def update_project_subcontractor(sc_id: int, body: SubcontractorUpdate,
                                 db: Session = Depends(get_db),
                                 user: User = Depends(require_roles("Admin"))):
    sc = db.get(ProjectSubcontractor, sc_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    assert_same_tenant(sc, user, "subcontractor")
    check_write_access(user, sc.project if hasattr(sc, "project") else db.get(Project, sc.project_id))
    data = body.model_dump(exclude_unset=True)
    if "type" in data:
        t = (data["type"] or "").strip()
        if not t:
            raise HTTPException(status_code=422, detail="Sub-contractor type is required")
        sc.type = t
    if "name" in data:
        sc.name = (data["name"] or "").strip() or None
    if "allocated_amount" in data:
        sc.allocated_amount = data["allocated_amount"]
    if "materials" in data:
        sc.materials = [m.strip() for m in (data["materials"] or []) if (m or "").strip()]
    if "notes" in data:
        sc.notes = data["notes"]
    db.commit()
    db.refresh(sc)
    return subcontractor_out(sc)


@router.delete("/subcontractors/{sc_id}", status_code=204)
def delete_project_subcontractor(sc_id: int, db: Session = Depends(get_db),
                                 user: User = Depends(require_roles("Admin"))):
    sc = db.get(ProjectSubcontractor, sc_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Sub-contractor not found")
    assert_same_tenant(sc, user, "subcontractor")
    db.delete(sc)
    db.commit()
