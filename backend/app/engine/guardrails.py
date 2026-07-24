"""Guardrail engine — loop detection, timeouts, approval gates, budget limits."""
import logging
import time

logger = logging.getLogger(__name__)


class GuardrailViolation(Exception):
    """Raised when a guardrail is breached."""
    def __init__(self, rule: str, detail: str):
        self.rule = rule
        self.detail = detail
        super().__init__(f"Guardrail [{rule}]: {detail}")


class GuardrailEngine:
    """Enforce guardrails on workflow execution."""

    def evaluate(
        self,
        task_id: str,
        workflow_guardrails: dict,
        task_created_at: float,
        node_visit_counts: dict,
        current_node: str,
    ) -> dict:
        """Run all guardrail checks. Returns dict with per-rule status.

        Raises GuardrailViolation on hard limit breach.
        """
        results = {}

        # --- Loop detection ---
        max_iter = workflow_guardrails.get("max_iterations", 10)
        loop_ok = self.check_loop_detection(node_visit_counts, max_iter)
        results["loop_detection"] = loop_ok
        if not loop_ok:
            offender = max(node_visit_counts, key=node_visit_counts.get)  # type: ignore
            raise GuardrailViolation(
                "max_iterations",
                f"Node '{offender}' visited {node_visit_counts[offender]} times (limit {max_iter})",
            )

        # --- Timeout ---
        timeout = workflow_guardrails.get("timeout_per_task", 1800)
        timed_out = self.check_timeout(task_created_at, timeout)
        results["timeout"] = not timed_out
        if timed_out:
            elapsed = time.time() - task_created_at
            raise GuardrailViolation(
                "timeout_per_task",
                f"Task elapsed {elapsed:.0f}s (limit {timeout}s)",
            )

        # --- Approval gate ---
        approval_nodes = workflow_guardrails.get("approval_nodes", [])
        needs_approval = self.check_approval_gate(current_node, approval_nodes)
        results["approval_gate"] = needs_approval
        # Approval is NOT a violation — it's a pause point. Handled by engine.

        # --- Budget (tokens/cost tracking) ---
        max_tokens = workflow_guardrails.get("max_tokens")
        max_cost = workflow_guardrails.get("max_cost")
        budget_info = self.check_budget(max_tokens, max_cost)
        results["budget"] = budget_info

        return results

    def check_loop_detection(
        self, node_visit_counts: dict, max_iterations: int = 10
    ) -> bool:
        """Return True if loop detection passes (no violations)."""
        for ref, count in node_visit_counts.items():
            if count > max_iterations:
                logger.warning("Loop detected: node %s visited %d times (limit %d)", ref, count, max_iterations)
                return False
        return True

    def check_timeout(self, task_created_at: float, timeout_per_task: int = 1800) -> bool:
        """Return True if task has timed out."""
        elapsed = time.time() - task_created_at
        if elapsed > timeout_per_task:
            logger.warning("Task timeout: elapsed %.0fs > limit %ds", elapsed, timeout_per_task)
            return True
        return False

    def check_approval_gate(self, current_node: str, approval_nodes: list) -> str | None:
        """Return the node ref if an approval gate is hit, else None."""
        if current_node in approval_nodes:
            logger.info("Approval gate hit: node %s", current_node)
            return current_node
        return None

    def check_budget(
        self, max_tokens: int | None = None, max_cost: float | None = None
    ) -> dict:
        """Budget check — returns info dict. Caller accumulates tokens/cost.

        Currently informational; full integration requires per-node token tracking.
        """
        return {
            "max_tokens": max_tokens,
            "max_cost": max_cost,
            "enforced": max_tokens is not None or max_cost is not None,
        }
