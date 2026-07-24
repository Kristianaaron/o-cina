"""Adapter framework base class.

Defines the contract all agent adapters must implement.
Adapters translate agent-specific configs into spawn commands
and provide harness-specific lifecycle hooks.
"""

from abc import ABC, abstractmethod
from typing import Any


class AgentAdapter(ABC):
    """Base class for agent harness adapters.

    Each harness type (hermes, claude-code, codex, etc.) provides
    its own subclass implementing the abstract methods.
    """

    # Unique identifier for this adapter type
    harness_type: str = "unknown"

    # Default command template (override in subclass)
    default_command: list[str] = []

    @abstractmethod
    def register_info(self, config: dict[str, Any]) -> dict[str, Any]:
        """Return agent metadata for registration.

        Returns dict with keys: name, harness, model, provider, skills, endpoint.
        """

    @abstractmethod
    def build_command(self, config: dict[str, Any]) -> list[str]:
        """Build the subprocess command list from agent config.

        Must return a list (no shell injection — Popen receives list directly).
        """

    def build_env(self, config: dict[str, Any]) -> dict[str, str] | None:
        """Build extra environment variables for the agent.

        These are merged with the scrubbed base environment.
        Override to provide harness-specific env vars.
        """
        return None

    def build_cwd(self, config: dict[str, Any]) -> str | None:
        """Return working directory for the agent process.

        Override to set a harness-specific default.
        """
        return config.get("cwd")

    def resource_limits(self, config: dict[str, Any]) -> dict[str, Any]:
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

    def health_endpoint(self, config: dict[str, Any]) -> str | None:
        """Return health check URL if the agent exposes one.

        The platform polls this URL to verify agent readiness.
        """
        return None

    def sandbox_required(self) -> bool:
        """Whether this harness type should run in a sandbox by default."""
        return False

    def default_skills(self) -> list[str]:
        """Return default skill tags for this harness type."""
        return []

    async def dispatch(self, *, agent: Any, prompt: str, context: dict[str, Any]) -> Any:
        """Optional live prompt dispatch for workflow agent nodes.

        Subclasses that can talk to a running agent should override this.
        The default raises NotImplementedError so the workflow engine can
        fall back to message-router dispatch.
        """
        raise NotImplementedError(
            f"Adapter '{self.harness_type}' does not implement live dispatch"
        )


# Registry of loaded adapters by harness type
_adapter_registry: dict[str, AgentAdapter] = {}

# Public alias (older code imported adapter_registry)
adapter_registry = _adapter_registry


def register_adapter(adapter: AgentAdapter):
    """Register an adapter instance in the global registry."""
    _adapter_registry[adapter.harness_type] = adapter


def get_adapter(harness_type: str) -> AgentAdapter | None:
    """Get an adapter by harness type."""
    return _adapter_registry.get(harness_type)


def list_adapters() -> list[str]:
    """List all registered adapter types."""
    return list(_adapter_registry.keys())
