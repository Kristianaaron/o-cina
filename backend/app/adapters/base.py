"""Adapter framework base class.

Defines the contract all agent adapters must implement.
Adapters translate agent-specific configs into spawn commands
and provide harness-specific lifecycle hooks.
"""

import subprocess
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class AgentAdapter(ABC):
    """Base class for agent harness adapters.

    Each harness type (hermes, claude-code, codex, etc.) provides
    its own subclass implementing the abstract methods.
    """

    # Unique identifier for this adapter type
    harness_type: str = "unknown"

    # Default command template (override in subclass)
    default_command: List[str] = []

    def __init__(self):
        pass

    @abstractmethod
    def register_info(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Return agent metadata for registration.

        Returns dict with keys: name, harness, model, provider, skills, endpoint.
        """
        pass

    @abstractmethod
    def build_command(self, config: Dict[str, Any]) -> List[str]:
        """Build the subprocess command list from agent config.

        Must return a list (no shell injection — Popen receives list directly).
        """
        pass

    def build_env(self, config: Dict[str, Any]) -> Optional[Dict[str, str]]:
        """Build extra environment variables for the agent.

        These are merged with the scrubbed base environment.
        Override to provide harness-specific env vars.
        """
        return None

    def build_cwd(self, config: Dict[str, Any]) -> Optional[str]:
        """Return working directory for the agent process.

        Override to set a harness-specific default.
        """
        return config.get("cwd")

    def resource_limits(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Return default resource limits for this harness type.

        Returns dict with optional 'cpu_seconds' and 'memory_bytes'.
        Override to set harness-appropriate defaults.
        """
        return {}

    def ready_signal(self) -> str:
        """Return the stdout pattern indicating the agent is ready.

        The process manager watches stdout for this string to
        transition from 'starting' to 'running'.
        Override to match harness-specific startup messages.
        """
        return ""

    def health_endpoint(self, config: Dict[str, Any]) -> Optional[str]:
        """Return health check URL if the agent exposes one.

        The platform polls this URL to verify agent readiness.
        """
        return None

    def sandbox_required(self) -> bool:
        """Whether this harness type should run in a sandbox by default."""
        return False

    def default_skills(self) -> List[str]:
        """Return default skill tags for this harness type."""
        return []


# Registry of loaded adapters by harness type
_adapter_registry: Dict[str, AgentAdapter] = {}


def register_adapter(adapter: AgentAdapter):
    """Register an adapter instance in the global registry."""
    _adapter_registry[adapter.harness_type] = adapter


def get_adapter(harness_type: str) -> Optional[AgentAdapter]:
    """Get an adapter by harness type."""
    return _adapter_registry.get(harness_type)


def list_adapters() -> List[str]:
    """List all registered adapter types."""
    return list(_adapter_registry.keys())
