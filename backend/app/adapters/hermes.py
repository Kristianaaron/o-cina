"""Hermes Agent adapter.

Wraps the Hermes Agent CLI for spawning managed agent instances.
"""

import os
import shutil
import subprocess
from typing import Any, Dict, List, Optional

from app.adapters.base import AgentAdapter


class HermesAdapter(AgentAdapter):
    """Adapter for Hermes Agent (CLI-based)."""

    harness_type = "hermes"
    default_skills = ["coding", "orchestration", "tool-use"]

    def register_info(self, config: Dict[str, Any]) -> Dict[str, Any]:
        info = {
            "name": config.get("name", "hermes-agent"),
            "harness": "hermes",
            "model": config.get("model"),
            "provider": config.get("provider", "local"),
            "skills": config.get("skills", self.default_skills),
        }
        return info

    def build_command(self, config: Dict[str, Any]) -> List[str]:
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

    def build_env(self, config: Dict[str, Any]) -> Optional[Dict[str, str]]:
        env = {}
        if config.get("model"):
            env["HERMES_MODEL"] = config["model"]
        if config.get("workdir"):
            env["HERMES_WORKDIR"] = config["workdir"]
        return env if env else None

    def build_cwd(self, config: Dict[str, Any]) -> Optional[str]:
        return config.get("workdir", os.environ.get("HOME"))

    def resource_limits(self, config: Dict[str, Any]) -> Dict[str, Any]:
        # Hermes can be memory-intensive — sensible defaults
        return {
            "memory_bytes": config.get("memory_limit", 4 * 1024**3),  # 4GB default
        }

    def ready_signal(self) -> str:
        return "Hermes"  # Hermes prints this on startup

    def sandbox_required(self) -> bool:
        return False

    def default_skills(self) -> List[str]:
        return self.default_skills


# Auto-register when imported
from app.adapters.base import register_adapter
register_adapter(HermesAdapter())
