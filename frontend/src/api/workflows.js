/* Workflow API layer */
const BASE = '/api/v1';

export async function listWorkflows() {
  const res = await fetch(`${BASE}/workflows`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getWorkflow(id) {
  const res = await fetch(`${BASE}/workflows/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createWorkflow(data) {
  const res = await fetch(`${BASE}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateWorkflow(id, data) {
  const res = await fetch(`${BASE}/workflows/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteWorkflow(id) {
  const res = await fetch(`${BASE}/workflows/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function validateWorkflow(id) {
  const res = await fetch(`${BASE}/workflows/${id}/validate`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function executeWorkflow(id, context = {}) {
  const res = await fetch(`${BASE}/workflows/${id}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTaskStatus(workflowId, taskId) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/tasks/${taskId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stopTask(workflowId, taskId) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/tasks/${taskId}/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function approveTask(workflowId, taskId) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/tasks/${taskId}/approve`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listTasks(workflowId) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/tasks`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTaskMessages(workflowId, taskId, limit = 50) {
  const res = await fetch(`${BASE}/workflows/${workflowId}/tasks/${taskId}/messages?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listTemplates() {
  const res = await fetch(`${BASE}/workflow-templates`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
