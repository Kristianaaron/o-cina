/**
 * High-scale agent field renderer (Canvas 2D).
 * LED behavior mirrors ledDriver + .node-radiance CSS (crawl, breathe, aim, amp).
 */

import { agentAvatarUrl, isAgentLive } from './agentField'

/** Matches node-led-spin / ledDriver SPIN_DUR */
const SPIN_MS = 14300
/** Matches node-radiance-breathe */
const BREATHE_MS = 2800

const ATLAS = 256
/** Disc diameter in world CSS px */
export const DISC_PX = 42
/** DOM node was 76px; scale LED shift/blur with disc size */
const DISC_REF = 76
const LABEL_MAX = 9

let atlasWhite = null
let atlasColor = null
const avatarCache = new Map()

function makeCanvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * Bake centered glow layers (no offset) — shift is applied at draw time
 * like CSS --led-shift on bloom / plate / luma.
 */
function bakeLayer(paint) {
  const c = makeCanvas(ATLAS, ATLAS)
  const ctx = c.getContext('2d')
  paint(ctx, ATLAS / 2, ATLAS / 2, ATLAS)
  return c
}

function bakeAtlas({ chromatic = false } = {}) {
  // Bloom — soft spill (66% of 220% spin ≈ 1.45× disc when drawn)
  const bloom = bakeLayer((ctx, cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, ATLAS * 0.42)
    if (chromatic) {
      g.addColorStop(0, 'rgba(0,229,255,0.7)')
      g.addColorStop(0.3, 'rgba(149,0,255,0.22)')
      g.addColorStop(0.48, 'rgba(255,208,0,0.08)')
      g.addColorStop(0.68, 'rgba(0,0,0,0)')
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.7)')
      g.addColorStop(0.32, 'rgba(255,255,255,0.22)')
      g.addColorStop(0.52, 'rgba(255,255,255,0.05)')
      g.addColorStop(0.68, 'rgba(0,0,0,0)')
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, ATLAS, ATLAS)
  })

  // Luma wash — white→black falloff (luminosity feel via soft grey halo)
  const luma = bakeLayer((ctx, cx, cy) => {
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, ATLAS * 0.48)
    g.addColorStop(0, 'rgba(242,242,242,0.9)')
    g.addColorStop(0.14, 'rgba(189,189,189,0.55)')
    g.addColorStop(0.34, 'rgba(110,110,110,0.28)')
    g.addColorStop(0.56, 'rgba(42,42,42,0.12)')
    g.addColorStop(0.74, 'rgba(10,10,10,0.04)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, ATLAS, ATLAS)
  })

  // Plate — hard disc with soft edge (eclipse rim when offset under black disc)
  const plate = bakeLayer((ctx, cx, cy) => {
    const r = ATLAS * 0.22
    const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
    if (chromatic) {
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.25, 'rgba(0,229,255,0.9)')
      g.addColorStop(0.5, 'rgba(149,0,255,0.55)')
      g.addColorStop(0.75, 'rgba(255,23,68,0.25)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
    } else {
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.35, 'rgba(255,255,255,0.85)')
      g.addColorStop(0.65, 'rgba(255,255,255,0.35)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
    }
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  })

  return { bloom, luma, plate }
}

export function ensureGlowAtlas() {
  if (typeof document === 'undefined') return
  if (!atlasWhite) atlasWhite = bakeAtlas({ chromatic: false })
  if (!atlasColor) atlasColor = bakeAtlas({ chromatic: true })
}

function getAvatarImage(agent) {
  const url = agentAvatarUrl(agent)
  let entry = avatarCache.get(url)
  if (entry) return entry
  entry = { img: null, ready: false }
  if (typeof Image !== 'undefined') {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      entry.ready = true
    }
    img.src = url
    entry.img = img
  }
  avatarCache.set(url, entry)
  return entry
}

/** Quadratic bezier point */
function quadAt(x1, y1, cx, cy, x2, y2, t) {
  const u = 1 - t
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  }
}

function curveControl(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  return { cx: mx - dy * 0.18, cy: my + dx * 0.12 }
}

/**
 * Mutable LED state — same fields as ledDriver (angle, amp, idle handoff).
 */
export function createNodeRuntime(agents) {
  const map = new Map()
  agents.forEach((a, i) => {
    const angle = (i * 47) % 360
    map.set(a.id, {
      angle,
      amp: 0.35,
      idle: true,
      idleOriginAngle: angle,
      idleOriginTime: performance.now?.() ?? 0,
      inside: false,
    })
  })
  return map
}

function ensureRuntime(runtime, agentId, index) {
  let rt = runtime.get(agentId)
  if (rt) return rt
  const angle = (index * 47) % 360
  rt = {
    angle,
    amp: 0.35,
    idle: true,
    idleOriginAngle: angle,
    idleOriginTime: performance.now?.() ?? 0,
    inside: false,
  }
  runtime.set(agentId, rt)
  return rt
}

