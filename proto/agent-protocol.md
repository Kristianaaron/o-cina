# Agent Protocol

## Overview
Agents register with the O-cina platform and communicate via:
1. REST API for registration, lifecycle, and state queries
2. Heartbeat POST /api/v1/heartbeat (every 15s)
3. SSE at GET /api/v1/events for real-time updates
4. Messages stored in SQLite, routed by workflow engine

## Registration
POST /api/v1/agents/register with name, harness, model, provider, skills, endpoint.

## Heartbeat
Agents POST heartbeat with status and optional metrics (cpu, memory, tasks).
Backend marks agent offline if no heartbeat within 30s (configurable).

## Message Contract
Messages are JSON with schema_version field for backward compatibility.
{task_id, from_agent, to_agent, type, payload, schema_version, timestamp}

## Data Rules
Workflow edges define transformation rules: which payload fields are forwarded,
renamed, or transformed between connected agents.
