"""Shared agent PTY hub — one session per agent, many clients.

Connect:  ws://host/api/v1/agents/{agent_id}/terminal
Inject:   POST /api/v1/agents/{agent_id}/terminal/input
            {"text":"hello","submit":true}

The prompt GUI and terminal panes share the same PTY so GUI input mirrors
in the pane. When a harness adapter is available (e.g. hermes), the session
launches that CLI inside the PTY instead of a bare shell.
"""

from __future__ import annotations

import asyncio
import fcntl
import logging
import os
import pty
import pwd
import signal
import struct
import termios
from collections import deque
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent

log = logging.getLogger(__name__)

router = APIRouter()

SCROLLBACK_CHARS = 80_000


def _set_nonblocking(fd: int) -> None:
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def _spawn_pty(
    agent_id: str,
    *,
    workdir: str | None = None,
    command: list[str] | None = None,
    env_extra: dict[str, str] | None = None,
) -> tuple[int, int]:
    """Spawn a PTY. Prefer harness command when provided; else a login shell."""
    shell = os.environ.get("SHELL", "/bin/bash")
    if not os.path.isfile(shell):
        shell = "/bin/bash"

    try:
        user_info = pwd.getpwuid(os.getuid())
        username = user_info.pw_name
        home_dir = user_info.pw_dir
    except KeyError:
        username = "agent"
        home_dir = "/tmp"

    cwd = workdir or home_dir
    pid, master_fd = pty.fork()

    if pid == 0:
        try:
            os.chdir(cwd)
        except OSError:
            os.chdir(home_dir)
        os.environ.setdefault("TERM", "xterm-256color")
        os.environ.setdefault("SHELL", shell)
        os.environ.setdefault("HOME", home_dir)
        os.environ.setdefault("USER", username)
        os.environ.setdefault("LOGNAME", username)
        os.environ["OCINA_AGENT_ID"] = agent_id
        os.environ["OCINA_TERMINAL"] = "1"
        if env_extra:
            for key, value in env_extra.items():
                if value is not None:
                    os.environ[key] = str(value)

        if command:
            os.execvp(command[0], command)
        os.execve(shell, [shell], os.environ)

    _set_nonblocking(master_fd)
    return pid, master_fd


def _resolve_workdir(db: Session, agent_id: str) -> str | None:
    try:
        from app.models import Project
        from app.models import Session as DBSession

        latest = (
            db.query(DBSession)
            .filter(DBSession.agent_id == agent_id)
            .order_by(DBSession.created_at.desc())
            .first()
        )
        if latest and latest.project_id:
            proj = db.query(Project).filter(Project.id == latest.project_id).first()
            if proj and getattr(proj, "workdir", None):
                return proj.workdir
    except Exception:
        pass
    return None


def _harness_launch(agent: Agent) -> tuple[list[str] | None, dict[str, str] | None, str | None]:
    """Resolve harness CLI + env for interactive PTY when an adapter exists."""
    try:
        from app.adapters.base import get_adapter

        adapter = get_adapter(agent.harness or "")
        if not adapter:
            return None, None, None
        config = agent.config or {}
        command = adapter.build_command(config)
        env_extra = adapter.build_env(config) or {}
        cwd = adapter.build_cwd(config)
        return command, env_extra, cwd
    except Exception as e:
        log.warning("Harness launch unavailable for %s: %s", agent.id, e)
        return None, None, None


