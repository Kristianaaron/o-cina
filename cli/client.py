"""HTTP client for the O-cina backend API."""

import os
from typing import Any, Optional

import httpx

DEFAULT_BASE_URL = "http://127.0.0.1:8002"


def _base_url() -> str:
    return os.environ.get("OCINA_API_URL", DEFAULT_BASE_URL)


class ApiError(Exception):
    """Raised on non-2xx API responses."""

    def __init__(self, status: int, detail: str, request_id: str = ""):
        self.status = status
        self.detail = detail
        self.request_id = request_id
        super().__init__(f"[{status}] {detail}")


def _handle_error(response: httpx.Response):
    """Parse error envelope and raise ApiError."""
    try:
        body = response.json()
        detail = body.get("detail") or body.get("error") or response.text
        rid = body.get("request_id", "")
    except Exception:
        detail = response.text or f"HTTP {response.status_code}"
        rid = ""
    raise ApiError(response.status_code, detail, rid)


# ── Health ──────────────────────────────────────────────────────────────────


def get_health(base_url: Optional[str] = None) -> dict:
    r = httpx.get(f"{base_url or _base_url()}/health", timeout=5)
    if r.is_error:
        _handle_error(r)
    return r.json()


# ── Agents ──────────────────────────────────────────────────────────────────


def list_agents(
    base_url: Optional[str] = None,
    harness: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if harness:
        params["harness"] = harness
    if status:
        params["status"] = status
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/agents",
        params=params,
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    data = r.json()
    return data.get("agents", data) if isinstance(data, dict) else data


def get_agent(base_url: Optional[str] = None, agent_id: str = "") -> dict:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}", timeout=10
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def register_agent(
    base_url: Optional[str] = None,
    name: str = "",
    harness: str = "",
    **kwargs,
) -> dict:
    body = {"name": name, "harness": harness, **kwargs}
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/agents/register",
        json=body,
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def start_agent(base_url: Optional[str] = None, agent_id: str = "") -> dict:
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}/start",
        timeout=30,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def stop_agent(base_url: Optional[str] = None, agent_id: str = "") -> dict:
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}/stop",
        timeout=15,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def restart_agent(base_url: Optional[str] = None, agent_id: str = "") -> dict:
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}/restart",
        timeout=35,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def delete_agent(base_url: Optional[str] = None, agent_id: str = "") -> dict:
    r = httpx.delete(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}", timeout=10
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def get_agent_logs(
    base_url: Optional[str] = None,
    agent_id: str = "",
    lines: int = 100,
) -> dict:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}/logs",
        params={"lines": lines},
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def get_agent_metrics(
    base_url: Optional[str] = None, agent_id: str = ""
) -> dict:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/agents/{agent_id}/metrics",
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def prompt_agent(
    base_url: Optional[str] = None,
    agent_id: str = "",
    prompt: str = "",
    session_id: Optional[str] = None,
) -> dict:
    body = {"agent_id": agent_id, "prompt": prompt}
    if session_id:
        body["session_id"] = session_id
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/prompt",
        json=body,
        timeout=30,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


# ── Workflows ───────────────────────────────────────────────────────────────


def list_workflows(
    base_url: Optional[str] = None, limit: int = 50, offset: int = 0
) -> list[dict]:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/workflows",
        params={"limit": limit, "offset": offset},
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    data = r.json()
    return data.get("workflows", data) if isinstance(data, dict) else data


def get_workflow(base_url: Optional[str] = None, workflow_id: str = "") -> dict:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/workflows/{workflow_id}", timeout=10
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def execute_workflow(
    base_url: Optional[str] = None, workflow_id: str = ""
) -> dict:
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/workflows/{workflow_id}/execute",
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def validate_workflow(
    base_url: Optional[str] = None, workflow_id: str = ""
) -> dict:
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/workflows/{workflow_id}/validate",
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def list_workflow_tasks(
    base_url: Optional[str] = None, workflow_id: str = ""
) -> list[dict]:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/workflows/{workflow_id}/tasks",
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


# ── Projects ────────────────────────────────────────────────────────────────


def list_projects(
    base_url: Optional[str] = None, limit: int = 50, offset: int = 0
) -> list[dict]:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/projects",
        params={"limit": limit, "offset": offset},
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    data = r.json()
    return data.get("projects", data) if isinstance(data, dict) else data


def get_project(base_url: Optional[str] = None, project_id: str = "") -> dict:
    r = httpx.get(
        f"{base_url or _base_url()}/api/v1/projects/{project_id}", timeout=10
    )
    if r.is_error:
        _handle_error(r)
    return r.json()


def create_project(
    base_url: Optional[str] = None, name: str = "", description: str = ""
) -> dict:
    r = httpx.post(
        f"{base_url or _base_url()}/api/v1/projects",
        json={"name": name, "description": description},
        timeout=10,
    )
    if r.is_error:
        _handle_error(r)
    return r.json()
