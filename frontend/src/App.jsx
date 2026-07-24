import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import AgentList from './pages/agents/AgentList'
import AgentDetail from './pages/agents/AgentDetail'
import WorkflowList from './pages/workflows/WorkflowList'
import WorkflowEditor from './pages/workflows/WorkflowEditor'
import ProjectList from './pages/projects/ProjectList'
import ProjectDetail from './pages/projects/ProjectDetail'
import TerminalHerdPage from './pages/terminals/TerminalHerdPage'

function App() {
  const location = useLocation()
  const nav = [
    { label: 'Dashboard', path: '/' },
    { label: 'Agents', path: '/agents' },
    { label: 'Herd', path: '/terminals' },
    { label: 'Workflows', path: '/workflows' },
    { label: 'Projects', path: '/projects' },
    { label: 'Prompt', path: '/prompt' },
  ]
  const isHerd = location.pathname.startsWith('/terminals')
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      <nav className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-mono font-semibold text-lg tracking-tight">O-cina</span>
          {nav.map((n) => (
            <Link key={n.path} to={n.path}
              className={`text-sm ${location.pathname === n.path ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className={`${isHerd ? 'max-w-none px-3 py-3' : 'max-w-7xl mx-auto px-4 py-6'} w-full flex-1 flex flex-col min-h-0`}>
        <ErrorBoundary>
          <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<AgentList />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/terminals" element={<TerminalHerdPage />} />
          <Route path="/workflows" element={<WorkflowList />} />
          <Route path="/workflows/:id" element={<WorkflowEditor />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/prompt" element={<div className="font-mono text-zinc-500">Prompt page — Phase 4</div>} />
        </Routes>
          </ErrorBoundary>
      </main>
      <footer className="border-t border-zinc-800 bg-zinc-950/80">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-mono text-zinc-600">
          <span>O-cina v0.1.0-rc</span>
          <span>Agent command center | API /api/v1</span>
        </div>
      </footer>
    </div>
  )
}

function Dashboard() {
  const [stats, setStats] = useState({ agents: 0, running: 0, workflows: 0, health: '…' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/agents').then(r => r.json()),
      fetch('/api/v1/workflows').then(r => r.json()),
      fetch('/health').then(r => r.json()),
    ]).then(([agentsData, wfData, health]) => {
      const agents = agentsData.agents || []
      setStats({
        agents: agents.length,
        running: agents.filter(a => a.status === 'running').length,
        workflows: (wfData.workflows || []).length,
        health: health.status === 'ok' ? 'All OK' : 'Degraded',
      })
    }).catch(() => {
      setStats(s => ({ ...s, health: 'Offline' }))
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">O-cina v0.1.0-rc — agent orchestration command center.</p>
        </div>
        <span className={`text-xs font-mono px-2 py-1 rounded-full ${
          stats.health === 'All OK' ? 'bg-emerald-900/50 text-emerald-400' :
          stats.health === 'Offline' ? 'bg-red-900/50 text-red-400' :
          'bg-amber-900/50 text-amber-400'
        }`}>
          ● {stats.health}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-zinc-500 text-xs font-mono mb-1">AGENTS</div>
          <div className="text-3xl font-mono text-yellow-400">{loading ? '…' : stats.agents}</div>
          <div className="text-xs text-zinc-600 mt-2">{stats.running} running · {stats.agents - stats.running} stopped</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-zinc-500 text-xs font-mono mb-1">WORKFLOWS</div>
          <div className="text-3xl font-mono text-blue-400">{loading ? '…' : stats.workflows}</div>
          <div className="text-xs text-zinc-600 mt-2">DAG-based orchestrations</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-zinc-500 text-xs font-mono mb-1">DATABASE</div>
          <div className="text-3xl font-mono text-emerald-400">SQLite</div>
          <div className="text-xs text-zinc-600 mt-2">WAL mode · ChromaDB</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-zinc-500 text-xs font-mono mb-1">MEMORY</div>
          <div className="text-3xl font-mono text-purple-400">ChromaDB</div>
          <div className="text-xs text-zinc-600 mt-2">Semantic vector store</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <h2 className="font-mono text-sm font-semibold text-zinc-300 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/agents" className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors">
            Manage Agents
          </Link>
          <Link to="/terminals" className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors">
            Open Terminal Herd
          </Link>
          <Link to="/workflows" className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors">
            Build Workflows
          </Link>
          <Link to="/projects" className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors">
            Open Projects
          </Link>
        </div>
      </div>
    </div>
  )
}

export default App
