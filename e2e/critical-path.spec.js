import { defineConfig, test } from '@playwright/test'
import { expect } from '@playwright/test'

// Critical path E2E tests

test.describe('Critical Paths', () => {
  test('Health endpoint returns ok', async ({ request }) => {
    const resp = await request.get('http://localhost:8002/health')
    expect(resp.ok()).toBeTruthy()
    const data = await resp.json()
    expect(data.components.database).toBe('ok')
  })

  test('Register agent and list', async ({ request }) => {
    const register = await request.post('http://localhost:8002/api/v1/agents/register', {
      data: { name: 'e2e-test-agent', harness: 'hermes', config: {} },
    })
    expect(register.status()).toBe(201)
    const agentId = (await register.json()).id

    const list = await request.get('http://localhost:8002/api/v1/agents')
    expect(list.ok()).toBeTruthy()
    const agents = await list.json()
    expect(agents.some(a => a.id === agentId)).toBe(true)

    // Cleanup
    await request.delete(`http://localhost:8002/api/v1/agents/${agentId}`)
  })

  test('Create project, store memory, search', async ({ request }) => {
    const create = await request.post('http://localhost:8002/api/v1/projects', {
      data: { name: 'e2e-project', description: 'E2E test', tags: ['e2e'] },
    })
    expect(create.status()).toBe(201)
    const pid = (await create.json()).id

    // Store memory
    await request.post(`http://localhost:8002/api/v1/projects/${pid}/memories`, {
      data: { content: 'E2E semantic memory test', source: 'user', tags: [] },
    })

    // Search
    const search = await request.post(`http://localhost:8002/api/v1/projects/${pid}/memories/search`, {
      data: { query: 'semantic memory', top_k: 5 },
    })
    expect(search.ok()).toBeTruthy()
    const results = await search.json()
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  test('Create workflow, validate DAG', async ({ request }) => {
    const create = await request.post('http://localhost:8002/api/v1/workflows', {
      data: {
        name: 'e2e-workflow',
        nodes: [
          { ref_id: 'a', type: 'agent', agent_id: 'agent-1', label: 'A' },
          { ref_id: 'b', type: 'agent', agent_id: 'agent-2', label: 'B' },
        ],
        edges: [{ source: 'a', target: 'b' }],
        project_id: 'e2e',
      },
    })
    expect(create.status()).toBe(201)
    const wid = (await create.json()).id

    const validate = await request.post(`http://localhost:8002/api/v1/workflows/${wid}/validate`)
    expect(validate.ok()).toBeTruthy()
    const val = await validate.json()
    expect(val.execution_order.length).toBe(2)
  })
})

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:8002' },
  timeout: 30000,
})
