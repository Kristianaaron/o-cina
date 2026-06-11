"""Agent adapters — harness-specific process managers.

Importing this package auto-registers all built-in adapters.
"""
from app.adapters import base
from app.adapters import hermes  # noqa: F401 — auto-registers

__all__ = ["base", "hermes"]
