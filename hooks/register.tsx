import type { Elements, EngineInterface, Register } from 'claude-code'

import { SECTION_MAPPING_KEY } from './constants'
import { isPaneOpen, startRefreshing, stopRefreshing, togglePane } from './lifecycle'
import { handleBoardMessage } from './messages'
import { renderPane } from './pane'
import { refreshBoard } from './refresh'
import { readSavedStages } from './stages'
import { writeBatchProgress, writeSetupDone, writeStages } from './state'
import { isWaiting, resolveCall, startHeartbeat, startWaiting, stopWaiting } from './waiting'

// Kanban for Claude: a pane next to the conversation, opened with /kanban or /dash, with one
// lane per work stage. The sidebar section is only the card's label.

const COMMAND_DESCRIPTION = 'Abre ou fecha o Kanban de Sessões ao lado da conversa'

// Whether the first-run section mapping was answered, in any session or window.
async function loadSetupDone($: EngineInterface): Promise<void> {
  try {
    const answer = await $.store.get(SECTION_MAPPING_KEY)
    await writeSetupDone($, answer !== undefined)
  } catch {
    await writeSetupDone($, null)
  }
}

// After a reload of the mod the pane may still be open: refresh it and restart its clock.
async function resumeOpenPane($: EngineInterface): Promise<void> {
  try {
    if (!(await isPaneOpen($))) return
    void refreshBoard($)
    startRefreshing($)
  } catch {
    // the session has no surface yet
  }
}

function endWaitIfAny($: EngineInterface): void {
  if (isWaiting()) void stopWaiting($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'kanban', description: COMMAND_DESCRIPTION })
    // "/dash" is a second name for the same pane ("/dashboard" is reserved by Claude Code)
    await $.command.register({ name: 'dash', description: COMMAND_DESCRIPTION })
    const saved = await readSavedStages($)
    if (saved) await writeStages($, () => saved)
    startHeartbeat($)
    // a reload during a batch stops its loop, so the stored progress no longer holds
    await writeBatchProgress($, null)
    await loadSetupDone($)
    await resumeOpenPane($)
    return next(e)
  })

  // In every session: a tool call put to the person (a permission, a question, a plan) starts a
  // wait; the approved call, the next step of the turn or the end of the turn ends it.
  // These run around every tool call of every session, so the board's part never throws into them.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    try {
      if (verdict.decision === 'ask' && e.approver !== undefined && e.tool_use_id) startWaiting($, e.tool_use_id, e.tool)
    } catch {
      // reporting a wait is best effort
    }
    return verdict
  })
  on('tool.call', async ($, e, next) => {
    try {
      resolveCall($, e.tool_use_id)
    } catch {
      // reporting a wait is best effort
    }
    return next(e)
  })
  // a new step of the turn only starts once every ask of the previous step was answered
  on('turn.step', async function* ($, e, next) {
    endWaitIfAny($)
    return yield* next(e)
  })
  on('turn.complete', async ($, e, next) => {
    endWaitIfAny($)
    return next(e)
  })
  on('turn.abort', async ($, e, next) => {
    endWaitIfAny($)
    return next(e)
  })

  on('command.run', { command: 'kanban' }, $ => togglePane($))
  on('command.run', { command: 'dash' }, $ => togglePane($))

  // Matchers are written as literals so the engine's scan can read them: 'kanban' is PANE_ID and
  // 'board' is BOARD_ELEMENT in constants.ts.
  on('ui.close', { id: 'kanban' }, async ($, e, next) => {
    stopRefreshing()
    return next(e)
  })

  on('ui.message', { element: 'board' }, async ($, e) => {
    await handleBoardMessage($, e.data)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: 'kanban' }, async ($, e) => renderPane($, $.ui.resolve(e) as Elements['desktop']))
}
