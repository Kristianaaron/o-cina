"""Agent heartbeat endpoint."""
import time
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Agent, AgentStatus

router = APIRouter()


class HeartbeatRequest(BaseModel):
    agent_id: str
    status: str = "running"
    metrics: dict = {}


@router.post("/heartbeat")
def heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db)):
    """Agents POST this regularly (every 15s). Backend tracks last_heartbeat."""
    agent = db.query(Agent).filter(Agent.id == req.agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    agent.last_heartbeat = time.time()
    if req.status:
        try:
            agent.status = AgentStatus(req.status)
        except ValueError:
            pass  # ignore unknown statuses
    db.commit()

    return {"status": "ok", "agent_id": req.agent_id}
