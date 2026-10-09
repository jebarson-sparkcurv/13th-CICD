"""AI Design Concept & Cost Estimate — module-local models.

Kept intentionally self-contained so this feature can be lifted into another app
with minimal changes.
"""
from datetime import datetime, timezone

from sqlalchemy import (Column, DateTime, ForeignKey, Integer, Numeric, String,
                          Text)
from sqlalchemy.orm import relationship

from app.database import Base

utcnow = lambda: datetime.now(timezone.utc)


class ConceptGeneration(Base):
    __tablename__ = "concept_generations"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    space_type = Column(String, nullable=False)       # LivingRoom, Bedroom, Kitchen, ...
    style = Column(String, nullable=False)            # Modern, Scandinavian, ...
    sqft = Column(Numeric(10, 2), nullable=False)
    region = Column(String, default="India", nullable=False)

    uploaded_photo_path = Column(String, nullable=False)     # storage path
    rendered_image_path = Column(String, nullable=True)      # storage path

    status = Column(String, default="Generating", nullable=False, index=True)  # Generating | Completed | Failed
    error_message = Column(Text, nullable=True)
    total_estimate = Column(Numeric(14, 2), default=0)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    lines = relationship("ConceptCostLine", back_populates="concept",
                         cascade="all, delete-orphan", lazy="joined")


class ConceptCostLine(Base):
    __tablename__ = "concept_cost_lines"

    id = Column(Integer, primary_key=True)
    concept_id = Column(Integer, ForeignKey("concept_generations.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    category = Column(String, nullable=False)          # Flooring / Paint / Furniture / Lighting / Fixtures / Labour
    description = Column(String, nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False, default=1)
    unit = Column(String, nullable=False, default="unit")
    rate = Column(Numeric(14, 2), nullable=False, default=0)
    subtotal = Column(Numeric(14, 2), nullable=False, default=0)
    sort_order = Column(Integer, default=0)

    concept = relationship("ConceptGeneration", back_populates="lines")
