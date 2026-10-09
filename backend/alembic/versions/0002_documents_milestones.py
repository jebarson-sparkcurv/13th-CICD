"""milestones, project documents, project_type/currency

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("project_type", sa.String, nullable=True))
    op.add_column("projects", sa.Column("currency", sa.String, server_default="INR"))
    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("phase_id", sa.Integer, sa.ForeignKey("phases.id"), nullable=False),
        sa.Column("title", sa.String, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String, nullable=False, server_default="Pending"),
        sa.Column("sequence_order", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_milestones_phase_id", "milestones", ["phase_id"])
    op.create_table(
        "project_documents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("document_name", sa.String, nullable=False),
        sa.Column("file_url", sa.String, nullable=False),
        sa.Column("file_type", sa.String),
        sa.Column("file_size", sa.Integer),
        sa.Column("uploaded_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String, server_default="Other"),
        sa.Column("is_client_visible", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("uploaded_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_project_documents_project_id", "project_documents", ["project_id"])


def downgrade():
    op.drop_table("project_documents")
    op.drop_table("milestones")
    op.drop_column("projects", "currency")
    op.drop_column("projects", "project_type")
