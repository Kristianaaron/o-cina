"""Direct agent prompting + streaming endpoints."""
import uuid
import time
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task, Message, Session as DBSession, Agent

router = APIRouter()


class PromptRequest(BaseModel):
    agent_id: str
    prompt: str
    context: dict = {}
    session_id: Optional[str] = None


@router.post("/prompt", status_code=202)
def prompt_agent(req: PromptRequest, db: Session = Depends(get_db)):
    """Send a prompt to an agent. Creates a task + message, returns task_id."""
    agent = db.query(Agent).filter(Agent.id == req.agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Create or reuse session
    if req.session_id:
        sess = db.query(DBSession).filter(DBSession.id == req.session_id).first()
    else:
        sess = DBSession(agent_id=req.agent_id)
        db.add(sess)
        db.flush()

    # Create task for the prompt
    task = Task(
        status="pending",
        context={"prompt": req.prompt, **req.context},
        assigned_agent_id=req.agent_id,
    )
    db.add(task)
    db.flush()

    # Store the prompt message
    msg = Message(
        task_id=task.id,
        session_id=sess.id,
        from_agent=req.agent_id,
        msg_type="prompt",
        payload={"text": req.prompt, "context": req.context},
    )
    db.add(msg)
    db.commit()

    return {"task_id": task.id, "status": "pending", "session_id": sess.id}


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
