import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AgentTerminal from '../AgentTerminal'
import { Avatar, IconButton, Kbd, cx } from '../ui'
import {
  IconClose,
  IconMaximize,
  IconMinimize,
  IconSplitColumns,
  IconSplitRows,
  IconTerminal,
} from '../icons'
import { agentAvatarUrl } from '../../lib/agentField'
import { needsAttention, statusMeta } from '../../lib/status'
import {
  computeLayout,
  listLeaves,
  minExtent,
  paneAgentState,
  resizeSizes,
} from '../../lib/terminalLayout'

export const PANE_GAP = 6
export const MIN_PANE = { w: 180, h: 96 }
const EDGE_ZONE = 0.3

function findSplit(node, id) {
  if (!node || node.kind === 'leaf') return null
  if (node.id === id) return node
  for (const c of node.children) {
    const hit = findSplit(c, id)
    if (hit) return hit
  }
  return null
}

function dropRect(r, zone) {
  if (!r) return null
  switch (zone) {
    case 'left': return { x: r.x, y: r.y, w: r.w / 2, h: r.h }
    case 'right': return { x: r.x + r.w / 2, y: r.y, w: r.w / 2, h: r.h }
    case 'top': return { x: r.x, y: r.y, w: r.w, h: r.h / 2 }
    case 'bottom': return { x: r.x, y: r.y + r.h / 2, w: r.w, h: r.h / 2 }
    default: return { x: r.x + 10, y: r.y + 10, w: r.w - 20, h: r.h - 20 }
  }
}

/** Lock cursor + selection for the whole page while a gesture runs. */
function lockPage(cursor) {
  const { style } = document.body
  const prev = { cursor: style.cursor, userSelect: style.userSelect }
  style.cursor = cursor
  style.userSelect = 'none'
  return () => {
    style.cursor = prev.cursor
    style.userSelect = prev.userSelect
  }
}

/**
 * Free-form pane canvas. The layout tree is solved to pixel rects and every
 * pane is absolutely positioned, so splitting, closing, zooming, docking and
 * window resizes glide — and a pane's terminal is never remounted by a move.
 */
