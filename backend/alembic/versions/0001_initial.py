"""initial tables

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clients",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("company", sa.String),
        sa.Column("email", sa.String),
        sa.Column("phone", sa.String),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("password_hash", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("client_id", sa.Integer, sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("site_engineer_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("location", sa.String),
        sa.Column("budget", sa.Numeric(14, 2)),
        sa.Column("start_date_planned", sa.Date),
        sa.Column("end_date_planned", sa.Date),
        sa.Column("start_date_actual", sa.Date, nullable=True),
        sa.Column("end_date_actual", sa.Date, nullable=True),
        sa.Column("status", sa.String, nullable=False),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_projects_client_id", "projects", ["client_id"])
    op.create_table(
        "phases",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("sequence_order", sa.Integer, nullable=False),
        sa.Column("planned_start", sa.Date),
        sa.Column("planned_end", sa.Date),
        sa.Column("actual_start", sa.Date, nullable=True),
        sa.Column("actual_end", sa.Date, nullable=True),
        sa.Column("status", sa.String, nullable=False),
        sa.Column("percent_complete", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("project_id", "sequence_order", name="uq_phase_sequence"),
    )
    op.create_index("ix_phases_project_id", "phases", ["project_id"])
    op.create_table(
        "progress_updates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("phase_id", sa.Integer, sa.ForeignKey("phases.id"), nullable=True),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("update_date", sa.Date, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("percent_progress", sa.Integer, nullable=True),
        sa.Column("status_flag", sa.String, nullable=False),
        sa.Column("attachments", sa.JSON),
        sa.Column("visible_to_client", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_progress_updates_project_id", "progress_updates", ["project_id"])
    op.create_index("ix_progress_updates_phase_id", "progress_updates", ["phase_id"])


def downgrade():
    op.drop_table("progress_updates")
    op.drop_table("phases")
    op.drop_table("projects")
    op.drop_table("users")
    op.drop_table("clients")
