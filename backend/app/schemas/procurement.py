from datetime import date
from decimal import Decimal
from typing import Optional, List, Literal
from pydantic import BaseModel, Field

POStatus = Literal["Draft", "PendingApproval", "Approved", "PartiallyReceived", "Closed", "Cancelled"]
SubStatus = Literal["Draft", "PendingApproval", "Executed", "Closed", "Terminated"]
COStatus = Literal["Pending", "Approved", "Rejected", "Void"]
PayAppStatus = Literal["Draft", "Submitted", "UnderReview", "Approved", "Paid", "Rejected"]
CommitmentType = Literal["po", "subcontract"]


class VendorCreate(BaseModel):
    name: str = Field(min_length=1)
    vendor_type: Literal["Subcontractor", "Supplier", "Consultant"] = "Supplier"
    trade: Optional[str] = None
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    license_number: Optional[str] = None
    insurance_expiry: Optional[date] = None
    status: Literal["Active", "Inactive", "Blacklisted"] = "Active"
    prequalified: bool = False
    rating: Optional[Decimal] = Field(default=None, ge=0, le=5)


class VendorUpdate(VendorCreate):
    name: Optional[str] = None
    vendor_type: Optional[Literal["Subcontractor", "Supplier", "Consultant"]] = None
    status: Optional[Literal["Active", "Inactive", "Blacklisted"]] = None
    prequalified: Optional[bool] = None


class VendorDocPatch(BaseModel):
    document_name: Optional[str] = None
    category: Optional[str] = None
    expiry_date: Optional[date] = None


class BidPackageCreate(BaseModel):
    title: str = Field(min_length=1)
    scope_description: Optional[str] = None
    cost_code: Optional[str] = None
    status: Literal["Draft", "Open", "Closed", "Awarded", "Cancelled"] = "Draft"
    bid_due_date: Optional[date] = None


class BidPackagePatch(BaseModel):
    title: Optional[str] = None
    scope_description: Optional[str] = None
    cost_code: Optional[str] = None
    status: Optional[Literal["Draft", "Open", "Closed", "Awarded", "Cancelled"]] = None
    bid_due_date: Optional[date] = None


class InviteIn(BaseModel):
    vendor_ids: List[int] = Field(min_length=1)


class BidCreate(BaseModel):
    vendor_id: int
    amount: Decimal
    notes: Optional[str] = None


class BidPatch(BaseModel):
    status: Optional[Literal["Submitted", "UnderReview", "Awarded", "Rejected"]] = None
    is_leveled: Optional[bool] = None


class AwardIn(BaseModel):
    bid_id: int
    commitment_type: CommitmentType = "po"


class POCreate(BaseModel):
    vendor_id: int
    cost_code: Optional[str] = None
    description: Optional[str] = None
    status: POStatus = "Draft"
    issue_date: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    original_amount: Decimal = 0


class POPatch(BaseModel):
    vendor_id: Optional[int] = None
    cost_code: Optional[str] = None
    description: Optional[str] = None
    status: Optional[POStatus] = None
    issue_date: Optional[date] = None
    expected_delivery_date: Optional[date] = None
    original_amount: Optional[Decimal] = None


class POLineItemCreate(BaseModel):
    item_description: str = Field(min_length=1)
    unit: Optional[str] = None
    quantity: Decimal = 0
    unit_price: Decimal = 0


class POLineItemPatch(BaseModel):
    item_description: Optional[str] = None
    unit: Optional[str] = None
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    received_quantity: Optional[Decimal] = None


class SubCreate(BaseModel):
    vendor_id: int
    scope_of_work: Optional[str] = None
    cost_code: Optional[str] = None
    status: SubStatus = "Draft"
    original_amount: Decimal = 0
    retainage_pct: Decimal = Field(default=0, ge=0, le=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class SubPatch(BaseModel):
    vendor_id: Optional[int] = None
    scope_of_work: Optional[str] = None
    cost_code: Optional[str] = None
    status: Optional[SubStatus] = None
    original_amount: Optional[Decimal] = None
    retainage_pct: Optional[Decimal] = Field(default=None, ge=0, le=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class COCreate(BaseModel):
    reason: str = Field(min_length=1)
    amount: Decimal


class COPatch(BaseModel):
    status: Optional[COStatus] = None
    reason: Optional[str] = None
    amount: Optional[Decimal] = None


class PayAppCreate(BaseModel):
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    amount_this_period: Decimal = Field(gt=0)


class PayAppPatch(BaseModel):
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    amount_this_period: Optional[Decimal] = None
    status: Optional[PayAppStatus] = None


class PayAppLineItemCreate(BaseModel):
    description: str = Field(min_length=1)
    scheduled_value: Decimal = 0
    previous_completed: Decimal = 0
    this_period: Decimal = 0
    materials_stored: Decimal = 0


class LienWaiverCreate(BaseModel):
    waiver_type: Literal["ConditionalProgress", "UnconditionalProgress", "ConditionalFinal", "UnconditionalFinal"] = "ConditionalProgress"
    amount: Decimal = 0
    signed_date: Optional[date] = None
    file_url: Optional[str] = None


class LienWaiverPatch(BaseModel):
    status: Optional[Literal["Pending", "Received", "Verified"]] = None
    file_url: Optional[str] = None
    signed_date: Optional[date] = None


class DeliveryCreate(BaseModel):
    purchase_order_id: Optional[int] = None
    item_description: str = Field(min_length=1)
    quantity_delivered: Decimal = 0
    delivery_date: Optional[date] = None
    condition_notes: Optional[str] = None
    status: Literal["Pending", "Partial", "Complete", "Rejected"] = "Pending"


class DeliveryPatch(BaseModel):
    quantity_delivered: Optional[Decimal] = None
    delivery_date: Optional[date] = None
    condition_notes: Optional[str] = None
    status: Optional[Literal["Pending", "Partial", "Complete", "Rejected"]] = None


class ProcDocPatch(BaseModel):
    document_name: Optional[str] = None
    category: Optional[str] = None
    is_client_visible: Optional[bool] = None
