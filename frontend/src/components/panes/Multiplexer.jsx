import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import PaneCanvas from './PaneCanvas'
import ChamberBar from '../ChamberBar'
import { Avatar, IconButton, Kbd, cx } from '../ui'
import {
  IconAdd,
  IconAgents,
  IconClose,
  IconCommand,
  IconMaximize,
  IconMinimize,
  IconPlay,
  IconRestart,
  IconSplitColumns,
  IconSplitRows,
  IconStop,
  IconTerminal,
} from '../icons'
import { api } from '../../api/agents'
import { fetchAgents } from '../../lib/store/agentsSlice'
import { agentAvatarUrl } from '../../lib/agentField'
import { useCommandPalette, useCommands } from '../../lib/commands'
import { needsAttention, statusMeta } from '../../lib/status'
import { plural } from '../../lib/format'
import {
  collectAgentIds,
  countLeaves,
  createLeaf,
  createWorkspace,
  cycleLeafId,
  equalizeSplits,
  findLeaf,
  findLeafByAgent,
  firstLeafId,
  getActiveWorkspace,
  loadWorkspaces,
  moveLeaf,
  paneAgentState,
  pathToLeaf,
  removeLeaf,
  saveWorkspaces,
  splitLeaf,
  resizeSizes,
  updateLeaf,
  updateSplitSizes,
  upsertActiveWorkspace,
} from '../../lib/terminalLayout'

/**
 * Command-center multiplexer: vertical workspace tabs with live agent state,
 * resizable PTY panes, attention rings, zoom, and keyboard control.
 */
