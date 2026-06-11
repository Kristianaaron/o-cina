"""Unit tests for workflow_engine.py — DB-backed DAG validation."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.engine.workflow_engine import WorkflowEngine
from app.models import Workflow, WorkflowNode, WorkflowEdge


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def engine():
    return WorkflowEngine()


def make_workflow(db, nodes_data, edges_data):
    """Create a workflow with nodes and edges in test DB."""
    wf = Workflow(name="test", nodes=[], edges=[])
    db.add(wf)
    db.flush()
    for nd in nodes_data:
        node = WorkflowNode(workflow_id=wf.id, ref_id=nd["ref_id"], node_type=nd["type"], config=nd.get("config", {}))
        db.add(node)
    for ed in edges_data:
        edge = WorkflowEdge(workflow_id=wf.id, source_ref=ed["source"], target_ref=ed["target"], data_rules=ed.get("data_rules", []))
        db.add(edge)
    db.commit()
    return wf.id


class TestWorkflowEngine:
    def test_validate_linear_dag(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "agent"}, {"ref_id": "C", "type": "agent"}],
            [{"source": "A", "target": "B"}, {"source": "B", "target": "C"}],
        )
        result = engine.validate_dag(wid, db)
        assert result is True

    def test_detect_cycle(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "agent"}],
            [{"source": "A", "target": "B"}, {"source": "B", "target": "A"}],
        )
        with pytest.raises(ValueError, match="cycle"):
            engine.validate_dag(wid, db)

    def test_empty_workflow(self, engine, db):
        wf = Workflow(name="empty", nodes=[], edges=[])
        db.add(wf)
        db.commit()
        with pytest.raises(ValueError, match="no nodes"):
            engine.validate_dag(wf.id, db)

    def test_unknown_source_ref(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "agent"}],
            [{"source": "Z", "target": "B"}],  # Z doesn't exist as source
        )
        with pytest.raises(ValueError, match="unknown source"):
            engine.validate_dag(wid, db)

    def test_unknown_target_ref(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "agent"}],
            [{"source": "A", "target": "Z"}],  # Z doesn't exist as target
        )
        with pytest.raises(ValueError, match="unknown target"):
            engine.validate_dag(wid, db)

    def test_diamond_dag(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "agent"},
             {"ref_id": "C", "type": "agent"}, {"ref_id": "D", "type": "agent"}],
            [{"source": "A", "target": "B"}, {"source": "A", "target": "C"},
             {"source": "B", "target": "D"}, {"source": "C", "target": "D"}],
        )
        result = engine.validate_dag(wid, db)
        assert result is True

    def test_single_node(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}],
            [],
        )
        result = engine.validate_dag(wid, db)
        assert result is True

    def test_disconnected_nodes(self, engine, db):
        # Two nodes, no edges — valid DAG (two entry points)
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "agent"}],
            [],
        )
        result = engine.validate_dag(wid, db)
        assert result is True

    def test_approval_node_in_dag(self, engine, db):
        wid = make_workflow(db,
            [{"ref_id": "A", "type": "agent"}, {"ref_id": "B", "type": "approval"}, {"ref_id": "C", "type": "agent"}],
            [{"source": "A", "target": "B"}, {"source": "B", "target": "C"}],
        )
        result = engine.validate_dag(wid, db)
        assert result is True
