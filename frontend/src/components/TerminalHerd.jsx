import { useCallback, useEffect, useMemo, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import AgentTerminal from './AgentTerminal'
import {
  collectAgentIds,
  countLeaves,
  createLeaf,
  findLeaf,
  findLeafByAgent,
  firstLeafId,
  herdState,
  loadLayout,
  removeLeaf,
  saveLayout,
  splitLeaf,
  updateLeaf,
} from '../lib/terminalLayout'

function SeparatorBar({ orientation }) {
  const vertical = orientation === 'horizontal' // group horizontal → vertical gutter
  return (
    <Separator
      className={
        vertical
          ? 'w-1.5 bg-zinc-900 hover:bg-sky-600/40 data-[separator=active]:bg-sky-500 transition-colors cursor-col-resize'
          : 'h-1.5 bg-zinc-900 hover:bg-sky-600/40 data-[separator=active]:bg-sky-500 transition-colors cursor-row-resize'
      }
    />
  )
}

function EmptyPane({ agents, focused, onFocus, onAssign }) {
  return (
    <div
      className={`h-full min-h-0 flex flex-col items-center justify-center gap-3 bg-[#0b0d12] ${
        focused ? 'outline outline-1 outline-sky-600/50' : ''
      }`}
      onMouseDown={onFocus}
    >
      <p className="font-mono text-xs text-zinc-500">Empty pane</p>
      <p className="font-mono text-[10px] text-zinc-600 max-w-[220px] text-center">
        Pick an agent from the sidebar, or assign one here — Herdr-style real PTY.
      </p>
      {agents.length > 0 && (
        <select
          defaultValue=""
          onChange={(e) => e.target.value && onAssign(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono text-zinc-200"
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
        className={`h-full min-h-0 min-w-0 flex flex-col ${
          focusedId === node.id ? 'ring-1 ring-inset ring-sky-600/60' : ''
        }`}
        onContextMenu={(e) => {
          e.preventDefault()
          onFocus(node.id)
          onContextSplit?.(node.id, e)
        }}
      >
        {node.agentId ? (
          <>
            <div className="flex items-center gap-2 px-2 py-0.5 bg-[#12151c] border-b border-zinc-800/80 text-[10px] font-mono shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${state.dot}`} />
              <span className={`truncate ${state.text}`}>{agent?.name || 'agent'}</span>
              <span className="text-zinc-600">·</span>
              <span className={state.text}>{state.label}</span>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500 truncate">{agent?.harness || 'pty'}</span>
              <div className="flex-1" />
              <button
                type="button"
                className="text-zinc-600 hover:text-zinc-300 px-1"
                title="Split right"
                onClick={() => onContextSplit?.(node.id, null, 'horizontal')}
              >
                │
              </button>
              <button
                type="button"
                className="text-zinc-600 hover:text-zinc-300 px-1"
                title="Split down"
                onClick={() => onContextSplit?.(node.id, null, 'vertical')}
              >
                ─
              </button>
              <button
                type="button"
                className="text-zinc-600 hover:text-red-300 px-1"
                title="Close pane"
                onClick={() => onClosePane(node.id)}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0">
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
 * Herdr-inspired agent multiplexer inside O-cina.
 * Sidebar for the herd + mouse-first resizable real PTY panes.
 */
export default function TerminalHerd({ agents = [], initialAgentIds = [] }) {
  const persisted = useMemo(() => loadLayout(), [])

  const [tree, setTree] = useState(() => {
    if (persisted?.tree) return persisted.tree
    if (initialAgentIds.length === 0) return createLeaf(null)
    let node = createLeaf(initialAgentIds[0])
    for (let i = 1; i < initialAgentIds.length; i += 1) {
      node = {
        kind: 'split',
        id: `seed_${i}`,
        orientation: i % 2 === 0 ? 'vertical' : 'horizontal',
        children: [node, createLeaf(initialAgentIds[i])],
      }
    }
    return node
  })

  const [focusedId, setFocusedId] = useState(() => persisted?.focusedId || firstLeafId(tree))
  const [menu, setMenu] = useState(null) // { x, y, leafId }

  const agentMap = useMemo(() => {
    const map = {}
    agents.forEach((a) => { map[a.id] = a })
    return map
  }, [agents])

  const openAgentIds = useMemo(() => collectAgentIds(tree), [tree])

  useEffect(() => {
    saveLayout(tree, focusedId)
  }, [tree, focusedId])

  useEffect(() => {
    if (!focusedId) setFocusedId(firstLeafId(tree))
  }, [tree, focusedId])

  useEffect(() => {
    if (!initialAgentIds.length) return
    if (collectAgentIds(tree).size > 0) return
    if (tree.kind === 'leaf' && !tree.agentId) {
      setTree(createLeaf(initialAgentIds[0]))
    }
  }, [initialAgentIds, tree])

  const onAssign = useCallback((leafId, agentId) => {
    setTree((t) => updateLeaf(t, leafId, { agentId }))
    setFocusedId(leafId)
  }, [])

  const onClosePane = useCallback((leafId) => {
    setTree((t) => removeLeaf(t, leafId) || createLeaf(null))
    setFocusedId((cur) => (cur === leafId ? null : cur))
  }, [])

  const splitAt = useCallback((leafId, orientation) => {
    const { tree: next, newLeafId } = splitLeaf(tree, leafId, orientation)
    setTree(next)
    if (newLeafId) setFocusedId(newLeafId)
    setMenu(null)
  }, [tree])

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
    if (event) {
      setMenu({ x: event.clientX, y: event.clientY, leafId })
    }
  }

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  const panes = countLeaves(tree)

  return (
    <div className="flex h-full min-h-0 bg-[#0b0d12] text-zinc-100">
      {/* Herdr-style sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-800/80 bg-[#0e1118] flex flex-col min-h-0">
        <div className="px-3 py-2.5 border-b border-zinc-800/80">
          <div className="font-mono text-sm tracking-tight">Herd</div>
          <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
            {agents.length} agents · {panes} panes
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {agents.length === 0 && (
            <p className="px-3 py-4 font-mono text-[11px] text-zinc-600">
              No agents registered yet.
            </p>
          )}
          {agents.map((agent) => {
            const state = herdState(agent.status)
            const active = openAgentIds.has(agent.id)
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => openAgent(agent.id)}
                className={`w-full text-left px-3 py-2 font-mono text-xs border-l-2 transition-colors ${
                  active
                    ? 'border-sky-500 bg-sky-950/30'
                    : 'border-transparent hover:bg-zinc-900/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${state.dot}`} />
                  <span className="truncate text-zinc-200">{agent.name}</span>
                </div>
                <div className="mt-0.5 pl-3.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className={state.text}>{state.label}</span>
                  <span>·</span>
                  <span>{agent.harness}</span>
                </div>
              </button>
            )
          })}
        </div>
        <div className="p-2 border-t border-zinc-800/80 space-y-1">
          <button
            type="button"
            onClick={() => {
              const id = focusedId || firstLeafId(tree)
              if (id) splitAt(id, 'horizontal')
            }}
            className="w-full px-2 py-1.5 text-[11px] font-mono rounded border border-zinc-800 hover:border-zinc-600 text-zinc-400"
          >
            Split pane │
          </button>
          <button
            type="button"
            onClick={() => {
              const id = focusedId || firstLeafId(tree)
              if (id) splitAt(id, 'vertical')
            }}
            className="w-full px-2 py-1.5 text-[11px] font-mono rounded border border-zinc-800 hover:border-zinc-600 text-zinc-400"
          >
            Split pane ─
          </button>
          <button
            type="button"
            onClick={() => {
              setTree(createLeaf(null))
              setFocusedId(null)
            }}
            className="w-full px-2 py-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-400"
          >
            Reset layout
          </button>
        </div>
      </aside>

      {/* Pane grid */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-zinc-800/80 bg-[#0e1118] text-[10px] font-mono text-zinc-500 shrink-0">
          <span>Click sidebar to attach · drag gutters to resize · right-click pane to split</span>
          <div className="flex-1" />
          <span className="text-zinc-600">inspired by herdr.dev</span>
        </div>
        <div className="flex-1 min-h-0">
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

      {menu && (
        <div
          className="fixed z-50 min-w-[140px] rounded border border-zinc-700 bg-zinc-900 shadow-xl py-1 font-mono text-xs"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200"
            onClick={() => splitAt(menu.leafId, 'horizontal')}
          >
            Split right
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-zinc-200"
            onClick={() => splitAt(menu.leafId, 'vertical')}
          >
            Split down
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 text-red-300"
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
