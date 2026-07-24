"""Projects CRUD endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.memory_store import memory_store
from app.models import Project
from app.schemas import ProjectCreate, ProjectUpdate, ProjectOut

router = APIRouter()


@router.post("/projects", status_code=201)
def create_project(proj: ProjectCreate, db: Session = Depends(get_db)):
    db_proj = Project(**proj.model_dump())
    db.add(db_proj)
    db.commit()
    db.refresh(db_proj)
    return ProjectOut.model_validate(db_proj)


@router.get("/projects")
def list_projects(
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Project)
    if tag:
        q = q.filter(Project.tags.contains([tag]))
    if search:
        q = q.filter(Project.name.ilike(f"%{search}%"))
    projs = q.all()
    return {"projects": [ProjectOut.model_validate(p) for p in projs], "total": len(projs)}


@router.get("/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    return ProjectOut.model_validate(proj)


@router.patch("/projects/{project_id}")
def update_project(project_id: str, updates: ProjectUpdate, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    for field, value in updates.model_dump(exclude_none=True).items():
        setattr(proj, field, value)
    db.commit()
    db.refresh(proj)
    return ProjectOut.model_validate(proj)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(404, "Project not found")
    # Clean up ChromaDB collection
    memory_store.delete_collection(project_id)
    db.delete(proj)
    db.commit()
