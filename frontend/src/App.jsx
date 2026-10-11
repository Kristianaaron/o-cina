import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import ErrorBoundary from './components/ErrorBoundary'
import AppNav from './components/AppNav'
import PromptPanel from './components/PromptPanel'
import CommandPalette from './components/CommandPalette'
import AgentList from './pages/agents/AgentList'
import AgentDetail from './pages/agents/AgentDetail'
import WorkflowList from './pages/workflows/WorkflowList'
import WorkflowEditor from './pages/workflows/WorkflowEditor'
import ProjectList from './pages/projects/ProjectList'
import ProjectDetail from './pages/projects/ProjectDetail'
import CommandChamber from './pages/dashboard/CommandChamber'
import { CommandProvider, useCommands } from './lib/commands'
import { agentAvatarUrl } from './lib/agentField'
import {
  IconAgents,
  IconNodes,
  IconPanes,
  IconProjects,
  IconTalk,
  IconWorkflows,
} from './components/icons'

function App() {
  return (
    <CommandProvider>
      <Shell />
    </CommandProvider>
  )
}

function Shell() {
  const location = useLocation()
  const [params] = useSearchParams()
  const isFullBleed = location.pathname === '/'
    || /^\/workflows\/[^/]+$/.test(location.pathname)
  const docked = location.pathname === '/' && params.get('view') === 'panes'
  const [promptOpen, setPromptOpen] = useState(false)

  return (
    <div className="relative h-dvh overflow-hidden bg-ink-0 font-sans text-zinc-100">
      <GlobalCommands onPrompt={() => setPromptOpen(true)} />
      {/* Full-viewport page surface — nav floats above, does not reserve space */}
      <main className={['h-full min-h-0 w-full', isFullBleed ? 'overflow-hidden' : 'overflow-y-auto'].join(' ')}>
        <div
          className={[
            'min-h-full w-full',
            isFullBleed
              ? 'flex h-full flex-col'
              : 'mx-auto max-w-6xl px-5 pb-32 pt-10 sm:px-8 sm:pt-14',
          ].join(' ')}
        >
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<CommandChamber />} />
              <Route path="/agents" element={<AgentList />} />
              <Route path="/agents/:id" element={<AgentDetail />} />
              <Route path="/terminals" element={<PanesRedirect />} />
              <Route path="/workflows" element={<WorkflowList />} />
              <Route path="/workflows/:id" element={<WorkflowEditor />} />
              <Route path="/projects" element={<ProjectList />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/prompt" element={<PromptRoute onOpen={() => setPromptOpen(true)} />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>

      <AppNav
        docked={docked}
        promptOpen={promptOpen}
        onTogglePrompt={() => setPromptOpen((v) => !v)}
      />
      <PromptPanel open={promptOpen} onClose={() => setPromptOpen(false)} />
      <CommandPalette />
    </div>
  )
}

/** App-wide navigation commands; pages add their own on top. */
function GlobalCommands({ onPrompt }) {
  const navigate = useNavigate()
  const agents = useSelector((state) => state.agents.list)

  const commands = useMemo(() => [
    { id: 'go-nodes', group: 'Navigate', title: 'Command center · Nodes', icon: IconNodes, run: () => navigate('/') },
    { id: 'go-panes', group: 'Navigate', title: 'Command center · Panes', icon: IconPanes, keywords: 'terminal multiplexer split', run: () => navigate('/?view=panes') },
    { id: 'go-agents', group: 'Navigate', title: 'Agents', icon: IconAgents, run: () => navigate('/agents') },
    { id: 'register-agent', group: 'Navigate', title: 'Register agent', icon: IconAgents, keywords: 'new add', run: () => navigate('/agents?register=1') },
    { id: 'go-workflows', group: 'Navigate', title: 'Workflows', icon: IconWorkflows, run: () => navigate('/workflows') },
    { id: 'go-projects', group: 'Navigate', title: 'Projects', icon: IconProjects, keywords: 'memory', run: () => navigate('/projects') },
    { id: 'prompt', group: 'Navigate', title: 'Prompt an agent', icon: IconTalk, keywords: 'chat ask talk', run: onPrompt },
    ...agents.map((a) => ({
      id: `agent-page-${a.id}`,
      group: 'Agents',
      title: a.name,
      subtitle: `${a.harness || 'agent'} · ${a.status || 'idle'}`,
      avatar: agentAvatarUrl(a),
      run: () => navigate(`/agents/${a.id}`),
    })),
  ], [navigate, onPrompt, agents])

  useCommands('global', commands)
  return null
}

function PanesRedirect() {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.set('view', 'panes')
  return <Navigate to={{ pathname: '/', search: `?${next.toString()}` }} replace />
}

function PromptRoute({ onOpen }) {
  useEffect(() => { onOpen() }, [onOpen])
  return <Navigate to="/" replace />
}

export default App
