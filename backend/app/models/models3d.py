"""3D Drawing Viewer — module-local models.

Self-contained so this can be lifted into a sibling app without pulling any
other Sitera table with it.
"""
from datetime import datetime, timezone

from sqlalchemy import (Column, DateTime, ForeignKey, Integer, Numeric, String,
                          Text)
from sqlalchemy.orm import relationship

from app.database import Base

utcnow = lambda: datetime.now(timezone.utc)


class Model3D(Base):
    __tablename__ = "model3d_files"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    phase_id = Column(Integer, ForeignKey("phases.id"), nullable=True, index=True)

    name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)        # local storage path
    file_size = Column(Integer, default=0)
    version = Column(Integer, default=1)
    is_active = Column(Integer, default=1, index=True)  # 1 = current for its scope

    # Persist last camera state so returning users see the same view
    saved_camera = Column(Text, nullable=True)       # JSON: {pos, target}

    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    annotations = relationship("ModelAnnotation", back_populates="model",
                                cascade="all, delete-orphan", lazy="joined")


class ModelAnnotation(Base):
    __tablename__ = "model3d_annotations"

    id = Column(Integer, primary_key=True)
    model_id = Column(Integer, ForeignKey("model3d_files.id", ondelete="CASCADE"),
                     nullable=False, index=True)

    position_x = Column(Numeric(12, 4), nullable=False)
    position_y = Column(Numeric(12, 4), nullable=False)
    position_z = Column(Numeric(12, 4), nullable=False)

    # Optional normal vector so we can offset the pin off the surface visually
    normal_x = Column(Numeric(10, 4), default=0)
    normal_y = Column(Numeric(10, 4), default=1)
    normal_z = Column(Numeric(10, 4), default=0)

    label = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    photo_path = Column(String, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    model = relationship("Model3D", back_populates="annotations")
