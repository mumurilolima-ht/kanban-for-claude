import { expect, test } from 'claude-code/testing'

import { mcpText, sessionStart } from './helpers'

for (const command of ['kanban', 'dash']) {
  test(`/${command} opens the pane, and closes it when it is open`, async ($, on) => {
    sessionStart(on)
    on('state.get', () => ({ value: { value: undefined, version: 0 } }))
    // opening starts a session list refresh in the background; the test waits for it to end
    let refreshed: () => void = () => {}
    const refresh = new Promise<void>(resolve => {
      refreshed = resolve
    })
    on('state.set', (_, e) => {
      const { key, value } = e as { key?: string; value?: unknown }
      if (key === 'loading' && value === false) refreshed()
      return { value: { isSet: true, version: 2 } }
    })
    on('mcp.call', () => mcpText('[]'))
    const open: string[] = []
    on('ui.open', (_, e) => {
      open.push((e as { id: string }).id)
      return { value: { isPlaced: false, reason: 'test' } }
    })
    on('ui.panes', () => ({ value: open.map(id => ({ id, title: 'Kanban de Sessões', isShown: false, isFocused: false, isPlaced: false })) }))
    on('ui.close', (_, e) => {
      const index = open.indexOf((e as { id: string }).id)
      if (index >= 0) open.splice(index, 1)
      return { value: undefined }
    })
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

    // the test kit stamps origin and presentation; the command name is enough here
    const run = { command, args: '' } as Parameters<typeof $.command.run>[0]
    const opened = await $.command.run(run)
    expect(open).toEqual(['kanban'])
    expect(JSON.stringify(opened)).toContain('Kanban pedido')
    await refresh

    const closed = await $.command.run(run)
    expect(open).toEqual([])
    expect(JSON.stringify(closed)).toContain('Kanban fechado')
  })
}
