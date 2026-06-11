"""Memory CRUD and semantic search endpoints."""
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MemoryEntry, Project
from app.memory_store import memory_store

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class MemoryCreate(BaseModel):
    content: str = Field(..., min_length=1, description="Memory text content")
    source: str = Field(default="user", description="Source: user, agent, system, workflow")
    tags: list[str] = Field(default_factory=list, description="Tags for filtering")
    session_id: Optional[str] = Field(None, description="Associate with a session")
    agent_id: Optional[str] = Field(None, description="Associate with an agent")


class MemoryUpdate(BaseModel):
    content: Optional[str] = None
    tags: Optional[list[str]] = None


class MemorySearch(BaseModel):
    query: str = Field(..., min_length=1, description="Search query text")
    top_k: int = Field(5, ge=1, le=20, description="Number of results")
    source: Optional[str] = Field(None, description="Filter by source")
    tags: Optional[list[str]] = Field(None, description="Filter by tags")


class MemoryOut(BaseModel):
    id: str
    chroma_id: str
    project_id: str
    content: str
    source: str
    metadata: dict = {}
    tags: list = []
    created_at: float
    updated_at: Optional[float] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, obj) -> "MemoryOut":
        return cls(
            id=obj.id, chroma_id=obj.chroma_id, project_id=obj.project_id,
            content=obj.content, source=obj.source,
            metadata=obj.meta or {}, tags=obj.tags or [],
            created_at=obj.created_at, updated_at=obj.updated_at,
        )


class SearchResult(BaseModel):
    id: str
    content: str
    metadata: dict = {}
    score: float
    distance: float


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/memories", status_code=201)
def create_memory(project_id: str, body: MemoryCreate, db: Session = Depends(get_db)):
    """Create a memory entry. Stores in both ChromaDB (embeddings) and SQLite (metadata)."""
    # Verify project exists
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    # Generate IDs
    mid = str(uuid.uuid4())
    chroma_mid = str(uuid.uuid4())

    # Store in ChromaDB (embeddings + semantic search)
    meta = {"tags": body.tags, "source": body.source}
    if body.session_id:
        meta["session_id"] = body.session_id
    if body.agent_id:
        meta["agent_id"] = body.agent_id

    memory_store.add_memory(
        project_id=project_id,
        content=body.content,
        source=body.source,
        metadata=meta,
        memory_id=chroma_mid,
    )

    # Store in SQLite (structured metadata)
    ts = time.time()
    entry = MemoryEntry(
        id=mid,
        project_id=project_id,
        chroma_id=chroma_mid,
        content=body.content,
        source=body.source,
        meta=meta,
        tags=body.tags,
        created_at=ts,
        updated_at=ts,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return MemoryOut.from_orm_obj(entry)


@router.get("/projects/{project_id}/memories")
def list_memories(
    project_id: str,
    source: Optional[str] = Query(None, description="Filter by source"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List memories for a project."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    q = db.query(MemoryEntry).filter(MemoryEntry.project_id == project_id)
    if source:
        q = q.filter(MemoryEntry.source == source)
    q = q.order_by(MemoryEntry.created_at.desc()).offset(offset).limit(limit)
    entries = q.all()
    return {"memories": [MemoryOut.from_orm_obj(e) for e in entries], "total": len(entries)}


@router.get("/projects/{project_id}/memories/count")
def memory_count(
    project_id: str,
    source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Count memories in a project."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    count = memory_store.count(project_id, source=source)
    return {"project_id": project_id, "source": source, "count": count}


@router.get("/projects/{project_id}/memories/{memory_id}")
def get_memory(project_id: str, memory_id: str, db: Session = Depends(get_db)):
    """Get a single memory entry."""
    entry = db.query(MemoryEntry).filter(
        MemoryEntry.id == memory_id,
        MemoryEntry.project_id == project_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Memory not found")
    return MemoryOut.from_orm_obj(entry)


@router.patch("/projects/{project_id}/memories/{memory_id}")
def update_memory(project_id: str, memory_id: str, body: MemoryUpdate, db: Session = Depends(get_db)):
    """Update a memory entry."""
    entry = db.query(MemoryEntry).filter(
        MemoryEntry.id == memory_id,
        MemoryEntry.project_id == project_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Memory not found")

    if body.content is not None:
        entry.content = body.content
    if body.tags is not None:
        entry.tags = body.tags
        entry.meta["tags"] = body.tags

    entry.updated_at = time.time()
    db.commit()
    db.refresh(entry)

    # Sync to ChromaDB
    update_data = {}
    if body.content is not None:
        update_data["content"] = body.content
    if body.tags is not None:
        update_data["metadata"] = {"tags": body.tags}
    if update_data:
        memory_store.update_memory(project_id, entry.chroma_id, **update_data)

    return MemoryOut.from_orm_obj(entry)


@router.delete("/projects/{project_id}/memories/{memory_id}", status_code=204)
def delete_memory(project_id: str, memory_id: str, db: Session = Depends(get_db)):
    """Delete a memory entry."""
    entry = db.query(MemoryEntry).filter(
        MemoryEntry.id == memory_id,
        MemoryEntry.project_id == project_id,
    ).first()
    if not entry:
        raise HTTPException(404, "Memory not found")

    # Delete from ChromaDB
    memory_store.delete_memory(project_id, entry.chroma_id)

    # Delete from SQLite
    db.delete(entry)
    db.commit()


@router.post("/projects/{project_id}/memories/search")
def search_memories(
    project_id: str,
    body: MemorySearch,
    db: Session = Depends(get_db),
):
    """Semantic search within a project's memory collection."""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")

    results = memory_store.search(
        project_id=project_id,
        query=body.query,
        top_k=body.top_k,
        source=body.source,
        tags=body.tags,
    )

    return {"query": body.query, "results": results, "total": len(results)}
