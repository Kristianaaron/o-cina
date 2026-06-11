"""initial schema

Revision ID: 001_initial
Revises: 
Create Date: 2026-06-09 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('agents',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('harness', sa.String(100), nullable=False),
        sa.Column('model', sa.String(255)),
        sa.Column('provider', sa.String(100)),
        sa.Column('skills', sa.JSON(), server_default='[]'),
        sa.Column('status', sa.String(50), server_default='registered'),
        sa.Column('endpoint', sa.String(500)),
        sa.Column('config', sa.JSON(), server_default='{}'),
        sa.Column('last_heartbeat', sa.Float()),
        sa.Column('pid', sa.Integer()),
        sa.Column('pgid', sa.Integer()),
        sa.Column('process_started_at', sa.Float()),
        sa.Column('sandboxed', sa.Boolean(), server_default='false'),
        sa.Column('sandbox_config', sa.JSON()),
        sa.Column('resource_limits', sa.JSON()),
        sa.Column('created_at', sa.Float()),
    )
    op.create_index(op.f('ix_agents_name'), 'agents', ['name'])
    op.create_index(op.f('ix_agents_harness'), 'agents', ['harness'])
    op.create_index(op.f('ix_agents_status'), 'agents', ['status'])

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

    op.create_table('users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), server_default='admin'),
        sa.Column('created_at', sa.Float()),
    )

    op.create_table('api_keys',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('key_hash', sa.String(64), nullable=False),
        sa.Column('prefix', sa.String(20), nullable=False),
        sa.Column('created_at', sa.Float()),
        sa.Column('last_used', sa.Float()),
        sa.Column('revoked', sa.Boolean(), server_default='false'),
    )

    op.create_table('adapters',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('module_path', sa.String(500), nullable=False),
        sa.Column('version', sa.String(50), server_default='0.1.0'),
        sa.Column('config_schema', sa.JSON(), server_default='{}'),
        sa.Column('created_at', sa.Float()),
    )

    op.create_table('workflow_nodes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id')),
        sa.Column('ref_id', sa.String(50), nullable=False),
        sa.Column('agent_id', sa.String(36), sa.ForeignKey('agents.id')),
        sa.Column('node_type', sa.String(50), server_default='agent'),
        sa.Column('config', sa.JSON(), server_default='{}'),
        sa.Column('status', sa.String(50), server_default='pending'),
        sa.Column('retry_count', sa.Integer(), server_default='0'),
    )

    op.create_table('workflow_edges',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id')),
        sa.Column('source_ref', sa.String(50), nullable=False),
        sa.Column('target_ref', sa.String(50), nullable=False),
        sa.Column('label', sa.String(255)),
        sa.Column('data_rules', sa.JSON(), server_default='{}'),
    )

    op.create_table('tasks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id')),
        sa.Column('status', sa.String(50), server_default='pending'),
        sa.Column('current_node', sa.String(50)),
        sa.Column('assigned_agent_id', sa.String(36), sa.ForeignKey('agents.id')),
        sa.Column('context', sa.JSON(), server_default='{}'),
        sa.Column('result', sa.JSON()),
        sa.Column('created_at', sa.Float()),
        sa.Column('updated_at', sa.Float()),
    )
    op.create_index(op.f('ix_tasks_status'), 'tasks', ['status'])

    op.create_table('projects',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('tags', sa.JSON(), server_default='[]'),
        sa.Column('agent_ids', sa.JSON(), server_default='[]'),
        sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id')),
        sa.Column('created_at', sa.Float()),
        sa.Column('updated_at', sa.Float()),
    )
    op.create_index(op.f('ix_projects_name'), 'projects', ['name'])

    op.create_table('sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id')),
        sa.Column('agent_id', sa.String(36), sa.ForeignKey('agents.id')),
        sa.Column('summary', sa.Text()),
        sa.Column('created_at', sa.Float()),
        sa.Column('updated_at', sa.Float()),
    )

    op.create_table('messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('task_id', sa.String(36), sa.ForeignKey('tasks.id')),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id')),
        sa.Column('from_agent', sa.String(36), sa.ForeignKey('agents.id')),
        sa.Column('to_agent', sa.String(36), sa.ForeignKey('agents.id')),
        sa.Column('type', sa.String(100), server_default='text'),
        sa.Column('payload', sa.JSON(), server_default='{}'),
        sa.Column('schema_version', sa.Integer(), server_default='1'),
        sa.Column('timestamp', sa.Float()),
    )
    op.create_index(op.f('ix_messages_timestamp'), 'messages', ['timestamp'])

    op.create_table('audit_log',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('timestamp', sa.Float()),
        sa.Column('user_id', sa.String(36)),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('target_type', sa.String(100)),
        sa.Column('target_id', sa.String(36)),
        sa.Column('result', sa.String(50), server_default='success'),
        sa.Column('detail', sa.JSON()),
    )
    op.create_index(op.f('ix_audit_log_timestamp'), 'audit_log', ['timestamp'])
    op.create_index(op.f('ix_audit_log_action'), 'audit_log', ['action'])


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('messages')
    op.drop_table('sessions')
    op.drop_table('projects')
    op.drop_table('tasks')
    op.drop_table('workflow_edges')
    op.drop_table('workflow_nodes')
    op.drop_table('adapters')
    op.drop_table('api_keys')
    op.drop_table('users')
    op.drop_table('workflows')
    op.drop_table('agents')
