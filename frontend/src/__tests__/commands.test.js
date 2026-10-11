import { describe, expect, it } from 'vitest'
import { filterCommands, scoreCommand } from '../lib/commands'

const cmds = [
  { id: 'a', group: 'Panes', title: 'Split right' },
  { id: 'b', group: 'Panes', title: 'Split down' },
  { id: 'c', group: 'Navigate', title: 'Workflows' },
  { id: 'd', group: 'Open in pane', title: 'scout-01', keywords: 'open attach' },
]

describe('command palette filtering', () => {
  it('returns everything for an empty query, in order', () => {
    expect(filterCommands(cmds, '  ').map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ranks substring matches ahead of subsequence matches', () => {
    expect(filterCommands(cmds, 'down').map((c) => c.id)).toEqual(['b'])
    expect(filterCommands(cmds, 'spr')[0].id).toBe('a')
  })

  it('matches keywords and rejects non-matches', () => {
    expect(filterCommands(cmds, 'attach').map((c) => c.id)).toEqual(['d'])
    expect(scoreCommand(cmds[2], 'zzz')).toBe(-1)
  })
})
