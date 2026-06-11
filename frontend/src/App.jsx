import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import AgentList from './pages/agents/AgentList'
import AgentDetail from './pages/agents/AgentDetail'
import WorkflowList from './pages/workflows/WorkflowList'
import WorkflowEditor from './pages/workflows/WorkflowEditor'
import ProjectList from './pages/projects/ProjectList'
import ProjectDetail from './pages/projects/ProjectDetail'

function App() {
  const location = useLocation()
  const nav = [
    { label: 'Dashboard', path: '/' },
    { label: 'Agents', path: '/agents' },
    { label: 'Workflows', path: '/workflows' },
    { label: 'Projects', path: '/projects' },
    { label: 'Prompt', path: '/prompt' },
  ]
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
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
      <main className="max-w-7xl mx-auto px-4 py-6">
        <ErrorBoundary>
          <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<AgentList />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/workflows" element={<WorkflowList />} />
          <Route path="/workflows/new" element={<WorkflowEditor id="new" />} />
          <Route path="/workflows/:id" element={<WorkflowEditor />} />
          <Route path="/projects" element={<ProjectList />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/prompt" element={<div className="font-mono text-zinc-500">Prompt page — Phase 4</div>} />
        </Routes>
          </ErrorBoundary>
      </main>
    </div>
  )
}

function Dashboard() {
  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl font-semibold">Dashboard</h1>
      <p className="text-zinc-500">O-cina v0.1.0-rc — agent orchestration command center.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs font-mono mb-1">PHASES</div>
          <div className="text-2xl font-mono text-green-400">4/4</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs font-mono mb-1">ENDPOINTS</div>
          <div className="text-2xl font-mono text-blue-400">40+</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs font-mono mb-1">AGENTS</div>
          <div className="text-2xl font-mono text-yellow-400">Hermes</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4">
          <div className="text-zinc-500 text-xs font-mono mb-1">MEMORY</div>
          <div className="text-2xl font-mono text-purple-400">ChromaDB</div>
        </div>
      </div>
    </div>
  )
}

export default App
