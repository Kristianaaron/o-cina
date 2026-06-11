"""Workflow engine — DAG validation, topological sort, and async execution."""
import asyncio
import logging
import time
import uuid
from collections import deque
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.engine.guardrails import GuardrailEngine, GuardrailViolation
from app.engine.message_router import MessageRouter
from app.models import Task, Workflow, WorkflowNode, WorkflowEdge, Message, Agent

logger = logging.getLogger(__name__)

guardrail_engine = GuardrailEngine()
message_router = MessageRouter()


class WorkflowEngine:
    """Execute workflows as DAGs with guardrail enforcement."""

    # ── DAG validation ────────────────────────────────────────────

    def validate_dag(self, workflow_id: str, db: Session) -> bool:
        """Validate workflow DAG: no cycles, all refs exist.

        Raises ValueError on validation failure.
        """
        nodes = (
            db.query(WorkflowNode)
            .filter(WorkflowNode.workflow_id == workflow_id)
            .all()
        )
        if not nodes:
            raise ValueError(f"Workflow {workflow_id} has no nodes")

        node_refs = {n.ref_id for n in nodes}

        edges = (
            db.query(WorkflowEdge)
            .filter(WorkflowEdge.workflow_id == workflow_id)
            .all()
        )

        for e in edges:
            if e.source_ref not in node_refs:
                raise ValueError(f"Edge references unknown source node '{e.source_ref}'")
            if e.target_ref not in node_refs:
                raise ValueError(f"Edge references unknown target node '{e.target_ref}'")

        # Cycle detection via Kahn's algorithm
        in_degree: dict[str, int] = {n.ref_id: 0 for n in nodes}
        adj: dict[str, list[str]] = {n.ref_id: [] for n in nodes}

        for e in edges:
            adj[e.source_ref].append(e.target_ref)
            in_degree[e.target_ref] += 1

        queue = deque(ref for ref, deg in in_degree.items() if deg == 0)
        visited = 0

        while queue:
            node = queue.popleft()
            visited += 1
            for neighbor in adj[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if visited != len(node_refs):
            raise ValueError(f"Workflow {workflow_id} contains a cycle")

        return True

    def topological_sort(self, workflow_id: str, db: Session) -> list:
        """Return list of ref_ids in topological execution order."""
        self.validate_dag(workflow_id, db)

        nodes = (
            db.query(WorkflowNode)
            .filter(WorkflowNode.workflow_id == workflow_id)
            .all()
        )
        edges = (
            db.query(WorkflowEdge)
            .filter(WorkflowEdge.workflow_id == workflow_id)
            .all()
        )

        node_refs = {n.ref_id for n in nodes}
        in_degree: dict[str, int] = {n.ref_id: 0 for n in nodes}
        adj: dict[str, list[str]] = {n.ref_id: [] for n in nodes}

        for e in edges:
            adj[e.source_ref].append(e.target_ref)
            in_degree[e.target_ref] += 1

        queue = deque(sorted(ref for ref, deg in in_degree.items() if deg == 0))
        order = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for neighbor in sorted(adj[node]):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return order

    # ── Task lifecycle ────────────────────────────────────────────

    def create_task(self, workflow_id: str, context: dict, db: Session) -> Task:
        """Create a Task record for workflow execution."""
        task = Task(
            workflow_id=workflow_id,
            status="pending",
            context=context,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def get_task_status(self, task_id: str, db: Session) -> dict:
        """Get task state + node statuses."""
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return {"error": "Task not found"}

        nodes = []
        if task.workflow_id:
            node_rows = (
                db.query(WorkflowNode)
                .filter(WorkflowNode.workflow_id == task.workflow_id)
                .all()
            )
            nodes = [
                {
                    "ref_id": n.ref_id,
                    "node_type": n.node_type,
                    "status": n.status,
                    "retry_count": n.retry_count,
                }
                for n in node_rows
            ]

        return {
            "task_id": task.id,
            "workflow_id": task.workflow_id,
            "status": task.status,
            "current_node": task.current_node,
            "context": task.context,
            "result": task.result,
            "nodes": nodes,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }

    def stop_task(self, task_id: str, db: Session) -> bool:
        """Cancel a running task."""
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return False

        if task.status in ("completed", "failed", "cancelled"):
            return False

        task.status = "cancelled"
        task.updated_at = time.time()
        db.commit()

        # Reset node statuses
        if task.workflow_id:
            db.query(WorkflowNode).filter(
                WorkflowNode.workflow_id == task.workflow_id
            ).update({WorkflowNode.status: "cancelled"})
            db.commit()

        logger.info("Task %s cancelled", task_id)
        return True

    # ── Execution ─────────────────────────────────────────────────

    async def execute_task(self, task_id: str):
        """Async executor: walk DAG, run nodes, enforce guardrails.

        Runs in background — uses its own DB session.
        """
        with SessionLocal() as db:
            try:
                await self._run_task(task_id, db)
            except Exception as exc:
                logger.exception("Task %s failed: %s", task_id, exc)
                task = db.query(Task).filter(Task.id == task_id).first()
                if task:
                    task.status = "failed"
                    task.result = {"error": str(exc)}
                    task.updated_at = time.time()
                    db.commit()

    async def _run_task(self, task_id: str, db: Session):
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise ValueError(f"Task {task_id} not found")

        workflow = db.query(Workflow).filter(Workflow.id == task.workflow_id).first()
        if not workflow:
            raise ValueError(f"Workflow {task.workflow_id} not found")

        guardrails = workflow.guardrails or {}
        task.created_at = task.created_at or time.time()

        # Validate DAG
        self.validate_dag(task.workflow_id, db)
        execution_order = self.topological_sort(task.workflow_id, db)

        task.status = "running"
        task.updated_at = time.time()
        db.commit()

        logger.info("Task %s executing workflow %s (%d nodes)", task_id, workflow.id, len(execution_order))

        node_map = {}
        node_rows = (
            db.query(WorkflowNode)
            .filter(WorkflowNode.workflow_id == task.workflow_id)
            .all()
        )
        for n in node_rows:
            node_map[n.ref_id] = n

        node_visit_counts: dict[str, int] = {}
        node_results: dict[str, dict] = {}

        for ref_id in execution_order:
            # Check if cancelled
            task = db.refresh(task) or task
            if task.status == "cancelled":
                return

            node = node_map.get(ref_id)
            if not node:
                continue

            # Visit count
            node_visit_counts[ref_id] = node_visit_counts.get(ref_id, 0) + 1

            # Check guardrails BEFORE execution
            try:
                guardrail_engine.evaluate(
                    task_id=task_id,
                    workflow_guardrails=guardrails,
                    task_created_at=task.created_at or time.time(),
                    node_visit_counts=node_visit_counts,
                    current_node=ref_id,
                )
            except GuardrailViolation as gvr:
                task.status = "failed"
                task.result = {"guardrail_violation": gvr.rule, "detail": gvr.detail}
                task.updated_at = time.time()
                db.commit()
                return

            # Check approval gate
            approval_nodes = guardrails.get("approval_nodes", [])
            if ref_id in approval_nodes:
                node.status = "waiting"
                task.current_node = ref_id
                task.status = "waiting_approval"
                task.updated_at = time.time()
                db.commit()
                logger.info("Task %s waiting for approval at node %s", task_id, ref_id)
                # Block until approved or cancelled
                await self._wait_for_approval(task_id, ref_id, db)
                task = db.refresh(task) or task
                if task.status == "cancelled":
                    return

            # Execute node
            task.current_node = ref_id
            task.status = "running"
            task.updated_at = time.time()
            node.status = "running"
            db.commit()

            result = await self._execute_node(task_id, node, task.context, db)

            node.status = "completed"
            node_results[ref_id] = result
            task.updated_at = time.time()
            db.commit()

            # Route message to downstream nodes
            routed = message_router.route(task_id, ref_id, result, task.workflow_id, db)
            for target_ref, transformed_payload, edge in routed:
                target_node = node_map.get(target_ref)
                if target_node:
                    agent_id = target_node.agent_id
                    message_router.send(
                        task_id=task_id,
                        from_agent_id=node.agent_id,
                        to_agent_id=agent_id,
                        message_type=edge.label or "workflow_message",
                        payload=transformed_payload,
                        db=db,
                    )
                    logger.info(
                        "Message routed: %s → %s (type=%s)",
                        ref_id, target_ref, edge.label or "workflow_message",
                    )

        # All nodes complete
        task.status = "completed"
        task.result = node_results
        task.updated_at = time.time()
        db.commit()

        logger.info("Task %s completed successfully", task_id)

    async def _execute_node(
        self, task_id: str, node: WorkflowNode, context: dict, db: Session
    ) -> dict:
        """Execute a single workflow node."""
        node_type = node.node_type

        if node_type == "agent":
            return await self._execute_agent_node(task_id, node, context, db)
        elif node_type == "approval":
            return {"approved": True, "node": node.ref_id}
        elif node_type == "decision":
            return await self._execute_decision_node(task_id, node, context, db)
        elif node_type == "subflow":
            return await self._execute_subflow_node(task_id, node, context, db)
        else:
            logger.warning("Unknown node type '%s' for node %s", node_type, node.ref_id)
            return {"error": f"Unknown node type: {node_type}"}

    async def _execute_agent_node(
        self, task_id: str, node: WorkflowNode, context: dict, db: Session
    ) -> dict:
        """Execute an agent node — dispatch to registered agent via adapter."""
        if not node.agent_id:
            return {"error": "Agent node has no agent_id assigned"}

        agent = db.query(Agent).filter(Agent.id == node.agent_id).first()
        if not agent:
            return {"error": f"Agent {node.agent_id} not found"}

        # Build prompt from context + node config
        prompt = context.get("prompt", "")
        node_prompt = node.config.get("prompt", "")
        full_prompt = f"{node_prompt}\n\n{prompt}" if node_prompt else prompt

        if not full_prompt:
            full_prompt = context.get("result", {}).get("output", "Continue workflow")

        logger.info("Dispatching to agent %s (%s)", node.ref_id, agent.name)

        # Try adapter dispatch
        try:
            from app.adapters.base import adapter_registry
            adapter = adapter_registry.get(agent.harness)
            if adapter:
                result = await adapter.dispatch(
                    agent=agent,
                    prompt=full_prompt,
                    context=context,
                )
                return {
                    "node": node.ref_id,
                    "agent": agent.name,
                    "status": "completed",
                    "output": result,
                }
        except Exception as exc:
            logger.warning("Adapter dispatch failed for %s: %s", agent.name, exc)

        # Fallback: record message and return placeholder
        msg = message_router.send(
            task_id=task_id,
            from_agent_id=None,
            to_agent_id=node.agent_id,
            message_type="workflow_dispatch",
            payload={"prompt": full_prompt, "context": context},
            db=db,
        )
        return {
            "node": node.ref_id,
            "agent": agent.name,
            "status": "dispatched",
            "message_id": msg.id,
            "note": "Agent dispatch pending — no adapter available",
        }

    async def _execute_decision_node(
        self, task_id: str, node: WorkflowNode, context: dict, db: Session
    ) -> dict:
        """Execute a decision node — evaluate condition from config."""
        condition = node.config.get("condition", "true")
        # Simple evaluation: check if context key matches expected value
        check_key = node.config.get("check_key")
        expected = node.config.get("expected")

        if check_key and expected:
            actual = context.get(check_key)
            passed = actual == expected
        else:
            passed = condition.lower() in ("true", "yes", "1")

        return {
            "node": node.ref_id,
            "type": "decision",
            "passed": passed,
            "condition": condition,
        }

    async def _execute_subflow_node(
        self, task_id: str, node: WorkflowNode, context: dict, db: Session
    ) -> dict:
        """Execute a subflow node — run another workflow."""
        subflow_id = node.config.get("workflow_id")
        if not subflow_id:
            return {"error": "Subflow node missing workflow_id in config"}

        logger.info("Executing subflow %s from node %s", subflow_id, node.ref_id)

        # Create subflow task
        sub_task = Task(
            workflow_id=subflow_id,
            status="pending",
            context=context,
        )
        db.add(sub_task)
        db.commit()
        db.refresh(sub_task)

        # Run subflow (synchronous for now)
        try:
            await self._run_task(sub_task.id, db)
            sub_task = db.query(Task).filter(Task.id == sub_task.id).first()
            return {
                "node": node.ref_id,
                "type": "subflow",
                "subflow_id": subflow_id,
                "subflow_task_id": sub_task.id,
                "status": sub_task.status,
                "result": sub_task.result,
            }
        except Exception as exc:
            return {
                "node": node.ref_id,
                "type": "subflow",
                "subflow_id": subflow_id,
                "error": str(exc),
            }

    async def _wait_for_approval(
        self, task_id: str, node_ref: str, db: Session, timeout: int = 3600
    ):
        """Poll until task is approved or timeout/cancelled."""
        start = time.time()
        while time.time() - start < timeout:
            task = db.query(Task).filter(Task.id == task_id).first()
            if not task:
                return
            if task.status == "approved":
                logger.info("Task %s approved at node %s", task_id, node_ref)
                task.status = "running"
                db.commit()
                return
            if task.status == "cancelled":
                return
            await asyncio.sleep(2)

        # Timeout — auto-approve or fail
        logger.warning("Approval timeout for task %s at node %s — auto-approving", task_id, node_ref)
        task = db.query(Task).filter(Task.id == task_id).first()
        if task:
            task.status = "running"
            db.commit()