export default function PaneCanvas({
  tree,
  agents,
  agentMap,
  focusedId,
  zoomedId,
  onFocus,
  onAssign,
  onClose,
  onSplit,
  onZoom,
  onMenu,
  onSizes,
  onMove,
  onEqualize,
  onInteracting,
}) {
  const rootRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [settling, setSettling] = useState(false)
  const [resizing, setResizing] = useState(null)
  const [drag, setDrag] = useState(null)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    let timer = 0
    let first = true
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: width, h: height })
      // Follow window resizes 1:1 — animation is for layout changes, not the viewport
      if (first) { first = false; return }
      setSettling(true)
      clearTimeout(timer)
      timer = setTimeout(() => setSettling(false), 160)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      clearTimeout(timer)
    }
  }, [])

  const layout = useMemo(
    () => computeLayout(tree, { x: 0, y: 0, w: size.w, h: size.h }, PANE_GAP),
    [tree, size],
  )
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const treeRef = useRef(tree)
  treeRef.current = tree

  // Stable DOM order: panes keep their element as the tree reshapes around them
  const orderRef = useRef([])
  const leaves = useMemo(() => {
    const byId = new Map(listLeaves(tree).map((l) => [l.id, l]))
    const order = orderRef.current.filter((id) => byId.has(id))
    byId.forEach((_, id) => { if (!order.includes(id)) order.push(id) })
    orderRef.current = order
    return order.map((id) => byId.get(id))
  }, [tree])

  const gesture = !!resizing || !!drag?.active
  const animate = !gesture && !settling

  // ── Divider drag: live resize with push-through ─────────────────────────

  const startResize = (d, e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const split = findSplit(treeRef.current, d.splitId)
    if (!split) return
    const horiz = d.orientation === 'horizontal'
    const axis = horiz ? 'w' : 'h'
    const mins = split.children.map((c) => minExtent(c, axis, MIN_PANE, PANE_GAP) / Math.max(1, d.available))
    const origin = horiz ? e.clientX : e.clientY
    const startSizes = split.sizes
    const unlock = lockPage(horiz ? 'col-resize' : 'row-resize')
    setResizing(d.id)
    onInteracting?.(true)

    let raf = 0
    let last = origin
    const move = (ev) => {
      last = horiz ? ev.clientX : ev.clientY
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const delta = (last - origin) / Math.max(1, d.available)
        onSizes(d.splitId, resizeSizes(startSizes, d.index, delta, mins))
      })
    }
    const end = () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      unlock()
      setResizing(null)
      onInteracting?.(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // ── Pane drag: grab a header, dock beside another pane or swap ──────────

  const startPaneDrag = (leafId, e) => {
    if (e.button !== 0 || zoomedId || e.target.closest('button, input, select')) return
    const box = rootRef.current?.getBoundingClientRect()
    if (!box) return
    const ox = e.clientX
    const oy = e.clientY
    let active = false
    let target = null
    let zone = null
    let unlock = null

    const move = (ev) => {
      const dx = ev.clientX - ox
      const dy = ev.clientY - oy
      if (!active) {
        if (Math.hypot(dx, dy) < 5) return
        active = true
        unlock = lockPage('grabbing')
        onFocus(leafId)
        onInteracting?.(true)
      }
      const px = ev.clientX - box.left
      const py = ev.clientY - box.top
      target = null
      zone = null
      for (const [id, r] of layoutRef.current.leaves) {
        if (id === leafId) continue
        if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue
        target = id
        const nx = (px - r.x) / r.w
        const ny = (py - r.y) / r.h
        const [edge, dist] = Object.entries({ left: nx, right: 1 - nx, top: ny, bottom: 1 - ny })
          .sort((a, b) => a[1] - b[1])[0]
        zone = dist < EDGE_ZONE ? edge : 'center'
        break
      }
      setDrag({ leafId, dx, dy, target, zone, active: true })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      unlock?.()
      if (active && target) onMove(leafId, target, zone)
      setDrag(null)
      if (active) onInteracting?.(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  useEffect(() => () => onInteracting?.(false), [onInteracting])

  const full = { x: 0, y: 0, w: size.w, h: size.h }
  const preview = drag?.target ? dropRect(layout.leaves.get(drag.target), drag.zone) : null

  return (
    <div
      ref={rootRef}
      className={cx('pane-canvas relative min-h-0 min-w-0 flex-1', animate && 'is-animated')}
    >
      {size.w > 0 && leaves.map((leaf) => {
        const rect = zoomedId === leaf.id ? full : layout.leaves.get(leaf.id)
        if (!rect) return null
        const dragged = drag?.active && drag.leafId === leaf.id
        const dimmed = !!zoomedId && zoomedId !== leaf.id
        return (
          <div
            key={leaf.id}
            className="pane-slot absolute left-0 top-0"
            style={{
              width: rect.w,
              height: rect.h,
              transform: dragged
                ? `translate3d(${rect.x + drag.dx}px, ${rect.y + drag.dy}px, 0) scale(0.97)`
                : `translate3d(${rect.x}px, ${rect.y}px, 0)${dimmed ? ' scale(0.985)' : ''}`,
              zIndex: dragged ? 40 : zoomedId === leaf.id ? 20 : 1,
              opacity: dimmed ? 0.18 : dragged ? 0.92 : 1,
              pointerEvents: dimmed || dragged ? 'none' : undefined,
              transition: dragged ? 'none' : undefined,
            }}
          >
            <Pane
              node={leaf}
              agents={agents}
              agent={leaf.agentId ? agentMap[leaf.agentId] : null}
              focused={focusedId === leaf.id}
              zoomed={zoomedId === leaf.id}
              lifted={dragged}
              onFocus={onFocus}
              onAssign={onAssign}
              onClose={onClose}
              onSplit={onSplit}
              onZoom={onZoom}
              onMenu={onMenu}
              onGrab={startPaneDrag}
            />
          </div>
        )
      })}

      {!zoomedId && layout.dividers.map((d) => {
        const horiz = d.orientation === 'horizontal'
        const r = d.rect
        return (
          <div
            key={d.id}
            role="separator"
            aria-orientation={horiz ? 'vertical' : 'horizontal'}
            title="Drag to resize · double-click to even out"
            className={cx('pane-divider absolute z-10', horiz ? 'cursor-col-resize' : 'cursor-row-resize')}
            data-orientation={d.orientation}
            data-active={resizing === d.id ? 'true' : 'false'}
            style={horiz
              ? { left: r.x - 3, top: r.y, width: r.w + 6, height: r.h }
              : { left: r.x, top: r.y - 3, width: r.w, height: r.h + 6 }}
            onPointerDown={(e) => startResize(d, e)}
            onDoubleClick={() => onEqualize(d.splitId)}
          >
            <span className="pane-divider__line" />
          </div>
        )
      })}

      {preview && (
        <div
          className="pane-drop pointer-events-none absolute left-0 top-0 z-30"
          data-zone={drag.zone}
          style={{
            width: preview.w,
            height: preview.h,
            transform: `translate3d(${preview.x}px, ${preview.y}px, 0)`,
          }}
        >
          <span className="pane-drop__label">{drag.zone === 'center' ? 'Swap' : `Dock ${drag.zone}`}</span>
        </div>
      )}
    </div>
  )
}

function Pane({
  node,
  agents,
  agent,
  focused,
  zoomed,
  lifted,
  onFocus,
  onAssign,
  onClose,
  onSplit,
  onZoom,
  onMenu,
  onGrab,
}) {
  const attention = agent && needsAttention(agent.status)
  const state = paneAgentState(agent?.status)

  return (
    <div
      className={cx(
        'pane-appear relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-ink-1',
        attention && 'shadow-[0_0_24px_rgba(251,191,36,0.08)]',
        lifted && 'shadow-[0_24px_60px_rgba(0,0,0,0.6)]',
      )}
      onMouseDown={() => onFocus(node.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(node.id, e)
      }}
    >
      {/* Ring drawn above the terminal canvas so it never gets painted over */}
      <span
        className={cx(
          'pointer-events-none absolute inset-0 z-[3] rounded-xl ring-1 ring-inset transition-colors duration-150',
          attention ? 'ring-amber-400/40' : focused || lifted ? 'ring-white/[0.16]' : 'ring-white/[0.05]',
        )}
        aria-hidden
      />
      {(focused || lifted) && <span className="pane-focus-line" aria-hidden />}

      {node.agentId ? (
        <>
          <div
            className="group/header flex h-8 shrink-0 cursor-grab items-center gap-2 border-b border-white/[0.05] pl-2.5 pr-1 active:cursor-grabbing"
            onPointerDown={(e) => onGrab(node.id, e)}
            onDoubleClick={(e) => { if (!e.target.closest('button')) onZoom(node.id) }}
            title="Drag to move · double-click to zoom"
          >
            <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', state.dot)} />
            <span className={cx('truncate font-mono text-[11px]', focused ? 'text-zinc-100' : 'text-zinc-400')}>
              {agent?.name || node.agentId.slice(0, 8)}
            </span>
            <span className={cx('shrink-0 font-mono text-[10px]', attention ? 'text-amber-300' : 'text-zinc-600')}>
              {state.label}
            </span>
            <span className="hidden truncate font-mono text-[10px] text-zinc-700 sm:inline">
              {agent?.harness || 'pty'}
            </span>
            <div className="flex-1" />
            <div className={cx('flex items-center transition-opacity', focused ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100')}>
              <IconButton label={zoomed ? 'Restore' : 'Zoom'} size="sm" onClick={() => onZoom(node.id)}>
                {zoomed ? <IconMinimize className="h-3 w-3" /> : <IconMaximize className="h-3 w-3" />}
              </IconButton>
              <IconButton label="Split right" size="sm" onClick={() => onSplit(node.id, 'horizontal')}>
                <IconSplitColumns className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Split down" size="sm" onClick={() => onSplit(node.id, 'vertical')}>
                <IconSplitRows className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Close pane" size="sm" onClick={() => onClose(node.id)}>
                <IconClose className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          </div>
          <div className="min-h-0 flex-1 pl-1.5 pt-1">
            <AgentTerminal
              key={`${node.id}:${node.agentId}`}
              agentId={node.agentId}
              agentName={agent?.name || node.agentId.slice(0, 8)}
              fill
              compact
              chrome={false}
              focused={focused}
              onFocus={() => onFocus(node.id)}
            />
          </div>
        </>
      ) : (
        <EmptyPane
          node={node}
          agents={agents}
          focused={focused}
          onGrab={onGrab}
          onClose={onClose}
          onAssign={(agentId) => onAssign(node.id, agentId)}
        />
      )}
    </div>
  )
}

function EmptyPane({ node, agents, focused, onAssign, onGrab, onClose }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="group/header flex h-8 shrink-0 cursor-grab items-center justify-between pl-2.5 pr-1 active:cursor-grabbing"
        onPointerDown={(e) => onGrab(node.id, e)}
      >
        <span className="font-mono text-[10px] text-zinc-700">empty</span>
        <IconButton
          label="Close pane"
          size="sm"
          className="opacity-0 group-hover/header:opacity-100"
          onClick={() => onClose(node.id)}
        >
          <IconClose className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-8">
        <div className="w-full max-w-[17rem]">
          <div className="mb-4 flex flex-col items-center text-center">
            <IconTerminal className={cx('mb-3 h-5 w-5', focused ? 'text-zinc-300' : 'text-zinc-600')} />
            <p className="font-mono text-[12px] text-zinc-300">Empty pane</p>
            <p className="mt-1 text-[12px] text-zinc-600">Attach an agent to start a session.</p>
          </div>
          {agents.length > 0 ? (
            <div className="space-y-0.5 rounded-xl bg-white/[0.02] p-1 ring-1 ring-inset ring-white/[0.05]">
              {agents.slice(0, 6).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAssign(a.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <Avatar src={agentAvatarUrl(a)} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">{a.name}</span>
                  <span className={cx('h-1.5 w-1.5 rounded-full', statusMeta(a.status).dot)} />
                </button>
              ))}
              {agents.length > 6 && (
                <p className="px-2 py-1.5 font-mono text-[10px] text-zinc-600">
                  +{agents.length - 6} more · <Kbd>⌘</Kbd><Kbd>K</Kbd>
                </p>
              )}
            </div>
          ) : (
            <p className="text-center font-mono text-[10px] text-zinc-600">No agents registered yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
