import { useEffect, useRef } from 'react'

/*
 * Depth instrumentation for the node space — no frame, no container.
 * Abstract HUD linework placed *in* the volume at different depths:
 *   · an orbit ring under the constellation (its front is nearer than its
 *     back, so it reads in perspective)
 *   · a dashed depth stem from every node down to that orbit, tagged z
 *   · a large, faint reticle far behind the graph
 *   · a few crosshair / arc fragments floating at their own depths
 *   · brutalist structure (lines only): datum lines, converging depth rails,
 *     part far-plane edges
 * Monochrome only.
 * Everything is projected through one camera + depth model and parallaxes with
 * pan, zoom and the pointer tilt, so the HUD *is* the depth cue.
 */

const FONT = '9px "IBM Plex Mono", ui-monospace, monospace'

function seeded(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KINDS = ['cross', 'ring']

/*
 * Brutalist structure — lines only: datum lines across the whole space with
 * heavier runs set into them, and converging depth rails.
 * Offsets are in graph radii from the centroid; d is depth.
 */
const DATUMS = [
  { axis: 'h', at: -0.82, d: -1.2, bar: [0.12, 0.2] },
  { axis: 'h', at: 0.3, d: -0.7, bar: [0.66, 0.08] },
  { axis: 'h', at: 0.92, d: 0.35, bar: [0.3, 0.14] },
  { axis: 'v', at: -1.2, d: -0.9, bar: [0.58, 0.16] },
  { axis: 'v', at: 0.18, d: -1.45, bar: [0.18, 0.1] },
  { axis: 'v', at: 1.28, d: 0.25, bar: [0.72, 0.12] },
]

function makeFragments() {
  const rnd = seeded(20261012)
  return Array.from({ length: 10 }, (_, i) => {
    const a = rnd() * Math.PI * 2
    const r = 0.55 + rnd() * 1.05 // in graph radii
    return {
      kind: KINDS[i % KINDS.length],
      ox: Math.cos(a) * r * 1.35,
      oy: Math.sin(a) * r * 0.85,
      d: -1.4 + rnd() * 1.9, // far … slightly near
      rot: rnd() * Math.PI * 2,
      spin: (rnd() - 0.5) * 0.3,
      phase: rnd() * Math.PI * 2,
      n: Math.round(rnd() * 999),
    }
  })
}

const pad3 = (n) => String(Math.abs(Math.round(n))).padStart(3, '0')

export default function DepthHud({ cameraRef, tiltRef, positionsRef, fieldRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const field = fieldRef.current
    if (!canvas || !field) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const fragments = makeFragments()
    const graph = { x: 0, y: 0, r: 0, bottom: 0, top: 0, ready: false }
    let w = 1
    let h = 1
    let dpr = 1
    let raf = 0
    const born = performance.now()

    const resize = () => {
      const rect = field.getBoundingClientRect()
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(field)

    const frame = (now) => {
      const cam = cameraRef.current
      const tilt = tiltRef.current
      const positions = positionsRef.current
      const t = reduced ? 0 : now / 1000
      const intro = reduced ? 1 : Math.min(1, (now - born) / 1600)
      const ease = 1 - (1 - intro) ** 3

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Graph centroid + extent in world px, eased so the instruments drift gently
      if (positions?.size) {
        let sx = 0
        let sy = 0
        let minY = Infinity
        let maxY = -Infinity
        let maxR = 0
        for (const p of positions.values()) {
          sx += (p.x / 100) * w
          sy += (p.y / 100) * h
        }
        const gx = sx / positions.size
        const gy = sy / positions.size
        for (const p of positions.values()) {
          const x = (p.x / 100) * w
          const y = (p.y / 100) * h
          maxR = Math.max(maxR, Math.hypot(x - gx, (y - gy) * 1.4))
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
        const target = { x: gx, y: gy, r: Math.max(160, maxR + 90), bottom: maxY + 70, top: minY - 70 }
        if (!graph.ready) Object.assign(graph, target, { ready: true })
        else for (const k of ['x', 'y', 'r', 'bottom', 'top']) graph[k] += (target[k] - graph[k]) * 0.05
      }
      if (!graph.ready) {
        raf = requestAnimationFrame(frame)
        return
      }

      const cx = w / 2
      const cy = h / 2
      // World point at depth d → screen. d < 0 recedes, d > 0 approaches.
      const project = (wx, wy, d) => {
        const sx = cam.x + wx * cam.zoom
        const sy = cam.y + wy * cam.zoom
        const s = 1 + d * 0.2
        return {
          x: cx + (sx - cx) * s + tilt.x * d * 30,
          y: cy + (sy - cy) * s + tilt.y * d * 22,
          s: s * cam.zoom,
        }
      }
      const depthAlpha = (d) => Math.max(0.15, Math.min(1, 0.55 + d * 0.35))
      const stroke = (a, rgb = '255, 255, 255') => { ctx.strokeStyle = `rgba(${rgb}, ${a * ease})` }
      const fill = (a, rgb = '255, 255, 255') => { ctx.fillStyle = `rgba(${rgb}, ${a * ease})` }
      ctx.font = FONT
      ctx.lineCap = 'round'

      // ── Far reticle behind everything ───────────────────────────────────
      {
        const d = -1.6
        const c = project(graph.x, graph.y, d)
        const R = graph.r * 1.25 * c.s
        ctx.lineWidth = 1
        stroke(0.035)
        ctx.beginPath()
        ctx.arc(c.x, c.y, R, 0, Math.PI * 2)
        ctx.stroke()
        for (let i = 0; i < 72; i += 1) {
          const a = (i / 72) * Math.PI * 2 + t * 0.012
          const len = i % 6 === 0 ? 7 : 3
          stroke(i % 6 === 0 ? 0.07 : 0.035)
          ctx.beginPath()
          ctx.moveTo(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R)
          ctx.lineTo(c.x + Math.cos(a) * (R + len), c.y + Math.sin(a) * (R + len))
          ctx.stroke()
        }
        ctx.lineWidth = 1
        stroke(0.09)
        const spin = -t * 0.05
        for (const [a0, a1] of [[-2.1, -1.05], [1.05, 2.1]]) {
          ctx.beginPath()
          ctx.arc(c.x, c.y, R * 1.06, a0 + spin, a0 + (a1 - a0) * ease + spin)
          ctx.stroke()
        }
      }

      // ── Brutalist structure ───────────────────────────────────────────────
      {
        const R0 = graph.r
        // Depth rails: far corners → near corners; parallax makes them converge
        const corners = [[-1.7, -1.05], [1.7, -1.05], [1.7, 1.15], [-1.7, 1.15]]
        ctx.lineWidth = 1
        for (const [ox, oy] of corners) {
          const far = project(graph.x + ox * R0, graph.y + oy * R0, -1.7)
          const near = project(graph.x + ox * R0, graph.y + oy * R0, 1.2)
          const end = { x: far.x + (near.x - far.x) * ease, y: far.y + (near.y - far.y) * ease }
          stroke(0.07)
          ctx.beginPath()
          ctx.moveTo(far.x, far.y)
          ctx.lineTo(end.x, end.y)
          ctx.stroke()
        }
        // Far plane edges — two sides only, never a closed box
        const f0 = project(graph.x - 1.7 * R0, graph.y - 1.05 * R0, -1.7)
        const f1 = project(graph.x + 1.7 * R0, graph.y - 1.05 * R0, -1.7)
        const f2 = project(graph.x + 1.7 * R0, graph.y + 1.15 * R0, -1.7)
        stroke(0.08)
        ctx.beginPath()
        ctx.moveTo(f0.x, f0.y)
        ctx.lineTo(f0.x + (f1.x - f0.x) * 0.38 * ease, f0.y + (f1.y - f0.y) * 0.38 * ease)
        ctx.moveTo(f2.x, f2.y)
        ctx.lineTo(f2.x, f2.y + (f1.y - f2.y) * 0.46 * ease)
        ctx.stroke()

        // Datum lines spanning the whole view, each with a heavier run set in
        for (const dl of DATUMS) {
          const a = 0.085 * depthAlpha(dl.d)
          if (dl.axis === 'h') {
            const p = project(graph.x, graph.y + dl.at * R0, dl.d)
            stroke(a)
            ctx.beginPath()
            ctx.moveTo(0, Math.round(p.y) + 0.5)
            ctx.lineTo(w * ease, Math.round(p.y) + 0.5)
            ctx.stroke()
            // A heavier stroke along the datum, then a run of tick lines
            const bx = w * dl.bar[0]
            const bw = w * dl.bar[1] * ease
            const y = Math.round(p.y) + 0.5
            ctx.lineWidth = 2
            stroke(a * 2.2)
            ctx.beginPath()
            ctx.moveTo(bx, y)
            ctx.lineTo(bx + bw, y)
            ctx.stroke()
            ctx.lineWidth = 1
            stroke(a * 2)
            ctx.beginPath()
            for (let i = 0; i <= 4; i += 1) {
              const tx = Math.round(bx + bw + 10 + i * 6) + 0.5
              ctx.moveTo(tx, y - 3)
              ctx.lineTo(tx, y + 4)
            }
            ctx.stroke()
          } else {
            const p = project(graph.x + dl.at * R0, graph.y, dl.d)
            stroke(a)
            ctx.beginPath()
            ctx.moveTo(Math.round(p.x) + 0.5, 0)
            ctx.lineTo(Math.round(p.x) + 0.5, h * ease)
            ctx.stroke()
            const by = h * dl.bar[0]
            const bh = h * dl.bar[1] * ease
            const x = Math.round(p.x) + 0.5
            ctx.lineWidth = 2
            stroke(a * 2.2)
            ctx.beginPath()
            ctx.moveTo(x, by)
            ctx.lineTo(x, by + bh)
            ctx.stroke()
            ctx.lineWidth = 1
          }
        }
      }

      // ── Orbit rings (3D: front half nearer than back half) ───────────────
      const orbit = (wy, radius, dMid, dSpread, alpha) => {
        const N = 160
        const pts = []
        for (let i = 0; i <= N; i += 1) {
          const a = (i / N) * Math.PI * 2
          const d = dMid + Math.sin(a) * dSpread
          pts.push({ ...project(graph.x + Math.cos(a) * radius, wy + Math.sin(a) * radius * 0.2, d), d, a })
        }
        ctx.lineWidth = 1
        const drawn = Math.round(N * ease)
        for (let i = 0; i < drawn; i += 1) {
          const p0 = pts[i]
          const p1 = pts[i + 1]
          stroke(alpha * depthAlpha(p0.d))
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
        }
        // Ticks around the ring
        for (let i = 0; i < 24; i += 1) {
          const a = (i / 24) * Math.PI * 2 + t * 0.03
          const d = dMid + Math.sin(a) * dSpread
          const major = true
          const p0 = project(graph.x + Math.cos(a) * radius, wy + Math.sin(a) * radius * 0.2, d)
          const p1 = project(graph.x + Math.cos(a) * radius * (major ? 1.05 : 1.025), wy + Math.sin(a) * radius * 0.2 * (major ? 1.05 : 1.025), d)
          stroke(alpha * 1.2 * depthAlpha(d))
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
        }
      }
      const R = graph.r
      orbit(graph.bottom, R * 1.15, -0.25, 0.55, 0.11)

      // ── Depth stems: node → lower orbit plane, tagged with z ─────────────
      if (positions) {
        ctx.setLineDash([2, 4])
        for (const p of positions.values()) {
          const wx = (p.x / 100) * w
          const wy = (p.y / 100) * h
          const z = p.z ?? 0
          const top = { x: cam.x + wx * cam.zoom, y: cam.y + wy * cam.zoom }
          const footD = -0.25 + z * 0.55
          const foot = project(wx, graph.bottom + z * R * 0.2 * 0.6, footD)
          if (foot.y <= top.y + 80 * cam.zoom) continue
          const a = 0.1 * depthAlpha(z)
          ctx.lineWidth = 1
          stroke(a)
          ctx.beginPath()
          ctx.moveTo(top.x, top.y + 60 * cam.zoom)
          ctx.lineTo(foot.x, foot.y - (foot.y - top.y) * (1 - ease))
          ctx.stroke()
          ctx.setLineDash([])
          stroke(a * 1.8)
          ctx.beginPath()
          ctx.ellipse(foot.x, foot.y, 7 * foot.s, 1.8 * foot.s, 0, 0, Math.PI * 2)
          ctx.stroke()
          fill(a * 1.4)
          ctx.fillText(`z ${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(2)}`, foot.x + 10 * foot.s, foot.y + 3)
          ctx.setLineDash([2, 4])
        }
        ctx.setLineDash([])
      }

      // ── Floating fragments at their own depths ────────────────────────────
      for (const f of fragments) {
        const p = project(graph.x + f.ox * R, graph.y + f.oy * R, f.d)
        if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) continue
        const a = 0.14 * depthAlpha(f.d) * (0.75 + 0.25 * Math.sin(t * 0.8 + f.phase))
        const sz = 7 * p.s
        ctx.lineWidth = 1
        stroke(a)
        fill(a)
        ctx.save()
        ctx.translate(p.x, p.y)
        if (f.kind === 'cross') {
          ctx.beginPath()
          ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0)
          ctx.moveTo(0, -sz); ctx.lineTo(0, sz)
          ctx.stroke()
        } else {
          const spin = f.rot + t * f.spin
          ctx.beginPath()
          ctx.arc(0, 0, sz * 1.4, spin, spin + Math.PI * 1.2)
          ctx.stroke()
        }
        ctx.restore()
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [cameraRef, tiltRef, positionsRef, fieldRef])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0" aria-hidden />
}
