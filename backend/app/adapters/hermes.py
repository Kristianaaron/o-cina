"""Hermes Agent adapter.

Wraps the Hermes Agent CLI for spawning managed agent instances.
"""

import os
import shutil
from typing import Any

from app.adapters.base import AgentAdapter, register_adapter


class HermesAdapter(AgentAdapter):
    """Adapter for Hermes Agent (CLI-based)."""

    harness_type = "hermes"
    _DEFAULT_SKILLS = ["coding", "orchestration", "tool-use"]

    def register_info(self, config: dict[str, Any]) -> dict[str, Any]:
        info = {
            "name": config.get("name", "hermes-agent"),
            "harness": "hermes",
            "model": config.get("model"),
            "provider": config.get("provider", "local"),
            "skills": config.get("skills", list(self._DEFAULT_SKILLS)),
        }
        return info

    def build_command(self, config: dict[str, Any]) -> list[str]:
        """Build the `hermes` CLI command.

        Config keys:
            model: Model to use (e.g. 'qwen3.6-27b-fp8')
            workdir: Working directory for the agent
            profile: Hermes profile name
            flags: Extra CLI flags as list
        """
        # Find hermes binary
        hermes_bin = config.get("hermes_path")
        if not hermes_bin:
            hermes_bin = shutil.which("hermes")
        if not hermes_bin:
            raise RuntimeError("Hermes CLI not found — set hermes_path in config or install hermes-agent")

        cmd = [hermes_bin]

        if config.get("model"):
            cmd.extend(["--model", config["model"]])

        if config.get("profile"):
            cmd.extend(["--profile", config["profile"]])

        if config.get("flags"):
            cmd.extend(config["flags"])

        return cmd

    def build_env(self, config: dict[str, Any]) -> dict[str, str] | None:
        env = {}
        if config.get("model"):
            env["HERMES_MODEL"] = config["model"]
        if config.get("workdir"):
            env["HERMES_WORKDIR"] = config["workdir"]
        return env if env else None

    def build_cwd(self, config: dict[str, Any]) -> str | None:
        return config.get("workdir", os.environ.get("HOME"))

    def resource_limits(self, config: dict[str, Any]) -> dict[str, Any]:
        # Hermes can be memory-intensive — sensible defaults
        return {
            "memory_bytes": config.get("memory_limit", 4 * 1024**3),  # 4GB default
        }

    def ready_signal(self) -> str:
        return "Hermes"  # Hermes prints this on startup

    def sandbox_required(self) -> bool:
        return False

    def default_skills(self) -> list[str]:
        return list(self._DEFAULT_SKILLS)


# Auto-register when imported
register_adapter(HermesAdapter())
