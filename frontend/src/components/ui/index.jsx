/**
 * Shared primitives — one set of buttons, surfaces, fields and dialogs
 * so every page reads as the same instrument.
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { statusMeta } from '../../lib/status'

export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const BUTTON = {
  primary: 'bg-zinc-100 text-zinc-950 hover:bg-white font-medium',
  ghost: 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100',
  subtle: 'bg-white/[0.04] text-zinc-300 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.08] hover:text-zinc-50',
  danger: 'text-zinc-500 ring-1 ring-inset ring-white/[0.08] hover:text-red-300 hover:ring-red-500/40',
  armed: 'bg-red-500/15 text-red-200 ring-1 ring-inset ring-red-500/50',
}

const SIZE = {
  sm: 'h-7 gap-1.5 rounded-lg px-2.5 text-[11px]',
  md: 'h-8 gap-2 rounded-lg px-3 text-xs',
}

export function Button({
  variant = 'subtle',
  size = 'md',
  className = '',
  to,
  children,
  ...rest
}) {
  const cls = cx(
    'inline-flex shrink-0 items-center justify-center font-mono transition-colors disabled:pointer-events-none disabled:opacity-40',
    SIZE[size],
    BUTTON[variant],
    className,
  )
  if (to) {
    return <Link to={to} className={cls} {...rest}>{children}</Link>
  }
  return <button type="button" className={cls} {...rest}>{children}</button>
}

export function IconButton({ label, active = false, className = '', size = 'md', children, ...rest }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
        active ? 'bg-white/[0.08] text-zinc-50' : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Raised hairline surface. `interactive` adds hover/focus affordance. */
export function Surface({ as: Tag = 'div', interactive = false, className = '', children, ...rest }) {
  return (
    <Tag
      className={cx(
        'rounded-2xl bg-white/[0.02] ring-1 ring-inset ring-white/[0.06]',
        interactive && 'cursor-pointer transition-colors hover:bg-white/[0.035] hover:ring-white/[0.12] focus:outline-none focus-visible:ring-white/30',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function Eyebrow({ className = '', children }) {
  return (
    <div className={cx('font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500', className)}>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, back, actions, leading }) {
  return (
    <header className="mb-8 space-y-4">
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <span aria-hidden>←</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          {leading}
          <div className="min-w-0">
            <h1 className="truncate font-mono text-xl font-semibold tracking-tight text-zinc-50">{title}</h1>
            {subtitle && <p className="mt-1 truncate text-[13px] text-zinc-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export const inputClass =
  'w-full rounded-lg bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-100 ring-1 ring-inset ring-white/[0.08] placeholder:text-zinc-600 transition-shadow focus:outline-none focus:ring-white/25'

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between">
        <Eyebrow>{label}</Eyebrow>
        {hint && <span className="font-mono text-[10px] text-zinc-600">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function Input(props) {
  return <input {...props} className={cx(inputClass, props.className)} />
}

export function Textarea(props) {
  return <textarea {...props} className={cx(inputClass, 'resize-y', props.className)} />
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select {...rest} className={cx(inputClass, 'select-field', className)}>
      {children}
    </select>
  )
}

export function Modal({ open = true, title, description, onClose, footer, width = 'max-w-md', children }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-0/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className={cx('ui-pop w-full rounded-2xl bg-ink-2 shadow-float', width)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="font-mono text-sm font-semibold text-zinc-50">{title}</h2>
            {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <CloseGlyph />
          </IconButton>
        </div>
        <div className="space-y-4 px-5 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function CloseGlyph({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function StatusDot({ status, className = '' }) {
  return <span className={cx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', statusMeta(status).dot, className)} aria-hidden />
}

export function StatusPill({ status }) {
  const meta = statusMeta(status)
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] ring-1 ring-inset ring-white/[0.06]', meta.text)}>
      <StatusDot status={status} />
      {meta.label}
    </span>
  )
}

export function Stat({ label, value, title }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.02] px-3 py-2.5 ring-1 ring-inset ring-white/[0.05]" title={title}>
      <Eyebrow className="!text-[9px] text-zinc-600">{label}</Eyebrow>
      <div className="mt-1 truncate font-mono text-[13px] text-zinc-100">{value}</div>
    </div>
  )
}

export function Tag({ children }) {
  return (
    <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 ring-1 ring-inset ring-white/[0.05]">
      {children}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.07] px-6 py-20 text-center">
      {Icon && <Icon className="mb-4 h-6 w-6 text-zinc-600" />}
      <p className="font-mono text-sm text-zinc-200">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[13px] text-zinc-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'error', children, onDismiss }) {
  return (
    <div className={cx(
      'flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-mono text-xs ring-1 ring-inset',
      tone === 'error' ? 'bg-red-500/[0.06] text-red-300 ring-red-500/20' : 'bg-white/[0.03] text-zinc-300 ring-white/[0.08]',
    )}>
      <span className="min-w-0 flex-1">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-zinc-500 hover:text-zinc-200" aria-label="Dismiss">
          <CloseGlyph className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/** Segmented control — tabs, view toggles. */
export function Segmented({ value, onChange, options, label, size = 'md' }) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-white/[0.03] p-0.5 ring-1 ring-inset ring-white/[0.06]"
      role="tablist"
      aria-label={label}
    >
      {options.map(({ value: v, label: l, icon: Icon }) => {
        const active = v === value
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cx(
              'flex items-center gap-1.5 rounded-md font-mono font-medium transition-colors',
              size === 'sm' ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]',
              active
                ? 'bg-white/[0.09] text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'text-zinc-500 hover:text-zinc-200',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {l}
          </button>
        )
      })}
    </div>
  )
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-white/[0.06] px-1 font-mono text-[10px] text-zinc-400 ring-1 ring-inset ring-white/[0.06]">
      {children}
    </kbd>
  )
}

/** Bit-sprite avatar — same sprite + glow the node field uses. */
export function Avatar({ src, live = false, size = 'md', className = '' }) {
  const dims = { xs: 'h-5 w-5 p-0.5', sm: 'h-7 w-7 p-1', md: 'h-10 w-10 p-1.5', lg: 'h-12 w-12 p-1.5' }[size]
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={cx('node-bit-avatar shrink-0 rounded-full bg-[#121218] object-contain object-center ring-1 ring-white/10', dims, className)}
      style={live ? { boxShadow: '0 0 16px rgba(255, 255, 255, 0.22)' } : undefined}
    />
  )
}
