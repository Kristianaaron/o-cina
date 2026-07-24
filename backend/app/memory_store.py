"""ChromaDB-based memory store with per-project collections and semantic search."""
# Force CPU-only ONNX Runtime BEFORE chromadb imports it — avoids GPU detection hangs on ARM64
import os as _os
import time
import uuid
from pathlib import Path

_os.environ["CUDA_VISIBLE_DEVICES"] = ""
_os.environ["ONNXRUNTIME_DISABLE_CUDA"] = "1"

import chromadb
from chromadb.utils import embedding_functions

# Keep chroma under ~/.o-cina alongside SQLite (portable macOS + Linux)
DEFAULT_PERSIST_DIR = _os.getenv(
    "CHROMA_PERSIST_DIR",
    str(Path.home() / ".o-cina" / "data" / "chroma"),
)
DEFAULT_TOP_K = 5
Path(DEFAULT_PERSIST_DIR).mkdir(parents=True, exist_ok=True)


class MemoryStore:
    """Per-project memory collections backed by ChromaDB."""

    def __init__(self, persist_dir: str = DEFAULT_PERSIST_DIR):
        import os
        # Force CPU-only ONNX — avoids GPU detection hangs on ARM64
        os.environ["ORT_TENSORRT_EP_DISABLE_AVOIDED"] = "1"
        self._client = chromadb.PersistentClient(path=persist_dir)
        ef = embedding_functions.DefaultEmbeddingFunction()
        # Patch to use CPU-only providers
        if hasattr(ef, '_ef') and hasattr(ef._ef, 'ondemand_text_embedding'):
            ef._ef.ondemand_text_embedding._providers = ["CPUExecutionProvider"]
        self._ef = ef
        self._persist_dir = persist_dir

    # ── Collection management ────────────────────────────────────────────────

    def _collection_name(self, project_id: str) -> str:
        return f"project_{project_id}"

    def _get_or_create_collection(self, project_id: str, metadata: dict | None = None) -> chromadb.Collection:
        name = self._collection_name(project_id)
        col = self._client.get_or_create_collection(
            name=name,
            metadata=metadata or {"hnsw:space": "cosine"},
            embedding_function=self._ef,
        )
        return col

    def ensure_collection(self, project_id: str) -> chromadb.Collection:
        """Ensure a project has a memory collection."""
        return self._get_or_create_collection(project_id)

    def delete_collection(self, project_id: str):
        """Delete a project's memory collection (called on project delete)."""
        name = self._collection_name(project_id)
        try:
            self._client.delete_collection(name=name)
        except Exception:
            pass  # Collection may not exist

    # ── Memory CRUD ──────────────────────────────────────────────────────────

    def add_memory(self, project_id: str, content: str, source: str = "user",
                   metadata: dict | None = None, memory_id: str | None = None) -> str:
        """Add a memory entry to a project's collection.

        Args:
            project_id: Project UUID
            content: Text content to store/embed
            source: Source of memory (user, agent, system, workflow)
            metadata: Additional metadata (tags, session_id, agent_id, etc.)
            memory_id: Optional pre-assigned ID (for DB sync)

        Returns:
            memory_id: ChromaDB document ID
        """
        col = self._get_or_create_collection(project_id)
        mid = memory_id or str(uuid.uuid4())
        ts = time.time()
        merged_meta = {
            "source": source,
            "created_at": str(ts),
            **(metadata or {}),
        }
        # ChromaDB v1.5+ rejects empty lists in metadata
        merged_meta = {k: v for k, v in merged_meta.items() if not (isinstance(v, list) and len(v) == 0)}
        col.upsert(
            documents=[content],
            ids=[mid],
            metadatas=[merged_meta],
        )
        return mid

    def get_memory(self, project_id: str, memory_id: str) -> dict | None:
        """Get a single memory by ID."""
        try:
            col = self._client.get_collection(name=self._collection_name(project_id), embedding_function=self._ef)
            result = col.get(ids=[memory_id])
            if result["documents"]:
                return {
                    "id": memory_id,
                    "content": result["documents"][0],
                    "metadata": result["metadatas"][0] if result["metadatas"] else {},
                }
        except Exception:
            pass
        return None

    def update_memory(self, project_id: str, memory_id: str, content: str | None = None,
                      metadata: dict | None = None):
        """Update a memory entry."""
        col = self._get_or_create_collection(project_id)
        docs, metas = [], []
        if content is not None:
            docs.append(content)
        if metadata is not None:
            metas.append(metadata)
        if docs or metas:
            col.update(ids=[memory_id], documents=docs or None, metadatas=metas or None)

    def delete_memory(self, project_id: str, memory_id: str):
        """Delete a memory entry."""
        try:
            col = self._client.get_collection(name=self._collection_name(project_id), embedding_function=self._ef)
            col.delete(ids=[memory_id])
        except Exception:
            pass

    # ── Semantic search ──────────────────────────────────────────────────────

    def search(self, project_id: str, query: str, top_k: int = DEFAULT_TOP_K,
               source: str | None = None, tags: list | None = None) -> list[dict]:
        """Semantic search within a project's memory collection.

        Args:
            project_id: Project UUID
            query: Search query text (embedded & compared via cosine similarity)
            top_k: Number of results
            source: Filter by source (user, agent, system, workflow)
            tags: Filter by tags list in metadata

        Returns:
            List of {id, content, metadata, distance, score}
        """
        try:
            col = self._client.get_collection(name=self._collection_name(project_id), embedding_function=self._ef)
        except Exception:
            return []

        where = {}
        if source:
            where["source"] = source
        # ChromaDB doesn't support list containment in where, so we post-filter tags
        results = col.query(query_texts=[query], n_results=top_k * (3 if tags else 1), where=where or None)

        hits = []
        for i in range(len(results["ids"][0])):
            meta = results["metadatas"][0][i] if results["metadatas"] and results["metadatas"][0] else {}
            # Post-filter by tags if specified
            if tags:
                meta_tags = meta.get("tags", [])
                if not any(t in meta_tags for t in tags):
                    continue
            dist = results["distances"][0][i] if results["distances"] else 1.0
            score = 1.0 - dist  # Convert distance to similarity score
            hits.append({
                "id": results["ids"][0][i],
                "content": results["documents"][0][i],
                "metadata": meta,
                "distance": dist,
                "score": round(score, 4),
            })
            if len(hits) >= top_k:
                break
        return hits

    # ── Bulk operations ──────────────────────────────────────────────────────

    def bulk_add(self, project_id: str, memories: list[dict]) -> list[str]:
        """Add multiple memories at once.

        Each memory: {content, source, metadata, id (optional)}
        """
        col = self._get_or_create_collection(project_id)
        ids, docs, metas = [], [], []
        for m in memories:
            mid = m.get("id", str(uuid.uuid4()))
            ts = time.time()
            merged = {
                "source": m.get("source", "user"),
                "created_at": str(ts),
                **(m.get("metadata") or {}),
            }
            ids.append(mid)
            docs.append(m["content"])
            metas.append(merged)
        col.upsert(ids=ids, documents=docs, metadatas=metas)
        return ids

    def list_memories(self, project_id: str, limit: int = 50, offset: int = 0,
                      source: str | None = None) -> list[dict]:
        """List memories in a project (most recent first)."""
        try:
            col = self._client.get_collection(name=self._collection_name(project_id), embedding_function=self._ef)
        except Exception:
            return []
        where = {"source": source} if source else None
        result = col.get(where=where, limit=limit, offset=offset, include=["metadatas", "documents"])
        memories = []
        for i in range(len(result["ids"])):
            memories.append({
                "id": result["ids"][i],
                "content": result["documents"][i] if result["documents"] else "",
                "metadata": result["metadatas"][i] if result["metadatas"] else {},
            })
        # Sort by created_at desc
        memories.sort(key=lambda m: float(m["metadata"].get("created_at", 0)), reverse=True)
        return memories

    def count(self, project_id: str, source: str | None = None) -> int:
        """Count memories in a project, optionally filtered by source."""
        try:
            col = self._client.get_collection(name=self._collection_name(project_id), embedding_function=self._ef)
            if source:
                r = col.get(where={"source": source})
                return len(r["ids"])
            return col.count()
        except Exception:
            return 0

    def health_check(self) -> str:
        """Quick health check."""
        try:
            self._client.heartbeat()
            return "ok"
        except Exception as e:
            return f"error: {e}"


# Singleton instance
memory_store = MemoryStore()
