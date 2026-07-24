"""Agents CRUD + lifecycle endpoints.

Real process management via ProcessManager + adapter framework.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.adapters.base import get_adapter, list_adapters
from app.database import get_db
from app.engine import process_manager
from app.models import Agent, AgentStatus
from app.schemas import AgentCreate, AgentOut, AgentUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Adapter schema (not duplicated in schemas.py) ────────────────────────────

class AdapterOut(BaseModel):
    harness_type: str
    available: bool


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/agents/register", status_code=201)
def register_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    """Register an agent. Optionally auto-fills metadata from adapter."""
    adapter = get_adapter(agent.harness)
    db_kwargs = agent.model_dump()

    if adapter:
        info = adapter.register_info(agent.config)
        for key, value in info.items():
            if key in db_kwargs and db_kwargs[key] is None:
                db_kwargs[key] = value

    db_agent = Agent(**db_kwargs)
    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)
    return AgentOut.model_validate(db_agent)


@router.get("/agents")
def list_agents(
    status: str | None = Query(None),
    harness: str | None = Query(None),
    skill: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Agent)
    if status:
        q = q.filter(Agent.status == status)
    if harness:
        q = q.filter(Agent.harness == harness)
    if skill:
        q = q.filter(Agent.skills.contains([skill]))
    if search:
        q = q.filter(Agent.name.ilike(f"%{search}%"))
    total = q.count()
    agents = q.order_by(Agent.created_at.desc()).offset(offset).limit(limit).all()
    return {"agents": [AgentOut.model_validate(a) for a in agents], "total": total}


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")
    return AgentOut.model_validate(agent)


@router.patch("/agents/{agent_id}")
def update_agent(agent_id: str, updates: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")
    for field, value in updates.model_dump(exclude_none=True).items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return AgentOut.model_validate(agent)


@router.delete("/agents/{agent_id}", status_code=204)
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    """Delete an agent. Stops it first if running."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Stop process if running
    process_manager.stop(agent_id, timeout=5)

    db.delete(agent)
    db.commit()


@router.post("/agents/{agent_id}/start", status_code=202)
def start_agent(agent_id: str, db: Session = Depends(get_db)):
    """Start an agent process using its harness adapter."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    if agent.status in (AgentStatus.running, AgentStatus.starting):
        raise HTTPException(409, f"Agent already {agent.status}")

    # Get adapter for this harness type
    adapter = get_adapter(agent.harness)
    if not adapter:
        raise HTTPException(400, f"No adapter for harness type '{agent.harness}'. Available: {list_adapters()}")

    # Build command from adapter
    try:
        command = adapter.build_command(agent.config or {})
    except RuntimeError as e:
        raise HTTPException(400, str(e))

    # Get resource limits
    limits = adapter.resource_limits(agent.config or {})
    cpu_limit = limits.get("cpu_seconds")
    memory_limit = limits.get("memory_bytes")

    # Merge explicit resource limits from agent config
    if agent.resource_limits:
        cpu_limit = agent.resource_limits.get("cpu_seconds", cpu_limit)
        memory_limit = agent.resource_limits.get("memory_bytes", memory_limit)

    # Set status to starting
    agent.status = AgentStatus.starting
    db.commit()

    try:
        # Spawn the process
        handle = process_manager.spawn(
            agent_id=agent_id,
            command=command,
            cwd=adapter.build_cwd(agent.config or {}),
            env=adapter.build_env(agent.config or {}),
            cpu_limit=cpu_limit,
            memory_limit=memory_limit,
        )

        # Update DB with process info
        agent.pid = handle.pid
        agent.pgid = handle.pgid
        agent.process_started_at = handle.started_at
        agent.status = AgentStatus.running
        db.commit()

        try:
            from app.routers.events import emit_event
            emit_event("agent.status", {
                "agent_id": agent_id,
                "status": "running",
                "pid": handle.pid,
            })
        except Exception:
            pass

        return {
            "status": "running",
            "agent_id": agent_id,
            "pid": handle.pid,
            "pgid": handle.pgid,
        }
    except Exception as e:
        agent.status = AgentStatus.error
        db.commit()
        logger.error("Failed to start agent %s: %s", agent_id, e)
        raise HTTPException(500, f"Failed to start agent: {e}")


@router.post("/agents/{agent_id}/stop", status_code=202)
def stop_agent(agent_id: str, force: bool = Query(False), db: Session = Depends(get_db)):
    """Stop an agent process (SIGTERM, or SIGKILL if force=True)."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    if agent.status == AgentStatus.stopped:
        return {"status": "already_stopped", "agent_id": agent_id}

    agent.status = AgentStatus.stopping
    db.commit()

    try:
        success = process_manager.stop(agent_id, timeout=10, force=force)
        agent.status = AgentStatus.stopped
        agent.pid = None
        agent.pgid = None
        agent.process_started_at = None
        db.commit()

        try:
            from app.routers.events import emit_event
            emit_event("agent.status", {"agent_id": agent_id, "status": "stopped"})
        except Exception:
            pass

        return {"status": "stopped", "agent_id": agent_id, "killed": success}
    except Exception as e:
        agent.status = AgentStatus.error
        db.commit()
        raise HTTPException(500, f"Failed to stop agent: {e}")


@router.post("/agents/{agent_id}/restart", status_code=202)
def restart_agent(agent_id: str, db: Session = Depends(get_db)):
    """Restart an agent process."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Stop first
    process_manager.stop(agent_id, timeout=10, force=False)

    # Then start (reuse start logic)
    adapter = get_adapter(agent.harness)
    if not adapter:
        raise HTTPException(400, f"No adapter for harness type '{agent.harness}'")

    agent.status = AgentStatus.starting
    db.commit()

    try:
        command = adapter.build_command(agent.config or {})
        limits = adapter.resource_limits(agent.config or {})
        cpu_limit = limits.get("cpu_seconds")
        memory_limit = limits.get("memory_bytes")

        if agent.resource_limits:
            cpu_limit = agent.resource_limits.get("cpu_seconds", cpu_limit)
            memory_limit = agent.resource_limits.get("memory_bytes", memory_limit)

        handle = process_manager.spawn(
            agent_id=agent_id,
            command=command,
            cwd=adapter.build_cwd(agent.config or {}),
            env=adapter.build_env(agent.config or {}),
            cpu_limit=cpu_limit,
            memory_limit=memory_limit,
        )

        agent.pid = handle.pid
        agent.pgid = handle.pgid
        agent.process_started_at = handle.started_at
        agent.status = AgentStatus.running
        db.commit()

        return {
            "status": "running",
            "agent_id": agent_id,
            "pid": handle.pid,
        }
    except Exception as e:
        agent.status = AgentStatus.error
        db.commit()
        raise HTTPException(500, f"Failed to restart agent: {e}")


@router.get("/agents/{agent_id}/logs")
def get_agent_logs(
    agent_id: str,
    lines: int = Query(100, ge=1, le=5000),
):
    """Read tail of agent log file."""
    log_content = process_manager.read_log(agent_id, lines=lines)
    return {"agent_id": agent_id, "lines": lines, "log": log_content}


@router.get("/agents/{agent_id}/metrics")
def get_agent_metrics(agent_id: str, db: Session = Depends(get_db)):
    """Get real-time resource metrics for a running agent."""
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    metrics = process_manager.metrics(agent_id)
    if not metrics:
        return {"agent_id": agent_id, "running": False}

    return {"agent_id": agent_id, "running": True, "metrics": metrics}


@router.get("/adapters")
def list_available_adapters():
    """List all available adapter types."""
    return {"adapters": [{"harness_type": h, "available": True} for h in list_adapters()]}
