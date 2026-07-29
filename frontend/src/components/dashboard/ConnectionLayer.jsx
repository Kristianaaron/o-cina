import { memo, useMemo } from 'react'
import { straightPath } from '../../lib/agentField'

/**
 * Solid light filaments with a soft traveling light pulse (no hard edges).
 * Filters are applied per layer group (not per path) to keep the same look cheaper.
 */
function ConnectionLayer({ edges, positions }) {
  const prepared = useMemo(() => {
    if (!edges?.length) return []
    return edges.map((edge, i) => {
      const a = positions.get(edge.from)
      const b = positions.get(edge.to)
      if (!a || !b) return null
      return {
        id: edge.id,
        d: straightPath(a.x, a.y, b.x, b.y),
        delay: `${(i % 5) * 0.45}s`,
        dur: `${2.6 + (i % 3) * 0.5}s`,
      }
    }).filter(Boolean)
  }, [edges, positions])

  if (!prepared.length) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      style={{ mixBlendMode: 'screen' }}
    >
      <defs>
        <filter id="linkBloom" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="1.25" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
          </feMerge>
        </filter>
        <filter id="linkPlate" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="0.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="pulseSoft" x="-120%" y="-120%" width="340%" height="340%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="0.55" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
          </feMerge>
        </filter>
        <filter id="pulseCoreSoft" x="-100%" y="-100%" width="300%" height="300%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="0.18" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="pulseOrb" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="25%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Bloom layer — one filter pass for all filaments */}
      <g filter="url(#linkBloom)" opacity="0.38">
        {prepared.map((e) => (
          <path
            key={`b-${e.id}`}
            d={e.d}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      <g filter="url(#linkPlate)" opacity="0.55">
        {prepared.map((e) => (
          <path
            key={`p-${e.id}`}
            d={e.d}
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.05"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      <g opacity="0.95">
        {prepared.map((e) => (
          <path
            key={`c-${e.id}`}
            d={e.d}
            fill="none"
            stroke="#ffffff"
            strokeWidth="0.3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Traveling pulses — small per-bead filters (shared defs) */}
      {prepared.map((e) => (
        <g key={`pulse-${e.id}`}>
          <animateMotion
            dur={e.dur}
            repeatCount="indefinite"
            path={e.d}
            begin={e.delay}
            rotate="auto"
          />
          <rect
            x="-0.65"
            y="-0.65"
            width="1.3"
            height="1.3"
            fill="url(#pulseOrb)"
            opacity="0.85"
            filter="url(#pulseSoft)"
            transform="rotate(45)"
          />
          <rect
            x="-0.26"
            y="-0.26"
            width="0.52"
            height="0.52"
            fill="#ffffff"
            opacity="1"
            filter="url(#pulseCoreSoft)"
            transform="rotate(45)"
          />
        </g>
      ))}
    </svg>
  )
}

export default memo(ConnectionLayer)
