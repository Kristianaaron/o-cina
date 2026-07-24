"""Workflows CRUD + execution endpoints with real engine integration."""
import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.engine import workflow_engine
from app.models import Message, Task, Workflow, WorkflowEdge, WorkflowNode
from app.schemas import (
    MessageOut,
    TaskOut,
    WorkflowCreate,
    WorkflowExecute,
    WorkflowOut,
    WorkflowUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Workflow CRUD ───────────────────────────────────────────────────────────

@router.post("/workflows", status_code=201)
def create_workflow(wf: WorkflowCreate, db: Session = Depends(get_db)):
    """Create a workflow with nodes and edges."""
    db_wf = Workflow(
        name=wf.name,
        description=wf.description,
        guardrails=wf.guardrails,
        updated_at=time.time(),
    )
    db.add(db_wf)
    db.flush()

    # Store normalized nodes + edges
    for n in wf.nodes:
        db.add(WorkflowNode(
            workflow_id=db_wf.id,
            ref_id=n.ref_id,
            agent_id=n.agent_id,
            node_type=n.node_type,
            config=n.config,
        ))

    for e in wf.edges:
        db.add(WorkflowEdge(
            workflow_id=db_wf.id,
            source_ref=e.source_ref,
            target_ref=e.target_ref,
            label=e.label,
            data_rules=e.data_rules,
        ))

    db.commit()
    db.refresh(db_wf)
    return WorkflowOut.model_validate(db_wf)


@router.get("/workflows")
def list_workflows(db: Session = Depends(get_db)):
    wfs = db.query(Workflow).order_by(Workflow.updated_at.desc()).all()
    return {
        "workflows": [WorkflowOut.model_validate(w) for w in wfs],
        "total": len(wfs),
    }


@router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    nodes = db.query(WorkflowNode).filter(WorkflowNode.workflow_id == workflow_id).all()
    edges = db.query(WorkflowEdge).filter(WorkflowEdge.workflow_id == workflow_id).all()

    return {
        "workflow": WorkflowOut.model_validate(wf),
        "nodes": [
            {
                "id": n.id,
                "ref_id": n.ref_id,
                "agent_id": n.agent_id,
                "node_type": n.node_type,
                "config": n.config,
                "status": n.status,
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": e.id,
                "source_ref": e.source_ref,
                "target_ref": e.target_ref,
                "label": e.label,
                "data_rules": e.data_rules,
            }
            for e in edges
        ],
    }


@router.patch("/workflows/{workflow_id}")
def update_workflow(
    workflow_id: str,
    wf: WorkflowUpdate,
    db: Session = Depends(get_db),
):
    existing = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not existing:
        raise HTTPException(404, "Workflow not found")

    for field in ("name", "description", "guardrails"):
        value = getattr(wf, field, None)
        if value is not None:
            setattr(existing, field, value)
    existing.updated_at = time.time()

    # Replace graph pieces when provided (nodes and/or edges independently)
    if wf.nodes is not None:
        db.query(WorkflowNode).filter(WorkflowNode.workflow_id == workflow_id).delete()
        for n in wf.nodes:
            db.add(WorkflowNode(
                workflow_id=workflow_id,
                ref_id=n.ref_id,
                agent_id=n.agent_id,
                node_type=n.node_type,
                config=n.config,
            ))

    if wf.edges is not None:
        db.query(WorkflowEdge).filter(WorkflowEdge.workflow_id == workflow_id).delete()
        for e in wf.edges:
            db.add(WorkflowEdge(
                workflow_id=workflow_id,
                source_ref=e.source_ref,
                target_ref=e.target_ref,
                label=e.label,
                data_rules=e.data_rules,
            ))

    db.commit()
    db.refresh(existing)
    return WorkflowOut.model_validate(existing)


@router.delete("/workflows/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")
    # Cascade handles node/edge cleanup
    db.delete(wf)
    db.commit()


# ── DAG validation ─────────────────────────────────────────────────────────

@router.post("/workflows/{workflow_id}/validate")
def validate_workflow(workflow_id: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    try:
        workflow_engine.validate_dag(workflow_id, db)
        order = workflow_engine.topological_sort(workflow_id, db)
        return {
            "valid": True,
            "execution_order": order,
            "node_count": len(order),
        }
    except ValueError as ve:
        return {
            "valid": False,
            "error": str(ve),
        }


# ── Execution ───────────────────────────────────────────────────────────────

@router.post("/workflows/{workflow_id}/execute", status_code=202)
async def execute_workflow(
    workflow_id: str,
    body: WorkflowExecute = WorkflowExecute(),
    db: Session = Depends(get_db),
):
    """Start workflow execution. Creates a Task, validates DAG, launches async executor."""
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    # Validate
    try:
        workflow_engine.validate_dag(workflow_id, db)
    except ValueError as ve:
        raise HTTPException(422, f"Invalid workflow DAG: {ve}")

    # Create task
    task = workflow_engine.create_task(workflow_id, body.context, db)

    # Launch async executor in background
    asyncio.create_task(workflow_engine.execute_task(task.id))

    return {
        "task_id": task.id,
        "workflow_id": workflow_id,
        "status": "pending",
    }


@router.get("/workflows/{workflow_id}/tasks")
def list_tasks(workflow_id: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    tasks = (
        db.query(Task)
        .filter(Task.workflow_id == workflow_id)
        .order_by(Task.created_at.desc())
        .all()
    )
    return {
        "tasks": [TaskOut.model_validate(t) for t in tasks],
        "total": len(tasks),
    }


@router.get("/workflows/{workflow_id}/tasks/{task_id}")
def get_task_status(workflow_id: str, task_id: str, db: Session = Depends(get_db)):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    task = db.query(Task).filter(
        Task.id == task_id, Task.workflow_id == workflow_id
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")

    return workflow_engine.get_task_status(task_id, db)


@router.post("/workflows/{workflow_id}/tasks/{task_id}/stop", status_code=202)
def stop_task(
    workflow_id: str, task_id: str, db: Session = Depends(get_db)
):
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(404, "Workflow not found")

    if not workflow_engine.stop_task(task_id, db):
        raise HTTPException(404, "Task not found or already finished")

    return {"status": "cancelled", "task_id": task_id}


@router.post("/workflows/{workflow_id}/tasks/{task_id}/approve", status_code=200)
def approve_task(
    workflow_id: str, task_id: str, db: Session = Depends(get_db)
):
    """Approve a waiting approval gate, resuming workflow execution."""
    task = db.query(Task).filter(
        Task.id == task_id, Task.workflow_id == workflow_id
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")

    if task.status != "waiting_approval":
        raise HTTPException(400, f"Task is not waiting for approval (status: {task.status})")

    task.status = "approved"
    task.updated_at = time.time()

    # Reset current node status
    if task.current_node:
        node = db.query(WorkflowNode).filter(
            WorkflowNode.workflow_id == workflow_id,
            WorkflowNode.ref_id == task.current_node,
        ).first()
        if node:
            node.status = "approved"

    db.commit()
    return {"status": "approved", "task_id": task_id, "node": task.current_node}


# ── Messages ─────────────────────────────────────────────────────────────────

@router.get("/workflows/{workflow_id}/tasks/{task_id}/messages")
def get_task_messages(
    workflow_id: str, task_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(
        Task.id == task_id, Task.workflow_id == workflow_id
    ).first()
    if not task:
        raise HTTPException(404, "Task not found")

    messages = (
        db.query(Message)
        .filter(Message.task_id == task_id)
        .order_by(Message.timestamp.desc())
        .limit(limit)
        .all()
    )
    return {
        "messages": [MessageOut.model_validate(m) for m in messages],
        "total": len(messages),
    }


# ── Templates ────────────────────────────────────────────────────────────────

TEMPLATES = [
    {
        "name": "Sequential",
        "description": "Linear pipeline: A → B → C",
        "nodes": [
            {"ref_id": "step1", "node_type": "agent", "config": {}},
            {"ref_id": "step2", "node_type": "agent", "config": {}},
            {"ref_id": "step3", "node_type": "agent", "config": {}},
        ],
        "edges": [
            {"source_ref": "step1", "target_ref": "step2", "label": "pass_through"},
            {"source_ref": "step2", "target_ref": "step3", "label": "pass_through"},
        ],
        "guardrails": {"max_iterations": 10, "timeout_per_task": 1800},
    },
    {
        "name": "Build and Review",
        "description": "Build → Review → Approve → Deploy",
        "nodes": [
            {"ref_id": "build", "node_type": "agent", "config": {"prompt": "Build the feature"}},
            {"ref_id": "review", "node_type": "agent", "config": {"prompt": "Review the code"}},
            {"ref_id": "approve", "node_type": "approval", "config": {}},
            {"ref_id": "deploy", "node_type": "agent", "config": {"prompt": "Deploy to production"}},
        ],
        "edges": [
            {"source_ref": "build", "target_ref": "review", "label": "build_output"},
            {"source_ref": "review", "target_ref": "approve", "label": "review_result"},
            {"source_ref": "approve", "target_ref": "deploy", "label": "approved"},
        ],
        "guardrails": {
            "max_iterations": 5,
            "timeout_per_task": 3600,
            "approval_nodes": ["approve"],
        },
    },
    {
        "name": "Fan-out / Fan-in",
        "description": "Split work across parallel agents, then aggregate",
        "nodes": [
            {"ref_id": "split", "node_type": "agent", "config": {}},
            {"ref_id": "worker1", "node_type": "agent", "config": {}},
            {"ref_id": "worker2", "node_type": "agent", "config": {}},
            {"ref_id": "aggregate", "node_type": "agent", "config": {"prompt": "Aggregate results"}},
        ],
        "edges": [
            {"source_ref": "split", "target_ref": "worker1", "label": "part_a"},
            {"source_ref": "split", "target_ref": "worker2", "label": "part_b"},
            {"source_ref": "worker1", "target_ref": "aggregate", "label": "result_a"},
            {"source_ref": "worker2", "target_ref": "aggregate", "label": "result_b"},
        ],
        "guardrails": {"max_iterations": 10, "timeout_per_task": 1800},
    },
]


@router.get("/workflow-templates")
def list_templates():
    """Get workflow templates."""
    return {"templates": TEMPLATES}
