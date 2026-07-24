"""Tasks CRUD + status polling endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task, Message

router = APIRouter()


class TaskOut(BaseModel):
    id: str
    workflow_id: str | None = None
    status: str
    current_node: str | None = None
    assigned_agent_id: str | None = None
    context: dict = {}
    result: dict | None = None
    error: str | None = None
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
    payload: dict = {}
    timestamp: float | None = None

    model_config = {"from_attributes": True}


@router.get("/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    """Get task status and details."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")

    out = TaskOut.model_validate(task)
    # Expose error from context if present
    if task.context and "error" in task.context:
        out.error = task.context["error"]
    return out


@router.get("/tasks/{task_id}/messages")
def get_task_messages(
    task_id: str,
    role: str | None = Query(None, description="Filter by role: 'user' or 'assistant'"),
    db: Session = Depends(get_db),
):
    """Get messages for a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")

    q = db.query(Message).filter(Message.task_id == task_id)

    if role == "user":
        q = q.filter(Message.msg_type == "prompt")
    elif role == "assistant":
        q = q.filter(Message.msg_type.in_(["response", "completion", "result"]))

    messages = q.order_by(Message.timestamp.asc()).all()
    return [MessageOut.model_validate(m) for m in messages]


@router.get("/tasks")
def list_tasks(
    agent_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List tasks with optional filters."""
    q = db.query(Task)
    if agent_id:
        q = q.filter(Task.assigned_agent_id == agent_id)
    if status:
        q = q.filter(Task.status == status)
    total = q.count()
    tasks = q.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "tasks": [TaskOut.model_validate(t) for t in tasks],
        "total": total,
    }