export default function Multiplexer({
  agents = [],
  initialAgentIds = [],
  view,
  onViewChange,
  error = null,
  loading = false,
}) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()

  const [wsState, setWsState] = useState(() => loadWorkspaces())
  const active = getActiveWorkspace(wsState)
  const [tree, setTree] = useState(() => active?.tree || createLeaf(null))
  const [focusedId, setFocusedId] = useState(() => active?.focusedId || firstLeafId(active?.tree))
  const [zoomedId, setZoomedId] = useState(null)
  const [menu, setMenu] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [interacting, setInteracting] = useState(false)

  // Open any agents named in the URL (?agent= / ?agents=) once.
  const seededRef = useRef(false)

  // Persist active workspace whenever layout changes (once a drag settles)
  useEffect(() => {
    if (interacting) return
    setWsState((prev) => {
      const next = upsertActiveWorkspace(prev, { tree, focusedId })
      saveWorkspaces(next)
      return next
    })
  }, [tree, focusedId, interacting])

  useEffect(() => {
    if (!focusedId || !findLeaf(tree, focusedId)) setFocusedId(firstLeafId(tree))
    if (zoomedId && !findLeaf(tree, zoomedId)) setZoomedId(null)
  }, [tree, focusedId, zoomedId])

  const agentMap = useMemo(() => {
    const map = {}
    agents.forEach((a) => { map[a.id] = a })
    return map
  }, [agents])

  const openAgentIds = useMemo(() => collectAgentIds(tree), [tree])
  const panes = countLeaves(tree)
  const liveCount = agents.filter((a) => paneAgentState(a.status).key === 'working').length
  const attentionCount = agents.filter((a) => needsAttention(a.status)).length
  const focusedLeaf = findLeaf(tree, focusedId)
  const focusedAgent = focusedLeaf?.agentId ? agentMap[focusedLeaf.agentId] : null

  // ── Workspace actions ────────────────────────────────────────────────────

  const commitWorkspaces = (next) => {
    saveWorkspaces(next)
    setWsState(next)
    const target = getActiveWorkspace(next)
    setTree(target?.tree || createLeaf(null))
    setFocusedId(target?.focusedId || firstLeafId(target?.tree))
    setZoomedId(null)
  }

  const switchWorkspace = (id) => {
    if (id === wsState.activeId) return
    const flushed = upsertActiveWorkspace(wsState, { tree, focusedId })
    commitWorkspaces({ ...flushed, activeId: id })
  }

  const createNewWorkspace = () => {
    const ws = createWorkspace(`Workspace ${(wsState.workspaces?.length || 0) + 1}`)
    const flushed = upsertActiveWorkspace(wsState, { tree, focusedId })
    commitWorkspaces({ activeId: ws.id, workspaces: [...flushed.workspaces, ws] })
  }

  const deleteWorkspace = (id) => {
    if ((wsState.workspaces?.length || 0) <= 1) return
    const flushed = upsertActiveWorkspace(wsState, { tree, focusedId })
    const remaining = flushed.workspaces.filter((w) => w.id !== id)
    const activeId = flushed.activeId === id ? remaining[0].id : flushed.activeId
    if (flushed.activeId === id) {
      commitWorkspaces({ activeId, workspaces: remaining })
    } else {
      const next = { activeId, workspaces: remaining }
      saveWorkspaces(next)
      setWsState(next)
    }
  }

  const renameWorkspace = (id, name) => {
    setWsState((prev) => {
      const next = {
        ...prev,
        workspaces: prev.workspaces.map((w) => (
          w.id === id ? { ...w, name: name.trim() || 'Workspace', updatedAt: Date.now() } : w
        )),
      }
      saveWorkspaces(next)
      return next
    })
    setRenamingId(null)
  }

  // ── Pane actions ─────────────────────────────────────────────────────────

  const onAssign = useCallback((leafId, agentId) => {
    setTree((t) => updateLeaf(t, leafId, { agentId }))
    setFocusedId(leafId)
  }, [])

  const closePane = useCallback((leafId) => {
    setTree((t) => removeLeaf(t, leafId) || createLeaf(null))
    setZoomedId((z) => (z === leafId ? null : z))
  }, [])

  const splitAt = useCallback((leafId, orientation) => {
    if (!leafId) return
    setTree((current) => {
      const { tree: next, newLeafId } = splitLeaf(current, leafId, orientation)
      if (newLeafId) setFocusedId(newLeafId)
      return next
    })
    setZoomedId(null)
    setMenu(null)
  }, [])

  const toggleZoom = useCallback((leafId) => {
    if (!leafId) return
    setZoomedId((z) => (z === leafId ? null : leafId))
    setFocusedId(leafId)
  }, [])

  const setSizes = useCallback((splitId, sizes) => {
    setTree((t) => updateSplitSizes(t, splitId, sizes))
  }, [])

  const dockPane = useCallback((srcId, targetId, zone) => {
    setTree((t) => moveLeaf(t, srcId, targetId, zone))
    setFocusedId(srcId)
  }, [])

  const equalize = useCallback((splitId = null) => {
    setTree((t) => equalizeSplits(t, splitId))
  }, [])

  /** ⌥⇧+arrow: push the focused pane's border that way (tmux-style). */
  const nudgeBorder = useCallback((direction) => {
    const horiz = direction === 'left' || direction === 'right'
    const orientation = horiz ? 'horizontal' : 'vertical'
    const sign = direction === 'right' || direction === 'down' ? 1 : -1
    setTree((t) => {
      const path = pathToLeaf(t, focusedId) || []
      const hop = [...path].reverse().find((p) => p.split.orientation === orientation)
      if (!hop) return t
      const { split, index } = hop
      const n = split.children.length
      // Prefer the border on the side we're moving toward
      const divider = sign > 0 ? (index < n - 1 ? index : index - 1) : (index > 0 ? index - 1 : index)
      const mins = split.children.map(() => 0.06)
      return updateSplitSizes(t, split.id, resizeSizes(split.sizes, divider, sign * 0.05, mins))
    })
  }, [focusedId])

  const openAgent = useCallback((agentId) => {
    setTree((current) => {
      const existing = findLeafByAgent(current, agentId)
      if (existing) {
        setFocusedId(existing.id)
        return current
      }
      const target = findLeaf(current, focusedId) ? focusedId : firstLeafId(current)
      const leaf = findLeaf(current, target)
      if (leaf && !leaf.agentId) {
        setFocusedId(target)
        return updateLeaf(current, target, { agentId })
      }
      const { tree: next, newLeafId } = splitLeaf(current, target, 'horizontal')
      setFocusedId(newLeafId)
      return updateLeaf(next, newLeafId, { agentId })
    })
    setZoomedId(null)
  }, [focusedId])

  useEffect(() => {
    if (seededRef.current || !initialAgentIds.length) return
    seededRef.current = true
    initialAgentIds.forEach((id) => openAgent(id))
  }, [initialAgentIds, openAgent])

  const controlAgent = useCallback(async (agent, action) => {
    if (!agent) return
    try {
      if (action === 'start') await api.startAgent(agent.id)
      if (action === 'stop') await api.stopAgent(agent.id)
      if (action === 'restart') await api.restartAgent(agent.id)
    } finally {
      dispatch(fetchAgents({}))
    }
  }, [dispatch])

  // ── Keyboard: ⌥ chords, captured so they work while a terminal has focus ──

  const keyActions = useRef({})
  keyActions.current = {
    KeyD: (e) => splitAt(focusedId, e.shiftKey ? 'vertical' : 'horizontal'),
    KeyW: () => focusedId && closePane(focusedId),
    KeyZ: () => toggleZoom(focusedId),
    KeyN: () => createNewWorkspace(),
    BracketRight: () => setFocusedId(cycleLeafId(tree, focusedId, 1)),
    BracketLeft: () => setFocusedId(cycleLeafId(tree, focusedId, -1)),
    Equal: () => equalize(),
    ArrowLeft: (e) => e.shiftKey && nudgeBorder('left'),
    ArrowRight: (e) => e.shiftKey && nudgeBorder('right'),
    ArrowUp: (e) => e.shiftKey && nudgeBorder('up'),
    ArrowDown: (e) => e.shiftKey && nudgeBorder('down'),
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || paletteOpen) return
      const digit = /^Digit([1-9])$/.exec(e.code)
      let handled = false
      if (digit) {
        const ws = wsState.workspaces[Number(digit[1]) - 1]
        if (ws) { switchWorkspace(ws.id); handled = true }
      } else if (keyActions.current[e.code]) {
        if (e.code.startsWith('Arrow') && !e.shiftKey) return
        keyActions.current[e.code](e)
        handled = true
      }
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  // ── Palette commands ─────────────────────────────────────────────────────

  const commands = useMemo(() => {
    const list = [
      { id: 'pane-split-right', group: 'Panes', title: 'Split right', icon: IconSplitColumns, shortcut: ['⌥', 'D'], run: () => splitAt(focusedId, 'horizontal') },
      { id: 'pane-split-down', group: 'Panes', title: 'Split down', icon: IconSplitRows, shortcut: ['⌥', '⇧', 'D'], run: () => splitAt(focusedId, 'vertical') },
      { id: 'pane-zoom', group: 'Panes', title: zoomedId ? 'Restore layout' : 'Zoom focused pane', icon: zoomedId ? IconMinimize : IconMaximize, shortcut: ['⌥', 'Z'], run: () => toggleZoom(focusedId) },
      { id: 'pane-equalize', group: 'Panes', title: 'Even out pane sizes', keywords: 'equalize balance', icon: IconSplitColumns, shortcut: ['⌥', '='], run: () => equalize() },
      { id: 'pane-next', group: 'Panes', title: 'Focus next pane', icon: IconTerminal, shortcut: ['⌥', ']'], run: () => setFocusedId(cycleLeafId(tree, focusedId, 1)) },
      { id: 'pane-close', group: 'Panes', title: 'Close pane', icon: IconClose, shortcut: ['⌥', 'W'], run: () => focusedId && closePane(focusedId) },
      { id: 'pane-clear', group: 'Panes', title: 'Clear workspace layout', keywords: 'reset', icon: IconClose, run: () => { setTree(createLeaf(null)); setZoomedId(null) } },
      { id: 'ws-new', group: 'Workspaces', title: 'New workspace', icon: IconAdd, shortcut: ['⌥', 'N'], run: createNewWorkspace },
      { id: 'ws-rename', group: 'Workspaces', title: `Rename “${active?.name || 'Workspace'}”`, icon: IconTerminal, run: () => setRenamingId(wsState.activeId) },
      ...wsState.workspaces.map((ws, i) => ({
        id: `ws-switch-${ws.id}`,
        group: 'Workspaces',
        title: `Switch to ${ws.name}`,
        icon: IconTerminal,
        shortcut: i < 9 ? ['⌥', String(i + 1)] : undefined,
        run: () => switchWorkspace(ws.id),
      })),
    ]
    if (wsState.workspaces.length > 1) {
      list.push({ id: 'ws-delete', group: 'Workspaces', title: `Delete “${active?.name}”`, icon: IconClose, run: () => deleteWorkspace(wsState.activeId) })
    }
    if (focusedAgent) {
      const live = paneAgentState(focusedAgent.status).key === 'working'
      list.unshift(
        live
          ? { id: 'agent-stop', group: focusedAgent.name, title: 'Stop agent', icon: IconStop, run: () => controlAgent(focusedAgent, 'stop') }
          : { id: 'agent-start', group: focusedAgent.name, title: 'Start agent', icon: IconPlay, run: () => controlAgent(focusedAgent, 'start') },
        { id: 'agent-restart', group: focusedAgent.name, title: 'Restart agent', icon: IconRestart, run: () => controlAgent(focusedAgent, 'restart') },
        { id: 'agent-details', group: focusedAgent.name, title: 'Open agent details', icon: IconAgents, run: () => navigate(`/agents/${focusedAgent.id}`) },
      )
    }
    agents.forEach((a) => {
      list.push({
        id: `pane-open-${a.id}`,
        group: 'Open in pane',
        title: a.name,
        subtitle: `${a.harness || 'agent'} · ${statusMeta(a.status).label}${openAgentIds.has(a.id) ? ' · open' : ''}`,
        avatar: agentAvatarUrl(a),
        keywords: 'open attach',
        run: () => openAgent(a.id),
      })
    })
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, wsState, focusedId, zoomedId, tree, focusedAgent, openAgentIds])

  useCommands('panes', commands)

  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-0 text-zinc-100">
      <ChamberBar
        view={view}
        onViewChange={onViewChange}
        meta={
          <WorkspaceTitle
            name={active?.name || 'Workspace'}
            renaming={renamingId === wsState.activeId}
            onStartRename={() => setRenamingId(wsState.activeId)}
            onRename={(name) => renameWorkspace(wsState.activeId, name)}
            onCancel={() => setRenamingId(null)}
          />
        }
        actions={(
          <>
            <IconButton label="Split right (⌥D)" className="hidden sm:inline-flex" onClick={() => splitAt(focusedId, 'horizontal')}>
              <IconSplitColumns className="h-4 w-4" />
            </IconButton>
            <IconButton label="Split down (⌥⇧D)" className="hidden sm:inline-flex" onClick={() => splitAt(focusedId, 'vertical')}>
              <IconSplitRows className="h-4 w-4" />
            </IconButton>
            <IconButton label={zoomedId ? 'Restore (⌥Z)' : 'Zoom pane (⌥Z)'} active={!!zoomedId} onClick={() => toggleZoom(focusedId)}>
              {zoomedId ? <IconMinimize className="h-4 w-4" /> : <IconMaximize className="h-4 w-4" />}
            </IconButton>
            <div className="mx-1 hidden h-4 w-px bg-white/[0.08] sm:block" aria-hidden />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Commands"
              className="flex h-7 items-center gap-2 rounded-lg bg-white/[0.03] pl-2.5 pr-1 font-mono text-[11px] text-zinc-500 ring-1 ring-inset ring-white/[0.06] transition-colors hover:text-zinc-200"
            >
              <span className="hidden sm:inline">Commands</span>
              <span className="flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
            </button>
          </>
        )}
      />

      {error && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/[0.06] px-4 py-1.5 font-mono text-[11px] text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          wsState={wsState}
          activeTree={tree}
          agents={agents}
          agentMap={agentMap}
          openAgentIds={openAgentIds}
          renamingId={renamingId}
          loading={loading}
          onSwitch={switchWorkspace}
          onCreate={createNewWorkspace}
          onDelete={deleteWorkspace}
          onStartRename={setRenamingId}
          onRename={renameWorkspace}
          onCancelRename={() => setRenamingId(null)}
          onOpenAgent={openAgent}
        />

        <div className="flex min-h-0 min-w-0 flex-1 p-1.5">
          <PaneCanvas
            tree={tree}
            agents={agents}
            agentMap={agentMap}
            focusedId={focusedId}
            zoomedId={zoomedId}
            onFocus={setFocusedId}
            onAssign={onAssign}
            onClose={closePane}
            onSplit={splitAt}
            onZoom={toggleZoom}
            onMenu={(leafId, e) => {
              setFocusedId(leafId)
              setMenu({ x: e.clientX, y: e.clientY, leafId })
            }}
            onSizes={setSizes}
            onMove={dockPane}
            onEqualize={equalize}
            onInteracting={setInteracting}
          />
        </div>
      </div>

      {/* Status strip — the floating nav docks into its centre */}
      <footer className="flex h-14 shrink-0 items-center gap-4 border-t border-white/[0.06] bg-ink-1 px-4 font-mono text-[10px] text-zinc-600">
        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          <Hint keys={['⌥', 'D']} label="split" />
          <Hint keys={['⌥', 'Z']} label="zoom" />
          <Hint keys={['⌥', '⇧', '←→']} label="resize" />
          <span className="hidden xl:inline">drag a header to dock</span>
        </div>
        <div className="flex-1" />
        <div className="hidden items-center gap-3 sm:flex">
          {attentionCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {attentionCount} need attention
            </span>
          )}
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-50 shadow-lit" />
            {liveCount} live
          </span>
          <span>{plural(panes, 'pane')}</span>
        </div>
      </footer>

      {menu && (
        <div
          className="ui-pop fixed z-[60] min-w-[168px] rounded-xl bg-ink-2 p-1 font-mono text-[11px] shadow-float"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MenuItem onClick={() => splitAt(menu.leafId, 'horizontal')} hint="⌥D">Split right</MenuItem>
          <MenuItem onClick={() => splitAt(menu.leafId, 'vertical')} hint="⌥⇧D">Split down</MenuItem>
          <MenuItem onClick={() => { toggleZoom(menu.leafId); setMenu(null) }} hint="⌥Z">
            {zoomedId === menu.leafId ? 'Restore' : 'Zoom'}
          </MenuItem>
          <div className="my-1 h-px bg-white/[0.06]" />
          <MenuItem danger onClick={() => { closePane(menu.leafId); setMenu(null) }} hint="⌥W">Close pane</MenuItem>
        </div>
      )}
    </div>
  )
}

