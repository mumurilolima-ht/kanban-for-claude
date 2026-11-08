import { expect, test } from 'claude-code/testing'

import { BOARD, FAMILY, PANE, RAW_SESSIONS, SAVED_AT, boardState, drawnText, fakeApp, fakeStore, noAppRegistry, sessionStart, watchWrites } from './helpers'

const inArchiveLane = (ids: string[]) => Object.fromEntries(ids.map(id => [id, { stage: 'archive', at: SAVED_AT }]))

// The app archives a session together with its linked sessions (children and grandchildren).
const archiveWithFamily = (id: string, archived: Set<string>): string => {
  if (archived.has(id)) return `Already archived ${id}`
  const family = [id]
  for (const member of family) family.push(...FAMILY.filter(session => session.startedBy === member).map(session => session.sessionId))
  for (const member of family) archived.add(member)
  return `Archived ${id} and its side sessions`
}

test('the "Arquivar" lane button archives the lane and checks what really left', async ($, on) => {
  // a1 and c3 are in "Arquivar"; b2 too, but it is pinned (the app refuses it); d4 stays unplaced.
  // The app archives a1 and refuses c3 (open on screen): c3 stays in the lane and in its stage.
  const stages = inArchiveLane(['local_a1', 'local_b2', 'local_c3'])
  const writes = watchWrites()
  boardState(on, { stages, onWrite: writes.onWrite })
  const store = fakeStore(on, stages)
  noAppRegistry(on)
  const app = fakeApp(on, RAW_SESSIONS, (id, archived) => {
    if (id === 'local_c3') return 'Not archived: the session is open on screen'
    archived.add(id)
    return `Archived ${id}`
  })
  sessionStart(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // the lane is "Arquivar" (the seventh, header h6) with "[ARQUIVAR TODAS]" on the name line;
  // the pinned session is mentioned in the smallest type size
  expect(await ui.find({ type: 'Text', text: /^Arquivar$/, in: BOARD })).toBeDefined()
  expect(JSON.stringify(await ui.drawn({ in: BOARD }))).toContain('"size":"caption","wrap":"truncate-end"},"children":["Fica 1 fixada ou em"]')
  expect((await ui.find({ type: 'Button', key: 'archive-all', in: BOARD }))?.text).toBe('[ARQUIVAR TODAS]')
  expect(drawnText(await ui.drawn({ in: BOARD }), 'h6')).toContain('[ARQUIVAR TODAS]')

  // the button asks first, under the name; "Não" goes back without calling the app
  await ui.press({ key: 'archive-all' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Text', text: /Arquivar as 2/, in: BOARD })).toBeDefined()
  expect(drawnText(await ui.drawn({ in: BOARD }), 'h6')).not.toContain('ARQUIVAR TODAS')
  await ui.press({ key: 'archive-all-no' })
  await ui.advance(50)
  expect(app.calls.some(call => call.tool === 'archive_session')).toBe(false)

  // "Sim" archives the two it can, one at a time, and leaves the pinned and the unplaced ones alone
  const finished = writes.next('batchProgress', value => value === null)
  await ui.press({ key: 'archive-all' })
  await ui.advance(50)
  await ui.press({ key: 'archive-all-yes' })
  await finished
  const archiveCalls = app.calls.filter(call => call.tool === 'archive_session').map(call => String(call.args.session_id))
  expect(archiveCalls.sort()).toEqual(['local_a1', 'local_c3'])

  // only the session that left keeps no "Arquivar" stage; the refused and the pinned ones keep it
  expect(Object.keys(store.stages as Record<string, unknown>).sort()).toEqual(['local_b2', 'local_c3'])
  expect(app.lastToast()).toContain('1 de 2 arquivadas')
  expect(app.lastToast()).toContain('open on screen')
  await ui.unmount()
})

for (const outcome of ['archived', 'refused'] as const) {
  test(`right-click "Arquivar" unpins a pinned session first (the app ${outcome === 'archived' ? 'archives it' : 'refuses and it is pinned again'})`, async ($, on) => {
    boardState(on)
    fakeStore(on, {})
    noAppRegistry(on)
    const app = fakeApp(on, RAW_SESSIONS, (id, archived) => {
      if (outcome === 'refused') return 'Not archived: the session is still working'
      archived.add(id)
      return `Archived ${id}`
    })
    sessionStart(on)
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

    // b2 (pinned) is the second card of "Sem status": the first one takes rows 1 to 7
    await ui.pointer({ in: BOARD, type: 'down', x: 6, y: 10, button: 'right' })
    await ui.advance(50)
    await ui.press({ key: 'menu-archive' })
    await ui.unmount()
    // the question lives in the board's state; mounted again, the card shows it and says it will unpin
    const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await again.find({ type: 'Text', text: /Desafixar e arquivar\?/, in: BOARD })).toBeDefined()
    await again.press({ key: 'y0.1' })

    const steps = app.calls
      .filter(call => call.tool === 'set_pinned' || call.tool === 'archive_session')
      .map(call => `${call.tool}:${String(call.args.session_id)}${call.tool === 'set_pinned' ? `:${String(call.args.pinned)}` : ''}`)
    if (outcome === 'archived') {
      expect(steps).toEqual(['set_pinned:local_b2:false', 'archive_session:local_b2'])
      expect(app.lastToast()).toContain('Desafixada e arquivada')
    } else {
      expect(steps).toEqual(['set_pinned:local_b2:false', 'archive_session:local_b2', 'set_pinned:local_b2:true'])
      expect(app.lastToast()).toContain('Não arquivou')
    }
    await again.unmount()
  })
}

test('archiving a parent session from the menu keeps its linked sessions', async ($, on) => {
  boardState(on, { sessions: FAMILY })
  fakeStore(on, {})
  noAppRegistry(on)
  const app = fakeApp(on, FAMILY, archiveWithFamily)
  sessionStart(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // the parent is the first card of "Sem status"
  await ui.pointer({ in: BOARD, type: 'down', x: 6, y: 3, button: 'right' })
  await ui.advance(50)
  await ui.press({ key: 'menu-archive' })
  await ui.unmount()
  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await again.press({ key: 'y0.0' })

  const unarchived = app.calls.filter(call => call.tool === 'unarchive_session').map(call => String(call.args.session_id)).sort()
  expect(unarchived).toEqual(['local_f1', 'local_n1'])
  expect([...app.archived]).toEqual(['local_m1'])
  expect(app.lastToast()).toContain('2 sessões ligadas continuam ativas')
  await again.unmount()
})

test('in a batch, a linked session that is also in "Arquivar" is archived; only the one outside the lane stays active', async ($, on) => {
  const stages = inArchiveLane(['local_m1', 'local_f1'])
  const writes = watchWrites()
  boardState(on, { sessions: FAMILY, stages, onWrite: writes.onWrite })
  fakeStore(on, stages)
  noAppRegistry(on)
  const app = fakeApp(on, FAMILY, archiveWithFamily)
  sessionStart(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const finished = writes.next('batchProgress', value => value === null)
  await ui.press({ key: 'archive-all' })
  await ui.advance(50)
  await ui.press({ key: 'archive-all-yes' })
  await finished

  expect(app.calls.filter(call => call.tool === 'unarchive_session').map(call => String(call.args.session_id))).toEqual(['local_n1'])
  expect([...app.archived].sort()).toEqual(['local_f1', 'local_m1'])
  expect(app.lastToast()).toContain('1 sessão ligada continua ativa')
  await ui.unmount()
})
