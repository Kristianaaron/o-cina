/**
 * Single rAF loop for interactive LED aiming.
 * Idle crawl is CSS-composited (cached glow bitmap + rotate) — no JS.
 */

const nodes = new Map()
const SPIN_DUR = 14.3 // matches node-led-spin in CSS

let pointerRef = null
let fieldRef = null
let cameraRef = null
let raf = 0
let running = false
let pointerWasActive = false

export function configureLedDriver({ pointer, field, camera }) {
  pointerRef = pointer
  fieldRef = field
  cameraRef = camera
}

export function registerLedNode(id, entry) {
  const phase = -((entry.led.angle % 360) / 360) * SPIN_DUR
  entry.idle = true
  if (entry.layer) {
    entry.layer.dataset.ledIdle = 'true'
    entry.layer.style.setProperty('--led-phase', `${phase}s`)
    entry.layer.style.setProperty('--led-amp', String(entry.led.amp))
  }
  entry.spin = entry.spin || entry.layer?.querySelector?.('.node-radiance__spin') || null
  nodes.set(id, entry)
  // Ensure loop can wake on pointer; idle nodes need no per-frame work
  ensureLoop()
  return () => {
    nodes.delete(id)
    if (nodes.size === 0) stopLoop()
  }
}

/** Update layout % without re-registering (force sim moves nodes every frame). */
export function patchLedNodePos(id, x, y) {
  const n = nodes.get(id)
  if (!n) return
  n.x = x
  n.y = y
}

function fieldMetrics() {
  const fieldEl = fieldRef?.current
  const cam = cameraRef?.current || { x: 0, y: 0, zoom: 1 }
  if (!fieldEl) {
    return { fieldLeft: 0, fieldTop: 0, fieldW: 1, fieldH: 1, zoom: 1, tx: 0, ty: 0 }
  }
  const rect = fieldEl.getBoundingClientRect()
  return {
    fieldLeft: rect.left,
    fieldTop: rect.top,
    fieldW: rect.width || 1,
    fieldH: rect.height || 1,
    zoom: cam.zoom || 1,
    tx: cam.x || 0,
    ty: cam.y || 0,
  }
}

function setIdle(n, idle) {
  if (n.idle === idle) return
  n.idle = idle
  const layer = n.layer
  const spin = n.spin
  if (!layer) return
  layer.dataset.ledIdle = idle ? 'true' : 'false'
  if (idle) {
    const phase = -((n.led.angle % 360) / 360) * SPIN_DUR
    layer.style.setProperty('--led-phase', `${phase}s`)
    if (spin) {
      spin.style.transform = ''
    }
  } else if (spin) {
    spin.style.transform = `translate(-50%, -50%) rotate(${n.led.angle}deg)`
  }
}

function ensureLoop() {
  if (running) return
  running = true
  const tick = () => {
    if (!running) return
    const pointer = pointerRef?.current
    const pointerActive = !!pointer?.active

    // Sleep while idle: CSS owns the crawl; wake when pointer moves
    if (!pointerActive) {
      if (pointerWasActive) {
        for (const n of nodes.values()) {
          setIdle(n, true)
          if (n.layer) n.layer.style.setProperty('--led-amp', String(n.led.amp))
        }
        pointerWasActive = false
      }
      raf = requestAnimationFrame(tick)
      return
    }
    pointerWasActive = true

    const { fieldLeft, fieldTop, fieldW, fieldH, zoom, tx, ty } = fieldMetrics()

    for (const n of nodes.values()) {
      const layer = n.layer
      if (!layer) continue
      if (!n.spin) n.spin = layer.querySelector('.node-radiance__spin')
      const led = n.led
      const spin = n.spin

      const cx = fieldLeft + tx + (n.x / 100) * fieldW * zoom
      const cy = fieldTop + ty + (n.y / 100) * fieldH * zoom
      const radius = Math.max(1, 38 * zoom)

      let amp = 0
      let inside = false
      let targetAngle = null

      const dx = pointer.x - cx
      const dy = pointer.y - cy
      const dist = Math.hypot(dx, dy)
      const reach = radius * 5.5
      inside = dist <= radius * 1.05
      if (dist < reach) {
        amp = Math.min(1, inside ? 1 : 1 - (dist - radius) / (reach - radius))
        targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI
      }

      if (targetAngle != null) {
        setIdle(n, false)
        const delta = ((targetAngle - led.angle + 540) % 360) - 180
        led.angle += delta * (0.18 + amp * 0.35)
        if (spin) {
          spin.style.transform = `translate(-50%, -50%) rotate(${led.angle}deg)`
        }
      } else if (!n.idle) {
        // Drift back to CSS crawl when pointer leaves this node's reach
        led.angle = (led.angle + 0.42) % 360
        setIdle(n, true)
      }

      led.amp += (Math.max(0.35, amp) - led.amp) * 0.2
      layer.style.setProperty('--led-amp', String(led.amp))

      const insideStr = inside ? 'true' : 'false'
      if (layer.dataset.ledInside !== insideStr) layer.dataset.ledInside = insideStr
    }

    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

function stopLoop() {
  running = false
  cancelAnimationFrame(raf)
  raf = 0
}
