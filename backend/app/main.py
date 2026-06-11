"""O-cina — Open Officina Agent Command Center.

FastAPI application entry point.
"""
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.database import engine, Base, SessionLocal
from app.auth import get_current_user
from app.routers import agents, workflows, projects, prompt, events, heartbeat, memory, sessions

# Auto-register all adapters on startup
from app import adapters  # noqa: F401 — triggers adapter registration
from app.engine import process_manager
from app.engine.discovery import DiscoveryScanner
from app.models import Agent, AgentStatus

# ── Config ──────────────────────────────────────────────────────────────────

HOST = os.getenv("OC_HOST", "127.0.0.1")
PORT = int(os.getenv("OC_PORT", "8002"))
VERSION = "0.1.0"

# Global process manager (imported from app.engine singleton)
# See: app/engine/__init__.py

# ── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging
    log = logging.getLogger(__name__)

    # Startup: create tables if not using Alembic (dev mode)
    if not os.getenv("ALEMBIC_MODE", "true"):
        Base.metadata.create_all(bind=engine)
        # Seed default admin user
        db = SessionLocal()
        from app.models import User, UserRole
        if not db.query(User).filter_by(name="admin").first():
            admin = User(name="admin", role=UserRole.admin)
            db.add(admin)
            db.commit()
        db.close()

    # Recover processes from previous session
    db = SessionLocal()
    try:
        all_agents = db.query(Agent).all()
        dead = process_manager.recover_from_db(all_agents)
        for agent_id in dead:
            agent = db.query(Agent).filter(Agent.id == agent_id).first()
            if agent:
                agent.status = AgentStatus.offline
                agent.pid = None
                agent.pgid = None
                agent.process_started_at = None
        if dead:
            db.commit()
            log.info("Recovered processes: %d dead agents marked offline", len(dead))
    except Exception:
        log.exception("Process recovery failed")
    finally:
        db.close()

    # Auto-discover available harnesses on startup
    try:
        scanner = DiscoveryScanner()
        discovered = scanner.scan()
        if discovered:
            log.info("Discovered %d harness(es): %s", len(discovered), [d["harness"] for d in discovered])
    except Exception:
        log.exception("Auto-discovery failed")

    yield

    # Shutdown: kill all managed processes
    try:
        killed = process_manager.cleanup_all()
        log.info("Shutdown: killed %d agent processes", killed)
    except Exception:
        log.exception("Shutdown cleanup failed")


# ── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="O-cina Agent Command Center",
    version=VERSION,
    lifespan=lifespan,
    dependencies=[Depends(get_current_user)],
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request ID middleware ───────────────────────────────────────────────────

import uuid

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request.state.request_id = str(uuid.uuid4())
    response = await call_next(request)
    return response


# ── Global error handler ────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "detail": str(exc),
            "request_id": getattr(request.state, "request_id", "unknown"),
        },
    )


# ── Health check ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    components = {"database": "ok", "redis": "unknown", "celery": "unknown", "chromadb": "unknown"}
    from app.memory_store import memory_store
    components["chromadb"] = memory_store.health_check()
    # Quick DB check
    try:
        db = SessionLocal()
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        db.close()
        components["database"] = "ok"
    except Exception as e:
        components["database"] = f"error: {e}"

    # Redis check
    try:
        import redis
        from urllib.parse import urlparse
        redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
        parsed = urlparse(redis_url)
        r = redis.Redis(
            host=parsed.hostname or "127.0.0.1",
            port=parsed.port or 6379,
            password=parsed.password or None,
            socket_timeout=2,
        )
        if r.ping():
            components["redis"] = "ok"
        else:
            components["redis"] = "error: ping failed"
        r.close()
    except Exception as e:
        components["redis"] = f"error: {e}"

    # Celery check — inspect active workers via Redis
    try:
        from app.celery_app import celery_app
        insp = celery_app.control.inspect(timeout=2)
        active = insp.active()
        if active:
            components["celery"] = "ok"
        else:
            components["celery"] = "error: no workers"
    except Exception as e:
        components["celery"] = f"error: {e}"

    return {
        "status": "ok",
        "version": VERSION,
        "components": components,
    }


# ── Discovery ────────────────────────────────────────────────────────────────

@app.post("/api/v1/discovery/run", tags=["discovery"])
async def run_discovery():
    """Trigger agent harness auto-discovery."""
    scanner = DiscoveryScanner()
    results = scanner.scan()
    return {"found": len(results), "results": results}


# ── Register routers ────────────────────────────────────────────────────────

app.include_router(agents.router, prefix="/api/v1", tags=["agents"])
app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
app.include_router(projects.router, prefix="/api/v1", tags=["projects"])
app.include_router(memory.router, prefix="/api/v1", tags=["memory"])
app.include_router(sessions.router, prefix="/api/v1", tags=["sessions"])
app.include_router(prompt.router, prefix="/api/v1", tags=["prompt"])
app.include_router(events.router, prefix="/api/v1", tags=["events"])
app.include_router(heartbeat.router, prefix="/api/v1", tags=["heartbeat"])


# ── Mount static files (frontend build output) ──────────────────────────────

STATIC_DIR = Path(__file__).parent.parent / "static"
if STATIC_DIR.exists():
    # Mount at /app to avoid catching API routes
    app.mount("/app", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


# ── Catch-all for SPA routing ──────────────────────────────────────────────


@app.get("/{catchall:path}")
async def spa_fallback(catchall: str):
    """Serve index.html for SPA routes; return JSON 404 for unknown API paths."""
    from fastapi.responses import FileResponse
    if catchall.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse({"detail": "Not Found"}, status_code=404)
