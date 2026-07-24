"""WebSocket PTY bridge — spawns a pseudo-terminal for agent shells.

Connects at:  ws://host:8002/api/v1/agents/{agent_id}/terminal
Protocol: bidirectional JSON messages
  Client → Server: {"type":"input","data":"ls -la\\n"}
  Server → Client: {"type":"output","data":"total 42\\ndrwxr..."}
  Server → Client: {"type":"error","data":"Process exited with code 1"}
  Server → Client: {"type":"exit","code":0}
"""

import asyncio
import fcntl
import logging
import os
import pty
import pwd
import signal
import struct
import termios

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent

log = logging.getLogger(__name__)

router = APIRouter()

# ── Active terminal sessions ────────────────────────────────────────────────

_active_terminals: dict[str, dict] = {}  # agent_id -> {proc, fd, websocket}


def _set_nonblocking(fd: int) -> None:
    """Set a file descriptor to non-blocking mode."""
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


def _spawn_shell(agent_id: str, workdir: str | None = None) -> tuple[int, int]:
    """Spawn a PTY with a login shell.

    Returns (child_pid, master_fd).
    """
    # Determine shell
    shell = os.environ.get("SHELL", "/bin/bash")
    if not os.path.isfile(shell):
        shell = "/bin/bash"

    # Determine user
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
        # Child process — set up the PTY environment
        os.chdir(cwd)
        os.environ.setdefault("TERM", "xterm-256color")
        os.environ.setdefault("SHELL", shell)
        os.environ.setdefault("HOME", home_dir)
        os.environ.setdefault("USER", username)
        os.environ.setdefault("LOGNAME", username)
        os.environ["OCINA_AGENT_ID"] = agent_id
        os.environ["OCINA_TERMINAL"] = "1"

        # Run the shell
        os.execve(shell, [shell], os.environ)

    # Parent — configure the PTY
    _set_nonblocking(master_fd)

    return pid, master_fd


async def _pty_reader(master_fd: int, websocket: WebSocket) -> None:
    """Read from PTY master and send to WebSocket."""
    loop = asyncio.get_event_loop()
    buf = b""

    while True:
        try:
            data = await loop.run_in_executor(None, os.read, master_fd, 4096)
            if not data:
                break
            buf += data
            # Flush on newline or buffer pressure
            while b"\n" in buf or len(buf) >= 4096:
                idx = buf.find(b"\n") + 1 if b"\n" in buf else len(buf)
                chunk = buf[:idx]
                buf = buf[idx:]
                try:
                    decoded = chunk.decode("utf-8", errors="replace")
                    await websocket.send_json({
                        "type": "output",
                        "data": decoded,
                    })
                except Exception:
                    pass
            # Send remaining buffer
            if buf:
                try:
                    decoded = buf.decode("utf-8", errors="replace")
                    await websocket.send_json({"type": "output", "data": decoded})
                    buf = b""
                except Exception:
                    pass
        except BlockingIOError:
            # No data yet — yield and retry
            await asyncio.sleep(0.02)
        except (OSError, ValueError):
            break


async def _pty_writer(master_fd: int, websocket: WebSocket, pid: int) -> None:
    """Read from WebSocket and write to PTY master."""
    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type", "")
            msg_data = msg.get("data", "")

            if msg_type == "input":
                os.write(master_fd, msg_data.encode("utf-8"))
            elif msg_type == "resize":
                cols = msg.get("cols", 80)
                rows = msg.get("rows", 24)
                try:
                    buf = struct.pack("HHHH", rows, cols, 0, 0)
                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, buf)
                except (OSError, struct.error, AttributeError):
                    pass
            elif msg_type == "signal":
                sig_name = msg_data.upper()
                sig_map = {
                    "INT": signal.SIGINT,
                    "TERM": signal.SIGTERM,
                    "KILL": signal.SIGKILL,
                    "QUIT": signal.SIGQUIT,
                    "HUP": signal.SIGHUP,
                }
                if sig_name in sig_map:
                    try:
                        os.kill(pid, sig_map[sig_name])
                    except (OSError, ProcessLookupError):
                        pass
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass


@router.websocket("/agents/{agent_id}/terminal")
async def agent_terminal(
    websocket: WebSocket,
    agent_id: str,
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for agent PTY terminal."""
    await websocket.accept()

    # Verify agent exists
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        await websocket.send_json({
            "type": "error",
            "data": f"Agent '{agent_id}' not found",
        })
        await websocket.close(code=4004)
        return

    # Determine working directory — try agent's project workdir
    workdir = None
    try:
        # Agent model doesn't have project_id directly; check via sessions
        from app.models import Session as DBSession
        latest_session = (
            db.query(DBSession)
            .filter(DBSession.agent_id == agent_id)
            .order_by(DBSession.created_at.desc())
            .first()
        )
        if latest_session and latest_session.project_id:
            from app.models import Project
            proj = db.query(Project).filter(Project.id == latest_session.project_id).first()
            if proj and hasattr(proj, 'workdir') and proj.workdir:
                workdir = proj.workdir
    except Exception:
        pass

    # Spawn PTY
    try:
        pid, master_fd = _spawn_shell(agent_id, workdir=workdir)
    except Exception as e:
        log.exception("Failed to spawn PTY for agent %s", agent_id)
        await websocket.send_json({
            "type": "error",
            "data": f"Failed to spawn terminal: {e}",
        })
        await websocket.close(code=1011)
        return

    session_key = f"{agent_id}:{id(master_fd)}"
    _active_terminals[session_key] = {
        "pid": pid,
        "fd": master_fd,
        "agent_id": agent_id,
    }

    try:
        # Welcome message
        await websocket.send_json({
            "type": "output",
            "data": f"\r\n\u001b[1mO-cina Terminal [Agent: {agent.name}]\u001b[0m\r\n",
        })

        # Run reader and writer concurrently
        reader_task = asyncio.create_task(_pty_reader(master_fd, websocket))
        writer_task = asyncio.create_task(_pty_writer(master_fd, websocket, pid))

        done, pending = await asyncio.wait(
            [reader_task, writer_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        # Cancel remaining
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        log.info("Terminal disconnected for agent %s", agent_id)
    except Exception:
        log.exception("Terminal error for agent %s", agent_id)
    finally:
        # Cleanup
        try:
            os.kill(pid, signal.SIGTERM)
            _, _ = os.waitpid(pid, 0)
        except (OSError, ProcessLookupError, ChildProcessError):
            pass
        try:
            os.close(master_fd)
        except OSError:
            pass
        _active_terminals.pop(session_key, None)

        try:
            await websocket.send_json({"type": "exit", "code": 0})
            await websocket.close()
        except Exception:
            pass


@router.get("/agents/{agent_id}/terminal/active")
def is_terminal_active(agent_id: str):
    """Check if an agent has an active terminal session."""
    active = any(
        info["agent_id"] == agent_id
        for info in _active_terminals.values()
    )
    return {"active": active}
