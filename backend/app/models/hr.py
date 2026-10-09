"""Staff leave & attendance (people with Sitera logins, not site labour).

* ``LeavePolicy``     — yearly quota per leave type, per tenant (editable by Admin).
* ``LeaveRequest``    — applied by staff from their own login, approved by Admin.
* ``StaffAttendance`` — one row per staff user per day; filled by self check-in /
                        check-out, by the Admin, or automatically from approved leave.

Applicants / attendees: SiteEngineer, Accountant, ProcurementOfficer.
Admins and labour (``employees`` table) are excluded by design.
"""
from datetime import datetime, timezone
from sqlalchemy import (Column, Integer, String, Text, Date, DateTime, Boolean,
                        Numeric, ForeignKey, UniqueConstraint)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


STAFF_ROLES = ("SiteEngineer", "Accountant", "ProcurementOfficer")
DEFAULT_POLICIES = [  # (leave_type, annual_quota or None = unlimited, is_paid)
    ("Casual", 12, True),
    ("Sick", 12, True),
    ("Earned", 15, True),
    ("Unpaid", None, False),
]
LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"]
ATTENDANCE_STATUSES = ["present", "absent", "half_day", "leave", "week_off", "holiday"]


class LeavePolicy(Base):
    __tablename__ = "leave_policies"
    __table_args__ = (UniqueConstraint("tenant_id", "leave_type", name="uq_leave_policy_tenant_type"),)
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type = Column(String, nullable=False)
    annual_quota = Column(Numeric(5, 1), nullable=True)      # NULL = unlimited
    is_paid = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    half_day = Column(Boolean, default=False, nullable=False)
    days = Column(Numeric(5, 1), nullable=False)
    reason = Column(Text)
    status = Column(String, default="Pending", nullable=False, index=True)
    decided_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)
    decision_note = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", foreign_keys=[user_id])
    decider = relationship("User", foreign_keys=[decided_by])


class StaffAttendance(Base):
    __tablename__ = "staff_attendance"
    __table_args__ = (UniqueConstraint("user_id", "attendance_date", name="uq_staff_attendance_user_date"),)
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    attendance_date = Column(Date, nullable=False, index=True)
    status = Column(String, nullable=False, default="present")
    check_in = Column(DateTime(timezone=True), nullable=True)
    check_out = Column(DateTime(timezone=True), nullable=True)
    source = Column(String, default="manual", nullable=False)   # self | manual | leave
    leave_request_id = Column(Integer, ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=True)
    leave_type = Column(String, nullable=True)
    is_half = Column(Boolean, default=False, nullable=False)    # half-day leave
    note = Column(Text)
    prev_status = Column(String, nullable=True)                 # restored if the leave is cancelled
    prev_source = Column(String, nullable=True)
    marked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
