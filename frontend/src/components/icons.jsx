/**
 * App icons — Lucide (shadcn/ui default via https://www.shadcn.io/icons).
 * Keep stable Icon* names so call sites stay unchanged.
 */
import {
  AppWindowMac,
  ArrowUp,
  Bot,
  Box,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CirclePlus,
  Columns2,
  Command,
  FolderKanban,
  GitBranch,
  GitFork,
  MessageSquare,
  Mic,
  Monitor,
  PanelsTopLeft,
  Maximize2,
  Minimize2,
  Palette,
  Play,
  Plus,
  RotateCw,
  Rows2,
  Square,
  SquareTerminal,
  Trash2,
  X,
  Waypoints,
  Workflow,
} from 'lucide-react'

const DEFAULT = 'w-5 h-5'

function lucide(Icon, { className = DEFAULT, strokeWidth = 1.75, ...rest } = {}) {
  return (
    <Icon
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden
      {...rest}
    />
  )
}

/** Main nav — home / command chamber */
export function IconDashboard(props) {
  return lucide(AppWindowMac, props)
}

/** Chamber “Nodes” field view */
export function IconNodes(props) {
  return lucide(Waypoints, props)
}

export function IconAgents(props) {
  return lucide(Bot, props)
}

/** Chamber “Panes” multiplexer */
export function IconPanes(props) {
  return lucide(PanelsTopLeft, props)
}

export function IconWorkflows(props) {
  return lucide(Workflow, props)
}

export function IconProjects(props) {
  return lucide(FolderKanban, props)
}

export function IconTalk(props) {
  return lucide(MessageSquare, props)
}

export function IconMark({ className = DEFAULT }) {
  return (
    <span className={`inline-flex items-center justify-center font-semibold ${className}`} aria-hidden>
      O
    </span>
  )
}

export function IconPlus(props) {
  return lucide(CirclePlus, props)
}

export function IconMic(props) {
  return lucide(Mic, props)
}

export function IconArrowUp(props) {
  return lucide(ArrowUp, { strokeWidth: 2.25, ...props })
}

export function IconChevronDown(props) {
  return lucide(ChevronDown, props)
}

export function IconBranch(props) {
  return lucide(GitBranch, props)
}

export function IconMonitor(props) {
  return lucide(Monitor, props)
}

export function IconAlert(props) {
  return lucide(CircleAlert, props)
}

export function IconApprove(props) {
  return lucide(CircleCheck, props)
}

export function IconDecision(props) {
  return lucide(GitFork, props)
}

export function IconSubflow(props) {
  return lucide(Box, props)
}

export function IconTrash(props) {
  return lucide(Trash2, props)
}

/** Side-by-side split (vertical divider) */
export function IconSplitColumns(props) {
  return lucide(Columns2, props)
}

/** Stacked split (horizontal divider) */
export function IconSplitRows(props) {
  return lucide(Rows2, props)
}

export function IconCommand(props) {
  return lucide(Command, props)
}

export function IconAdd(props) {
  return lucide(Plus, props)
}

export function IconClose(props) {
  return lucide(X, props)
}

export function IconMaximize(props) {
  return lucide(Maximize2, props)
}

export function IconMinimize(props) {
  return lucide(Minimize2, props)
}

export function IconPlay(props) {
  return lucide(Play, props)
}

export function IconStop(props) {
  return lucide(Square, props)
}

export function IconRestart(props) {
  return lucide(RotateCw, props)
}

export function IconTerminal(props) {
  return lucide(SquareTerminal, props)
}

export function IconPalette(props) {
  return lucide(Palette, props)
}
