"""Agent process manager.

Spawns agents via subprocess.Popen with process-group isolation,
captures stdout/stderr to log files, optionally enforces resource
limits via resource.RLIMIT_*, and scrubs environment variables.

Works on macOS and Linux. Uses start_new_session=True (portable) instead
of preexec_fn + os.setsid. Recovered PIDs use a psutil-backed handle.
"""
from __future__ import annotations

import logging
import os
import platform
import resource
import signal
import subprocess
import threading
import time
from pathlib import Path

import psutil

logger = logging.getLogger(__name__)

# Secrets/patterns to scrub from child environment (extra_vars + inherited)
SCRUB_PREFIXES = (
    "API_KEY", "APIKEY", "SECRET", "TOKEN", "PASSWORD", "PASSWD",
    "PRIVATE_KEY", "CREDENTIAL", "AUTH",
)

# Backend-specific env vars children should NOT inherit
SCRUB_EXACT = (
    "OCINA_API_KEY", "OCINA_SECRET", "DATABASE_URL", "REDIS_URL",
    "CHROMA_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "AWS_ACCESS_KEY", "AWS_SECRET_KEY", "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY", "GOOGLE_API_KEY",
    "HF_TOKEN", "GITHUB_TOKEN", "SECRET_KEY", "API_KEYS",
)

# Vars safe to pass through from the parent environment when present
PASSTHROUGH_ENV = (
    "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE",
    "TERM", "TMPDIR", "TMP", "TEMP", "SHELL", "SSH_AUTH_SOCK",
    "XDG_RUNTIME_DIR", "COLORTERM",
)

LOG_DIR = Path(os.getenv("OCINA_LOG_DIR", "~/.o-cina/logs")).expanduser()
LOG_DIR.mkdir(parents=True, exist_ok=True)

_IS_DARWIN = platform.system() == "Darwin"


def _default_path() -> str:
    """Build a sensible PATH for agent subprocesses (Homebrew + system)."""
    parts = []
    existing = os.environ.get("PATH", "")
    if existing:
        parts.extend(existing.split(os.pathsep))
    for candidate in (
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ):
        if candidate not in parts and os.path.isdir(candidate):
            parts.append(candidate)
    return os.pathsep.join(parts) if parts else "/usr/local/bin:/usr/bin:/bin"


def _should_scrub(key: str) -> bool:
    upper = key.upper()
    if upper in SCRUB_EXACT or key in SCRUB_EXACT:
        return True
    return any(token in upper for token in SCRUB_PREFIXES)


def scrub_env(extra_vars: dict[str, str] | None = None) -> dict[str, str]:
    """Build a clean environment for child processes.

    Starts from a small safe base, optionally passthroughs selected parent
    vars, then merges extra_vars while scrubbing secret-like keys.
    """
    env: dict[str, str] = {
        "PATH": _default_path(),
        "HOME": os.environ.get("HOME", ""),
        "USER": os.environ.get("USER", os.environ.get("LOGNAME", "")),
        "LANG": os.environ.get("LANG", "en_US.UTF-8"),
        "LC_ALL": os.environ.get("LC_ALL", os.environ.get("LANG", "en_US.UTF-8")),
        "TERM": os.environ.get("TERM", "xterm-256color"),
    }

    for key in PASSTHROUGH_ENV:
        value = os.environ.get(key)
        if value and key not in env:
            env[key] = value

    if extra_vars:
        for key, value in extra_vars.items():
            if value is None:
                continue
            if _should_scrub(key):
                logger.debug("Scrubbed env var %s from child environment", key)
                continue
            env[key] = str(value)

    return env


def apply_resource_limits(
    cpu_seconds: int | None = None,
    memory_bytes: int | None = None,
):
    """Apply per-process resource limits via resource.RLIMIT_*.

    Memory limits via RLIMIT_AS are best-effort on macOS and may be ignored
    or behave differently than on Linux.
    """
    if cpu_seconds is not None and cpu_seconds > 0:
        try:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
            logger.info("Set RLIMIT_CPU = %d seconds", cpu_seconds)
        except (ValueError, OSError) as exc:
            logger.warning("Could not set RLIMIT_CPU: %s", exc)

    if memory_bytes is not None and memory_bytes > 0:
        if _IS_DARWIN:
            # RLIMIT_AS is unreliable on Darwin; skip rather than fail spawn.
            logger.info(
                "Skipping RLIMIT_AS=%d on macOS (not reliably enforceable)",
                memory_bytes,
            )
            return
        try:
            resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
            logger.info("Set RLIMIT_AS = %d bytes", memory_bytes)
        except (ValueError, OSError) as exc:
            logger.warning("Could not set RLIMIT_AS: %s", exc)


