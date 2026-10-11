import { Segmented, cx } from './ui'
import { IconNodes, IconPanes } from './icons'

const VIEWS = [
  { value: 'nodes', label: 'Nodes', icon: IconNodes },
  { value: 'panes', label: 'Panes', icon: IconPanes },
]

/**
 * Command-center top bar shared by the node field and the pane multiplexer.
 * `floating` renders it as glass islands over the canvas; otherwise a solid strip.
 */
export default function ChamberBar({ view, onViewChange, meta, actions, floating = false }) {
  const brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black font-mono text-[11px] font-semibold text-zinc-100 ring-1 ring-white/15">
        O
      </span>
      <span className="hidden font-mono text-[12px] font-semibold tracking-wide text-zinc-100 sm:inline">O-cina</span>
      {meta && <span className="hidden h-3.5 w-px bg-white/[0.1] sm:block" aria-hidden />}
      {meta && <div className="flex min-w-0 items-center">{meta}</div>}
    </div>
  )

  const toggle = (
    <Segmented value={view} onChange={onViewChange} options={VIEWS} label="Command center view" />
  )

  if (floating) {
    const island = 'pointer-events-auto flex h-11 items-center gap-3 rounded-2xl bg-ink-1/75 px-2.5 shadow-float backdrop-blur-xl'
    return (
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className={cx(island, 'min-w-0 pl-3')}>
          {brand}
          {toggle}
        </div>
        {actions && <div className={cx(island, 'gap-1 px-1.5')}>{actions}</div>}
      </div>
    )
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-ink-1 px-3 pl-4">
      {brand}
      {toggle}
      <div className="flex-1" />
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </header>
  )
}
