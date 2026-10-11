/**
 * One status vocabulary for the whole app.
 * Live = white light (same language as the node radiance); trouble = warm accents.
 */
const META = {
  running: { key: 'working', label: 'running', dot: 'bg-zinc-50 shadow-lit', text: 'text-zinc-100' },
  starting: { key: 'working', label: 'starting', dot: 'bg-zinc-300 animate-pulse', text: 'text-zinc-300' },
  stopping: { key: 'blocked', label: 'stopping', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  error: { key: 'blocked', label: 'error', dot: 'bg-red-400', text: 'text-red-300' },
  offline: { key: 'offline', label: 'offline', dot: 'bg-zinc-700', text: 'text-zinc-500' },
  stopped: { key: 'idle', label: 'stopped', dot: 'bg-zinc-600', text: 'text-zinc-400' },
  registered: { key: 'idle', label: 'idle', dot: 'bg-zinc-600', text: 'text-zinc-400' },
}

export function statusMeta(status) {
  return META[status] || META.registered
}

export function needsAttention(status) {
  return statusMeta(status).key === 'blocked'
}
