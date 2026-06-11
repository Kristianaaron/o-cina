"""SSE event stream for real-time updates."""
import asyncio
import json
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory event bus — stores asyncio.Queue for each connected client
_event_queues: dict[int, asyncio.Queue] = {}


@router.get("/events")
async def events_stream(last_event_id: str = ""):
    """SSE endpoint — agent status changes, workflow progress, system alerts."""
    queue: asyncio.Queue = asyncio.Queue()
    listener_id = id(queue)
    _event_queues[listener_id] = queue

    async def event_generator():
        try:
            # Initial ping
            yield f"event: connected\ndata: {json.dumps({'message': 'connected'})}\n\n"
            while True:
                message = await asyncio.wait_for(queue.get(), timeout=30)
                yield message
        except asyncio.TimeoutError:
            # Send keepalive comment every 30s
            yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _event_queues.pop(listener_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def emit_event(event_type: str, data: dict):
    """Broadcast event to all connected SSE clients."""
    message = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    dead = []
    for lid, queue in _event_queues.items():
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            dead.append(lid)
            logger.warning("SSE queue full for listener %d, dropping", lid)
    for lid in dead:
        _event_queues.pop(lid, None)
