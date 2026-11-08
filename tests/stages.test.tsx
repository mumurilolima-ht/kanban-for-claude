import { expect, test } from 'claude-code/testing'

import { BOARD, PANE, RAW_SESSIONS, SAVED_AT, boardState, drawnText, fakeApp, fakeStore, noAppRegistry, realState, sessionStart, watchWrites } from './helpers'

test('moving a card re-reads the store and keeps what another board saved', async ($, on) => {
  boardState(on, { sessions: RAW_SESSIONS.slice(0, 3) })
  const store = fakeStore(on, {})
  sessionStart(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // after this board opened, another board (another app window) put c3 in "Revisar"
  store.stages = { local_c3: { stage: 'review', at: SAVED_AT } }

  // here, a1 goes from "Sem status" (lane 0) to "A fazer" (lane 1, x 29..56)
  await ui.pointer({ in: BOARD, type: 'down', x: 4, y: 2, button: 'left' })
  await ui.pointer({ in: BOARD, type: 'move', x: 34, y: 2, button: 'left' })
  await ui.pointer({ in: BOARD, type: 'up', x: 34, y: 2, button: 'left' })
  await ui.advance(50)

  const saved = store.stages as Record<string, { stage: string }>
  expect(saved.local_c3?.stage).toBe('review') // the other board's move stays
  expect(saved.local_a1?.stage).toBe('todo') // this board's move is in
  await ui.unmount()

  // the board now shows what the other one saved. The test state does not tell the engine to
  // redraw, so the board is mounted again to read the drawing.
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tree = await again.drawn({ in: BOARD })
  expect(drawnText(tree, 'c5.0')).toContain('Sales proposal')
  expect(drawnText(tree, 'c1.0')).toContain('Weekly sales pipeline')
  await again.unmount()
})

test('a refresh brings in the stages another board saved after this session started', async ($, on) => {
  const writes = watchWrites()
  const memory = realState(on, {}, writes.onWrite)
  const store = fakeStore(on, {})
  noAppRegistry(on)
  fakeApp(on, RAW_SESSIONS)
  sessionStart(on)
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  store.stages = { local_c3: { stage: 'review', at: SAVED_AT } }
  const refreshed = writes.next('loading', value => value === false)
  await $.command.run({ command: 'kanban', args: '' } as Parameters<typeof $.command.run>[0])
  await refreshed

  const shown = (memory.get('stages')?.value as { value?: Record<string, { stage: string }> } | undefined)?.value ?? {}
  expect(shown.local_c3?.stage).toBe('review')
  expect(store.stageWrites).toBe(0) // reading writes nothing
})
