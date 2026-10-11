import { NavLink } from 'react-router-dom'
import { useCommandPalette } from '../lib/commands'
import {
  IconAgents,
  IconCommand,
  IconDashboard,
  IconProjects,
  IconTalk,
  IconWorkflows,
} from './icons'

const PRIMARY_NAV = [
  { to: '/', label: 'Command center', icon: IconDashboard, end: true },
  { to: '/agents', label: 'Agents', icon: IconAgents },
  { to: '/workflows', label: 'Workflows', icon: IconWorkflows },
  { to: '/projects', label: 'Projects', icon: IconProjects },
]

const ITEM = 'group relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors'
const IDLE = 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100'

/**
 * Floating bottom nav — overlays the viewport, does not consume layout space.
 * `docked` tucks it into the multiplexer's status strip.
 */
export default function AppNav({ promptOpen, onTogglePrompt, docked = false }) {
  const { open: paletteOpen, toggle: togglePalette } = useCommandPalette()

  return (
    <div
      className={[
        'pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-4 transition-[padding] duration-200',
        docked ? 'pb-1.5' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6',
      ].join(' ')}
    >
      <nav
        className="pointer-events-auto flex items-center gap-0.5 rounded-2xl bg-ink-1/90 p-1 shadow-float backdrop-blur-xl"
        aria-label="Primary"
      >
        {PRIMARY_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={!!end}
            aria-label={label}
            className={({ isActive }) => [ITEM, isActive ? 'text-zinc-50' : IDLE].join(' ')}
          >
            {({ isActive }) => (
              <>
                <Icon className="h-4 w-4" />
                <Tooltip>{label}</Tooltip>
                {isActive && <NavIllumine />}
              </>
            )}
          </NavLink>
        ))}

        <div className="mx-1 h-4 w-px bg-white/[0.08]" aria-hidden />

        <button
          type="button"
          onClick={onTogglePrompt}
          aria-label="Prompt"
          aria-pressed={promptOpen}
          className={[ITEM, promptOpen ? 'text-zinc-50' : IDLE].join(' ')}
        >
          <IconTalk className="h-4 w-4" />
          <Tooltip>Prompt</Tooltip>
          {promptOpen && <NavIllumine />}
        </button>
        <button
          type="button"
          onClick={togglePalette}
          aria-label="Commands"
          aria-pressed={paletteOpen}
          className={[ITEM, paletteOpen ? 'text-zinc-50' : IDLE].join(' ')}
        >
          <IconCommand className="h-4 w-4" />
          <Tooltip>Commands · ⌘K</Tooltip>
          {paletteOpen && <NavIllumine />}
        </button>
      </nav>
    </div>
  )
}

function Tooltip({ children }) {
  return (
    <span className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-3 px-2 py-1 font-mono text-[10px] text-zinc-300 opacity-0 shadow-float transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  )
}

/** Horizontal filament — same radiance stack as workspace pane-illumine. */
function NavIllumine() {
  return (
    <span
      className="nav-illumine"
      style={{ '--led-angle': '-90deg', '--led-amp': 0.48 }}
      aria-hidden
    >
      <span className="nav-illumine__bloom" />
      <span className="nav-illumine__luma" />
      <span className="nav-illumine__plate" />
      <span className="nav-illumine__noise" />
      <span className="nav-illumine__core" />
    </span>
  )
}
