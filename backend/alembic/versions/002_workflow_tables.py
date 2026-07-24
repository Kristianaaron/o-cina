"""workflow table indexes (tables already created in 001_initial)

Revision ID: 002_workflow_tables
Revises: 001_initial
Create Date: 2026-06-09 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_workflow_tables"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_index(inspector, table: str, name: str) -> bool:
    if table not in inspector.get_table_names():
        return False
    return any(ix["name"] == name for ix in inspector.get_indexes(table))


def upgrade() -> None:
    """001 already creates workflow tables; add any missing indexes only."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _has_index(inspector, "workflow_nodes", "ix_workflow_nodes_workflow_id"):
        op.create_index(
            op.f("ix_workflow_nodes_workflow_id"),
            "workflow_nodes",
            ["workflow_id"],
        )

    if not _has_index(inspector, "workflow_edges", "ix_workflow_edges_workflow_id"):
        op.create_index(
            op.f("ix_workflow_edges_workflow_id"),
            "workflow_edges",
            ["workflow_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if _has_index(inspector, "workflow_edges", "ix_workflow_edges_workflow_id"):
        op.drop_index(op.f("ix_workflow_edges_workflow_id"), table_name="workflow_edges")
    if _has_index(inspector, "workflow_nodes", "ix_workflow_nodes_workflow_id"):
        op.drop_index(op.f("ix_workflow_nodes_workflow_id"), table_name="workflow_nodes")