def _make_preexec(
    cpu_seconds: int | None = None,
    memory_bytes: int | None = None,
):
    """Child-side limit applicator. Process group is handled by start_new_session."""
    def _preexec():
        apply_resource_limits(cpu_seconds, memory_bytes)
    return _preexec


class _RecoveredProcess:
    """Minimal Popen-like wrapper around a recovered psutil.Process."""

    def __init__(self, pid: int):
        self.pid = pid
        self._ps = psutil.Process(pid)

    def poll(self) -> int | None:
        try:
            if self._ps.is_running() and self._ps.status() != psutil.STATUS_ZOMBIE:
                return None
            return self._ps.wait(timeout=0) or 0
        except psutil.TimeoutExpired:
            return None
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return 0

    def wait(self, timeout: float | None = None) -> int:
        try:
            return int(self._ps.wait(timeout=timeout))
        except psutil.TimeoutExpired as exc:
            raise subprocess.TimeoutExpired(cmd=f"pid={self.pid}", timeout=timeout) from exc
        except psutil.NoSuchProcess:
            return 0


class ProcessHandle:
    """Wrapper around a running agent process."""

    def __init__(
        self,
        agent_id: str,
        proc: subprocess.Popen | _RecoveredProcess,
        log_path: Path,
        started_at: float,
        log_fd=None,
    ):
        self.agent_id = agent_id
        self.proc = proc
        self.pid = proc.pid
        try:
            self.pgid = os.getpgid(proc.pid)
        except OSError:
            self.pgid = proc.pid
        self.log_path = log_path
        self.started_at = started_at
        self._log_fd = log_fd

    @classmethod
    def from_pid(
        cls,
        agent_id: str,
        pid: int,
        log_path: Path,
        started_at: float,
        pgid: int | None = None,
    ) -> ProcessHandle:
        """Create a ProcessHandle from an existing PID (no Popen needed)."""
        handle = object.__new__(cls)
        handle.agent_id = agent_id
        handle.pid = pid
        handle.pgid = pgid or pid
        handle.log_path = log_path
        handle.started_at = started_at
        handle.proc = _RecoveredProcess(pid)
        handle._log_fd = None
        return handle

    def close_log(self):
        fd = getattr(self, "_log_fd", None)
        if fd is not None:
            try:
                fd.close()
            except OSError:
                pass
            self._log_fd = None

    @property
    def alive(self) -> bool:
        """Check if process is still running."""
        try:
            if self.proc.poll() is not None:
                return False
        except Exception:
            return False
        try:
            os.kill(self.pid, 0)
            return True
        except OSError:
            return False

    def metrics(self) -> dict:
        """Get resource usage metrics via psutil (monitoring only)."""
        result = {
            "pid": self.pid,
            "pgid": self.pgid,
            "alive": self.alive,
            "uptime": time.time() - self.started_at,
        }
        if self.alive:
            try:
                p = psutil.Process(self.pid)
                result["cpu_percent"] = p.cpu_percent(interval=0.1)
                result["memory_rss"] = p.memory_info().rss
                result["num_threads"] = p.num_threads()
                children = p.children(recursive=True)
                result["num_children"] = len(children)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                result["alive"] = False
        return result

    def read_log_tail(self, lines: int = 100) -> str:
        """Read last N lines from the agent's log file."""
        try:
            with open(self.log_path) as f:
                all_lines = f.readlines()
                return "".join(all_lines[-lines:])
        except FileNotFoundError:
            return ""

    def kill(self, timeout: int = 10, force: bool = False) -> bool:
        """Kill the process group. SIGTERM first, escalate to SIGKILL after timeout."""
        if not self.alive:
            self.close_log()
            return True

        sig = signal.SIGKILL if force else signal.SIGTERM
        try:
            os.killpg(self.pgid, sig)
            logger.info(
                "Sent %s to process group %d (agent=%s)",
                sig, self.pgid, self.agent_id,
            )
        except ProcessLookupError:
            self.close_log()
            return True
        except OSError as e:
            # Fall back to signaling the PID directly (common for recovered procs)
            try:
                os.kill(self.pid, sig)
            except (ProcessLookupError, OSError) as e2:
                logger.error("Failed to signal pid %d / pgid %d: %s / %s", self.pid, self.pgid, e, e2)
                return False

        if not force:
            try:
                self.proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                logger.warning(
                    "Process group %d did not exit in %ds, sending SIGKILL",
                    self.pgid, timeout,
                )
                return self.kill(timeout=5, force=True)

        self.close_log()
        return True


