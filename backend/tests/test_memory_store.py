"""Unit tests for memory_store.py"""
import pytest

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture
def store(temp_chroma):
    """Isolated MemoryStore with temp ChromaDB directory."""
    from app.memory_store import MemoryStore
    s = MemoryStore(persist_dir=temp_chroma)
    return s


class TestMemoryStore:
    def test_health_check(self, store):
        assert store.health_check() == "ok"

    def test_ensure_collection(self, store):
        coll = store.ensure_collection("proj-unique-1")
        assert coll is not None

    def test_store_and_search(self, store):
        pid = "proj-store-search"
        store.ensure_collection(pid)
        mid = store.add_memory(pid, "Python is a programming language", source="user")
        assert mid is not None

        results = store.search(pid, "programming language")
        assert len(results) >= 1
        assert results[0]["id"] == mid

    def test_search_returns_ranked(self, store):
        pid = "proj-ranked"
        store.ensure_collection(pid)
        store.add_memory(pid, "Python is great for data science", source="user")
        store.add_memory(pid, "Rust is a systems language", source="user")
        store.add_memory(pid, "JavaScript runs in the browser", source="user")

        results = store.search(pid, "data science")
        assert len(results) >= 1
        assert "Python" in results[0]["content"]

    def test_delete_memory(self, store):
        pid = "proj-del"
        store.ensure_collection(pid)
        mid = store.add_memory(pid, "To be deleted", source="user")
        store.delete_memory(pid, mid)
        result = store.get_memory(pid, mid)
        assert result is None

    def test_update_memory(self, store):
        pid = "proj-upd"
        store.ensure_collection(pid)
        mid = store.add_memory(pid, "Original content", source="user")
        store.update_memory(pid, mid, content="Updated content")
        result = store.get_memory(pid, mid)
        assert result["content"] == "Updated content"

    def test_count_with_source_filter(self, store):
        pid = "proj-count"
        store.ensure_collection(pid)
        store.add_memory(pid, "User mem 1", source="user")
        store.add_memory(pid, "User mem 2", source="user")
        store.add_memory(pid, "System mem", source="system")

        assert store.count(pid) == 3
        assert store.count(pid, source="user") == 2
        assert store.count(pid, source="system") == 1

    def test_search_empty_collection(self, store):
        pid = "proj-empty"
        store.ensure_collection(pid)
        results = store.search(pid, "anything")
        assert results == []

    def test_search_source_filter(self, store):
        pid = "proj-src-filter"
        store.ensure_collection(pid)
        store.add_memory(pid, "User thought", source="user")
        store.add_memory(pid, "System note", source="system")

        results = store.search(pid, "thought", source="user")
        assert len(results) == 1

    def test_delete_collection(self, store):
        pid = "proj-del-coll"
        store.ensure_collection(pid)
        store.add_memory(pid, "X", source="user")
        store.delete_collection(pid)
        assert store.count(pid) == 0
