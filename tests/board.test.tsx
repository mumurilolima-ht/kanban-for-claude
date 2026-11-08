import { expect, test } from 'claude-code/testing'

import { BOARD, PANE, RAW_SESSIONS, boardState, drawnText, fakeApp, fakeStore, findByKey, fixedState, noAppRegistry, sessionStart } from './helpers'

test('draws the lanes and cards on the desktop surface', async ($, on) => {
  fixedState(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /A fazer/, in: BOARD })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Weekly sales pipeline/, in: BOARD })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sales proposal/, in: BOARD })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Abrir/, in: BOARD })).toBeDefined()
  await ui.unmount()
})

test('a session nobody placed sits in "Sem status", whatever its section', async ($, on) => {
  fixedState(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tree = await ui.drawn({ in: BOARD })

  expect(drawnText(tree, 'h0')).toContain('Sem status')
  expect(drawnText(tree, 'h1')).toContain('A fazer')
  // b2 is in the PRIORITY section and c3 in DONE: both stay unplaced
  expect(drawnText(tree, 'c0.1')).toContain('Tax reform guide')
  expect(drawnText(tree, 'c0.2')).toContain('Sales proposal')
  expect(findByKey(tree, 'c1.0')).toBeUndefined()
  expect(findByKey(tree, 'c2.0')).toBeUndefined()
  expect(findByKey(tree, 'c4.0')).toBeUndefined()
  await ui.unmount()
})

test('dragging a card onto another lane saves its stage', async ($, on) => {
  fixedState(on)
  const writes: Array<{ key?: string; value?: unknown }> = []
  on('state.set', (_, e) => {
    writes.push(e as { key?: string; value?: unknown })
    return { value: { isSet: true, version: 2 } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // the first card of lane 0 starts on row 1; lane 1 spans x 29..56
  await ui.pointer({ in: BOARD, type: 'down', x: 4, y: 2, button: 'left' })
  await ui.pointer({ in: BOARD, type: 'move', x: 30, y: 2, button: 'left' })
  await ui.pointer({ in: BOARD, type: 'up', x: 30, y: 2, button: 'left' })

  expect(writes.some(write => write.key === 'stages' && JSON.stringify(write.value).includes('"local_a1":{"stage":"todo"'))).toBe(true)
  await ui.unmount()
})

test('clicking a cut title expands the card, and a second click collapses it', async ($, on) => {
  fixedState(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // b2 is the second card of "Sem status" (key 0.1); its title is cut and the last line ends in "…"
  expect(await ui.find({ type: 'Text', text: /…$/, in: BOARD })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /companies$/, in: BOARD })).toBeUndefined()
  await ui.press({ key: 't0.10' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Text', text: /companies$/, in: BOARD })).toBeDefined()
  await ui.press({ key: 't0.10' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Text', text: /companies$/, in: BOARD })).toBeUndefined()
  // hovering changes nothing
  await ui.pointer({ in: BOARD, type: 'move', x: 28, y: 3 })
  await ui.advance(50)
  expect(await ui.find({ type: 'Text', text: /companies$/, in: BOARD })).toBeUndefined()
  await ui.unmount()
})

test('right-click opens the card menu with Abrir, Renomear and Arquivar', async ($, on) => {
  fixedState(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ type: 'Button', key: 'menu-archive', in: BOARD })).toBeUndefined()
  await ui.pointer({ in: BOARD, type: 'down', x: 6, y: 3, button: 'right' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Button', text: /^Abrir$/, key: 'menu-open', in: BOARD })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'menu-rename', in: BOARD })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Arquivar/, key: 'menu-archive', in: BOARD })).toBeDefined()
  await ui.press({ key: 'menu-archive' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Button', key: 'menu-archive', in: BOARD })).toBeUndefined()
  await ui.unmount()
})

test('Renomear opens a field on the card, and Enter asks the app for the new title', async ($, on) => {
  fixedState(on)
  const calls: unknown[] = []
  on('mcp.call', (_, e) => {
    calls.push(e)
    return { value: { content: [{ type: 'text', text: 'ok' }], isError: false } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.pointer({ in: BOARD, type: 'down', x: 6, y: 3, button: 'right' })
  await ui.advance(50)
  await ui.press({ key: 'menu-rename' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Input', key: 'r0.0', in: BOARD })).toBeDefined()
  await ui.input({ key: 'r0.0', text: 'Weekly sales pipeline v2' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Input', key: 'r0.0', in: BOARD })).toBeUndefined()
  expect(calls.some(call => JSON.stringify(call).includes('"set_session_title"') && JSON.stringify(call).includes('Weekly sales pipeline v2'))).toBe(true)
  await ui.unmount()
})

test('the section picker offers "Fixado": picking it pins, and picking a section on a pinned card unpins', async ($, on) => {
  boardState(on)
  fakeStore(on, {})
  noAppRegistry(on)
  const app = fakeApp(on, RAW_SESSIONS)
  sessionStart(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const tree = await ui.drawn({ in: BOARD })

  // a1 (not pinned) shows its section; b2 (pinned) shows "Fixado"
  expect(drawnText(tree, 's0.0')).toContain('"Fixado"')
  expect(drawnText(tree, 's0.0')).toContain('"value":"cg-1"')
  expect(drawnText(tree, 's0.1')).toContain('"value":"__pinned"')

  const select = (key: string, value: string) => ui.select({ key, value })
  await select('s0.0', '__pinned')
  await select('s0.1', 'cg-3')
  await select('s0.1', '')
  expect(app.calls.filter(call => call.tool === 'set_pinned' || call.tool === 'move_sessions')).toEqual([
    { tool: 'set_pinned', args: { session_id: 'local_a1', pinned: true } },
    { tool: 'move_sessions', args: { session_ids: ['local_b2'], group_id: 'cg-3' } },
    { tool: 'set_pinned', args: { session_id: 'local_b2', pinned: false } },
    { tool: 'move_sessions', args: { session_ids: ['local_b2'], section_id: 'sessions' } },
    { tool: 'set_pinned', args: { session_id: 'local_b2', pinned: false } },
  ])
  await ui.unmount()
})