function Hint({ keys, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
      {label}
    </span>
  )
}

function MenuItem({ children, onClick, hint, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]',
        danger ? 'text-red-300' : 'text-zinc-200',
      )}
    >
      {children}
      {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
    </button>
  )
}

function WorkspaceTitle({ name, renaming, onStartRename, onRename, onCancel }) {
  if (renaming) {
    return (
      <RenameInput
        initial={name}
        onCommit={onRename}
        onCancel={onCancel}
        className="w-44 text-[12px]"
      />
    )
  }
  return (
    <button
      type="button"
      onDoubleClick={onStartRename}
      title="Double-click to rename"
      className="truncate font-mono text-[12px] text-zinc-400 transition-colors hover:text-zinc-200"
    >
      {name}
    </button>
  )
}

function RenameInput({ initial, onCommit, onCancel, className = '' }) {
  const [draft, setDraft] = useState(initial)
  const doneRef = useRef(false)
  const finish = (commit) => {
    if (doneRef.current) return
    doneRef.current = true
    if (commit) onCommit(draft)
    else onCancel()
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      className={cx('min-w-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-zinc-100 ring-1 ring-inset ring-white/20 focus:outline-none', className)}
    />
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({
  wsState,
  activeTree,
  agents,
  agentMap,
  openAgentIds,
  renamingId,
  loading,
  onSwitch,
  onCreate,
  onDelete,
  onStartRename,
  onRename,
  onCancelRename,
  onOpenAgent,
}) {
  const live = agents.filter((a) => paneAgentState(a.status).key === 'working').length

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-ink-1 md:flex">
      <SectionHeader
        label="Workspaces"
        action={(
          <IconButton label="New workspace (⌥N)" size="sm" onClick={onCreate}>
            <IconAdd className="h-3.5 w-3.5" />
          </IconButton>
        )}
      />
      <div className="max-h-[45%] space-y-0.5 overflow-y-auto px-2 pb-3">
        {wsState.workspaces.map((ws, i) => {
          const isActive = ws.id === wsState.activeId
          const tree = isActive ? activeTree : ws.tree
          const ids = [...collectAgentIds(tree)]
          const wsAgents = ids.map((id) => agentMap[id]).filter(Boolean)
          const attention = wsAgents.some((a) => needsAttention(a.status))
          const working = wsAgents.filter((a) => paneAgentState(a.status).key === 'working').length
          return (
            <div
              key={ws.id}
              role="button"
              tabIndex={0}
              onClick={() => onSwitch(ws.id)}
              onDoubleClick={() => onStartRename(ws.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSwitch(ws.id) }}
              className={cx(
                'group relative cursor-pointer rounded-lg py-2 pl-3.5 pr-2 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
                isActive ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]',
              )}
            >
              <PaneIllumine active={isActive} />
              <div className="flex items-center gap-2">
                {renamingId === ws.id ? (
                  <RenameInput
                    initial={ws.name}
                    onCommit={(name) => onRename(ws.id, name)}
                    onCancel={onCancelRename}
                    className="flex-1 text-[12px]"
                  />
                ) : (
                  <span className={cx('min-w-0 flex-1 truncate font-mono text-[12px]', isActive ? 'font-medium text-zinc-50' : 'text-zinc-400')}>
                    {ws.name}
                  </span>
                )}
                {attention && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" title="Needs attention" />}
                {wsState.workspaces.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(ws.id) }}
                    className="hidden h-4 w-4 items-center justify-center rounded text-zinc-600 hover:text-zinc-200 group-hover:flex"
                    aria-label={`Delete ${ws.name}`}
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                )}
                {i < 9 && <span className="font-mono text-[10px] text-zinc-700 group-hover:hidden">⌥{i + 1}</span>}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex -space-x-1">
                  {wsAgents.slice(0, 5).map((a) => (
                    <img
                      key={a.id}
                      src={agentAvatarUrl(a)}
                      alt=""
                      title={a.name}
                      className={cx(
                        'node-bit-avatar h-4 w-4 rounded-full bg-[#121218] p-px ring-1',
                        needsAttention(a.status) ? 'ring-amber-400/70' : paneAgentState(a.status).key === 'working' ? 'ring-white/50' : 'ring-ink-1',
                      )}
                    />
                  ))}
                </div>
                <span className="truncate font-mono text-[10px] text-zinc-600">
                  {countLeaves(tree)} {countLeaves(tree) === 1 ? 'pane' : 'panes'}
                  {working > 0 ? ` · ${working} live` : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mx-3 h-px bg-white/[0.06]" />

      <SectionHeader label="Agents" meta={loading ? '…' : `${live}/${agents.length} live`} />
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {!loading && agents.length === 0 && (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-zinc-600">
            No agents registered yet. Add one from the Agents page.
          </p>
        )}
        {agents.map((agent) => {
          const meta = statusMeta(agent.status)
          const isOpen = openAgentIds.has(agent.id)
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onOpenAgent(agent.id)}
              title={isOpen ? 'Focus pane' : 'Open in pane'}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                isOpen ? 'bg-white/[0.04]' : 'hover:bg-white/[0.025]',
              )}
            >
              <Avatar src={agentAvatarUrl(agent)} size="xs" />
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-[12px]', isOpen ? 'text-zinc-100' : 'text-zinc-400')}>
                  {agent.name}
                </span>
                <span className="block truncate font-mono text-[10px] text-zinc-600">
                  {agent.harness || 'agent'}
                </span>
              </span>
              <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} title={meta.label} />
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function SectionHeader({ label, meta, action }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between px-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</span>
      {action || (meta && <span className="font-mono text-[10px] text-zinc-600">{meta}</span>)}
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
        top: 8,
        bottom: 8,
        opacity: active ? 1 : 0,
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
