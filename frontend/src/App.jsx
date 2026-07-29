import { useState } from 'react'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import AppNav from './components/AppNav'
import PromptPanel from './components/PromptPanel'
import AgentList from './pages/agents/AgentList'
import AgentDetail from './pages/agents/AgentDetail'
import WorkflowList from './pages/workflows/WorkflowList'
import WorkflowEditor from './pages/workflows/WorkflowEditor'
import ProjectList from './pages/projects/ProjectList'
import ProjectDetail from './pages/projects/ProjectDetail'
import CommandChamber from './pages/dashboard/CommandChamber'

function App() {
  const location = useLocation()
  const isFullBleed = location.pathname === '/'
    || /^\/workflows\/[^/]+$/.test(location.pathname)
  const [promptOpen, setPromptOpen] = useState(false)

  return (
    <div className="relative h-dvh overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Full-viewport page surface — nav floats above, does not reserve space */}
      <main
        className={[
          'h-full min-h-0 w-full overflow-y-auto',
          isFullBleed ? 'overflow-hidden' : '',
        ].join(' ')}
      >
        <div
          className={[
            'min-h-full w-full',
            isFullBleed
              ? 'flex h-full flex-col p-0'
              : 'mx-auto max-w-7xl px-4 py-6 pb-28',
          ].join(' ')}
        >
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<CommandChamber />} />
              <Route path="/agents" element={<AgentList />} />
              <Route path="/agents/:id" element={<AgentDetail />} />
              <Route path="/terminals" element={<TerminalsRedirect />} />
              <Route path="/workflows" element={<WorkflowList />} />
              <Route path="/workflows/:id" element={<WorkflowEditor />} />
              <Route path="/projects" element={<ProjectList />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/prompt" element={<PromptPage onOpenPanel={() => setPromptOpen(true)} />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>

      <AppNav
        promptOpen={promptOpen}
        onTogglePrompt={() => setPromptOpen((v) => !v)}
      />
      <PromptPanel open={promptOpen} onClose={() => setPromptOpen(false)} />
    </div>
  )
}

function TerminalsRedirect() {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.set('view', 'herd')
  return <Navigate to={{ pathname: '/', search: `?${next.toString()}` }} replace />
}

function PromptPage({ onOpenPanel }) {
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="font-mono text-2xl font-semibold">Prompt</h1>
      <p className="text-sm text-zinc-500">
        Use the talk icon in the floating bottom nav to open the prompt composer from anywhere.
      </p>
      <button
        type="button"
        onClick={onOpenPanel}
        className="rounded-lg bg-zinc-100 px-4 py-2 font-mono text-sm text-zinc-950 hover:bg-white"
      >
        Open prompt
      </button>
    </div>
  )
}

export default App
