import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Group, Panel, Separator } from 'react-resizable-panels'
import AgentTerminal from './AgentTerminal'
import { IconSplitColumns, IconSplitRows } from './icons'
import {
  collectAgentIds,
  countLeaves,
  createLeaf,
  createWorkspace,
  findLeaf,
  findLeafByAgent,
  firstLeafId,
  getActiveWorkspace,
  herdState,
  loadWorkspaces,
  removeLeaf,
  saveWorkspaces,
  splitLeaf,
  updateLeaf,
  upsertActiveWorkspace,
} from '../lib/terminalLayout'

function SeparatorBar({ orientation }) {
  const vertical = orientation === 'horizontal'
  return (
    <Separator
      className={
        vertical
          ? 'w-1.5 cursor-col-resize bg-zinc-900 transition-colors hover:bg-zinc-500/50 data-[separator=active]:bg-zinc-300'
          : 'h-1.5 cursor-row-resize bg-zinc-900 transition-colors hover:bg-zinc-500/50 data-[separator=active]:bg-zinc-300'
      }
    />
  )
}

function EmptyPane({ agents, focused, onFocus, onAssign }) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-[#07070a] ${
        focused ? 'outline outline-1 outline-white/25' : ''
      }`}
      onMouseDown={onFocus}
    >
      <p className="font-mono text-xs text-zinc-500">Empty pane</p>
      <p className="max-w-[220px] text-center font-mono text-[10px] text-zinc-600">
        Assign an agent from the sidebar, or pick one below.
      </p>
      {agents.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => e.target.value && onAssign(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-200"
        >
          <option value="" disabled>Assign agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function LayoutTree({
  node,
  agents,
  agentMap,
  focusedId,
  onFocus,
  onAssign,
  onClosePane,
  onContextSplit,
}) {
  if (!node) return null

  if (node.kind === 'leaf') {
    const agent = node.agentId ? agentMap[node.agentId] : null
    const state = herdState(agent?.status)
    return (
      <div
        className={`flex h-full min-h-0 min-w-0 flex-col ${
          focusedId === node.id ? 'ring-1 ring-inset ring-white/30' : ''
        }`}
        onContextMenu={(e) => {
          e.preventDefault()
          onFocus(node.id)
          onContextSplit?.(node.id, e)
        }}
      >
        {node.agentId ? (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 bg-[#0c0c10] px-2 py-0.5 font-mono text-[10px]">
              <span className={`h-1.5 w-1.5 rounded-full ${
                focusedId === node.id
                  ? 'bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                  : state.dot
              }`} />
              <span className={`truncate ${focusedId === node.id ? 'text-zinc-100' : state.text}`}>
                {agent?.name || 'agent'}
              </span>
              <span className="text-zinc-600">·</span>
              <span className={focusedId === node.id ? 'text-zinc-400' : state.text}>{state.label}</span>
              <span className="text-zinc-600">·</span>
              <span className="truncate text-zinc-500">{agent?.harness || 'pty'}</span>
              <div className="flex-1" />
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                title="Split right"
                onClick={() => onContextSplit?.(node.id, null, 'horizontal')}
              >
                <IconSplitColumns className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                title="Split down"
                onClick={() => onContextSplit?.(node.id, null, 'vertical')}
              >
                <IconSplitRows className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="px-1 text-zinc-600 hover:text-red-300"
                title="Close pane"
                onClick={() => onClosePane(node.id)}
              >
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AgentTerminal
                key={`${node.id}:${node.agentId}`}
                agentId={node.agentId}
                agentName={agent?.name || node.agentId.slice(0, 8)}
                fill
                compact
                chrome={false}
                focused={focusedId === node.id}
                onFocus={() => onFocus(node.id)}
              />
            </div>
          </>
        ) : (
          <EmptyPane
            agents={agents}
            focused={focusedId === node.id}
            onFocus={() => onFocus(node.id)}
            onAssign={(agentId) => onAssign(node.id, agentId)}
          />
        )}
      </div>
    )
  }

  const parts = []
  node.children.forEach((child, index) => {
    if (index > 0) {
      parts.push(<SeparatorBar key={`sep-${child.id}`} orientation={node.orientation} />)
    }
    parts.push(
      <Panel
        key={child.id}
        id={child.id}
        defaultSize={Math.floor(100 / node.children.length)}
        minSize={10}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <LayoutTree
          node={child}
          agents={agents}
          agentMap={agentMap}
          focusedId={focusedId}
          onFocus={onFocus}
          onAssign={onAssign}
          onClosePane={onClosePane}
          onContextSplit={onContextSplit}
        />
      </Panel>,
    )
  })

  return (
    <Group id={node.id} orientation={node.orientation} className="h-full w-full">
      {parts}
    </Group>
  )
}

/**
 * Herdr / cmux-inspired multiplexer: workspaces + agent sidebar + resizable PTYs.
 * Chrome (toggle, title) is integrated — nothing floats over the panes.
 */
export default function TerminalHerd({
  agents = [],
  initialAgentIds = [],
  viewToggle = null,
  error = null,
}) {
  const [wsState, setWsState] = useState(() => loadWorkspaces())
  const active = getActiveWorkspace(wsState)
  const [tree, setTree] = useState(() => active?.tree || createLeaf(null))
  const [focusedId, setFocusedId] = useState(() => active?.focusedId || firstLeafId(active?.tree))
  const [menu, setMenu] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')

  // Seed empty default from URL agents once
  useEffect(() => {
    if (!initialAgentIds.length) return
    if (collectAgentIds(tree).size > 0) return
    if (tree.kind === 'leaf' && !tree.agentId) {
      setTree(createLeaf(initialAgentIds[0]))
    }
  }, [initialAgentIds, tree])

  // Persist active workspace whenever layout changes
  useEffect(() => {
    setWsState((prev) => {
      const next = upsertActiveWorkspace(prev, { tree, focusedId })
      saveWorkspaces(next)
      return next
    })
  }, [tree, focusedId])

  useEffect(() => {
    if (!focusedId) setFocusedId(firstLeafId(tree))
  }, [tree, focusedId])

  const agentMap = useMemo(() => {
    const map = {}
    agents.forEach((a) => { map[a.id] = a })
    return map
  }, [agents])

  const openAgentIds = useMemo(() => collectAgentIds(tree), [tree])
  const panes = countLeaves(tree)

  const switchWorkspace = (id) => {
    const flushed = upsertActiveWorkspace(wsState, { tree, focusedId })
    const next = { ...flushed, activeId: id }
    saveWorkspaces(next)
    setWsState(next)
    const target = getActiveWorkspace(next)
    setTree(target?.tree || createLeaf(null))
    setFocusedId(target?.focusedId || firstLeafId(target?.tree))
  }

  const createNewWorkspace = () => {
    const n = (wsState.workspaces?.length || 0) + 1
    const ws = createWorkspace(`Workspace ${n}`)
    const flushed = upsertActiveWorkspace(wsState, { tree, focusedId })
    const next = {
      activeId: ws.id,
      workspaces: [...flushed.workspaces, ws],
    }
    saveWorkspaces(next)
    setWsState(next)
    setTree(ws.tree)
    setFocusedId(ws.focusedId)
  }

  const deleteWorkspace = (id) => {
    if ((wsState.workspaces?.length || 0) <= 1) return
    const flushed = upsertActiveWorkspace(wsState, { tree, focusedId })
    const remaining = flushed.workspaces.filter((w) => w.id !== id)
    const activeId = flushed.activeId === id ? remaining[0].id : flushed.activeId
    const next = { activeId, workspaces: remaining }
    saveWorkspaces(next)
    setWsState(next)
    if (flushed.activeId === id) {
      const target = getActiveWorkspace(next)
      setTree(target.tree)
      setFocusedId(target.focusedId)
    }
  }

  const commitRename = () => {
    if (!renamingId) return
    const name = renameDraft.trim() || 'Workspace'
    setWsState((prev) => {
      const next = {
        ...prev,
        workspaces: prev.workspaces.map((w) => (
          w.id === renamingId ? { ...w, name, updatedAt: Date.now() } : w
        )),
      }
      saveWorkspaces(next)
      return next
    })
    setRenamingId(null)
  }

  const onAssign = useCallback((leafId, agentId) => {
    setTree((t) => updateLeaf(t, leafId, { agentId }))
    setFocusedId(leafId)
  }, [])

  const onClosePane = useCallback((leafId) => {
    setTree((t) => removeLeaf(t, leafId) || createLeaf(null))
    setFocusedId((cur) => (cur === leafId ? null : cur))
  }, [])

  const splitAt = useCallback((leafId, orientation) => {
    setTree((current) => {
      const { tree: next, newLeafId } = splitLeaf(current, leafId, orientation)
      if (newLeafId) setFocusedId(newLeafId)
      return next
    })
    setMenu(null)
  }, [])

  const openAgent = (agentId) => {
    const existing = findLeafByAgent(tree, agentId)
    if (existing) {
      setFocusedId(existing.id)
      return
    }
    const target = focusedId || firstLeafId(tree)
    const leaf = findLeaf(tree, target)
    if (leaf && !leaf.agentId) {
      onAssign(target, agentId)
      return
    }
    if (target) {
      const { tree: next, newLeafId } = splitLeaf(tree, target, 'horizontal')
      setTree(updateLeaf(next, newLeafId, { agentId }))
      setFocusedId(newLeafId)
    } else {
      setTree(createLeaf(agentId))
    }
  }

  const onContextSplit = (leafId, event, orientation) => {
    if (orientation) {
      splitAt(leafId, orientation)
      return
    }
    if (event) setMenu({ x: event.clientX, y: event.clientY, leafId })
  }

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#07070a] text-zinc-100">
      {/* Integrated top chrome */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 bg-[#0a0a0e] px-3 py-2">
        {viewToggle}
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold tracking-wide text-zinc-100">
            Panes
          </div>
          <div className="font-mono text-[10px] text-zinc-500">
            {active?.name || 'Workspace'} · {agents.length} agents · {panes} panes
          </div>
        </div>
        <div className="flex-1" />
        <Link
          to="/agents"
          className="font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          Agents →
        </Link>
      </header>

      {error && (
        <div className="shrink-0 border-b border-red-900 bg-red-950/40 px-3 py-2 font-mono text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Sidebar: workspaces + herd */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-[#0a0a0e]">
          <section className="border-b border-zinc-800/80">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Workspaces
              </span>
              <button
                type="button"
                onClick={createNewWorkspace}
                className="rounded border border-zinc-700/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                title="New workspace"
              >
                + New
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto pb-1">
              {wsState.workspaces.map((ws) => {
                const isActive = ws.id === wsState.activeId
                return (
                  <div
                    key={ws.id}
                    className={`group relative flex items-center gap-2 py-1.5 pl-3.5 pr-2.5 ${
                      isActive
                        ? 'bg-white/[0.06]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <PaneIllumine active={isActive} />
                    {renamingId === ws.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[11px] text-zinc-100 focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => switchWorkspace(ws.id)}
                        onDoubleClick={() => {
                          setRenamingId(ws.id)
                          setRenameDraft(ws.name)
                        }}
                        className={[
                          'min-w-0 flex-1 truncate text-left font-mono text-xs',
                          isActive ? 'font-medium text-zinc-50' : 'text-zinc-400',
                        ].join(' ')}
                        title="Click to switch · double-click to rename"
                      >
                        {ws.name}
                      </button>
                    )}
                    {wsState.workspaces.length > 1 && (
                      <button
                        type="button"
                        onClick={() => deleteWorkspace(ws.id)}
                        className="px-1 font-mono text-[10px] text-zinc-600 opacity-0 hover:text-zinc-300 group-hover:opacity-100"
                        title="Delete workspace"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col">
            <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Herd
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
              {agents.length === 0 && (
                <p className="px-3 py-4 font-mono text-[11px] text-zinc-600">
                  No agents registered yet.
                </p>
              )}
              {agents.map((agent) => {
                const state = herdState(agent.status)
                const isOpen = openAgentIds.has(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => openAgent(agent.id)}
                    className={`w-full px-3 py-2 text-left font-mono text-xs transition-colors ${
                      isOpen
                        ? 'bg-white/[0.06]'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          isOpen
                            ? 'bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.45)]'
                            : 'bg-zinc-600'
                        }`}
                      />
                      <span className={`truncate ${isOpen ? 'text-zinc-50' : 'text-zinc-300'}`}>
                        {agent.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 pl-3.5 text-[10px] text-zinc-500">
                      <span className={isOpen ? 'text-zinc-400' : state.text}>{state.label}</span>
                      <span>·</span>
                      <span>{agent.harness}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="border-t border-zinc-800/80 p-2">
            <button
              type="button"
              onClick={() => {
                setTree(createLeaf(null))
                setFocusedId(null)
              }}
              className="w-full px-2 py-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-400"
            >
              Reset this workspace
            </button>
          </div>
        </aside>

        {/* Pane grid */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-end border-b border-zinc-800/80 bg-[#0a0a0e] px-2 py-1">
            <div
              className="flex items-center gap-0.5"
              role="group"
              aria-label="Split pane"
            >
              <button
                type="button"
                title="Split right"
                aria-label="Split right"
                onClick={() => {
                  const id = focusedId || firstLeafId(tree)
                  if (id) splitAt(id, 'horizontal')
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
              >
                <IconSplitColumns className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Split down"
                aria-label="Split down"
                onClick={() => {
                  const id = focusedId || firstLeafId(tree)
                  if (id) splitAt(id, 'vertical')
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
              >
                <IconSplitRows className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 bg-[#07070a]">
            <LayoutTree
              node={tree}
              agents={agents}
              agentMap={agentMap}
              focusedId={focusedId}
              onFocus={setFocusedId}
              onAssign={onAssign}
              onClosePane={onClosePane}
              onContextSplit={onContextSplit}
            />
          </div>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-[140px] rounded border border-zinc-700 bg-zinc-900 py-1 font-mono text-xs shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            onClick={() => splitAt(menu.leafId, 'horizontal')}
          >
            Split right
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-zinc-800"
            onClick={() => splitAt(menu.leafId, 'vertical')}
          >
            Split down
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
            onClick={() => {
              onClosePane(menu.leafId)
              setMenu(null)
            }}
          >
            Close pane
          </button>
        </div>
      )}
    </div>
  )
}

/** Vertical filament lit with the node radiance stack (no animation). */
function PaneIllumine({ active = false }) {
  return (
    <span
      className="pane-illumine"
      data-active={active ? 'true' : 'false'}
      style={{
        '--led-angle': '-48deg',
        '--led-amp': active ? 0.48 : 0.18,
      }}
      aria-hidden
    >
      <span className="pane-illumine__bloom" />
      <span className="pane-illumine__luma" />
      <span className="pane-illumine__plate" />
      <span className="pane-illumine__noise" />
      <span className="pane-illumine__core" />
    </span>
  )
}
