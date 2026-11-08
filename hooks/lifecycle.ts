import type { EngineInterface } from 'claude-code'

import { keepBoardInOwnWindow } from './actions'
import { PANE_ID, PANE_TITLE, REFRESH_MS, WAITING_REFRESH_MS } from './constants'
import { refreshBoard } from './refresh'
import { reloadWaiting } from './waiting'

const TICKS_PER_REFRESH = Math.round(REFRESH_MS / WAITING_REFRESH_MS)

let clock: { cancel: () => void } | null = null

export const stopRefreshing = (): void => {
  clock?.cancel()
  clock = null
}

// While the pane is open: who is waiting every few seconds, the whole session list less often.
export function startRefreshing($: EngineInterface): void {
  stopRefreshing()
  let ticks = 0
  void reloadWaiting($)
  clock = $.clock.every(WAITING_REFRESH_MS, () => {
    ticks += 1
    void reloadWaiting($)
    if (ticks % TICKS_PER_REFRESH === 0) void refreshBoard($)
  })
}

export async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE_ID)
}

// "/kanban" and "/dash": open the pane, or close it when it is already open.
export async function togglePane($: EngineInterface): Promise<{ text: string }> {
  if (await isPaneOpen($)) {
    await $.ui.close({ id: PANE_ID })
    return { text: 'Kanban fechado.' }
  }
  const opened = await $.ui.open({ id: PANE_ID, title: PANE_TITLE, focus: true })
  void refreshBoard($)
  startRefreshing($)
  if (opened.isPlaced) void keepBoardInOwnWindow($)
  return { text: opened.isPlaced ? 'Kanban aberto ao lado da conversa.' : `Kanban pedido; o app ainda não o colocou (${opened.reason}).` }
}