class SharedTerminal:
    """One PTY session shared by pane WebSockets and the prompt GUI."""

    def __init__(self, agent_id: str, agent_name: str, pid: int, master_fd: int):
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.pid = pid
        self.master_fd = master_fd
        self.clients: set[WebSocket] = set()
        self.scrollback: deque[str] = deque()
        self._scroll_len = 0
        self._reader_task: asyncio.Task | None = None
        self._alive = True

    def _append_scroll(self, chunk: str) -> None:
        self.scrollback.append(chunk)
        self._scroll_len += len(chunk)
        while self._scroll_len > SCROLLBACK_CHARS and self.scrollback:
            dropped = self.scrollback.popleft()
            self._scroll_len -= len(dropped)

    async def start_reader(self) -> None:
        if self._reader_task is None:
            self._reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        loop = asyncio.get_event_loop()
        while self._alive:
            try:
                data = await loop.run_in_executor(None, os.read, self.master_fd, 4096)
                if not data:
                    break
                decoded = data.decode("utf-8", errors="replace")
                self._append_scroll(decoded)
                await self._broadcast({"type": "output", "data": decoded})
            except BlockingIOError:
                await asyncio.sleep(0.02)
            except (OSError, ValueError):
                break

        self._alive = False
        await self._broadcast({"type": "exit", "code": 0})
        self.clients.clear()

    async def _broadcast(self, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def attach(self, websocket: WebSocket) -> None:
        self.clients.add(websocket)
        if self.scrollback:
            await websocket.send_json({
                "type": "output",
                "data": "".join(self.scrollback),
            })

    async def detach(self, websocket: WebSocket) -> None:
        self.clients.discard(websocket)

    def write(self, text: str) -> None:
        if not self._alive:
            raise RuntimeError("Terminal session is not alive")
        os.write(self.master_fd, text.encode("utf-8"))

    def resize(self, cols: int, rows: int) -> None:
        try:
            buf = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, buf)
        except (OSError, struct.error, AttributeError):
            pass

    def signal(self, sig_name: str) -> None:
        sig_map = {
            "INT": signal.SIGINT,
            "TERM": signal.SIGTERM,
            "KILL": signal.SIGKILL,
            "QUIT": signal.SIGQUIT,
            "HUP": signal.SIGHUP,
        }
        sig = sig_map.get(sig_name.upper())
        if not sig:
            return
        try:
            os.kill(self.pid, sig)
        except (OSError, ProcessLookupError):
            pass

    async def close(self) -> None:
        self._alive = False
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except (asyncio.CancelledError, Exception):
                pass
            self._reader_task = None
        try:
            os.kill(self.pid, signal.SIGTERM)
            os.waitpid(self.pid, 0)
        except (OSError, ProcessLookupError, ChildProcessError):
            pass
        try:
            os.close(self.master_fd)
        except OSError:
            pass
        self.clients.clear()


class TerminalHub:
    """Process-wide registry of shared agent terminals."""

    def __init__(self) -> None:
        self._sessions: dict[str, SharedTerminal] = {}
        self._lock = asyncio.Lock()

    def get(self, agent_id: str) -> SharedTerminal | None:
        session = self._sessions.get(agent_id)
        if session and session._alive:
            return session
        if session and not session._alive:
            self._sessions.pop(agent_id, None)
        return None

    def is_active(self, agent_id: str) -> bool:
        return self.get(agent_id) is not None

    async def ensure(
        self,
        agent_id: str,
        agent_name: str,
        workdir: str | None = None,
        command: list[str] | None = None,
        env_extra: dict[str, str] | None = None,
    ) -> SharedTerminal:
        async with self._lock:
            existing = self.get(agent_id)
            if existing:
                return existing

            pid, master_fd = _spawn_pty(
                agent_id,
                workdir=workdir,
                command=command,
                env_extra=env_extra,
            )
            session = SharedTerminal(agent_id, agent_name, pid, master_fd)
            self._sessions[agent_id] = session
            await session.start_reader()
            label = " ".join(command) if command else "shell"
            banner = (
                f"\r\n\u001b[1mO-cina · {agent_name}\u001b[0m"
                f"  \u001b[2m{label}\u001b[0m\r\n"
            )
            session._append_scroll(banner)
            return session

    async def drop(self, agent_id: str) -> None:
        async with self._lock:
            session = self._sessions.pop(agent_id, None)
        if session:
            await session.close()


terminal_hub = TerminalHub()


