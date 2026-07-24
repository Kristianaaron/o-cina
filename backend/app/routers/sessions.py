"""Session management endpoints."""
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import String
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Session as SessionModel, Message, Project, Agent

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    project_id: str = Field(..., description="Project to associate with")
    agent_id: Optional[str] = Field(None, description="Agent running this session")
    summary: Optional[str] = Field(None, description="Session summary/title")


class SessionUpdate(BaseModel):
    summary: Optional[str] = None


class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, description="Message content")
    agent_id: Optional[str] = Field(None, description="Sending agent ID")
    msg_type: str = Field(default="text", description="Message type: text, tool, result, error")


class SessionOut(BaseModel):
    id: str
    project_id: Optional[str] = None
    agent_id: Optional[str] = None
    summary: Optional[str] = None
    message_count: int = 0
    created_at: float
    updated_at: Optional[float] = None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    session_id: Optional[str] = None
    from_agent: Optional[str] = None
    to_agent: Optional[str] = None
    msg_type: str = "text"
    payload: dict = {}
    timestamp: float
    agent_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/sessions", status_code=201)
def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    """Create a new session within a project."""
    proj = db.query(Project).filter(Project.id == body.project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    ts = time.time()
    session = SessionModel(
        id=str(uuid.uuid4()),
        project_id=body.project_id,
        agent_id=body.agent_id,
        summary=body.summary,
        created_at=ts,
        updated_at=ts,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return SessionOut(
        id=session.id,
        project_id=session.project_id,
        agent_id=session.agent_id,
        summary=session.summary,
        message_count=0,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("/projects/{project_id}/sessions")
def list_sessions(
    project_id: str,
    agent_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List sessions for a project."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    # Eager-load message counts via correlated subquery (fixes N+1)
    from sqlalchemy import func as sa_func
    count_subq = (
        db.query(sa_func.count(Message.id))
        .filter(Message.session_id == SessionModel.id)
        .correlate(SessionModel)
        .scalar_subquery()
    )
    q = db.query(SessionModel, count_subq.label("msg_count"))
    q = q.filter(SessionModel.project_id == project_id)
    if agent_id:
        q = q.filter(SessionModel.agent_id == agent_id)
    q = q.order_by(SessionModel.created_at.desc()).offset(offset).limit(limit)
    rows = q.all()

    results = []
    for s, msg_count in rows:
        results.append(SessionOut(
            id=s.id,
            project_id=s.project_id,
            agent_id=s.agent_id,
            summary=s.summary,
            message_count=msg_count,
            created_at=s.created_at,
            updated_at=s.updated_at,
        ))

    return {"sessions": results, "total": len(results)}


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    """Get session details with message count."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    msg_count = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .count()
    )

    return SessionOut(
        id=session.id,
        project_id=session.project_id,
        agent_id=session.agent_id,
        summary=session.summary,
        message_count=msg_count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.patch("/sessions/{session_id}")
def update_session(session_id: str, body: SessionUpdate, db: Session = Depends(get_db)):
    """Update session summary."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    if body.summary is not None:
        session.summary = body.summary
    session.updated_at = time.time()
    db.commit()
    db.refresh(session)

    msg_count = db.query(Message).filter(Message.session_id == session_id).count()
    return SessionOut(
        id=session.id,
        project_id=session.project_id,
        agent_id=session.agent_id,
        summary=session.summary,
        message_count=msg_count,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a session and its messages."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Delete associated messages first
    db.query(Message).filter(Message.session_id == session_id).delete()
    db.delete(session)
    db.commit()


@router.post("/sessions/{session_id}/messages", status_code=201)
def add_message(session_id: str, body: MessageCreate, db: Session = Depends(get_db)):
    """Add a message to a session."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Verify agent exists if provided
    if body.agent_id:
        agent = db.query(Agent).filter(Agent.id == body.agent_id).first()
        if not agent:
            raise HTTPException(404, "Agent not found")

    msg = Message(
        id=str(uuid.uuid4()),
        session_id=session_id,
        from_agent=body.agent_id,
        msg_type=body.msg_type,
        payload={"content": body.content},
        timestamp=time.time(),
    )
    db.add(msg)

    session.updated_at = time.time()
    db.commit()
    db.refresh(msg)

    return MessageOut(
        id=msg.id,
        session_id=msg.session_id,
        from_agent=msg.from_agent,
        to_agent=msg.to_agent,
        msg_type=msg.msg_type,
        payload=msg.payload,
        timestamp=msg.timestamp,
    )


@router.get("/sessions/{session_id}/messages")
def list_messages(
    session_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List messages in a session (chronological)."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.timestamp.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Build agent name lookup (eager-load, avoids N+1)
    agent_ids = {m.from_agent for m in messages if m.from_agent}
    agent_names = {}
    if agent_ids:
        agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all()
        agent_names = {a.id: a.name for a in agents}

    results = []
    for m in messages:
        results.append(MessageOut(
            id=m.id,
            session_id=m.session_id,
            from_agent=m.from_agent,
            to_agent=m.to_agent,
            msg_type=m.msg_type,
            payload=m.payload,
            timestamp=m.timestamp,
            agent_name=agent_names.get(m.from_agent) if m.from_agent else None,
        ))

    return {"messages": results, "total": len(results)}


@router.get("/search/sessions")
def search_sessions(
    project_id: str = Query(..., description="Search within a project"),
    q: str = Query(..., description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search sessions by summary and messages by content (text search)."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    # Search sessions by summary
    sessions = (
        db.query(SessionModel)
        .filter(
            SessionModel.project_id == project_id,
            SessionModel.summary.ilike(f"%{q}%")
        )
        .order_by(SessionModel.updated_at.desc())
        .limit(limit)
        .all()
    )

    # Search messages by content
    messages = (
        db.query(Message)
        .join(SessionModel, Message.session_id == SessionModel.id)
        .filter(
            SessionModel.project_id == project_id,
            Message.payload.cast(String).ilike(f"%{q}%")
        )
        .order_by(Message.timestamp.desc())
        .limit(limit)
        .all()
    )

    session_results = []
    for s in sessions:
        msg_count = db.query(Message).filter(Message.session_id == s.id).count()
        session_results.append({
            "id": s.id,
            "summary": s.summary,
            "message_count": msg_count,
            "created_at": s.created_at,
            "type": "session",
        })

    message_results = []
    for m in messages:
        message_results.append({
            "id": m.id,
            "session_id": m.session_id,
            "msg_type": m.msg_type,
            "payload": m.payload,
            "timestamp": m.timestamp,
            "from_agent": m.from_agent,
            "kind": "message",
        })

    return {
        "query": q,
        "sessions": session_results,
        "messages": message_results,
    }
