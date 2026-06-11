/**
 * API client for O-cina backend.
 * All calls go through /api/v1 (proxied by Vite in dev).
 */
const BASE = '/api/v1';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const opts = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, opts);
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const j = JSON.parse(text);
      detail = j.detail || j.error || text;
    } catch {
      // not json
    }
    throw new Error(`API ${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Agents
  listAgents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/agents${qs ? '?' + qs : ''}`);
  },
  getAgent: (id) => request(`/agents/${id}`),
  registerAgent: (data) => request('/agents/register', { method: 'POST', body: data }),
  updateAgent: (id, data) => request(`/agents/${id}`, { method: 'PATCH', body: data }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),
  startAgent: (id) => request(`/agents/${id}/start`, { method: 'POST' }),
  stopAgent: (id, force = false) => request(`/agents/${id}/stop?force=${force}`, { method: 'POST' }),
  restartAgent: (id) => request(`/agents/${id}/restart`, { method: 'POST' }),
  getAgentLogs: (id, lines = 100) => request(`/agents/${id}/logs?lines=${lines}`),
  getAgentMetrics: (id) => request(`/agents/${id}/metrics`),

  // Adapters
  getAdapters: () => request('/adapters'),

  // Heartbeat
  sendHeartbeat: (agentId, status = 'running', metrics = {}) => request('/heartbeat', { method: 'POST', body: { agent_id: agentId, status, metrics } }),
  getHeartbeatStats: () => request('/heartbeat/stats'),

  // Discovery
  runDiscovery: () => request('/discovery/run', { method: 'POST' }),
};
