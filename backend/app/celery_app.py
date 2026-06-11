"""Celery application for task queue."""
import os
from celery import Celery
from celery.schedules import crontab

broker_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("o-cina", broker=broker_url, backend=broker_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # Periodic task schedule (beat)
    beat_schedule={
        "monitor-heartbeat-ttl": {
            "task": "app.tasks.monitor_heartbeat_ttl",
            "schedule": int(os.getenv("OCINA_HEARTBEAT_CHECK_INTERVAL", "30")),
        },
        "reap-dead-processes": {
            "task": "app.tasks.reap_dead_processes",
            "schedule": 60,  # every 60 seconds
        },
    },
)