function setLedIdle(rt, idle, now) {
  if (rt.idle === idle) return
  rt.idle = idle
  if (idle) {
    rt.idleOriginAngle = rt.angle
    rt.idleOriginTime = now
  }
}

/**
 * Draw radiance stack for one node — proportions + amp shift match .node-radiance.
 * Layers are authored for light-from-+X; caller has already rotated.
 */
function drawRadiance(ctx, atlas, discPx, amp, inside, breathe) {
  const scale = discPx / DISC_REF
  // CSS: --led-shift: calc(4px + 5px * var(--led-amp))
  const shift = (4 + 5 * amp) * scale
  const spin = discPx * 2.2

  ctx.globalCompositeOperation = 'lighter'

  // Bloom — 66% of spin, opacity breathes 0.72↔1 after fade-in
  {
    const size = spin * 0.66
    const bloomAlpha = (0.4 + 0.3 * amp) * breathe
    ctx.globalAlpha = bloomAlpha
    ctx.drawImage(atlas.bloom, shift - size / 2, -size / 2, size, size)
  }

  // Luma — 77% of spin; CSS luminosity ≈ soft additive wash here
  {
    const size = spin * 0.77
    const lumaShift = 7 * amp * scale
    const lumaAlpha = (0.45 + 0.35 * amp) * breathe
    ctx.globalAlpha = lumaAlpha * 0.55
    ctx.drawImage(atlas.luma, lumaShift - size / 2, -size / 2, size, size)
  }

  // Plate — 45.5% of spin ≈ disc-sized; opacity 0.5+0.45*amp (1 when inside)
  {
    const size = spin * 0.455
    const plateAlpha = inside ? 1 : 0.5 + 0.45 * amp
    ctx.globalAlpha = plateAlpha
    ctx.drawImage(atlas.plate, shift - size / 2, -size / 2, size, size)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

/**
 * Draw one frame into an already-sized canvas (device pixels).
 * Positions are field %; camera is {x,y,zoom} in CSS pixels of the field.
 */
export function drawAgentField(ctx, {
  width,
  height,
  dpr,
  agents,
  positions,
  edges,
  runtime,
  camera,
  pointer,
  selectedId,
  ledColors,
  now = performance.now(),
}) {
  ensureGlowAtlas()
  const w = width
  const h = height
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const { x: tx, y: ty, zoom } = camera
  ctx.save()
  ctx.translate(tx, ty)
  ctx.scale(zoom, zoom)

  const atlas = ledColors ? atlasColor : atlasWhite

  const margin = DISC_PX * 2.5
  const viewL = (-tx) / zoom - margin
  const viewT = (-ty) / zoom - margin
  const viewR = (w - tx) / zoom + margin
  const viewB = (h - ty) / zoom + margin

  const toWorld = (px, py) => ({
    x: (px / 100) * w,
    y: (py / 100) * h,
  })

  // —— Links ——
  if (edges?.length) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let pass = 0; pass < 3; pass += 1) {
      if (pass === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 2.6 / zoom
        ctx.shadowColor = 'rgba(255,255,255,0.35)'
        ctx.shadowBlur = 8 / zoom
      } else if (pass === 1) {
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.lineWidth = 1.05 / zoom
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 0.35 / zoom
      }
      for (let i = 0; i < edges.length; i += 1) {
        const e = edges[i]
        const a = positions.get(e.from)
        const b = positions.get(e.to)
        if (!a || !b) continue
        const p1 = toWorld(a.x, a.y)
        const p2 = toWorld(b.x, b.y)
        if (
          (p1.x < viewL && p2.x < viewL)
          || (p1.x > viewR && p2.x > viewR)
          || (p1.y < viewT && p2.y < viewT)
          || (p1.y > viewB && p2.y > viewB)
        ) continue
        const { cx, cy } = curveControl(p1.x, p1.y, p2.x, p2.y)
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.quadraticCurveTo(cx, cy, p2.x, p2.y)
        ctx.stroke()
      }
    }
    ctx.shadowBlur = 0

    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]
      const a = positions.get(e.from)
      const b = positions.get(e.to)
      if (!a || !b) continue
      const p1 = toWorld(a.x, a.y)
      const p2 = toWorld(b.x, b.y)
      const { cx, cy } = curveControl(p1.x, p1.y, p2.x, p2.y)
      const dur = 2600 + (i % 3) * 500
      const delay = (i % 5) * 450
      const t = ((now + delay) % dur) / dur
      const pt = quadAt(p1.x, p1.y, cx, cy, p2.x, p2.y, t)
      if (pt.x < viewL || pt.x > viewR || pt.y < viewT || pt.y > viewB) continue
      const r = 2.2 / zoom
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 3)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // —— Nodes ——
  const pointerActive = !!pointer?.active
  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i]
    const pos = positions.get(agent.id)
    if (!pos) continue
    const p = toWorld(pos.x, pos.y)
    if (p.x < viewL || p.x > viewR || p.y < viewT || p.y > viewB) continue

    const live = isAgentLive(agent.status)
    const rt = ensureRuntime(runtime, agent.id, i)

    if (live && atlas) {
      // Same interaction model as ledDriver + .node-radiance
      let inside = false

      if (!pointerActive) {
        // Sleep interactive aiming; CSS crawl equivalent owns the spin
        if (!rt.idle) setLedIdle(rt, true, now)
        rt.inside = false
      } else {
        const wx = (pointer.x - tx) / zoom
        const wy = (pointer.y - ty) / zoom
        const dx = wx - p.x
        const dy = wy - p.y
        const dist = Math.hypot(dx, dy)
        const radius = DISC_PX / 2
        const reach = radius * 5.5
        inside = dist <= radius * 1.05
        let amp = 0
        let targetAngle = null
        if (dist < reach) {
          amp = Math.min(1, inside ? 1 : 1 - (dist - radius) / (reach - radius))
          targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI
        }

        if (targetAngle != null) {
          setLedIdle(rt, false, now)
          const delta = ((targetAngle - rt.angle + 540) % 360) - 180
          rt.angle += delta * (0.18 + amp * 0.35)
        } else if (!rt.idle) {
          // One-tick drift then hand off to idle crawl
          rt.angle = (rt.angle + 0.42) % 360
          setLedIdle(rt, true, now)
        }

        rt.amp += (Math.max(0.35, amp) - rt.amp) * 0.2
        rt.inside = inside
      }

      if (rt.idle) {
        // CSS node-led-spin: 360° / 14.3s from phase handoff
        const elapsed = now - rt.idleOriginTime
        rt.angle = (rt.idleOriginAngle + (elapsed / SPIN_MS) * 360) % 360
      }

      // Breathe: 0.72↔1 over 2.8s (bloom/luma)
      const breatheT = ((now + 700 + i * 37) % BREATHE_MS) / BREATHE_MS
      const breathe = 0.72 + 0.28 * (0.5 - 0.5 * Math.cos(breatheT * Math.PI * 2))

      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((rt.angle * Math.PI) / 180)
      drawRadiance(ctx, atlas, DISC_PX, rt.amp, rt.inside, breathe)
      ctx.restore()
    }

    // Disc
    const discR = live ? DISC_PX / 2 : (DISC_PX / 2) * 0.92
    ctx.beginPath()
    ctx.arc(p.x, p.y, discR, 0, Math.PI * 2)
    if (live) {
      ctx.fillStyle = '#000000'
      ctx.fill()
    } else {
      ctx.fillStyle = '#0a0a0e'
      ctx.globalAlpha = 0.45
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#27272a'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (selectedId === agent.id) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, discR + 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    const av = getAvatarImage(agent)
    if (av.ready && av.img) {
      const s = discR * 0.98
      ctx.save()
      if (!live) ctx.globalAlpha = 0.55
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(av.img, p.x - s / 2, p.y - s / 2, s, s)
      ctx.restore()
    }

    const name = agent.name || 'agent'
    const label = name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1)}…` : name
    ctx.font = '600 9px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const tyLabel = p.y + discR + 6
    if (live) {
      const tw = ctx.measureText(label).width
      const padX = 5
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.beginPath()
      const bw = tw + padX * 2
      const bh = 13
      const bx = p.x - bw / 2
      const by = tyLabel - 1
      const r = 2.5
      ctx.moveTo(bx + r, by)
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r)
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r)
      ctx.arcTo(bx, by + bh, bx, by, r)
      ctx.arcTo(bx, by, bx + bw, by, r)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#fafafa'
    } else {
      ctx.fillStyle = '#71717a'
    }
    ctx.fillText(label, p.x, tyLabel)
  }

  ctx.restore()
}

/**
 * Hit-test agents. pointerX/Y are field-local CSS pixels.
 */
export function hitTestAgent(agents, positions, camera, fieldW, fieldH, pointerX, pointerY) {
  const { x: tx, y: ty, zoom } = camera
  const wx = (pointerX - tx) / zoom
  const wy = (pointerY - ty) / zoom
  let best = null
  let bestDist = Infinity
  for (let i = agents.length - 1; i >= 0; i -= 1) {
    const agent = agents[i]
    const pos = positions.get(agent.id)
    if (!pos) continue
    const cx = (pos.x / 100) * fieldW
    const cy = (pos.y / 100) * fieldH
    const dist = Math.hypot(wx - cx, wy - cy)
    const r = (isAgentLive(agent.status) ? DISC_PX / 2 : (DISC_PX / 2) * 0.92) + 4
    if (dist <= r && dist < bestDist) {
      best = agent
      bestDist = dist
    }
  }
  return best
}
