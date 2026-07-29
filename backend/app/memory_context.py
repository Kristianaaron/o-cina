"""Claude-style tagged context from the shared project memory bank.

Retrieves relevant memories via semantic search and wraps them in XML tags
so coding harnesses / agents can ground replies the way ChatGPT/Claude use
cross-chat project memory.
"""
from __future__ import annotations

from typing import Any

DEFAULT_TOP_K = 5
# Soft floor — drop weak matches so noise doesn't dominate the prompt
DEFAULT_MIN_SCORE = 0.15


def format_memory_bank_tags(
    hits: list[dict],
    *,
    project_id: str,
    project_name: str | None = None,
) -> str:
    """Render search hits as Claude-style <memory_bank> / <memory> tags."""
    if not hits:
        return ""

    name_attr = f' name="{_xml_attr(project_name)}"' if project_name else ""
    lines = [
        f'<memory_bank project_id="{_xml_attr(project_id)}"{name_attr}>',
        "<!-- Shared project memory — use for continuity across chats/sessions -->",
    ]
    for hit in hits:
        mid = hit.get("id") or ""
        meta = hit.get("metadata") or {}
        source = meta.get("source") or "unknown"
        score = hit.get("score")
        tags = meta.get("tags") or []
        if isinstance(tags, str):
            tags_str = tags
        elif isinstance(tags, list):
            tags_str = ",".join(str(t) for t in tags)
        else:
            tags_str = ""

        attrs = [
            f'id="{_xml_attr(mid)}"',
            f'source="{_xml_attr(source)}"',
        ]
        if score is not None:
            attrs.append(f'score="{float(score):.3f}"')
        if tags_str:
            attrs.append(f'tags="{_xml_attr(tags_str)}"')

        content = (hit.get("content") or "").strip()
        lines.append(f"  <memory {' '.join(attrs)}>")
        lines.append(f"  {_xml_text(content)}")
        lines.append("  </memory>")

    lines.append("</memory_bank>")
    return "\n".join(lines)


def build_augmented_prompt(
    user_prompt: str,
    memory_block: str,
) -> str:
    """Compose final text sent to the agent: memory bank + tagged user query."""
    user = (user_prompt or "").strip()
    if not memory_block:
        return user

    return (
        f"{memory_block}\n\n"
        "<instructions>\n"
        "Use the shared <memory_bank> as durable project context across chats. "
        "Prefer facts from memory when relevant; do not invent memories. "
        "If memory conflicts with the user, ask or note the conflict.\n"
        "</instructions>\n\n"
        f"<user_query>\n{user}\n</user_query>"
    )


def retrieve_project_memories(
    memory_store,
    project_id: str,
    query: str,
    *,
    top_k: int = DEFAULT_TOP_K,
    min_score: float = DEFAULT_MIN_SCORE,
    tags: list[str] | None = None,
) -> list[dict]:
    """Semantic search + score filter for a project's memory bank."""
    if not project_id or not (query or "").strip():
        return []
    try:
        hits = memory_store.search(
            project_id=project_id,
            query=query,
            top_k=top_k,
            tags=tags,
        )
    except Exception:
        return []
    return [h for h in hits if float(h.get("score") or 0) >= min_score]


def attach_memory_context(
    *,
    memory_store,
    project_id: str,
    prompt: str,
    project_name: str | None = None,
    top_k: int = DEFAULT_TOP_K,
    min_score: float = DEFAULT_MIN_SCORE,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Retrieve + tag memories for a prompt.

    Returns:
      {
        memories: [...hits],
        memory_block: str,          # XML tags (may be empty)
        augmented_prompt: str,      # what the agent should see
        memory_count: int,
      }
    """
    hits = retrieve_project_memories(
        memory_store,
        project_id,
        prompt,
        top_k=top_k,
        min_score=min_score,
        tags=tags,
    )
    block = format_memory_bank_tags(hits, project_id=project_id, project_name=project_name)
    return {
        "memories": hits,
        "memory_block": block,
        "augmented_prompt": build_augmented_prompt(prompt, block),
        "memory_count": len(hits),
    }


def _xml_attr(value: Any) -> str:
    s = str(value if value is not None else "")
    return (
        s.replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _xml_text(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
