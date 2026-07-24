"""Agent adapters — harness-specific process managers.

Importing this package auto-registers all built-in adapters.
"""
from app.adapters import (
    base,
    hermes,
)

__all__ = ["base", "hermes"]
