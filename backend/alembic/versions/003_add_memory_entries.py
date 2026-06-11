"""add memory entries

Revision ID: 002_memory_entries
Revises: 001_initial
Create Date: 2026-06-09 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '003_add_memory_entries'
down_revision: Union[str, None] = '002_workflow_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('memory_entries',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('chroma_id', sa.String(100), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('source', sa.String(50), server_default='user'),
        sa.Column('metadata', sa.JSON(), server_default='{}'),
        sa.Column('tags', sa.JSON(), server_default='[]'),
        sa.Column('created_at', sa.Float()),
        sa.Column('updated_at', sa.Float()),
    )
    op.create_index(op.f('ix_memory_entries_project_id'), 'memory_entries', ['project_id'])
    op.create_index(op.f('ix_memory_entries_chroma_id'), 'memory_entries', ['chroma_id'])
    op.create_index(op.f('ix_memory_entries_source'), 'memory_entries', ['source'])


def downgrade() -> None:
    op.drop_table('memory_entries')
