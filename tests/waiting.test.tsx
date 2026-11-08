import { expect, mock, test } from 'claude-code/testing'

import { BOARD, PANE, RAW_SESSIONS, SAVED_AT, boardState, drawnText, fakeApp, fakeStore, findByKey, mcpText, noAppRegistry, sessionStart, watchWrites } from './helpers'

const BLINK_STEP_MS = 650
const DOT_ON = '"color":"warning","bold":true},"children":["●"]'

test('a session about to ask the person reports it after 2 s and clears the report once approved', async ($, on) => {
  const clock = mock.clock(on)
  const store = fakeStore(on, {})
  on('mcp.call', (_, e) => {
    const { tool } = e as { tool: string }
    return mcpText(tool === 'get_session' ? JSON.stringify({ sessionId: 'local_me', title: 'This session' }) : 'ok')
  })
  sessionStart(on)
  on('tool.check', () => ({ decision: 'ask' as const }))
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ask = (id: string) =>
    $.tool.check({ tool: 'Bash', input: { command: 'rm -rf out' }, tool_use_id: id, approver: 'host' } as unknown as Parameters<typeof $.tool.check>[0])
  const approve = (id: string) => $.tool.call({ tool: 'Bash', command: 'rm -rf out', tool_use_id: id } as unknown as Parameters<typeof $.tool.call>[0])

  // answered in under 2 s (auto mode, the app itself): boards never hear about it
  await ask('call-quick')
  await clock.advance(500)
  await approve('call-quick')
  await clock.advance(3000)
  expect(store.others['waiting:local_me']).toBeUndefined()

  // left waiting for the person: after 2 s the report shows up, with the time it was seen
  await ask('call-1')
  await clock.advance(2100)
  const report = store.others['waiting:local_me'] as { seen?: string; tool?: string } | undefined
  expect(report?.tool).toBe('Bash')
  expect(typeof report?.seen).toBe('string')
  // approved, the report goes away
  await approve('call-1')
  await clock.advance(10)
  expect(store.others['waiting:local_me']).toBeUndefined()
  expect(store.writtenKeys.filter(key => key.startsWith('waiting:'))).toEqual(['waiting:local_me'])
})

test('the board shows waiting sessions with a blinking yellow dot, filters by them and drops stale reports', async ($, on) => {
  const writes = watchWrites()
  const memory = boardState(on, { onWrite: writes.onWrite })
  const now = new Date().toISOString()
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString()
  const store = fakeStore(on, {}, {
    sectionMapping: { at: SAVED_AT, applied: false, mapping: {} },
    'waiting:local_a1': { since: now, seen: now, tool: 'Bash' },
    'waiting:local_zz': { since: SAVED_AT, seen: tenMinutesAgo, tool: 'Bash' },
  })
  noAppRegistry(on)
  fakeApp(on, RAW_SESSIONS)
  sessionStart(on)
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const read = writes.next('waiting')
  await $.command.run({ command: 'kanban', args: '' } as Parameters<typeof $.command.run>[0])
  await read

  // only the recently renewed report counts; the one from ten minutes ago is deleted
  expect(memory.get('waiting')?.value).toEqual(['local_a1'])
  expect(store.others['waiting:local_zz']).toBeUndefined()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const firstCard = async () => drawnText(await ui.drawn({ in: BOARD }), 'c0.0')
  expect(await firstCard()).toContain('aguarda você')
  // the dot blinks on the drawing's own clock: lit, then dark
  await ui.advance(BLINK_STEP_MS)
  const lit = await firstCard()
  await ui.advance(BLINK_STEP_MS)
  const dark = await firstCard()
  expect(lit).toContain(DOT_ON)
  expect(dark).not.toContain(DOT_ON)
  await ui.unmount()

  // "Só aguardando sua ação" shows only the waiting session
  const filtering = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await filtering.select({ key: 'show', value: 'waiting' })
  await filtering.unmount()
  const filtered = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tree = await filtered.drawn({ in: BOARD })
  expect(drawnText(tree, 'c0.0')).toContain('Weekly sales pipeline')
  expect(findByKey(tree, 'c0.1')).toBeUndefined()
  await filtered.unmount()
})
