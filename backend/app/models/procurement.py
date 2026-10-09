from sqlalchemy import (Column, Integer, String, Text, Date, DateTime, Boolean,
                        Numeric, ForeignKey)
from sqlalchemy.orm import relationship
from app.database import Base
from app.models import utcnow


class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    vendor_type = Column(String, default="Supplier")
    trade = Column(String)
    contact_name = Column(String)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    tax_id = Column(String)
    license_number = Column(String)
    insurance_expiry = Column(Date, nullable=True)
    status = Column(String, default="Active", nullable=False)
    prequalified = Column(Boolean, default=False, nullable=False)
    rating = Column(Numeric(3, 1), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class VendorDocument(Base):
    __tablename__ = "vendor_documents"
    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    document_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_type = Column(String)
    category = Column(String, default="Other")
    expiry_date = Column(Date, nullable=True)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime(timezone=True), default=utcnow)
    vendor = relationship("Vendor")


class CostCodeBudget(Base):
    __tablename__ = "cost_code_budgets"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    cost_code = Column(String, nullable=False)
    allocated_amount = Column(Numeric(14, 2), default=0)


class BidPackage(Base):
    __tablename__ = "bid_packages"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    scope_description = Column(Text)
    cost_code = Column(String)
    status = Column(String, default="Draft", nullable=False)
    bid_due_date = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=utcnow)


