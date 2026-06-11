import { test, expect } from '@playwright/test';

const API = '/api/v1';

test('health endpoint is reachable', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe('ok');
});

test('register and list agents', async ({ request }) => {
  const register = await request.post(`${API}/agents/register`, {
    data: { name: 'e2e-test-agent', harness: 'hermes' }
  });
  expect(register.ok()).toBe(true);
  const agent = await register.json();
  expect(agent.id).toBeTruthy();

  const list = await request.get(`${API}/agents`);
  expect(list.ok()).toBe(true);
  const body = await list.json();
  expect(body.agents.some(a => a.id === agent.id)).toBe(true);

  // cleanup
  await request.delete(`${API}/agents/${agent.id}`);
});

test('create project, store memory, semantic search', async ({ request }) => {
  const proj = await request.post(`${API}/projects`, {
    data: { name: 'E2E Test Project', description: 'Automated test' }
  });
  expect(proj.ok()).toBe(true);
  const project = await proj.json();
  const pid = project.id;

  // Store memories — must include tags (ChromaDB quirk: empty lists cause upsert errors)
  const m1 = await request.post(`${API}/projects/${pid}/memories`, {
    data: { content: 'React is a JavaScript library for building UIs', source: 'user', tags: ['js'] }
  });
  expect(m1.ok()).toBe(true);

  const m2 = await request.post(`${API}/projects/${pid}/memories`, {
    data: { content: 'FastAPI is a Python web framework for APIs', source: 'user', tags: ['python'] }
  });
  expect(m2.ok()).toBe(true);

  // Semantic search — returns { query, results: [...], total }
  const search = await request.post(`${API}/projects/${pid}/memories/search`, {
    data: { query: 'web framework Python', top_k: 2 }
  });
  expect(search.ok()).toBe(true);
  const body = await search.json();
  expect(body.results.length).toBeGreaterThan(0);

  // Cleanup
  await request.delete(`${API}/projects/${pid}`);
});

test('create workflow, validate, and check execution order', async ({ request }) => {
  const wf = await request.post(`${API}/workflows`, {
    data: {
      name: 'E2E Linear Workflow',
      nodes: [
        { ref_id: 'start', type: 'agent', label: 'Start', config: {} },
        { ref_id: 'process', type: 'agent', label: 'Process', config: {} },
        { ref_id: 'end', type: 'agent', label: 'End', config: {} }
      ],
      edges: [
        { source_ref: 'start', target_ref: 'process', data_rules: {} },
        { source_ref: 'process', target_ref: 'end', data_rules: {} }
      ]
    }
  });
  expect(wf.ok()).toBe(true);
  const workflow = await wf.json();
  expect(workflow.id).toBeTruthy();

  // Validate DAG
  const validate = await request.post(`${API}/workflows/${workflow.id}/validate`);
  expect(validate.ok()).toBe(true);
  const validation = await validate.json();
  expect(validation.valid).toBe(true);
  expect(validation.execution_order.length).toBe(3);

  // Cleanup
  await request.delete(`${API}/workflows/${workflow.id}`);
});

test('create session and exchange messages', async ({ request }) => {
  // Create project first (required by session endpoint)
  const proj = await request.post(`${API}/projects`, {
    data: { name: 'E2E Session Project' }
  });
  expect(proj.ok()).toBe(true);
  const pid = (await proj.json()).id;

  // Create session
  const sess = await request.post(`${API}/sessions`, {
    data: { project_id: pid, agent_id: 'e2e-agent', summary: 'Test session' }
  });
  expect(sess.ok()).toBe(true);
  const session = await sess.json();
  expect(session.id).toBeTruthy();

  // Add messages — content field, not payload
  const msg1 = await request.post(`${API}/sessions/${session.id}/messages`, {
    data: { content: 'Hello' }
  });
  expect(msg1.ok()).toBe(true);

  const msg2 = await request.post(`${API}/sessions/${session.id}/messages`, {
    data: { content: 'Hi there!' }
  });
  expect(msg2.ok()).toBe(true);

  // List messages — wrapped in { messages: [...], total: N }
  const msgs = await request.get(`${API}/sessions/${session.id}/messages`);
  expect(msgs.ok()).toBe(true);
  const body = await msgs.json();
  expect(body.messages.length).toBe(2);

  // Cleanup
  await request.delete(`${API}/sessions/${session.id}`);
  await request.delete(`${API}/projects/${pid}`);
});
