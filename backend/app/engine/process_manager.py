"""Agent process manager.

Spawns agents via subprocess.Popen with process groups (os.setsid),
captures stdout/stderr to log files, enforces resource limits via
resource.RLIMIT_*, and scrubs environment variables before spawn.

psutil is monitoring-only (cannot enforce limits).
"""

import asyncio
import logging
import os
import resource
import signal
import subprocess
import time
from pathlib import Path
from typing import Dict, Optional

import psutil

logger = logging.getLogger(__name__)

# Secrets/patterns to scrub from child environment
SCRUB_PREFIXES = (
    "API_KEY", "APIKEY", "SECRET", "TOKEN", "PASSWORD", "PASSWD",
    "PRIVATE_KEY", "CREDENTIAL", "AUTH",
)

# Backend-specific env vars the platform needs but children should NOT inherit
SCRUB_EXACT = (
    "OCINA_API_KEY", "OCINA_SECRET", "DATABASE_URL", "REDIS_URL",
    "CHROMA_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "AWS_ACCESS_KEY", "AWS_SECRET_KEY", "GOOGLE_API_KEY",
    "HF_TOKEN", "GITHUB_TOKEN",
)

LOG_DIR = Path(os.getenv("OCINA_LOG_DIR", "~/.o-cina/logs")).expanduser()
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Safe base environment — minimal vars every agent inherits
SAFE_ENV_BASE = {
    "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
    "HOME": os.environ.get("HOME", ""),
    "USER": os.environ.get("USER", ""),
    "LANG": os.environ.get("LANG", "en_US.UTF-8"),
    "LC_ALL": os.environ.get("LC_ALL", "en_US.UTF-8"),
    "TERM": "xterm-256color",
}


