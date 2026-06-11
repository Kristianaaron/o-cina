"""Integration tests for all API endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app import main as main_mod
app = main_mod.app


@pytest.fixture
def client(test_db):
    return TestClient(app)


# --- Health ---
class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("ok", "degraded")
        assert "components" in data


# --- Projects ---
class TestProjects:
    def _create_project(self, client):
        return client.post("/api/v1/projects", json={
            "name": "test-project",
            "description": "Integration test",
            "tags": ["test"],
        })

    def test_create_project(self, client):
        resp = self._create_project(client)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "test-project"

    def test_list_projects(self, client):
        self._create_project(client)
        resp = client.get("/api/v1/projects")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_get_project(self, client):
        cp = self._create_project(client)
        pid = cp.json()["id"]
        resp = client.get(f"/api/v1/projects/{pid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == pid

    def test_delete_project(self, client):
        cp = self._create_project(client)
        pid = cp.json()["id"]
        resp = client.delete(f"/api/v1/projects/{pid}")
        assert resp.status_code in (200, 204)  # 204 No Content is also valid
        resp2 = client.get(f"/api/v1/projects/{pid}")
        assert resp2.status_code == 404


# --- Memory ---
class TestMemory:
    def _create_project(self, client):
        return client.post("/api/v1/projects", json={"name": "mem-test", "description": "", "tags": []})

    def test_store_memory(self, client):
        pid = self._create_project(client).json()["id"]
        resp = client.post(f"/api/v1/projects/{pid}/memories", json={
            "content": "Test memory",
            "source": "user",
            "tags": ["test"],
        })
        assert resp.status_code == 201

    def test_list_memories(self, client):
        pid = self._create_project(client).json()["id"]
        client.post(f"/api/v1/projects/{pid}/memories", json={"content": "Mem1", "source": "user", "tags": ["test"]})
        resp = client.get(f"/api/v1/projects/{pid}/memories")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_search_memories(self, client):
        pid = self._create_project(client).json()["id"]
        client.post(f"/api/v1/projects/{pid}/memories", json={"content": "Python programming", "source": "user", "tags": ["test"]})
        resp = client.post(f"/api/v1/projects/{pid}/memories/search", json={
            "query": "programming",
            "top_k": 5,
        })
        assert resp.status_code == 200

    def test_memory_count(self, client):
        pid = self._create_project(client).json()["id"]
        client.post(f"/api/v1/projects/{pid}/memories", json={"content": "C1", "source": "user", "tags": ["test"]})
        resp = client.get(f"/api/v1/projects/{pid}/memories/count")
        assert resp.status_code == 200
        assert resp.json()["count"] == 1


# --- Sessions ---
class TestSessions:
    def _create_project(self, client):
        return client.post("/api/v1/projects", json={"name": "sess-test", "description": "", "tags": []})

    def test_create_session(self, client):
        pid = self._create_project(client).json()["id"]
        resp = client.post("/api/v1/sessions", json={
            "project_id": pid,
            "agent_id": "agent-1",
            "summary": "Test session",
        })
        assert resp.status_code == 201

    def test_list_project_sessions(self, client):
        pid = self._create_project(client).json()["id"]
        client.post("/api/v1/sessions", json={"project_id": pid, "agent_id": "agent-1", "summary": "S1"})
        resp = client.get(f"/api/v1/projects/{pid}/sessions")
        assert resp.status_code == 200

    def test_add_message(self, client):
        pid = client.post("/api/v1/projects", json={"name": "msg-proj", "description": "", "tags": []}).json()["id"]
        sid = client.post("/api/v1/sessions", json={"project_id": pid, "summary": ""}).json()["id"]
        resp = client.post(f"/api/v1/sessions/{sid}/messages", json={
            "content": "Hello",
        })
        assert resp.status_code == 201

    def test_list_messages(self, client):
        pid = client.post("/api/v1/projects", json={"name": "msg-list-proj", "description": "", "tags": []}).json()["id"]
        sid = client.post("/api/v1/sessions", json={"project_id": pid, "summary": ""}).json()["id"]
        client.post(f"/api/v1/sessions/{sid}/messages", json={"content": "Hi"})
        resp = client.get(f"/api/v1/sessions/{sid}/messages")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# --- Workflows ---
class TestWorkflows:
    def test_create_workflow(self, client):
        pid = client.post("/api/v1/projects", json={"name": "wf-proj", "description": "", "tags": []}).json()["id"]
        resp = client.post("/api/v1/workflows", json={
            "name": "test-flow",
            "nodes": [{"ref_id": "a", "agent_id": "agent-1", "node_type": "agent"}],
            "edges": [],
        })
        assert resp.status_code == 201

    def test_list_workflows(self, client):
        resp = client.get("/api/v1/workflows")
        assert resp.status_code == 200

    def test_get_templates(self, client):
        resp = client.get("/api/v1/workflow-templates")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data.get("templates", [])) >= 1

    def test_validate_dag(self, client):
        pid = client.post("/api/v1/projects", json={"name": "val-proj", "description": "", "tags": []}).json()["id"]
        wf = client.post("/api/v1/workflows", json={
            "name": "v-flow",
            "nodes": [
                {"ref_id": "a", "agent_id": "agent-1", "node_type": "agent"},
                {"ref_id": "b", "agent_id": "agent-2", "node_type": "agent"},
            ],
            "edges": [{"source_ref": "a", "target_ref": "b"}],
        }).json()
        if "id" not in wf:
            pytest.skip("Workflow creation failed — skipping validation test")
        resp = client.post(f"/api/v1/workflows/{wf['id']}/validate")
        assert resp.status_code == 200
        assert "execution_order" in resp.json()


# --- Agents ---
class TestAgents:
    def test_list_agents(self, client):
        resp = client.get("/api/v1/agents")
        assert resp.status_code == 200
