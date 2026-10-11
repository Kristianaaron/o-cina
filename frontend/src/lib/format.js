/** Relative time from a unix-seconds timestamp. */
export function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`
}
