"""add profile write candidates

Revision ID: 017_profile_write_gate
Revises: 016_profile_learning
"""
from alembic import op
import sqlalchemy as sa

revision = "017_profile_write_gate"
down_revision = "016_profile_learning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profile_write_candidates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("signal_id", sa.Integer(), nullable=False),
        sa.Column("candidate_index", sa.Integer(), nullable=False),
        sa.Column("memory_key", sa.String(160), nullable=False),
        sa.Column("action", sa.String(20), nullable=False, server_default="add"),
        sa.Column("target_memory_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("surface_text", sa.Text(), nullable=False),
        sa.Column("evidence_quote", sa.Text(), nullable=False),
        sa.Column("entities", sa.JSON(), nullable=False),
        sa.Column("durability", sa.String(20), nullable=False, server_default="emerging"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("sensitivity", sa.String(20), nullable=False, server_default="personal"),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("gate_reason", sa.String(120), nullable=True),
        sa.Column("applied_memory_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("signal_id", "candidate_index", name="uq_profile_candidate_signal_index"),
    )
    op.create_index("ix_profile_write_candidates_user_id", "profile_write_candidates", ["user_id"])
    op.create_index("ix_profile_write_candidates_signal_id", "profile_write_candidates", ["signal_id"])
    op.create_index("ix_profile_candidate_user_status", "profile_write_candidates", ["user_id", "status"])
    op.create_index("ix_profile_candidate_user_key", "profile_write_candidates", ["user_id", "memory_key"])


def downgrade() -> None:
    op.drop_index("ix_profile_candidate_user_key", table_name="profile_write_candidates")
    op.drop_index("ix_profile_candidate_user_status", table_name="profile_write_candidates")
    op.drop_index("ix_profile_write_candidates_signal_id", table_name="profile_write_candidates")
    op.drop_index("ix_profile_write_candidates_user_id", table_name="profile_write_candidates")
    op.drop_table("profile_write_candidates")
