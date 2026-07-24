From: O-cina Codebase Fixes
Date: June 11, 2026
Subject: Fix 23 identified issues (critical → optimization)

Summary of changes across 15 files + 1 deletion:

CRITICAL:
  • workflows.py: BackgroundTasks → asyncio.create_task (async no-op fix)
  • events.py: Full SSE rewrite with Queue-based broadcasting
  • models.py: Consolidated from dual files (deleted models/ dir)

HIGH:
  • tasks.py: Dead PID logging fix (if False → or "unknown")
  • projects.js: Hardcoded localhost:8002 → relative /api/v1
  • projects.py: ChromaDB cleanup on project delete
  • workflows.py: WorkflowUpdate schema for PATCH (optional fields)

MEDIUM:
  • auth.py: NEW — get_current_user/require_user deps, SHA-256 token hashing
  • main.py: Auth dependency wired globally, Redis URL parsing, static mount fix
  • sessions.py: N+1 query fix (correlated subquery), type_result→type, msg_type migration
  • agents.py: Expanded AgentUpdate (model, provider, endpoint, sandbox)
  • process_manager.py: from_pid() classmethod, dummy Popen removal
  • prompt.py, message_router.py: .type → .msg_type
  • database.py: pool_pre_ping conditional on SQLite

OPTIMIZATIONS:
  • agents.py: Pagination (limit/offset) on GET /agents
  • main.py: Static files mounted at /app, SPA fallback with JSON 404 for API
  • database.py: pool_pre_ping=False for SQLite