class BidInvitation(Base):
    __tablename__ = "bid_invitations"
    id = Column(Integer, primary_key=True)
    bid_package_id = Column(Integer, ForeignKey("bid_packages.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    invited_at = Column(DateTime(timezone=True), default=utcnow)
    response_status = Column(String, default="Invited")
    vendor = relationship("Vendor")


class Bid(Base):
    __tablename__ = "bids"
    id = Column(Integer, primary_key=True)
    bid_package_id = Column(Integer, ForeignKey("bid_packages.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    submitted_at = Column(DateTime(timezone=True), default=utcnow)
    notes = Column(Text)
    is_leveled = Column(Boolean, default=False)
    status = Column(String, default="Submitted", nullable=False)
    vendor = relationship("Vendor")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    po_number = Column(String, nullable=False)
    cost_code = Column(String)
    description = Column(Text)
    status = Column(String, default="Draft", nullable=False)
    issue_date = Column(Date, nullable=True)
    expected_delivery_date = Column(Date, nullable=True)
    original_amount = Column(Numeric(14, 2), default=0)
    revised_amount = Column(Numeric(14, 2), default=0)
    created_by = Column(Integer, ForeignKey("users.id"))
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    vendor = relationship("Vendor")
    line_items = relationship("POLineItem", cascade="all, delete-orphan")


class POLineItem(Base):
    __tablename__ = "po_line_items"
    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    item_description = Column(String, nullable=False)
    unit = Column(String)
    quantity = Column(Numeric(12, 2), default=0)
    unit_price = Column(Numeric(14, 2), default=0)
    line_total = Column(Numeric(14, 2), default=0)
    received_quantity = Column(Numeric(12, 2), default=0)


class Subcontract(Base):
    __tablename__ = "subcontracts"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    contract_number = Column(String, nullable=False)
    scope_of_work = Column(Text)
    cost_code = Column(String)
    status = Column(String, default="Draft", nullable=False)
    original_amount = Column(Numeric(14, 2), default=0)
    revised_amount = Column(Numeric(14, 2), default=0)
    retainage_pct = Column(Numeric(5, 2), default=0)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    executed_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    vendor = relationship("Vendor")


class ChangeOrder(Base):
    __tablename__ = "change_orders"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    commitment_type = Column(String, nullable=False)
    commitment_id = Column(Integer, nullable=False, index=True)
    co_number = Column(String, nullable=False)
    reason = Column(Text)
    amount = Column(Numeric(14, 2), nullable=False)
    status = Column(String, default="Pending", nullable=False)
    requested_by = Column(Integer, ForeignKey("users.id"))
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    requested_at = Column(DateTime(timezone=True), default=utcnow)
    approved_at = Column(DateTime(timezone=True), nullable=True)


class PayApplication(Base):
    __tablename__ = "pay_applications"
    id = Column(Integer, primary_key=True)
    commitment_type = Column(String, nullable=False)
    commitment_id = Column(Integer, nullable=False, index=True)
    application_number = Column(Integer, default=1)
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    amount_this_period = Column(Numeric(14, 2), default=0)
    retainage_held = Column(Numeric(14, 2), default=0)
    amount_due = Column(Numeric(14, 2), default=0)
    status = Column(String, default="Draft", nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    line_items = relationship("PayApplicationLineItem", cascade="all, delete-orphan")
    lien_waivers = relationship("LienWaiver", cascade="all, delete-orphan")


class PayApplicationLineItem(Base):
    __tablename__ = "pay_application_line_items"
    id = Column(Integer, primary_key=True)
    pay_application_id = Column(Integer, ForeignKey("pay_applications.id"), nullable=False, index=True)
    description = Column(String, nullable=False)
    scheduled_value = Column(Numeric(14, 2), default=0)
    previous_completed = Column(Numeric(14, 2), default=0)
    this_period = Column(Numeric(14, 2), default=0)
    materials_stored = Column(Numeric(14, 2), default=0)
    pct_complete = Column(Numeric(5, 2), default=0)


class LienWaiver(Base):
    __tablename__ = "lien_waivers"
    id = Column(Integer, primary_key=True)
    pay_application_id = Column(Integer, ForeignKey("pay_applications.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    waiver_type = Column(String, default="ConditionalProgress")
    file_url = Column(String, nullable=True)
    amount = Column(Numeric(14, 2), default=0)
    signed_date = Column(Date, nullable=True)
    status = Column(String, default="Pending", nullable=False)


class MaterialDelivery(Base):
    __tablename__ = "material_deliveries"
    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    item_description = Column(String, nullable=False)
    quantity_delivered = Column(Numeric(12, 2), default=0)
    delivery_date = Column(Date, nullable=True)
    received_by = Column(Integer, ForeignKey("users.id"))
    condition_notes = Column(Text)
    status = Column(String, default="Pending", nullable=False)


class ProcurementDocument(Base):
    __tablename__ = "procurement_documents"
    id = Column(Integer, primary_key=True)
    related_type = Column(String, nullable=False)
    related_id = Column(Integer, nullable=False, index=True)
    document_name = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_type = Column(String)
    category = Column(String, default="Other")
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    uploaded_at = Column(DateTime(timezone=True), default=utcnow)
    is_client_visible = Column(Boolean, default=False, nullable=False)
    uploader = relationship("User", foreign_keys=[uploaded_by])


class VendorProduct(Base):
    __tablename__ = "vendor_products"
    id = Column(Integer, primary_key=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    unit = Column(String, default="unit")
    unit_price = Column(Numeric(14, 2), nullable=False, default=0)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class VendorQuotation(Base):
    __tablename__ = "vendor_quotations"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    quote_number = Column(String, nullable=False)
    status = Column(String, default="Draft", nullable=False)
    notes = Column(Text, nullable=True)
    total_amount = Column(Numeric(14, 2), nullable=False, default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    expense_entry_id = Column(Integer, nullable=True)
    items = relationship("VendorQuotationItem", cascade="all, delete-orphan")


class VendorQuotationItem(Base):
    __tablename__ = "vendor_quotation_items"
    id = Column(Integer, primary_key=True)
    quotation_id = Column(Integer, ForeignKey("vendor_quotations.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("vendor_products.id"), nullable=True)
    product_name = Column(String, nullable=False)
    unit = Column(String, default="unit")
    quantity = Column(Numeric(12, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False, default=0)
    line_total = Column(Numeric(14, 2), nullable=False, default=0)


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    unit = Column(String, default="nos")
    category = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    default_price = Column(Numeric(14, 2), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Quotation(Base):
    __tablename__ = "quotations"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    status = Column(String, default="draft")
    quotation_number = Column(String, nullable=False)
    quotation_date = Column(Date, nullable=True)
    valid_until = Column(Date, nullable=True)
    quotation_total = Column(Numeric(14, 2), default=0)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    line_items = relationship("QuotationLineItem", cascade="all, delete-orphan", backref="quotation")


class QuotationLineItem(Base):
    __tablename__ = "quotation_line_items"
    id = Column(Integer, primary_key=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False, default=0)
    line_total = Column(Numeric(14, 2), nullable=False, default=0)
    notes = Column(Text, nullable=True)


class QuotationShareLog(Base):
    __tablename__ = "quotation_share_logs"
    id = Column(Integer, primary_key=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False, index=True)
    channel = Column(String, nullable=False)
    sent_to = Column(String, nullable=True)
    sent_at = Column(DateTime(timezone=True), default=utcnow)
    sent_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="sent")



# ============================================================================
# Quotation-derived Purchase Orders (customer-facing PO document)
# NOTE: distinct from `purchase_orders` (construction commitments) above.
# ============================================================================

class QuotationPurchaseOrder(Base):
    __tablename__ = "quotation_purchase_orders"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False, index=True)
    po_number = Column(String, nullable=False, unique=True)
    status = Column(String, default="DRAFT", nullable=False)   # DRAFT | ISSUED | SENT | CANCELLED
    order_date = Column(Date, nullable=True)
    subtotal = Column(Numeric(14, 2), default=0, nullable=False)
    discount = Column(Numeric(14, 2), default=0, nullable=False)
    tax = Column(Numeric(14, 2), default=0, nullable=False)
    grand_total = Column(Numeric(14, 2), default=0, nullable=False)
    notes = Column(Text, nullable=True)
    pdf_path = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    items = relationship("QuotationPurchaseOrderItem", cascade="all, delete-orphan",
                         backref="purchase_order", order_by="QuotationPurchaseOrderItem.id")
    vendor = relationship("Vendor")


class QuotationPurchaseOrderItem(Base):
    __tablename__ = "quotation_purchase_order_items"
    id = Column(Integer, primary_key=True)
    purchase_order_id = Column(Integer, ForeignKey("quotation_purchase_orders.id"),
                               nullable=False, index=True)
    quotation_item_id = Column(Integer, ForeignKey("quotation_line_items.id"), nullable=True)
    item_name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    quantity = Column(Numeric(12, 2), nullable=False, default=1)
    unit_price = Column(Numeric(14, 2), nullable=False, default=0)
    total_price = Column(Numeric(14, 2), nullable=False, default=0)
