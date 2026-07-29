import { memo, useEffect, useRef } from 'react'
import { agentAvatarUrl, isAgentLive, shortLabel } from '../../lib/agentField'
import { patchLedNodePos, registerLedNode } from '../../lib/ledDriver'

/**
 * Live-node LED — Vercel triangle-led interaction model:
 * - idle: slow rim crawl + breathe
 * - pointer: light angle follows cursor; intensity from proximity / inside
 * - double-click / LED chip: toggle chromatic colors
 */
function AgentNode({
  agent,
  index,
  x,
  y,
  selected,
  onSelect,
  ledColors,
  onToggleLedColors,
}) {
  const live = isAgentLive(agent.status)
  const label = shortLabel(agent.name)
  const avatar = agentAvatarUrl(agent)
  const radianceRef = useRef(null)
  const ledRef = useRef({
    angle: (index * 47) % 360,
    amp: 0.35,
  })

  useEffect(() => {
    if (!live) return undefined
    const layer = radianceRef.current
    if (!layer) return undefined
    return registerLedNode(agent.id, {
      layer,
      led: ledRef.current,
      x,
      y,
    })
    // x/y patched separately so force-layout ticks don't reset the LED
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [live, agent.id])

  useEffect(() => {
    if (!live) return
    patchLedNodePos(agent.id, x, y)
  }, [live, agent.id, x, y])

  return (
    <button
      type="button"
      data-agent-node
      onPointerDown={(e) => {
        // Select on down — force drift can move the node before click fires
        if (e.button !== 0) return
        e.stopPropagation()
        onSelect(agent)
      }}
      onClick={(e) => {
        // Prevent a synthesized click from toggling selection again
        e.preventDefault()
      }}
      onDoubleClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (live && onToggleLedColors) onToggleLedColors()
      }}
      className="group absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus:outline-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-label={`${agent.name} (${agent.status})`}
      aria-pressed={selected}
    >
      <div className="relative flex flex-col items-center gap-1.5">
        <div className="relative h-[76px] w-[76px] shrink-0">
          {live && (
            <div
              ref={radianceRef}
              className="node-radiance"
              aria-hidden
              data-led-idle="true"
              data-led-colors={ledColors ? 'true' : 'false'}
              style={{
                '--led-angle': `${ledRef.current.angle}deg`,
                '--led-amp': String(ledRef.current.amp),
                '--led-phase': `${-((ledRef.current.angle % 360) / 360) * 14.3}s`,
              }}
            >
              <div className="node-radiance__spin">
                <span className="node-radiance__bloom" />
                <span className="node-radiance__luma" />
                <span className="node-radiance__plate" />
                <span className="node-radiance__noise" />
              </div>
            </div>
          )}

          <div
            data-node-disc
            className={[
              'node-bit-face relative z-[1] h-full w-full overflow-hidden rounded-full transition-all duration-300',
              live
                ? 'scale-100 bg-black'
                : 'scale-[0.92] border border-zinc-800 bg-[#0a0a0e] opacity-45 grayscale',
              selected ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-[#07070a]' : '',
              'group-hover:brightness-110',
            ].join(' ')}
          >
            <img
              src={avatar}
              alt=""
              className="node-bit-avatar absolute left-1/2 top-1/2 block h-[49%] w-[49%] -translate-x-1/2 -translate-y-1/2 object-contain object-center"
              draggable={false}
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextSibling?.classList.remove('hidden')
              }}
            />            <div
              className="hidden absolute inset-0 flex items-center justify-center bg-black font-mono text-sm text-zinc-300"
              aria-hidden
            >
              {label.slice(0, 2)}
            </div>
          </div>
        </div>

        <span
          className={[
            'node-bit-label relative z-[2] mt-0.5 max-w-[8.5rem] truncate px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold tracking-wide',
            live
              ? 'rounded bg-black/70 text-zinc-50 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]'
              : 'text-zinc-500',
          ].join(' ')}
          title={agent.name}
        >
          {agent.name || label}
        </span>
        {!live && (
          <span className="-mt-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            {agent.status || 'idle'}
          </span>
        )}
      </div>
    </button>
  )
}

function propsEqual(prev, next) {
  return (
    prev.agent.id === next.agent.id
    && prev.agent.status === next.agent.status
    && prev.agent.name === next.agent.name
    && prev.x === next.x
    && prev.y === next.y
    && prev.selected === next.selected
    && prev.ledColors === next.ledColors
    && prev.index === next.index
    && prev.onSelect === next.onSelect
    && prev.onToggleLedColors === next.onToggleLedColors
  )
}

export default memo(AgentNode, propsEqual)