class ProcessManager:
    """Manages agent subprocess lifecycle.

    Singleton-style — one instance per backend process.
    """

    def __init__(self):
        self._handles: dict[str, ProcessHandle] = {}
        self._lock = threading.RLock()

    def spawn(
        self,
        agent_id: str,
        command: list,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        cpu_limit: int | None = None,
        memory_limit: int | None = None,
    ) -> ProcessHandle:
        """Spawn an agent subprocess with process group isolation."""
        with self._lock:
            if agent_id in self._handles and self._handles[agent_id].alive:
                raise RuntimeError(
                    f"Agent {agent_id} is already running (pid={self._handles[agent_id].pid})"
                )

            clean_env = scrub_env(env)
            log_path = LOG_DIR / f"{agent_id}.log"
            log_fd = open(log_path, "a")

            # Only use preexec for resource limits when needed (avoid multithread issues)
            preexec = None
            if (cpu_limit and cpu_limit > 0) or (memory_limit and memory_limit > 0 and not _IS_DARWIN):
                preexec = _make_preexec(cpu_limit, memory_limit)

            logger.info(
                "Spawning agent %s: %s (cwd=%s)", agent_id, " ".join(command), cwd
            )

            try:
                proc = subprocess.Popen(
                    command,
                    cwd=cwd,
                    env=clean_env,
                    stdout=log_fd,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                    preexec_fn=preexec,
                )
            except Exception:
                log_fd.close()
                raise

            handle = ProcessHandle(
                agent_id=agent_id,
                proc=proc,
                log_path=log_path,
                started_at=time.time(),
                log_fd=log_fd,
            )
            self._handles[agent_id] = handle
            logger.info(
                "Agent %s spawned: pid=%d, pgid=%d, log=%s",
                agent_id, handle.pid, handle.pgid, log_path,
            )
            return handle

    def stop(self, agent_id: str, timeout: int = 10, force: bool = False) -> bool:
        """Stop an agent process group."""
        with self._lock:
            handle = self._handles.get(agent_id)
            if not handle:
                logger.warning("No handle for agent %s — not in active set", agent_id)
                return False

            success = handle.kill(timeout=timeout, force=force)
            if success:
                del self._handles[agent_id]
                logger.info("Agent %s stopped successfully", agent_id)
            return success

    def get(self, agent_id: str) -> ProcessHandle | None:
        return self._handles.get(agent_id)

    def metrics(self, agent_id: str) -> dict | None:
        handle = self._handles.get(agent_id)
        if not handle:
            return None
        return handle.metrics()

    def read_log(self, agent_id: str, lines: int = 100) -> str:
        handle = self._handles.get(agent_id)
        if not handle:
            log_path = LOG_DIR / f"{agent_id}.log"
            try:
                with open(log_path) as f:
                    all_lines = f.readlines()
                    return "".join(all_lines[-lines:])
            except FileNotFoundError:
                return ""
        return handle.read_log_tail(lines)

    def list_active(self) -> dict[str, dict]:
        result = {}
        for aid, handle in self._handles.items():
            m = handle.metrics()
            m["log_path"] = str(handle.log_path)
            result[aid] = m
        return result

    def recover_from_db(self, agents: list) -> list:
        """On startup: re-attach live PIDs; return agent_ids that are dead."""
        dead_agents = []
        with self._lock:
            for agent in agents:
                if agent.pid is None:
                    continue

                try:
                    os.kill(agent.pid, 0)
                    log_path = LOG_DIR / f"{agent.id}.log"
                    handle = ProcessHandle.from_pid(
                        agent_id=agent.id,
                        pid=agent.pid,
                        pgid=agent.pgid,
                        log_path=log_path,
                        started_at=agent.process_started_at or time.time(),
                    )
                    if not handle.alive:
                        dead_agents.append(agent.id)
                        continue
                    self._handles[agent.id] = handle
                    logger.info("Recovered running agent %s (pid=%d)", agent.id, agent.pid)
                except (OSError, psutil.NoSuchProcess, psutil.AccessDenied):
                    dead_agents.append(agent.id)
                    logger.info(
                        "Agent %s pid=%d is dead (backend was restarted)",
                        agent.id, agent.pid,
                    )

        return dead_agents

    def cleanup_all(self) -> int:
        """Kill all managed processes. Returns count of killed processes."""
        count = 0
        with self._lock:
            agent_ids = list(self._handles.keys())
        for aid in agent_ids:
            if self.stop(aid, timeout=5, force=True):
                count += 1
        return count
