from sqlalchemy import (Column, Integer, String, Text, Date, DateTime, Numeric, ForeignKey,
                        UniqueConstraint, Boolean)
from sqlalchemy.orm import relationship
from app.database import Base
from app.models import utcnow


class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    invoice_number = Column(String, nullable=False)
    amount = Column(Numeric(14, 2), default=0)
    tax_amount = Column(Numeric(14, 2), default=0)
    issue_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    status = Column(String, default="Draft", nullable=False)
    description = Column(Text)
    income_entry_id = Column(Integer, ForeignKey("income_entries.id"), nullable=True, unique=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    payments = relationship("Payment", backref="invoice")


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    vendor_id = Column(Integer, nullable=True)
    purchase_order_id = Column(Integer, nullable=True, index=True)   # quotation_purchase_orders.id
    payment_direction = Column(String, default="incoming")
    amount = Column(Numeric(14, 2), nullable=False)
    payment_date = Column(Date, nullable=True)
    payment_method = Column(String, default="BankTransfer")
    reference_no = Column(String)
    received_by = Column(Integer, ForeignKey("users.id"))
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PayrollRun(Base):
    __tablename__ = "payroll_runs"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    status = Column(String, default="Draft", nullable=False)
    processed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    entries = relationship("PayrollEntry", cascade="all, delete-orphan")


class PayrollEntry(Base):
    __tablename__ = "payroll_entries"
    id = Column(Integer, primary_key=True)
    payroll_run_id = Column(Integer, ForeignKey("payroll_runs.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    role_at_time = Column(String)
    base_salary = Column(Numeric(14, 2), default=0)
    overtime_amount = Column(Numeric(14, 2), default=0)
    deductions = Column(Numeric(14, 2), default=0)
    bonuses = Column(Numeric(14, 2), default=0)
    net_pay = Column(Numeric(14, 2), default=0)
    deduction_days = Column(Numeric(5, 1), default=0)   # from staff attendance / unpaid leave
    deduction_note = Column(String, nullable=True)
    payment_status = Column(String, default="Pending")
    paid_at = Column(DateTime(timezone=True), nullable=True)
    staff = relationship("User", foreign_keys=[user_id])


class ExpenseEntry(Base):
    __tablename__ = "expense_entries"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    category = Column(String, default="Misc")
    amount = Column(Numeric(14, 2), nullable=False)
    expense_date = Column(Date, nullable=True)
    description = Column(Text)
    recorded_by = Column(Integer, ForeignKey("users.id"))
    receipt_file_url = Column(String, nullable=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True, index=True)
    source_type = Column(String, nullable=True)
    source_id = Column(Integer, nullable=True)
    product_id = Column(Integer, nullable=True)
    payment_type = Column(String, nullable=True)
    balance_after = Column(Numeric(14, 2), nullable=True)
    quotation_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class EstimateCategory(Base):
    __tablename__ = "estimate_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)


class EstimateStatus(Base):
    __tablename__ = "estimate_statuses"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, unique=True)


class RequirementMaster(Base):
    __tablename__ = "requirements_master"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class EstimateRequirement(Base):
    __tablename__ = "estimate_requirements"
    id = Column(Integer, primary_key=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False, index=True)
    requirement_name = Column(String, nullable=False)
    price = Column(Numeric(14, 2), nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Estimate(Base):
    __tablename__ = "estimates"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    project_name = Column(String, nullable=True)
    phase = Column(String, nullable=True)
    category_id = Column(Integer, ForeignKey("estimate_categories.id"), nullable=False)
    drawing_url = Column(String, nullable=True)
    drawing_filename = Column(String, nullable=True)
    estimate_date = Column(Date, nullable=True)
    total_amount = Column(Numeric(14, 2), nullable=False)
    status_id = Column(Integer, ForeignKey("estimate_statuses.id"), nullable=False)
    approval_state = Column(String, nullable=False, default="pending")
    client_email = Column(String, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    linked_project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    approval_token = Column(String, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    token_used = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    category = relationship("EstimateCategory")
    status = relationship("EstimateStatus")


class EstimateApprovalEvent(Base):
    __tablename__ = "estimate_approval_events"
    id = Column(Integer, primary_key=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False, index=True)
    action = Column(String, nullable=False)
    actor = Column(String, nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class IncomeEntry(Base):
    __tablename__ = "income_entries"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    phase = Column(String, nullable=True)
    amount = Column(Numeric(14, 2), nullable=False)
    payment_type = Column(String, nullable=False, default="Partial Payment")
    balance = Column(Numeric(14, 2), nullable=True)
    balance_auto = Column(Numeric(14, 2), nullable=True)
    override_old = Column(Numeric(14, 2), nullable=True)
    override_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    override_at = Column(DateTime(timezone=True), nullable=True)
    income_date = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class ProjectAssignment(Base):
    __tablename__ = "project_assignments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    assigned_role = Column(String, default="SiteEngineer")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class BidLineItem(Base):
    __tablename__ = "bid_line_items"
    id = Column(Integer, primary_key=True)
    bid_package_id = Column(Integer, ForeignKey("bid_packages.id"), nullable=False, index=True)
    item_description = Column(String, nullable=False)
    unit = Column(String)
    quantity_required = Column(Numeric(12, 2), default=0)
    cost_code = Column(String)


class BidLineItemQuote(Base):
    __tablename__ = "bid_line_item_quotes"
    id = Column(Integer, primary_key=True)
    bid_id = Column(Integer, ForeignKey("bids.id"), nullable=False, index=True)
    bid_line_item_id = Column(Integer, ForeignKey("bid_line_items.id"), nullable=False, index=True)
    quantity_offered = Column(Numeric(12, 2), default=0)
    unit_price = Column(Numeric(14, 2), default=0)
    line_total = Column(Numeric(14, 2), default=0)
    lead_time_days = Column(Integer, nullable=True)
    notes = Column(Text)


class EmployeeCategory(Base):
    __tablename__ = "employee_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    default_wage_type = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    role_title = Column(String, nullable=True)
    category_id = Column(Integer, ForeignKey("employee_categories.id"), nullable=True)
    phone = Column(String, nullable=True)
    id_proof_type = Column(String, nullable=True)
    id_proof_number = Column(String, nullable=True)
    daily_wage = Column(Numeric(12, 2), nullable=True)
    wage_type = Column(String, default="daily", nullable=False)
    joining_date = Column(Date, nullable=True)
    status = Column(String, default="active", nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    category = relationship("EmployeeCategory")


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("employee_id", "attendance_date", name="uq_attendance_emp_date"),)
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    attendance_date = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="present")
    check_in_time = Column(String, nullable=True)
    check_out_time = Column(String, nullable=True)
    marked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    marked_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    notes = Column(Text, nullable=True)


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class PhaseEmployee(Base):
    __tablename__ = "phase_employees"
    __table_args__ = (UniqueConstraint("phase_id", "employee_id", name="uq_phase_employee"),)
    id = Column(Integer, primary_key=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
