const API = '/api/v1';

async function req(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data?.detail || data?.error || res.statusText
    throw new Error(msg)
  }
  return data
}

// ── Projects ─────────────────────────────────────────────────────────────────

export function listProjects(params = {}) {
  const qs = new URLSearchParams(params).toString()
  return req(`/projects${qs ? '?' + qs : ''}`)
}

export function getProject(id) {
  return req(`/projects/${id}`)
}

export function createProject(body) {
  return req('/projects', { method: 'POST', body: JSON.stringify(body) })
}

export function updateProject(id, body) {
  return req(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteProject(id) {
  return req(`/projects/${id}`, { method: 'DELETE' })
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(body) {
  return req('/sessions', { method: 'POST', body: JSON.stringify(body) })
}

export function listSessions(projectId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return req(`/projects/${projectId}/sessions${qs ? '?' + qs : ''}`)
}

export function getSession(id) {
  return req(`/sessions/${id}`)
}

export function updateSession(id, body) {
  return req(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteSession(id) {
  return req(`/sessions/${id}`, { method: 'DELETE' })
}

export function addMessage(sessionId, body) {
  return req(`/sessions/${sessionId}/messages`, { method: 'POST', body: JSON.stringify(body) })
}

export function listMessages(sessionId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return req(`/sessions/${sessionId}/messages${qs ? '?' + qs : ''}`)
}

export function searchSessions(projectId, q, limit = 20) {
  return req(`/search/sessions?project_id=${encodeURIComponent(projectId)}&q=${encodeURIComponent(q)}&limit=${limit}`)
}

// ── Memory ───────────────────────────────────────────────────────────────────

export function createMemory(projectId, body) {
  return req(`/projects/${projectId}/memories`, { method: 'POST', body: JSON.stringify(body) })
}

export function listMemories(projectId, params = {}) {
  const qs = new URLSearchParams(params).toString()
  return req(`/projects/${projectId}/memories${qs ? '?' + qs : ''}`)
}

export function getMemory(projectId, memoryId) {
  return req(`/projects/${projectId}/memories/${memoryId}`)
}

export function updateMemory(projectId, memoryId, body) {
  return req(`/projects/${projectId}/memories/${memoryId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteMemory(projectId, memoryId) {
  return req(`/projects/${projectId}/memories/${memoryId}`, { method: 'DELETE' })
}

export function searchMemories(projectId, query, topK = 5, source, tags) {
  return req(`/projects/${projectId}/memories/search`, {
    method: 'POST',
    body: JSON.stringify({ query, top_k: topK, source, tags }),
  })
}

export function memoryCount(projectId, source) {
  const qs = source ? `?source=${source}` : ''
  return req(`/projects/${projectId}/memories/count${qs}`)
}
