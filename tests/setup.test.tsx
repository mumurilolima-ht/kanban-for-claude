import { expect, test } from 'claude-code/testing'

import { BOARD, PANE, RAW_SESSIONS, SAVED_AT, boardState, fakeApp, fakeStore, noAppRegistry, realState, sessionStart, watchWrites } from './helpers'

test('the first open asks for the section mapping; Aplicar places only unplaced sessions and the question does not come back', async ($, on) => {
  boardState(on)
  // d4 (SALES BOT) is already in "Revisar"; the mapping was never answered
  const store = fakeStore(on, { local_d4: { stage: 'review', at: SAVED_AT } }, {})
  sessionStart(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // the question replaces the board, with each section and its lane picker
  expect(await ui.find({ type: 'Text', text: /Primeira configuração/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^DONE$/ })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'setup-cg-3' })).toBeDefined()

  // DONE goes to "Feito" and SALES BOT to "A fazer"; PRIORITY stays in "Sem status"
  await ui.select({ key: 'setup-cg-3', value: 'done' })
  await ui.select({ key: 'setup-cg-1', value: 'todo' })
  await ui.press({ key: 'setup-apply' })

  const saved = store.stages as Record<string, { stage: string }>
  expect(saved.local_c3?.stage).toBe('done')
  expect(saved.local_a1?.stage).toBe('todo')
  expect(saved.local_d4?.stage).toBe('review') // already placed: it does not move
  expect(saved.local_b2).toBeUndefined()
  expect(store.others.sectionMapping).toBeDefined()
  await ui.unmount()

  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await again.find({ type: 'Text', text: /Primeira configuração/ })).toBeUndefined()
  expect(await again.find({ type: 'Text', text: /Sem status/, in: BOARD })).toBeDefined()
  await again.unmount()
})

test('once another window answers the mapping, the question leaves this board on the next refresh', async ($, on) => {
  const writes = watchWrites()
  const memory = realState(on, {}, writes.onWrite)
  const store = fakeStore(on, {}, {}) // not answered when this session starts
  noAppRegistry(on)
  fakeApp(on, RAW_SESSIONS)
  sessionStart(on)
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(memory.get('setupDone')?.value).toBe(false)

  // another window presses "Pular"
  store.others.sectionMapping = { at: SAVED_AT, applied: false, mapping: {} }
  const refreshed = writes.next('loading', value => value === false)
  await $.command.run({ command: 'kanban', args: '' } as Parameters<typeof $.command.run>[0])
  await refreshed
  expect(memory.get('setupDone')?.value).toBe(true)
})