async def _ensure_agent_terminal(agent: Agent, db: Session) -> SharedTerminal:
    command, env_extra, adapter_cwd = _harness_launch(agent)
    workdir = adapter_cwd or _resolve_workdir(db, agent.id)
    return await terminal_hub.ensure(
        agent.id,
        agent.name,
        workdir=workdir,
        command=command,
        env_extra=env_extra,
    )


class TerminalInputRequest(BaseModel):
    text: str = Field(..., min_length=1)
    submit: bool = Field(
        True,
        description="Append a newline so the harness treats this as a submitted line",
    )


@router.post("/agents/{agent_id}/terminal/connect")
async def connect_terminal(
    agent_id: str,
    db: Session = Depends(get_db),
):
    """Start / attach the agent's shared PTY so the prompt GUI can drive it."""
    if agent_id.startswith("demo-"):
        raise HTTPException(400, "Preview agents have no live terminal")

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    try:
        session = await _ensure_agent_terminal(agent, db)
    except Exception as e:
        log.exception("Failed to connect terminal for %s", agent_id)
        raise HTTPException(500, f"Failed to connect terminal: {e}") from e

    return {
        "ok": True,
        "agent_id": agent_id,
        "agent_name": agent.name,
        "harness": agent.harness,
        "active": True,
        "clients": len(session.clients),
        "pid": session.pid,
    }


@router.post("/agents/{agent_id}/terminal/input")
async def inject_terminal_input(
    agent_id: str,
    body: TerminalInputRequest,
    db: Session = Depends(get_db),
):
    """GUI prompt path — write into the agent's shared PTY (mirrors in panes)."""
    if agent_id.startswith("demo-"):
        raise HTTPException(400, "Preview agents have no live terminal")

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    try:
        session = await _ensure_agent_terminal(agent, db)
        payload = body.text if body.text.endswith("\n") or not body.submit else body.text + "\n"
        session.write(payload)
    except Exception as e:
        log.exception("Failed to inject into terminal for %s", agent_id)
        raise HTTPException(500, f"Failed to write to terminal: {e}") from e

    return {
        "ok": True,
        "agent_id": agent_id,
        "active": True,
        "clients": len(session.clients),
    }


@router.get("/agents/{agent_id}/terminal/active")
def is_terminal_active(agent_id: str):
    """Check if an agent has an active shared terminal session."""
    session = terminal_hub.get(agent_id)
    return {
        "active": session is not None,
        "clients": len(session.clients) if session else 0,
    }


@router.websocket("/agents/{agent_id}/terminal")
async def agent_terminal(
    websocket: WebSocket,
    agent_id: str,
    db: Session = Depends(get_db),
):
    """Attach to the agent's shared PTY (creates one if needed)."""
    await websocket.accept()

    if agent_id.startswith("demo-"):
        await websocket.send_json({
            "type": "error",
            "data": "Preview agents have no live terminal",
        })
        await websocket.close(code=4004)
        return

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        await websocket.send_json({
            "type": "error",
            "data": f"Agent '{agent_id}' not found",
        })
        await websocket.close(code=4004)
        return

    try:
        session = await _ensure_agent_terminal(agent, db)
    except Exception as e:
        log.exception("Failed to open shared terminal for %s", agent_id)
        await websocket.send_json({
            "type": "error",
            "data": f"Failed to spawn terminal: {e}",
        })
        await websocket.close(code=1011)
        return

    await session.attach(websocket)

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "")
            msg_data = msg.get("data", "")

            if msg_type == "input":
                try:
                    session.write(str(msg_data))
                except Exception as e:
                    await websocket.send_json({"type": "error", "data": str(e)})
                    break
            elif msg_type == "resize":
                session.resize(int(msg.get("cols", 80)), int(msg.get("rows", 24)))
            elif msg_type == "signal":
                session.signal(str(msg_data))
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        log.exception("Terminal client error for agent %s", agent_id)
    finally:
        await session.detach(websocket)
        # Keep the shared PTY alive so the prompt GUI and other panes stay attached.
