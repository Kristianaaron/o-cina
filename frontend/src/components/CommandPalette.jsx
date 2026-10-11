import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, useCommandPalette } from '../lib/commands'
import { Kbd, cx } from './ui'

/**
 * ⌘K / Ctrl+K — the one place to reach every action.
 * Listens in the capture phase so it still opens while a terminal has focus.
 */
export default function CommandPalette() {
  const { commands, open, setOpen, toggle } = useCommandPalette()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === 'KeyK') {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [toggle])

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setCursor(0)
    const prev = document.activeElement
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(t)
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
  }, [open])

  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(results.length - 1, 0)))
  }, [results.length])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const run = (cmd) => {
    if (!cmd) return
    setOpen(false)
    // Let the palette unmount (and restore focus) before the action moves focus.
    requestAnimationFrame(() => cmd.run())
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (results.length ? (c + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (results.length ? (c - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[cursor])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  let lastGroup = null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-ink-0/60 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={() => setOpen(false)}
    >
      <div
        className="ui-pop w-full max-w-xl overflow-hidden rounded-2xl bg-ink-2/95 shadow-float backdrop-blur-xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
          <svg className="h-4 w-4 shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search agents…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={results[cursor] ? `cmd-${results[cursor].id}` : undefined}
          />
          <Kbd>esc</Kbd>
        </div>

        <ul id="command-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center font-mono text-xs text-zinc-600">No matching commands</li>
          )}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null
            lastGroup = cmd.group
            const Icon = cmd.icon
            const active = i === cursor
            return (
              <li key={cmd.id} role="presentation">
                {header && (
                  <div className="px-2.5 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                    {header}
                  </div>
                )}
                <button
                  id={`cmd-${cmd.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-index={i}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => run(cmd)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-white/[0.07]' : '',
                  )}
                >
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center', active ? 'text-zinc-100' : 'text-zinc-500')}>
                    {cmd.avatar ? (
                      <img src={cmd.avatar} alt="" className="node-bit-avatar h-5 w-5 rounded-full bg-[#121218] p-0.5 ring-1 ring-white/10" />
                    ) : Icon ? <Icon className="h-4 w-4" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[13px]', active ? 'text-zinc-50' : 'text-zinc-300')}>{cmd.title}</span>
                    {cmd.subtitle && <span className="block truncate font-mono text-[10px] text-zinc-600">{cmd.subtitle}</span>}
                  </span>
                  {cmd.shortcut && (
                    <span className="flex shrink-0 gap-1">
                      {cmd.shortcut.map((k) => <Kbd key={k}>{k}</Kbd>)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2 font-mono text-[10px] text-zinc-600">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> run</span>
          <span className="ml-auto">{results.length} commands</span>
        </div>
      </div>
    </div>
  )
}
