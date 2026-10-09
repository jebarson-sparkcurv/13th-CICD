"""Lead generation / sales pipeline.

* ``Lead`` — one enquiry from a prospective customer, tenant-owned.
* ``LeadActivity`` — timeline entries on a lead (calls, notes, site visits,
  status changes). Child rows; tenancy is inherited through the lead.
* ``LeadCaptureForm`` — one per tenant. Holds the secret token behind the
  public enquiry form (``/enquiry/<token>``) so a tenant's website can post
  leads straight into Sitera without logging in.
"""
from datetime import datetime, timezone
from sqlalchemy import (Column, Integer, String, Text, DateTime, Boolean,
                        Numeric, ForeignKey)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


LEAD_STATUSES = ["New", "Contacted", "Qualified", "SiteVisit",
                 "ProposalSent", "Negotiation", "Won", "Lost"]
OPEN_STATUSES = [s for s in LEAD_STATUSES if s not in ("Won", "Lost")]
LEAD_SOURCES = ["Website", "Walk-in", "Referral", "Phone Call", "WhatsApp",
                "Facebook", "Instagram", "Google Ads", "JustDial", "IndiaMART",
                "Existing Client", "Other"]
LEAD_PRIORITIES = ["Low", "Medium", "High"]
ACTIVITY_TYPES = ["Note", "Call", "Email", "WhatsApp", "Meeting", "SiteVisit",
                  "StatusChange", "Enquiry", "System"]


class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    company = Column(String)
    email = Column(String, index=True)
    phone = Column(String, index=True)
    location = Column(String)
    project_type = Column(String)        # e.g. Residential, Commercial, Interior
    requirement = Column(Text)           # what the customer asked for
    budget = Column(Numeric(14, 2))      # expected deal value
    source = Column(String, default="Other", nullable=False)
    status = Column(String, default="New", nullable=False, index=True)
    priority = Column(String, default="Medium", nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    next_follow_up = Column(DateTime(timezone=True), nullable=True, index=True)
    last_contacted_at = Column(DateTime(timezone=True), nullable=True)
    lost_reason = Column(Text)
    converted_client_id = Column(Integer, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    assignee = relationship("User", foreign_keys=[assigned_to])
    activities = relationship("LeadActivity", back_populates="lead",
                              cascade="all, delete-orphan", passive_deletes=True,
                              order_by="LeadActivity.created_at.desc()")


class LeadActivity(Base):
    __tablename__ = "lead_activities"
    id = Column(Integer, primary_key=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String, nullable=False, default="Note")
    content = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    lead = relationship("Lead", back_populates="activities")
    author = relationship("User", foreign_keys=[created_by])


class LeadCaptureForm(Base):
    __tablename__ = "lead_capture_forms"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    token = Column(String, nullable=False, unique=True, index=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    headline = Column(String)            # shown on the public page
    created_at = Column(DateTime(timezone=True), default=utcnow)
