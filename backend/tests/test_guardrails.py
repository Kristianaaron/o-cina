"""Unit tests for guardrails.py"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.engine.guardrails import GuardrailEngine, GuardrailViolation
import pytest


@pytest.fixture
def engine():
    return GuardrailEngine()


def now():
    import time; return time.time()


class TestGuardrails:
    def test_passes_clean(self, engine):
        result = engine.evaluate(
            task_id="t1",
            workflow_guardrails={"max_iterations": 10, "timeout_per_task": 3600, "approval_nodes": set(), "max_failed_attempts": 3, "budget_limit": None},
            task_created_at=now(),
            node_visit_counts={"n1": 1},
            current_node="n1",
        )
        assert result["loop_detection"] is True

    def test_max_iterations_violation(self, engine):
        with pytest.raises(GuardrailViolation) as exc:
            engine.evaluate(
                task_id="t1",
                workflow_guardrails={"max_iterations": 3},
                task_created_at=now(),
                node_visit_counts={"n1": 4},
                current_node="n1",
            )
        assert "max_iterations" in str(exc.value) or "loop" in str(exc.value).lower()

    def test_timeout_violation(self, engine):
        import time
        with pytest.raises(GuardrailViolation) as exc:
            engine.evaluate(
                task_id="t1",
                workflow_guardrails={"timeout_per_task": 10},
                task_created_at=time.time() - 100,  # 100s ago
                node_visit_counts={"n1": 1},
                current_node="n1",
            )
        assert "timeout" in str(exc.value).lower()

    def test_guardrail_violation_attributes(self):
        v = GuardrailViolation("test_rule", "test detail")
        assert v.rule == "test_rule"
        assert v.detail == "test detail"
        assert "test_rule" in str(v)
