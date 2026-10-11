/**
 * Command registry behind the ⌘K palette.
 * Pages contribute context commands with `useCommands(key, list)`; the palette
 * shows them above the global set. Keep `list` memoized at the call site.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const CommandContext = createContext(null)

export function CommandProvider({ children }) {
  const [sources, setSources] = useState(() => new Map())
  const [open, setOpen] = useState(false)

  const register = useCallback((key, list) => {
    setSources((prev) => {
      const next = new Map(prev)
      if (list) next.set(key, list)
      else next.delete(key)
      return next
    })
  }, [])

  // Page commands first, app-wide navigation last.
  const commands = useMemo(
    () => [...sources.entries()]
      .sort(([a], [b]) => (a === 'global') - (b === 'global'))
      .flatMap(([, list]) => list),
    [sources],
  )

  const value = useMemo(() => ({
    commands,
    register,
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
  }), [commands, register, open])

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
}

export function useCommandPalette() {
  const ctx = useContext(CommandContext)
  if (!ctx) throw new Error('useCommandPalette must be used inside <CommandProvider>')
  return ctx
}

export function useCommands(key, list) {
  const { register } = useCommandPalette()
  useEffect(() => {
    register(key, list)
  }, [key, list, register])
  useEffect(() => () => register(key, null), [key, register])
}

/** Case-insensitive subsequence match; lower score = better. */
export function scoreCommand(cmd, query) {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const hay = `${cmd.title} ${cmd.subtitle || ''} ${cmd.group || ''} ${cmd.keywords || ''}`.toLowerCase()
  const idx = hay.indexOf(q)
  if (idx >= 0) return idx
  let pos = -1
  let gaps = 0
  for (const ch of q) {
    const next = hay.indexOf(ch, pos + 1)
    if (next < 0) return -1
    gaps += next - pos - 1
    pos = next
  }
  return 100 + gaps
}

export function filterCommands(commands, query) {
  if (!query.trim()) return commands
  return commands
    .map((cmd, order) => ({ cmd, order, score: scoreCommand(cmd, query) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map((r) => r.cmd)
}
