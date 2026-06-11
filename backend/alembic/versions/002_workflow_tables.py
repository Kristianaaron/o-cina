"""workflow tables

Revision ID: 002_workflow_tables
Revises: 001_initial
Create Date: 2026-06-09 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '002_workflow_tables'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('workflows',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('graph', sa.JSON()),
        sa.Column('guardrails', sa.JSON(), server_default='{}'),
        sa.Column('created_at', sa.Float()),
        sa.Column('updated_at', sa.Float()),
    )
    op.create_index(op.f('ix_workflows_name'), 'workflows', ['name'])

    op.create_table('workflow_nodes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id'), nullable=False),
        sa.Column('ref_id', sa.String(50), nullable=False),
        sa.Column('agent_id', sa.String(36), sa.ForeignKey('agents.id')),
        sa.Column('node_type', sa.String(50), server_default='agent'),
        sa.Column('config', sa.JSON(), server_default='{}'),
        sa.Column('status', sa.String(50), server_default='pending'),
        sa.Column('retry_count', sa.Integer(), server_default='0'),
    )
    op.create_index(op.f('ix_workflow_nodes_workflow_id'), 'workflow_nodes', ['workflow_id'])

    op.create_table('workflow_edges',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id'), nullable=False),
        sa.Column('source_ref', sa.String(50), nullable=False),
        sa.Column('target_ref', sa.String(50), nullable=False),
        sa.Column('label', sa.String(255)),
        sa.Column('data_rules', sa.JSON(), server_default='{}'),
    )
    op.create_index(op.f('ix_workflow_edges_workflow_id'), 'workflow_edges', ['workflow_id'])

    # Task table was in 001 but add workflow_id FK
    if 'tasks' not in [col['name'] for col in sa.inspect(op.get_bind()).get_columns('tasks')]:
        pass  # already exists


def downgrade() -> None:
    op.drop_table('workflow_edges')
    op.drop_table('workflow_nodes')
    op.drop_table('workflows')
