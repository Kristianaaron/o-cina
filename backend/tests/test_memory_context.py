"""Unit tests for Claude-style memory bank tagging (no Chroma required)."""
from app.memory_context import (
    build_augmented_prompt,
    format_memory_bank_tags,
)


def test_format_memory_bank_tags_empty():
    assert format_memory_bank_tags([], project_id="p1") == ""


def test_format_memory_bank_tags_xml():
    hits = [
        {
            "id": "m1",
            "content": "API uses JWT auth",
            "score": 0.82,
            "metadata": {"source": "user", "tags": ["auth", "api"]},
        },
        {
            "id": "m2",
            "content": "Prefer <raw> XML escaped",
            "score": 0.71,
            "metadata": {"source": "agent"},
        },
    ]
    block = format_memory_bank_tags(hits, project_id="proj-1", project_name='Acme "Lab"')
    assert '<memory_bank project_id="proj-1" name="Acme &quot;Lab&quot;">' in block
    assert 'id="m1"' in block
    assert 'source="user"' in block
    assert 'tags="auth,api"' in block
    assert "API uses JWT auth" in block
    assert "&lt;raw&gt;" in block
    assert "</memory_bank>" in block


def test_build_augmented_prompt_wraps_user_query():
    mem = '<memory_bank project_id="p">\n  <memory id="1">\n  note\n  </memory>\n</memory_bank>'
    out = build_augmented_prompt("How does auth work?", mem)
    assert mem in out
    assert "<user_query>\nHow does auth work?\n</user_query>" in out
    assert "<instructions>" in out


def test_build_augmented_prompt_passthrough_without_memory():
    assert build_augmented_prompt("hello", "") == "hello"
