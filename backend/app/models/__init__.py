from datetime import datetime, timezone
from sqlalchemy import (Column, Integer, String, Text, Date, DateTime, Boolean,
                        Numeric, ForeignKey, JSON, UniqueConstraint)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Client")
    # NULL for SuperAdmin (platform-wide), FK to tenants.id for everyone else.
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    # Optional per-user module allow-list (subset of the tenant's allowed_modules).
    # NULL means the user inherits the full tenant module set.
    allowed_modules = Column(JSON, nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, default="Active", nullable=False)
    linked_vendor_id = Column(Integer, nullable=True)
    base_salary = Column(Numeric(14, 2), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    company = Column(String)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    tax_id = Column(String)
    notes = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    projects = relationship("Project", back_populates="client")


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    site_engineer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    location = Column(String)
    budget = Column(Numeric(14, 2))
    currency = Column(String, default="INR")
    project_type = Column(String, nullable=True)
    start_date_planned = Column(Date)
    end_date_planned = Column(Date)
    start_date_actual = Column(Date, nullable=True)
    end_date_actual = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="Planning")
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    client = relationship("Client", back_populates="projects")
    site_engineer = relationship("User", foreign_keys=[site_engineer_id])
    phases = relationship("Phase", back_populates="project", cascade="all, delete-orphan",
                          order_by="Phase.sequence_order")
    updates = relationship("ProgressUpdate", back_populates="project", cascade="all, delete-orphan")


class Phase(Base):
    __tablename__ = "phases"
    __table_args__ = (UniqueConstraint("project_id", "sequence_order", name="uq_phase_sequence"),)
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    sequence_order = Column(Integer, nullable=False)
    planned_start = Column(Date)
    planned_end = Column(Date)
    actual_start = Column(Date, nullable=True)
    actual_end = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="NotStarted")
    percent_complete = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="phases")


class PhaseNote(Base):
    __tablename__ = "phase_notes"
    id = Column(Integer, primary_key=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ProgressUpdate(Base):
    __tablename__ = "progress_updates"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True, index=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    update_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    percent_progress = Column(Integer, nullable=True)
    status_flag = Column(String, nullable=False, default="OnTrack")
    attachments = Column(JSON, default=list)
    visible_to_client = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project", back_populates="updates")
    phase = relationship("Phase")
    author = relationship("User", foreign_keys=[updated_by])


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    phase_id = Column(Integer, nullable=True)
    link = Column(String, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Milestone(Base):
    __tablename__ = "milestones"
    id = Column(Integer, primary_key=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="Pending")
    sequence_order = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    phase = relationship("Phase")


class ProjectDocument(Base):
    __tablename__ = "project_documents"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    document_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_type = Column(String)
    file_size = Column(Integer)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(String, default="Other")
    is_client_visible = Column(Boolean, default=True, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=utcnow)

    project = relationship("Project")
    uploader = relationship("User", foreign_keys=[uploaded_by])


class ProjectChangeOrder(Base):
    __tablename__ = "project_change_orders"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True, index=True)
    co_number = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=False, default="Client Modification")
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    date_requested = Column(Date, nullable=True)
    estimated_cost = Column(Numeric(14, 2), nullable=False, default=0)
    estimated_time_impact_days = Column(Integer, default=0)
    status = Column(String, nullable=False, default="Draft")
    approved_cost = Column(Numeric(14, 2), nullable=True)
    approval_date = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    attachments = Column(Text, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    revisions = relationship("ProjectChangeOrderRevision", cascade="all, delete-orphan",
                             order_by="ProjectChangeOrderRevision.version")
    events = relationship("ProjectChangeOrderEvent", cascade="all, delete-orphan",
                          order_by="ProjectChangeOrderEvent.created_at")


class ProjectChangeOrderRevision(Base):
    __tablename__ = "project_change_order_revisions"
    id = Column(Integer, primary_key=True)
    change_order_id = Column(Integer, ForeignKey("project_change_orders.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    estimated_cost = Column(Numeric(14, 2), nullable=False)
    estimated_time_impact_days = Column(Integer, default=0)
    note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ProjectChangeOrderEvent(Base):
    __tablename__ = "project_change_order_events"
    id = Column(Integer, primary_key=True)
    change_order_id = Column(Integer, ForeignKey("project_change_orders.id"), nullable=False, index=True)
    action = Column(String, nullable=False)
    comment = Column(Text, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)



class ProjectSubcontractor(Base):
    """Lightweight sub-contractor allocation captured during project planning.

    Distinct from `procurement.Subcontract` (which is a full contract entity
    tied to a Vendor). This model captures the Admin's intent at project-creation
    time: what work type is being sub-contracted, how much budget is allocated,
    and which materials are being supplied to that sub-contractor.
    """
    __tablename__ = "project_subcontractors"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    type = Column(String, nullable=False)          # Electrical / Plumbing / Custom …
    name = Column(String, nullable=True)           # Firm or point-of-contact name
    allocated_amount = Column(Numeric(14, 2), nullable=False, default=0)
    materials = Column(JSON, nullable=False, default=list)  # list[str]
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
