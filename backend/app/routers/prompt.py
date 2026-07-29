"""Direct agent prompting + streaming endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.memory_context import attach_memory_context
from app.memory_store import memory_store
from app.models import Agent, Message, Project, Task
from app.models import Session as DBSession

router = APIRouter()


class PromptRequest(BaseModel):
    agent_id: str
    prompt: str
    context: dict = {}
    session_id: str | None = None
    project_id: str | None = Field(
        default=None,
        description="Project whose shared memory bank to inject (Claude-style tags)",
    )
    memory_top_k: int = Field(default=5, ge=0, le=20)
    memory_tags: list[str] | None = None


def _resolve_project_id(req: PromptRequest, sess: DBSession | None, agent: Agent, db: Session) -> str | None:
    """Prefer explicit project, then session, then unique project membership."""
    if req.project_id:
        return req.project_id
    if sess and sess.project_id:
        return sess.project_id
    # Soft membership: agent listed on exactly one project
    matches = []
    for p in db.query(Project).all():
        ids = p.agent_ids or []
        if agent.id in ids:
            matches.append(p.id)
            if len(matches) > 1:
                break
    if len(matches) == 1:
        return matches[0]
    return None


@router.post("/prompt", status_code=202)
def prompt_agent(req: PromptRequest, db: Session = Depends(get_db)):
    """Send a prompt to an agent. Creates a task + message, returns task_id.

    When a project is linked, relevant memories from that project's memory bank
    are retrieved and wrapped in Claude-style <memory_bank>/<memory> tags so the
    agent has cross-chat shared context.
    """
    agent = db.query(Agent).filter(Agent.id == req.agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Create or reuse session
    if req.session_id:
        sess = db.query(DBSession).filter(DBSession.id == req.session_id).first()
        if not sess:
            raise HTTPException(404, "Session not found")
    else:
        sess = DBSession(agent_id=req.agent_id)
        db.add(sess)
        db.flush()

    project_id = _resolve_project_id(req, sess, agent, db)
    project = None
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(404, "Project not found")
        # Keep session scoped to the shared bank
        if not sess.project_id:
            sess.project_id = project_id

    memory_pack = {
        "memories": [],
        "memory_block": "",
        "augmented_prompt": req.prompt,
        "memory_count": 0,
    }
    if project_id and req.memory_top_k > 0:
        memory_pack = attach_memory_context(
            memory_store=memory_store,
            project_id=project_id,
            prompt=req.prompt,
            project_name=project.name if project else None,
            top_k=req.memory_top_k,
            tags=req.memory_tags,
        )

    task_context = {
        "prompt": req.prompt,
        "augmented_prompt": memory_pack["augmented_prompt"],
        "project_id": project_id,
        "memory_count": memory_pack["memory_count"],
        "memory_ids": [m.get("id") for m in memory_pack["memories"]],
        **req.context,
    }

    task = Task(
        status="pending",
        context=task_context,
        assigned_agent_id=req.agent_id,
    )
    db.add(task)
    db.flush()

    msg = Message(
        task_id=task.id,
        session_id=sess.id,
        from_agent=req.agent_id,
        msg_type="prompt",
        payload={
            "text": req.prompt,
            "augmented_text": memory_pack["augmented_prompt"],
            "context": req.context,
            "project_id": project_id,
            "memory_bank": memory_pack["memory_block"] or None,
            "memory_count": memory_pack["memory_count"],
            "memories": [
                {
                    "id": m.get("id"),
                    "score": m.get("score"),
                    "source": (m.get("metadata") or {}).get("source"),
                    "preview": (m.get("content") or "")[:160],
                }
                for m in memory_pack["memories"]
            ],
        },
    )
    db.add(msg)
    db.commit()

    return {
        "task_id": task.id,
        "status": "pending",
        "session_id": sess.id,
        "project_id": project_id,
        "memory_count": memory_pack["memory_count"],
        "memories": msg.payload.get("memories") or [],
    }


@router.get("/prompt/{task_id}/stream")
def stream_response(task_id: str, db: Session = Depends(get_db)):
    """SSE stream for prompt responses."""
    async def event_generator():
        last_ts = 0.0
        while True:
            msg = db.query(Message).filter(
                Message.task_id == task_id,
                Message.timestamp > last_ts,
            ).order_by(Message.timestamp).first()
            if msg:
                yield f"data: {msg.payload}\n\n"
                last_ts = msg.timestamp
                task = db.query(Task).filter(Task.id == task_id).first()
                if task and task.status in ("complete", "failed"):
                    yield f"data: {{\"done\": true, \"status\": \"{task.status}\"}}\n\n"
                    break
            import asyncio
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/prompt/{task_id}")
def get_prompt_result(task_id: str, db: Session = Depends(get_db)):
    """Get completed prompt result (non-streaming)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    messages = db.query(Message).filter(Message.task_id == task_id).all()
    return {
        "task_id": task.id,
        "status": task.status,
        "result": task.result,
        "messages": [
            {"id": m.id, "type": m.msg_type, "payload": m.payload, "timestamp": m.timestamp}
            for m in messages
        ],
    }
