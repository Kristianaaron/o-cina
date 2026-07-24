"""Celery periodic tasks for agent lifecycle management.

- TTL monitor: checks agent heartbeats and marks stale agents as offline.
- Process reaper: checks running processes and cleans up dead ones.
"""
import logging
import time

from app.celery_app import celery_app
from app.database import SessionLocal
from app.engine import process_manager
from app.models import Agent, AgentStatus

logger = logging.getLogger(__name__)

# TTL settings (configurable via env)
HEARTBEAT_TIMEOUT = int(__import__("os").environ.get("OCINA_HEARTBEAT_TIMEOUT", "60"))  # seconds
HEARTBEAT_CHECK_INTERVAL = int(__import__("os").environ.get("OCINA_HEARTBEAT_CHECK_INTERVAL", "30"))  # seconds
GRACE_MULTIPLIER = 3  # agents get 3x heartbeat interval on backend restart


@celery_app.task(name="monitor_heartbeat_ttl")
def monitor_heartbeat_ttl():
    """Check all running agents for heartbeat TTL expiry.

    If an agent's last_heartbeat is older than HEARTBEAT_TIMEOUT,
    mark it as 'error'. If the process is confirmed dead, mark 'offline'.
    """
    db = SessionLocal()
    try:
        now = time.time()
        running_agents = db.query(Agent).filter(
            Agent.status.in_([AgentStatus.running, AgentStatus.starting])
        ).all()

        expired = 0
        for agent in running_agents:
            if agent.last_heartbeat is None:
                # No heartbeat recorded yet — check if process is alive
                if agent.pid:
                    metrics = process_manager.metrics(agent.id)
                    if not metrics or not metrics.get("alive"):
                        agent.status = AgentStatus.error
                        expired += 1
                        logger.warning(
                            "Agent %s (pid=%d) has no heartbeat and process is dead",
                            agent.id, agent.pid,
                        )
                continue

            age = now - agent.last_heartbeat
            if age > HEARTBEAT_TIMEOUT:
                # Check if process is actually dead
                is_dead = False
                if agent.pid:
                    metrics = process_manager.metrics(agent.id)
                    is_dead = not metrics or not metrics.get("alive")
                else:
                    is_dead = True  # no pid + no heartbeat = definitely dead

                if is_dead:
                    agent.status = AgentStatus.offline
                    logger.warning(
                        "Agent %s marked offline: heartbeat expired (%.0fs ago)",
                        agent.id, age,
                    )
                else:
                    agent.status = AgentStatus.error
                    logger.warning(
                        "Agent %s marked error: heartbeat expired (%.0fs) but process alive",
                        agent.id, age,
                    )
                expired += 1

        if expired:
            db.commit()
            logger.info("Heartbeat TTL check: %d agents expired out of %d running", expired, len(running_agents))

    except Exception:
        logger.exception("Heartbeat TTL monitor failed")
    finally:
        db.close()


@celery_app.task(name="reap_dead_processes")
def reap_dead_processes():
    """Check all registered agents with PIDs and clean up dead processes.

    Runs periodically to handle cases where agents die without the
    backend noticing (e.g., OOM kill, segfault).
    """
    db = SessionLocal()
    try:
        import os as _os

        agents_with_pids = db.query(Agent).filter(Agent.pid.isnot(None)).all()
        reaped = 0
        for agent in agents_with_pids:
            dead_pid = agent.pid
            try:
                # Prefer checking the actual PID (pgid may differ after recovery)
                _os.kill(agent.pid, 0)
            except OSError:
                # Process is dead
                agent.status = AgentStatus.stopped
                agent.pid = None
                agent.pgid = None
                agent.process_started_at = None
                reaped += 1
                logger.info(
                    "Reaped dead agent %s (pid=%s was gone)",
                    agent.id, dead_pid if dead_pid is not None else "unknown",
                )

        if reaped:
            db.commit()
            logger.info("Process reaper: cleaned up %d dead agents", reaped)

    except Exception:
        logger.exception("Process reaper failed")
    finally:
        db.close()