def scrub_env(extra_vars: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Build a clean environment for child processes.

    Starts from SAFE_ENV_BASE and adds only explicitly provided extra_vars.
    This prevents the backend's secrets from leaking to agent subprocesses.
    """
    env = dict(SAFE_ENV_BASE)
    if extra_vars:
        env.update(extra_vars)
    return env


def apply_resource_limits(cpu_seconds: Optional[int] = None, memory_bytes: Optional[int] = None):
    """Apply per-process resource limits via resource.RLIMIT_*.

    Must be called in the child process (via preexec_fn pattern)
    or before Popen spawns.

    Args:
        cpu_seconds: Max CPU time in seconds (RLIMIT_CPU). None = unlimited.
        memory_bytes: Max virtual memory in bytes (RLIMIT_AS). None = unlimited.
    """
    if cpu_seconds is not None and cpu_seconds > 0:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        logger.info("Set RLIMIT_CPU = %d seconds", cpu_seconds)

    if memory_bytes is not None and memory_bytes > 0:
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        logger.info("Set RLIMIT_AS = %d bytes", memory_bytes)


def _make_preexec(
    cpu_seconds: Optional[int] = None,
    memory_bytes: Optional[int] = None,
):
    """Build a preexec function that sets resource limits in the child."""
    def _preexec():
        os.setsid()
        apply_resource_limits(cpu_seconds, memory_bytes)
    return _preexec


class ProcessHandle:
    """Wrapper around a running agent process."""

    def __init__(
        self,
        agent_id: str,
        proc: subprocess.Popen,
        log_path: Path,
        started_at: float,
    ):
        self.agent_id = agent_id
        self.proc = proc
        self.pid = proc.pid
        self.pgid = os.getpgid(proc.pid)
        self.log_path = log_path
        self.started_at = started_at

    @classmethod
    def from_pid(
        cls,
        agent_id: str,
        pid: int,
        log_path: Path,
        started_at: float,
        pgid: int | None = None,
    ) -> "ProcessHandle":
        """Create a ProcessHandle from an existing PID (no Popen needed).

        Used during recovery when the process was spawned by a previous
        backend instance and we only have the PID from the database.
        """
        import subprocess
        handle = object.__new__(cls)
        handle.agent_id = agent_id
        handle.pid = pid
        handle.pgid = pgid or pid
        handle.log_path = log_path
        handle.started_at = started_at
        # Attach a lightweight psutil wrapper instead of a fake Popen
        handle.proc = psutil.Process(pid)
        return handle

    @property
    def alive(self) -> bool:
        """Check if process is still running (uses os.kill with signal 0)."""
        if self.proc.poll() is not None:
            return False
        try:
            os.kill(self.pgid, 0)
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
            with open(self.log_path, "r") as f:
                all_lines = f.readlines()
                return "".join(all_lines[-lines:])
        except FileNotFoundError:
            return ""

    def kill(self, timeout: int = 10, force: bool = False) -> bool:
        """Kill the process group. SIGTERM first, escalate to SIGKILL after timeout.

        Returns True if process was successfully stopped.
        """
        if not self.alive:
            return True

        sig = signal.SIGKILL if force else signal.SIGTERM
        try:
            os.killpg(self.pgid, sig)
            logger.info(
                "Sent %s to process group %d (agent=%s)",
                sig, self.pgid, self.agent_id,
            )
        except ProcessLookupError:
            return True  # already gone
        except OSError as e:
            logger.error("Failed to send signal to pgid %d: %s", self.pgid, e)
            return False

        if not force:
            # Wait for graceful shutdown; escalate if needed
            try:
                self.proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                logger.warning(
                    "Process group %d did not exit in %ds, sending SIGKILL",
                    self.pgid, timeout,
                )
                return self.kill(timeout=5, force=True)

        return True


class ProcessManager:
    """Manages agent subprocess lifecycle.

    Singleton-style — one instance per backend process.
    Stores active processes in memory keyed by agent_id.
    """

    def __init__(self):
        self._handles: Dict[str, ProcessHandle] = {}
        self._lock = asyncio.Lock()

    def spawn(
        self,
        agent_id: str,
        command: list,
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        cpu_limit: Optional[int] = None,
        memory_limit: Optional[int] = None,
    ) -> ProcessHandle:
        """Spawn an agent subprocess with process group isolation.

        Args:
            agent_id: Unique agent identifier.
            command: Command as list (no shell injection).
            cwd: Working directory for the process.
            env: Extra environment variables (merged with scrubbed base).
            cpu_limit: CPU time limit in seconds (RLIMIT_CPU).
            memory_limit: Virtual memory limit in bytes (RLIMIT_AS).

        Returns:
            ProcessHandle wrapping the spawned process.

        Raises:
            RuntimeError: If agent is already running.
            subprocess.SubprocessError: If spawn fails.
        """
        if agent_id in self._handles and self._handles[agent_id].alive:
            raise RuntimeError(f"Agent {agent_id} is already running (pid={self._handles[agent_id].pid})")

        # Build clean environment
        clean_env = scrub_env(env)

        # Log file path
        log_path = LOG_DIR / f"{agent_id}.log"

        # Open log file for writing
        log_fd = open(log_path, "a")

        # Preexec: create process group + apply resource limits
        preexec = _make_preexec(cpu_limit, memory_limit)

        logger.info(
            "Spawning agent %s: %s (cwd=%s)", agent_id, " ".join(command), cwd
        )

        proc = subprocess.Popen(
            command,
            cwd=cwd,
            env=clean_env,
            stdout=log_fd,
            stderr=subprocess.STDOUT,
            preexec_fn=preexec,
        )

        handle = ProcessHandle(
            agent_id=agent_id,
            proc=proc,
            log_path=log_path,
            started_at=time.time(),
        )

        self._handles[agent_id] = handle
        logger.info(
            "Agent %s spawned: pid=%d, pgid=%d, log=%s",
            agent_id, handle.pid, handle.pgid, log_path,
        )
        return handle

    def stop(self, agent_id: str, timeout: int = 10, force: bool = False) -> bool:
        """Stop an agent process group.

        Returns True if process was stopped, False if not found or failed.
        """
        handle = self._handles.get(agent_id)
        if not handle:
            # Try to find by pgid in DB (fallback for recovered processes)
            logger.warning("No handle for agent %s — not in active set", agent_id)
            return False

        success = handle.kill(timeout=timeout, force=force)
        if success:
            del self._handles[agent_id]
            logger.info("Agent %s stopped successfully", agent_id)
        return success

    def get(self, agent_id: str) -> Optional[ProcessHandle]:
        """Get handle for a running agent (or None)."""
        return self._handles.get(agent_id)

    def metrics(self, agent_id: str) -> Optional[dict]:
        """Get resource metrics for an agent."""
        handle = self._handles.get(agent_id)
        if not handle:
            return None
        return handle.metrics()

    def read_log(self, agent_id: str, lines: int = 100) -> str:
        """Read tail of agent log."""
        handle = self._handles.get(agent_id)
        if not handle:
            # Try to read log file directly even if not in active set
            log_path = LOG_DIR / f"{agent_id}.log"
            try:
                with open(log_path, "r") as f:
                    all_lines = f.readlines()
                    return "".join(all_lines[-lines:])
            except FileNotFoundError:
                return ""
        return handle.read_log_tail(lines)

    def list_active(self) -> Dict[str, dict]:
        """List all active agents with their metrics."""
        result = {}
        for aid, handle in self._handles.items():
            m = handle.metrics()
            m["log_path"] = str(handle.log_path)
            result[aid] = m
        return result

    def recover_from_db(self, agents: list) -> list:
        """On startup: check which DB agents have PIDs that are still alive.

        Args:
            agents: List of Agent ORM objects with pid/pgid/process_started_at.

        Returns:
            List of agent_ids whose processes are confirmed dead (need cleanup).
        """
        dead_agents = []
        for agent in agents:
            if agent.pid is None:
                continue

            try:
                os.kill(agent.pgid or agent.pid, 0)
                # Process is alive — re-attach handle
                log_path = LOG_DIR / f"{agent.id}.log"
                handle = ProcessHandle.from_pid(
                    agent_id=agent.id,
                    pid=agent.pid,
                    pgid=agent.pgid,
                    log_path=log_path,
                    started_at=agent.process_started_at or time.time(),
                )
                self._handles[agent.id] = handle
                logger.info("Recovered running agent %s (pid=%d)", agent.id, agent.pid)
            except (OSError, psutil.NoSuchProcess):
                dead_agents.append(agent.id)
                logger.info("Agent %s pid=%d is dead (backend was restarted)", agent.id, agent.pid)

        return dead_agents

    def cleanup_all(self) -> int:
        """Kill all managed processes. Returns count of killed processes."""
        count = 0
        agent_ids = list(self._handles.keys())
        for aid in agent_ids:
            if self.stop(aid, timeout=5, force=True):
                count += 1
        return count
