import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AgentNode from '../../components/dashboard/AgentNode'
import AgentDetailSheet from '../../components/dashboard/AgentDetailSheet'
import ConnectionLayer from '../../components/dashboard/ConnectionLayer'
import SpaceBackdrop from '../../components/dashboard/SpaceBackdrop'
import DepthHud from '../../components/dashboard/DepthHud'
import {
  buildConnections,
  isAgentLive,
  mergeFieldAgents,
  mergeFieldTasks,
} from '../../lib/agentField'
import { positionsFromNodes, syncForceSim } from '../../lib/forceGraph'
import { configureLedDriver } from '../../lib/ledDriver'
import { depthFor, floatOffset } from '../../lib/depth'
import ChamberBar from '../../components/ChamberBar'
import { Button, IconButton, cx } from '../../components/ui'
import { IconPalette } from '../../components/icons'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const ZOOM_STEP = 1.18
const INTRO_ZOOM = 0.84
const INTRO_MS = 1400

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Full-bleed "command chamber" — force-directed node-link field.
 */
export default function AgentNodeField({ view = 'nodes', onViewChange }) {
  const [agents, setAgents] = useState([])
  const [workflowGraphs, setWorkflowGraphs] = useState([])
  const [tasks, setTasks] = useState([])
  const [health, setHealth] = useState('…')
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState(null)
  const [ledColors, setLedColors] = useState(false)
  const [positions, setPositions] = useState(() => new Map())

  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const fieldRef = useRef(null)
  const worldRef = useRef(null)
  const tiltRef = useRef({ x: 0, y: 0 })
  const sizeRef = useRef({ w: 1, h: 1 })
  const depthRef = useRef(new Map())
  const introRef = useRef(0)
  const positionsRef = useRef(null)
  const zoomLabelRef = useRef(null)
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const panRef = useRef(null)
  const spaceDownRef = useRef(false)
  const forceRef = useRef(null)
  const graphKeyRef = useRef('')

  const setFieldCursor = (grabbing) => {
    const el = fieldRef.current
    if (!el) return
    el.classList.toggle('cursor-grabbing', grabbing)
    el.classList.toggle('cursor-grab', !grabbing)
  }

  const applyCamera = () => {
    const { x, y, zoom } = cameraRef.current
    const world = worldRef.current
    if (world) {
      world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`
    }
  }

  const setCamera = (next) => {
    cameraRef.current = {
      x: next.x,
      y: next.y,
      zoom: clamp(next.zoom, MIN_ZOOM, MAX_ZOOM),
    }
    applyCamera()
  }

  const resetCamera = () => {
    setCamera({ x: 0, y: 0, zoom: 1 })
  }

  const zoomAt = (clientX, clientY, factor) => {
    const field = fieldRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const cam = cameraRef.current
    const nextZoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM)
    if (nextZoom === cam.zoom) return
    const wx = (mx - cam.x) / cam.zoom
    const wy = (my - cam.y) / cam.zoom
    setCamera({
      zoom: nextZoom,
      x: mx - wx * nextZoom,
      y: my - wy * nextZoom,
    })
  }

  const zoomBy = (factor) => {
    const field = fieldRef.current
    if (!field) return
    const rect = field.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  const onSelectAgent = useCallback((a) => {
    setSelectedId((cur) => (cur === a.id ? null : a.id))
  }, [])

  const onToggleLedColors = useCallback(() => {
    setLedColors((v) => !v)
  }, [])

  const load = async () => {
    try {
      const [agentsRes, wfRes, tasksRes, healthRes] = await Promise.all([
        fetch('/api/v1/agents').then((r) => r.json()),
        fetch('/api/v1/workflows').then((r) => r.json()),
        fetch('/api/v1/tasks?limit=40').then((r) => r.json()).catch(() => ({ tasks: [] })),
        fetch('/health').then((r) => r.json()).catch(() => ({ status: 'error' })),
      ])
      const list = agentsRes.agents || []
      setAgents((prev) => {
        if (
          prev.length === list.length
          && prev.every((a, i) => a.id === list[i]?.id && a.status === list[i]?.status && a.name === list[i]?.name)
        ) {
          return prev
        }
        return list
      })
      const wfs = wfRes.workflows || []
      setTasks(tasksRes.tasks || [])
      setHealth(healthRes.status === 'ok' ? 'Stable' : 'Degraded')

      const graphs = await Promise.all(
        wfs.slice(0, 6).map(async (w) => {
          try {
            const detail = await fetch(`/api/v1/workflows/${w.id}`).then((r) => r.json())
            return {
              id: w.id,
              nodes: detail.nodes || [],
              edges: detail.edges || [],
            }
          } catch {
            return { id: w.id, nodes: [], edges: [] }
          }
        }),
      )
      setWorkflowGraphs(graphs)
      setError(null)
    } catch (e) {
      setError(e.message || 'Failed to load field')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    configureLedDriver({
      pointer: pointerRef,
      field: fieldRef,
      camera: cameraRef,
    })
  }, [])

  // Track field size (for px → % float offsets) without layout reads per frame
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return undefined
    const ro = new ResizeObserver(([entry]) => {
      sizeRef.current = {
        w: Math.max(1, entry.contentRect.width),
        h: Math.max(1, entry.contentRect.height),
      }
    })
    ro.observe(field)
    return () => ro.disconnect()
  }, [])

  // Arrival — the camera drifts in from slightly further out
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const field = fieldRef.current
    if (!field) return undefined
    const rect = field.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    cameraRef.current = { x: 0, y: 0, zoom: 1 }
    zoomAt(cx, cy, INTRO_ZOOM)
    const from = { ...cameraRef.current }
    const start = performance.now()
    const token = ++introRef.current
    const step = (now) => {
      if (token !== introRef.current) return
      const p = Math.min(1, (now - start) / INTRO_MS)
      const e = 1 - (1 - p) ** 3
      setCamera({
        x: from.x * (1 - e),
        y: from.y * (1 - e),
        zoom: from.zoom + (1 - from.zoom) * e,
      })
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    return () => { introRef.current += 1 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, active: true }
    }
    const onClear = () => {
      pointerRef.current = { ...pointerRef.current, active: false }
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onClear)
    window.addEventListener('blur', onClear)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onClear)
      window.removeEventListener('blur', onClear)
    }
  }, [])

  useEffect(() => {
    const isTypingTarget = (t) => {
      if (!t || typeof t.closest !== 'function') return false
      return !!t.closest('input, textarea, select, [contenteditable="true"]')
    }
    const onKeyDown = (e) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return
      e.preventDefault()
      spaceDownRef.current = true
      setFieldCursor(true)
    }
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return
      spaceDownRef.current = false
      if (!panRef.current) setFieldCursor(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      introRef.current += 1
      const magnitude = Math.min(Math.abs(e.deltaY), 80)
      const sign = e.deltaY > 0 ? -1 : 1
      const factor = e.deltaMode === 0
        ? 1 + sign * (0.0018 * magnitude)
        : sign > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      zoomAt(e.clientX, e.clientY, factor)
    }
    field.addEventListener('wheel', onWheel, { passive: false })
    return () => field.removeEventListener('wheel', onWheel)
  }, [])

  const fieldAgents = useMemo(() => mergeFieldAgents(agents), [agents])
  const fieldTasks = useMemo(
    () => mergeFieldTasks(tasks, fieldAgents),
    [tasks, fieldAgents],
  )
  const connections = useMemo(
    () => buildConnections(fieldAgents, workflowGraphs, fieldTasks),
    [fieldAgents, workflowGraphs, fieldTasks],
  )
  const selected = fieldAgents.find((a) => a.id === selectedId) || null
  const liveCount = fieldAgents.filter((a) => isAgentLive(a.status)).length

  // Force-directed layout — continuous tick for organic Obsidian-like drift
  useEffect(() => {
    const key = `${fieldAgents.map((a) => a.id).join(',')}|${connections.map((e) => e.id).join(',')}`
    if (!forceRef.current || graphKeyRef.current !== key) {
      forceRef.current = syncForceSim(forceRef.current, fieldAgents, connections)
      graphKeyRef.current = key
      if (forceRef.current?.nodes?.length) {
        setPositions(positionsFromNodes(forceRef.current.nodes))
      }
    }

    let raf = 0
    let alive = true
    const motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const frame = (now) => {
      if (!alive || !forceRef.current) return
      const base = forceRef.current.tick()

      // Ease the pointer into a -1…1 tilt; settle back to level when it leaves
      const pointer = pointerRef.current
      const { w, h } = sizeRef.current
      const tilt = tiltRef.current
      const tx = motion && pointer.active ? clamp((pointer.x / window.innerWidth) * 2 - 1, -1, 1) : 0
      const ty = motion && pointer.active ? clamp((pointer.y / window.innerHeight) * 2 - 1, -1, 1) : 0
      tilt.x += (tx - tilt.x) * 0.05
      tilt.y += (ty - tilt.y) * 0.05

      // Float each node at its own depth — lines read the same positions, so they stay attached
      const t = now / 1000
      const next = new Map()
      for (const [id, p] of base) {
        let d = depthRef.current.get(id)
        if (!d) {
          d = depthFor(id)
          depthRef.current.set(id, d)
        }
        const off = floatOffset(d, t, tilt, { motion })
        next.set(id, { ...p, x: p.x + (off.x / w) * 100, y: p.y + (off.y / h) * 100, z: d.z })
      }
      setPositions(next)
      positionsRef.current = next
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [fieldAgents, connections])

  useEffect(() => () => {
    forceRef.current?.stop()
    forceRef.current = null
  }, [])

  const endPan = (e) => {
    const drag = panRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    panRef.current = null
    setFieldCursor(!!spaceDownRef.current)
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
  }

  const onFieldPointerDown = (e) => {
    const middle = e.button === 1
    const left = e.button === 0
    if (!middle && !left) return

    const onWorld = !!worldRef.current?.contains(e.target)
    const onFieldBg = e.target === fieldRef.current
    if (!onWorld && !onFieldBg && !middle) return

    const onNode = !!e.target.closest?.('[data-agent-node]')
    if (onNode && !middle && !spaceDownRef.current) return

    e.preventDefault()
    introRef.current += 1
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: cameraRef.current.x,
      originY: cameraRef.current.y,
      moved: false,
    }
    setFieldCursor(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onFieldPointerMove = (e) => {
    const drag = panRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 3) drag.moved = true
    setCamera({
      x: drag.originX + dx,
      y: drag.originY + dy,
      zoom: cameraRef.current.zoom,
    })
  }

  return (
    <div
      ref={fieldRef}
      className="relative h-full min-h-0 touch-none overflow-hidden bg-[#020203] cursor-grab"
      onPointerDown={onFieldPointerDown}
      onPointerMove={onFieldPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <SpaceBackdrop cameraRef={cameraRef} tiltRef={tiltRef} ledColors={ledColors} />
      <DepthHud cameraRef={cameraRef} tiltRef={tiltRef} positionsRef={positionsRef} fieldRef={fieldRef} />

      <div
        ref={worldRef}
        className="space-enter absolute inset-0 z-0 origin-top-left will-change-transform"
        style={{ transform: 'translate(0px, 0px) scale(1)' }}
      >
        <ConnectionLayer edges={connections} positions={positions} />
        <div className="absolute inset-0">
          {fieldAgents.map((agent, index) => {
            const pos = positions.get(agent.id) || { x: 50, y: 48 }
            return (
              <AgentNode
                key={agent.id}
                agent={agent}
                index={index}
                x={pos.x}
                y={pos.y}
                depth={pos.z ?? 0}
                selected={selectedId === agent.id}
                onSelect={onSelectAgent}
                ledColors={ledColors}
                onToggleLedColors={onToggleLedColors}
              />
            )
          })}
        </div>
      </div>

      <div
        className="space-vignette pointer-events-none absolute inset-0 z-[1]"
        aria-hidden
      />

      <ChamberBar
        floating
        view={view}
        onViewChange={onViewChange}
        meta={(
          <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className={cx('h-1.5 w-1.5 rounded-full', liveCount ? 'bg-zinc-50 shadow-lit' : 'bg-zinc-600')} />
              {loading ? '…' : `${liveCount} live`}
            </span>
            <span className="hidden md:inline">{loading ? '…' : `${fieldAgents.length} nodes`}</span>
            <span className="hidden md:inline">{loading ? '…' : `${connections.length} links`}</span>
            <span className={cx('hidden lg:inline', health === 'Degraded' && 'text-amber-300')}>{health === '…' ? '…' : `field ${health.toLowerCase()}`}</span>
          </div>
        )}
        actions={(
          <IconButton
            label={ledColors ? 'LED: color' : 'LED: white'}
            active={ledColors}
            onClick={onToggleLedColors}
            className={ledColors ? '!text-fuchsia-300' : ''}
          >
            <IconPalette className="h-4 w-4" />
          </IconButton>
        )}
      />

      {error && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl bg-red-500/[0.08] px-3.5 py-2 font-mono text-[11px] text-red-300 ring-1 ring-inset ring-red-500/25 backdrop-blur-md">
          {error}
        </div>
      )}

      {!loading && fieldAgents.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-mono text-sm text-zinc-400">No agents in the field yet</p>
          <Button variant="primary" to="/agents">Register an agent</Button>
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-10 flex items-center gap-0.5 rounded-xl bg-ink-1/75 p-1 shadow-float backdrop-blur-xl sm:bottom-6">
        <button
          type="button"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-50"
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          ref={zoomLabelRef}
          onClick={resetCamera}
          className="min-w-[3.25rem] rounded-lg px-1.5 py-1.5 font-mono text-[11px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          title="Reset view"
        >
          100%
        </button>
        <button
          type="button"
          onClick={() => zoomBy(ZOOM_STEP)}
          className="flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-50"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      {selected && (
        <AgentDetailSheet
          agent={selected}
          tasks={fieldTasks}
          connections={connections}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
