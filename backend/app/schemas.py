"""Pydantic schemas for API request/response validation."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# ── Agent ────────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    harness: str = Field(..., min_length=1, max_length=100)
    model: str | None = None
    provider: str | None = None
    skills: list[str] = []
    endpoint: str | None = None
    config: dict[str, Any] = {}
    sandboxed: bool = False
    sandbox_config: dict[str, Any] | None = None
    resource_limits: dict[str, Any] | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    model: str | None = None
    provider: str | None = None
    endpoint: str | None = None
    config: dict[str, Any] | None = None
    sandboxed: bool | None = None
    sandbox_config: dict[str, Any] | None = None
    resource_limits: dict[str, Any] | None = None


class AgentOut(BaseModel):
    id: str
    name: str
    harness: str
    model: str | None = None
    provider: str | None = None
    skills: list[str] = []
    status: str = "registered"
    endpoint: str | None = None
    config: dict[str, Any] = {}
    last_heartbeat: float | None = None
    pid: int | None = None
    pgid: int | None = None
    process_started_at: float | None = None
    sandboxed: bool = False
    sandbox_config: dict[str, Any] | None = None
    resource_limits: dict[str, Any] | None = None
    created_at: float | None = None

    model_config = {"from_attributes": True}


# ── Workflow ─────────────────────────────────────────────────────────────────

class WorkflowNodeIn(BaseModel):
    ref_id: str
    agent_id: str | None = None
    node_type: str = "agent"
    config: dict[str, Any] = {}


class WorkflowEdgeIn(BaseModel):
    source_ref: str
    target_ref: str
    label: str | None = None
    data_rules: dict[str, Any] = {}


class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    nodes: list[WorkflowNodeIn] = []
    edges: list[WorkflowEdgeIn] = []
    guardrails: dict[str, Any] = {}


class WorkflowUpdate(BaseModel):
    """All fields optional for PATCH semantics."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    nodes: list[WorkflowNodeIn] | None = None
    edges: list[WorkflowEdgeIn] | None = None
    guardrails: dict[str, Any] | None = None


class WorkflowOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    graph: dict[str, Any] | None = None
    guardrails: dict[str, Any] = {}
    created_at: float | None = None
    updated_at: float | None = None

    model_config = {"from_attributes": True}


class WorkflowExecute(BaseModel):
    context: dict[str, Any] = {}


class TaskOut(BaseModel):
    id: str
    workflow_id: str | None = None
    status: str = "pending"
    current_node: str | None = None
    assigned_agent_id: str | None = None
    context: dict[str, Any] = {}
    result: dict[str, Any] | None = None
    created_at: float | None = None
    updated_at: float | None = None

    model_config = {"from_attributes": True}


# ── Project ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] = []
    agent_ids: list[str] = []
    workflow_id: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    agent_ids: list[str] | None = None
    workflow_id: str | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    tags: list[str] = []
    agent_ids: list[str] = []
    workflow_id: str | None = None
    created_at: float | None = None
    updated_at: float | None = None

    model_config = {"from_attributes": True}


# ── Prompt ───────────────────────────────────────────────────────────────────

class PromptIn(BaseModel):
    agent_id: str
    message: str
    session_id: str | None = None


class PromptOut(BaseModel):
    message_id: str
    agent_id: str
    status: str = "queued"


# ── Heartbeat ────────────────────────────────────────────────────────────────

class HeartbeatIn(BaseModel):
    agent_id: str
    status: str = "running"
    metrics: dict[str, Any] = {}


class HeartbeatOut(BaseModel):
    agent_id: str
    status: str
    last_heartbeat: float


# ── Session ──────────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: str
    project_id: str | None = None
    agent_id: str | None = None
    summary: str | None = None
    created_at: float | None = None
    updated_at: float | None = None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    task_id: str | None = None
    session_id: str | None = None
    from_agent: str | None = None
    to_agent: str | None = None
    msg_type: str = "text"
    payload: dict[str, Any] = {}
    schema_version: int = 1
    timestamp: float | None = None

    model_config = {"from_attributes": True}


# ── Health ───────────────────────────────────────────────────────────────────

class HealthComponent(BaseModel):
    database: str = "ok"
    redis: str = "unknown"
    celery: str = "unknown"
    chromadb: str = "unknown"


class HealthOut(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    components: HealthComponent


# ── Generic ──────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    request_id: str | None = None


class ListResponse(BaseModel):
    items: list[Any]
    total: int
