import { useEffect, useRef } from 'react'

const LAYERS = [
  // far → near: count, radius, alpha, pan parallax, tilt parallax
  { count: 220, r: 0.5, a: 0.16, pan: 0.015, tilt: 4 },
  { count: 110, r: 0.8, a: 0.26, pan: 0.04, tilt: 10 },
  { count: 40, r: 1.15, a: 0.4, pan: 0.09, tilt: 20 },
]

function makeStars(w, h) {
  const stars = []
  LAYERS.forEach((layer, li) => {
    for (let i = 0; i < layer.count; i += 1) {
      stars.push({
        layer: li,
        x: Math.random() * w,
        y: Math.random() * h,
        r: layer.r * (0.7 + Math.random() * 0.6),
        a: layer.a * (0.6 + Math.random() * 0.4),
        tw: 0.4 + Math.random() * 1.6, // twinkle speed
        ph: Math.random() * Math.PI * 2,
      })
    }
  })
  return stars
}

const wrap = (v, size) => ((v % size) + size) % size

/**
 * Deep-space backdrop for the node field: a dim parallax starfield and faint
 * drifting nebula — kept dark so node edge-light pops.
 * Reads the field camera + smoothed pointer tilt each frame; never re-renders.
 */
export default function SpaceBackdrop({ cameraRef, tiltRef, ledColors = false }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let dpr = 1
    let stars = []
    let raf = 0

    const resize = () => {
      const rect = root.getBoundingClientRect()
      w = Math.max(1, rect.width)
      h = Math.max(1, rect.height)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      stars = makeStars(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(root)

    const frame = (now) => {
      const cam = cameraRef?.current || { x: 0, y: 0, zoom: 1 }
      const tilt = tiltRef?.current || { x: 0, y: 0 }
      const t = now / 1000

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2

      for (const s of stars) {
        const layer = LAYERS[s.layer]
        // Zoom pushes stars outward a little — nearer layers more ("warp")
        const warp = 1 + (cam.zoom - 1) * layer.pan * 3
        const px = wrap(s.x + cam.x * layer.pan - tilt.x * layer.tilt, w)
        const py = wrap(s.y + cam.y * layer.pan - tilt.y * layer.tilt, h)
        const x = cx + (px - cx) * warp
        const y = cy + (py - cy) * warp
        const twinkle = reduced ? 1 : 0.65 + 0.35 * Math.sin(t * s.tw + s.ph)
        ctx.globalAlpha = s.a * twinkle
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1

      // Nebula drifts against the tilt
      root.style.setProperty('--tilt-x', tilt.x.toFixed(4))
      root.style.setProperty('--tilt-y', tilt.y.toFixed(4))

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [cameraRef, tiltRef])

  return (
    <div
      ref={rootRef}
      className="space-backdrop pointer-events-none absolute inset-0 z-0 overflow-hidden"
      data-led-colors={ledColors ? 'true' : 'false'}
      aria-hidden
    >
      <div className="space-nebula space-nebula--a" />
      <div className="space-nebula space-nebula--b" />
      <div className="space-nebula space-nebula--c" />
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
