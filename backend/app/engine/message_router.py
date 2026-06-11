"""Message router — route messages between workflow nodes per edge data_rules."""
import logging
import time
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Message, WorkflowEdge, WorkflowNode

logger = logging.getLogger(__name__)


class MessageRouter:
    """Route messages along workflow edges, respecting data_rules."""

    def resolve_targets(self, source_ref: str, workflow_id: str, db: Session) -> list:
        """Get downstream node ref_ids for a given source node."""
        edges = (
            db.query(WorkflowEdge)
            .filter(
                WorkflowEdge.workflow_id == workflow_id,
                WorkflowEdge.source_ref == source_ref,
            )
            .all()
        )
        return [e.target_ref for e in edges]

    def get_node_edges(self, workflow_id: str, source_ref: str, db: Session) -> list:
        """Get all edge objects leaving a source node."""
        return (
            db.query(WorkflowEdge)
            .filter(
                WorkflowEdge.workflow_id == workflow_id,
                WorkflowEdge.source_ref == source_ref,
            )
            .all()
        )

    def route(
        self,
        task_id: str,
        from_ref_id: str,
        payload: dict,
        workflow_id: str,
        db: Session,
    ) -> list:
        """Route message from a source node to all downstream targets.

        Returns list of (target_ref_id, transformed_payload) tuples.
        """
        edges = self.get_node_edges(workflow_id, from_ref_id, db)
        routed = []

        for edge in edges:
            transformed = self._apply_data_rules(payload, edge.data_rules)
            routed.append((edge.target_ref, transformed, edge))

            logger.info(
                "Routed message: task=%s node=%s → %s (label=%s)",
                task_id, from_ref_id, edge.target_ref, edge.label or "—",
            )

        return routed

    def send(
        self,
        task_id: str,
        from_agent_id: Optional[str],
        to_agent_id: Optional[str],
        message_type: str,
        payload: dict,
        db: Session,
    ) -> Message:
        """Persist a message in the messages table."""
        msg = Message(
            task_id=task_id,
            from_agent=from_agent_id,
            to_agent=to_agent_id,
            msg_type=message_type,
            payload=payload,
            timestamp=time.time(),
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        return msg

    def _apply_data_rules(self, payload: dict, data_rules: dict) -> dict:
        """Apply edge data_rules to transform payload.

        Supported rules:
        - "filter": list of keys to keep (whitelist)
        - "exclude": list of keys to remove (blacklist)
        - "rename": dict mapping old_key → new_key
        - "prepend": str prefix added to string values
        """
        if not data_rules:
            return payload

        result = payload.copy()

        # Filter (whitelist)
        if "filter" in data_rules:
            keep = data_rules["filter"]
            result = {k: v for k, v in result.items() if k in keep}

        # Exclude (blacklist)
        if "exclude" in data_rules:
            exclude = data_rules["exclude"]
            result = {k: v for k, v in result.items() if k not in exclude}

        # Rename keys
        if "rename" in data_rules:
            renames = data_rules["rename"]
            renamed = {}
            for k, v in result.items():
                renamed[renames.get(k, k)] = v
            result = renamed

        # Prepend to string values
        if "prepend" in data_rules:
            prefix = data_rules["prepend"]
            for k, v in result.items():
                if isinstance(v, str):
                    result[k] = f"{prefix}{v}"

        return result
