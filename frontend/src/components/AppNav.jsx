import { NavLink } from 'react-router-dom'
import {
  IconAgents,
  IconDashboard,
  IconProjects,
  IconTalk,
  IconWorkflows,
} from './icons'

const PRIMARY_NAV = [
  { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/agents', label: 'Agents', icon: IconAgents },
  { to: '/workflows', label: 'Workflows', icon: IconWorkflows },
  { to: '/projects', label: 'Projects', icon: IconProjects },
]

/**
 * Floating sticky bottom nav — overlays the viewport, does not consume layout space.
 */
export default function AppNav({ promptOpen, onTogglePrompt }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6">
      <nav
        className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-zinc-700/80 bg-zinc-950/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
        aria-label="Primary"
      >
        {PRIMARY_NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={!!end}
            title={label}
            aria-label={label}
            className={({ isActive }) => [
              'relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
              isActive
                ? 'text-zinc-50'
                : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100',
            ].join(' ')}
          >
            {({ isActive }) => (
              <>
                <Icon />
                <span className="sr-only">{label}</span>
                {isActive && <NavIllumine />}
              </>
            )}
          </NavLink>
        ))}

        <div className="mx-0.5 h-7 w-px bg-zinc-700/80" aria-hidden />

        <button
          type="button"
          onClick={onTogglePrompt}
          title="Prompt"
          aria-label="Prompt"
          aria-pressed={promptOpen}
          className={[
            'relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
            promptOpen
              ? 'text-zinc-50'
              : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100',
          ].join(' ')}
        >
          <IconTalk />
          {promptOpen && <NavIllumine />}
        </button>
      </nav>
    </div>
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
