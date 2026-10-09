from datetime import date
from decimal import Decimal
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, Field, model_validator

ProjectStatus = Literal["Planning", "Ongoing", "OnHold", "Completed", "Cancelled"]
PhaseStatus = Literal["NotStarted", "InProgress", "Completed", "Delayed", "Blocked"]
StatusFlag = Literal["OnTrack", "Delayed", "Blocked"]
DOC_CATEGORIES = ["Drawing", "Contract", "Invoice", "Approval", "Other"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: Literal["Admin", "SiteEngineer", "Client", "Vendor"] = "Client"
    client_id: Optional[int] = None


class SubcontractorItem(BaseModel):
    """Sub-contractor allocation captured on a project."""
    type: str = Field(min_length=1, max_length=80)
    name: Optional[str] = Field(default=None, max_length=160)
    allocated_amount: Decimal = Field(ge=0)
    materials: List[str] = Field(default_factory=list)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _clean(self):
        self.type = self.type.strip()
        if not self.type:
            raise ValueError("Sub-contractor type is required")
        self.materials = [m.strip() for m in (self.materials or []) if (m or "").strip()]
        if self.name is not None:
            self.name = self.name.strip() or None
        return self


class SubcontractorUpdate(BaseModel):
    type: Optional[str] = Field(default=None, min_length=1, max_length=80)
    name: Optional[str] = Field(default=None, max_length=160)
    allocated_amount: Optional[Decimal] = Field(default=None, ge=0)
    materials: Optional[List[str]] = None
    notes: Optional[str] = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1)
    client_id: int
    site_engineer_id: Optional[int] = None
    location: Optional[str] = None
    project_type: Optional[str] = None
    budget: Optional[Decimal] = None
    currency: str = "INR"
    start_date_planned: Optional[date] = None
    end_date_planned: Optional[date] = None
    start_date_actual: Optional[date] = None
    end_date_actual: Optional[date] = None
    status: ProjectStatus = "Planning"
    subcontractors: List[SubcontractorItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date_planned and self.end_date_planned and self.end_date_planned < self.start_date_planned:
            raise ValueError("end_date_planned must be after start_date_planned")
        return self


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[int] = None
    site_engineer_id: Optional[int] = None
    location: Optional[str] = None
    project_type: Optional[str] = None
    budget: Optional[Decimal] = None
    currency: Optional[str] = None
    start_date_planned: Optional[date] = None
    end_date_planned: Optional[date] = None
    start_date_actual: Optional[date] = None
    end_date_actual: Optional[date] = None
    status: Optional[ProjectStatus] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date_planned and self.end_date_planned and self.end_date_planned < self.start_date_planned:
            raise ValueError("end_date_planned must be after start_date_planned")
        return self


class PhaseCreate(BaseModel):
    name: str = Field(min_length=1)
    sequence_order: int = Field(ge=1)
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    status: PhaseStatus = "NotStarted"
    percent_complete: int = Field(default=0, ge=0, le=100)
    description: Optional[str] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.planned_start and self.planned_end and self.planned_end < self.planned_start:
            raise ValueError("planned_end must be after planned_start")
        return self


class PhaseUpdate(BaseModel):
    name: Optional[str] = None
    sequence_order: Optional[int] = Field(default=None, ge=1)
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    status: Optional[PhaseStatus] = None
    percent_complete: Optional[int] = Field(default=None, ge=0, le=100)
    description: Optional[str] = None


class ProgressUpdateCreate(BaseModel):
    phase_id: Optional[int] = None
    update_date: Optional[date] = None
    description: str = Field(min_length=1)
    percent_progress: Optional[int] = Field(default=None, ge=0, le=100)
    status_flag: StatusFlag = "OnTrack"
    attachments: List[str] = []
    visible_to_client: bool = True


class PhaseReorder(BaseModel):
    phase_ids: List[int] = Field(min_length=1)


class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    due_date: Optional[date] = None
    sequence_order: int = Field(default=1, ge=1)
    status: Literal["Pending", "Done", "Skipped"] = "Pending"


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    sequence_order: Optional[int] = Field(default=None, ge=1)
    status: Optional[Literal["Pending", "Done", "Skipped"]] = None


class DocumentPatch(BaseModel):
    document_name: Optional[str] = Field(default=None, min_length=1)
    category: Optional[str] = None
    is_client_visible: Optional[bool] = None
