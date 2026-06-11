"""SQLAlchemy ORM models matching the Alembic migration schema.

Consolidated from dual model files (models.py + models/__init__.py).
Uses modern Mapped/mapped_column style with cascades and proper relationships.
"""
import enum
import time
import uuid
from sqlalchemy import String, Text, Float, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def _now_timestamp() -> float:
    return time.time()


def _uuid() -> str:
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    admin = "admin"
    operator = "operator"
    viewer = "viewer"


class AgentStatus(str, enum.Enum):
    registered = "registered"
    starting = "starting"
    running = "running"
    stopping = "stopping"
    stopped = "stopped"
    error = "error"
    offline = "offline"


class NodeType(str, enum.Enum):
    agent = "agent"
    approval = "approval"
    decision = "decision"
    subflow = "subflow"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    harness: Mapped[str] = mapped_column(String(100), index=True)
    model: Mapped[str | None] = mapped_column(String(255))
    provider: Mapped[str | None] = mapped_column(String(100))
    skills: Mapped[list] = mapped_column(JSON, server_default="[]")
    status: Mapped[str] = mapped_column(String(50), server_default="registered", index=True)
    endpoint: Mapped[str | None] = mapped_column(String(500))
    config: Mapped[dict] = mapped_column(JSON, server_default="{}")
    last_heartbeat: Mapped[float | None] = mapped_column(Float)
    pid: Mapped[int | None] = mapped_column(Integer)
    pgid: Mapped[int | None] = mapped_column(Integer)
    process_started_at: Mapped[float | None] = mapped_column(Float)
    sandboxed: Mapped[bool] = mapped_column(Boolean, server_default="false")
    sandbox_config: Mapped[dict | None] = mapped_column(JSON)
    resource_limits: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)

    # Relationships
    workflow_nodes = relationship("WorkflowNode", back_populates="agent")
    tasks = relationship("Task", back_populates="assigned_agent")
    messages_sent = relationship("Message", foreign_keys="Message.from_agent")
    messages_received = relationship("Message", foreign_keys="Message.to_agent")
    sessions = relationship("Session", back_populates="agent")


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    graph: Mapped[dict | None] = mapped_column(JSON)
    guardrails: Mapped[dict] = mapped_column(JSON, server_default="{}")
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)
    updated_at: Mapped[float | None] = mapped_column(Float, onupdate=_now_timestamp)

    # Relationships
    nodes = relationship("WorkflowNode", back_populates="workflow", cascade="all, delete-orphan")
    edges = relationship("WorkflowEdge", back_populates="workflow", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="workflow")
    projects = relationship("Project", back_populates="workflow")


class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflows.id"))
    ref_id: Mapped[str] = mapped_column(String(50))
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    node_type: Mapped[str] = mapped_column(String(50), server_default="agent")
    config: Mapped[dict] = mapped_column(JSON, server_default="{}")
    status: Mapped[str] = mapped_column(String(50), server_default="pending")
    retry_count: Mapped[int] = mapped_column(Integer, server_default="0")

    # Relationships
    workflow = relationship("Workflow", back_populates="nodes")
    agent = relationship("Agent", back_populates="workflow_nodes")


class WorkflowEdge(Base):
    __tablename__ = "workflow_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflows.id"))
    source_ref: Mapped[str] = mapped_column(String(50))
    target_ref: Mapped[str] = mapped_column(String(50))
    label: Mapped[str | None] = mapped_column(String(255))
    data_rules: Mapped[dict] = mapped_column(JSON, server_default="{}")

    # Relationships
    workflow = relationship("Workflow", back_populates="edges")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    workflow_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflows.id"))
    status: Mapped[str] = mapped_column(String(50), server_default="pending", index=True)
    current_node: Mapped[str | None] = mapped_column(String(50))
    assigned_agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    context: Mapped[dict] = mapped_column(JSON, server_default="{}")
    result: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)
    updated_at: Mapped[float | None] = mapped_column(Float, onupdate=_now_timestamp)

    # Relationships
    workflow = relationship("Workflow", back_populates="tasks")
    assigned_agent = relationship("Agent", back_populates="tasks")
    messages = relationship("Message", back_populates="task")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, server_default="[]")
    agent_ids: Mapped[list] = mapped_column(JSON, server_default="[]")
    workflow_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("workflows.id"))
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)
    updated_at: Mapped[float | None] = mapped_column(Float, onupdate=_now_timestamp)

    # Relationships
    workflow = relationship("Workflow", back_populates="projects")
    sessions = relationship("Session", back_populates="project")
    memory_entries = relationship("MemoryEntry", back_populates="project", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("projects.id"))
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)
    updated_at: Mapped[float | None] = mapped_column(Float, onupdate=_now_timestamp)

    # Relationships
    project = relationship("Project", back_populates="sessions")
    agent = relationship("Agent", back_populates="sessions")
    messages = relationship("Message", back_populates="session")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    task_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tasks.id"))
    session_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("sessions.id"))
    from_agent: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    to_agent: Mapped[str | None] = mapped_column(String(36), ForeignKey("agents.id"))
    msg_type: Mapped[str] = mapped_column("type", String(100), server_default="text")
    payload: Mapped[dict] = mapped_column(JSON, server_default="{}")
    schema_version: Mapped[int] = mapped_column(Integer, server_default="1")
    timestamp: Mapped[float | None] = mapped_column(Float, default=_now_timestamp, index=True)

    # Relationships
    task = relationship("Task", back_populates="messages")
    session = relationship("Session", back_populates="messages")


class MemoryEntry(Base):
    __tablename__ = "memory_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), index=True)
    chroma_id: Mapped[str] = mapped_column(String(100), index=True)  # ChromaDB document ID
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(50), server_default="user", index=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, server_default="{}")
    tags: Mapped[list] = mapped_column(JSON, server_default="[]")
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)
    updated_at: Mapped[float | None] = mapped_column(Float, onupdate=_now_timestamp)

    # Relationships
    project = relationship("Project", back_populates="memory_entries")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), server_default="admin")
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)

    # Relationships
    api_keys = relationship("ApiKey", back_populates="user")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    key_hash: Mapped[str] = mapped_column(String(64))
    prefix: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)
    last_used: Mapped[float | None] = mapped_column(Float)
    revoked: Mapped[bool] = mapped_column(Boolean, server_default="false")

    # Relationships
    user = relationship("User", back_populates="api_keys")


class Adapter(Base):
    __tablename__ = "adapters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    module_path: Mapped[str] = mapped_column(String(500))
    version: Mapped[str] = mapped_column(String(50), server_default="0.1.0")
    config_schema: Mapped[dict] = mapped_column(JSON, server_default="{}")
    created_at: Mapped[float | None] = mapped_column(Float, default=_now_timestamp)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    timestamp: Mapped[float | None] = mapped_column(Float, default=_now_timestamp, index=True)
    user_id: Mapped[str | None] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(100), index=True)
    target_type: Mapped[str | None] = mapped_column(String(100))
    target_id: Mapped[str | None] = mapped_column(String(36))
    result: Mapped[str] = mapped_column(String(50), server_default="success")
    detail: Mapped[dict | None] = mapped_column(JSON)
