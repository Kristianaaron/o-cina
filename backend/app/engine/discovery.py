"""Auto-discovery for known agent harnesses.

Scans local system and network for installed/configured agent harnesses.
Can be triggered manually via API or run periodically via Celery.
"""

import logging
import os
import shutil
import subprocess
from typing import Any

logger = logging.getLogger(__name__)


class HarnessProbe:
    """Probe for a specific harness type."""

    def __init__(
        self,
        harness_type: str,
        bin_names: list[str],
        config_paths: list[str] | None = None,
        port: int | None = None,
    ):
        self.harness_type = harness_type
        self.bin_names = bin_names
        self.config_paths = config_paths or []
        self.port = port

    def probe(self) -> dict[str, Any] | None:
        """Check if this harness is available on the system."""
        # Check for binary
        found_bin = None
        for name in self.bin_names:
            path = shutil.which(name)
            if path:
                found_bin = path
                break

        if not found_bin:
            return None

        result = {
            "harness": self.harness_type,
            "binary_path": found_bin,
            "config_paths": [],
        }

        # Check for config files
        for cp in self.config_paths:
            full_path = os.path.expanduser(cp)
            if os.path.exists(full_path):
                result["config_paths"].append(full_path)

        # Try version string
        try:
            out = subprocess.check_output(
                [found_bin, "--version"],
                stderr=subprocess.STDOUT,
                timeout=5,
            ).decode().strip()
            result["version"] = out.split("\n")[0]
        except Exception:
            pass

        return result


# Built-in probes for known harnesses
DEFAULT_PROBES = [
    HarnessProbe(
        harness_type="hermes",
        bin_names=["hermes"],
        config_paths=["~/.hermes/config.yaml", "~/.config/hermes/config.yaml"],
    ),
    HarnessProbe(
        harness_type="claude-code",
        bin_names=["claude"],
        config_paths=["~/.claude/"],
    ),
    HarnessProbe(
        harness_type="codex",
        bin_names=["codex"],
        config_paths=["~/.config/codex/"],
    ),
    HarnessProbe(
        harness_type="opencode",
        bin_names=["opencode"],
        config_paths=["~/.config/opencode/"],
    ),
]


class DiscoveryScanner:
    """Scan for available harnesses and return results."""

    def __init__(self, probes: list[HarnessProbe] | None = None):
        self.probes = probes or DEFAULT_PROBES

    def scan(self) -> list[dict[str, Any]]:
        """Run all probes and return discovered harnesses."""
        results = []
        for probe in self.probes:
            try:
                result = probe.probe()
                if result:
                    results.append(result)
                    logger.info("Discovered harness: %s at %s", result["harness"], result["binary_path"])
            except Exception as e:
                logger.warning("Probe failed for %s: %s", probe.harness_type, e)
        return results

    def scan_to_agents(self) -> list[dict[str, Any]]:
        """Scan and convert results to agent registration payloads.

        Returns list of dicts suitable for POST /agents/register.
        """
        discovered = self.scan()
        agents = []
        for d in discovered:
            agent = {
                "name": f"{d['harness']}-auto-{len(agents)+1}",
                "harness": d["harness"],
                "config": {
                    "hermes_path": d.get("binary_path"),
                },
            }
            agents.append(agent)
        return agents
