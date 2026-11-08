import type { EngineInterface } from 'claude-code'

import type { BoardMessage, Session } from '../types'
import { openSession, renameSessionTitle, setSection } from './actions'
import { archiveAll, archiveOne, isBatchRunning } from './archive'
import { ARCHIVE } from './constants'
import { isVisible, splitArchiveBatch } from './filters'
import { saveStage, stageOf } from './stages'
import { readFilterValues, readSessions, readStages, showMoreCards, writeConfirmingArchive } from './state'

// Messages the board's surface module posts: drags, picks and presses.

const isBoardMessage = (value: unknown): value is BoardMessage =>
  !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'

// "[ARQUIVAR TODAS]" recounts the lane the way the board drew it (current search and filter) and
// refuses when the lane changed since the person confirmed.
async function startArchiveAll($: EngineInterface, list: Session[], confirmedCount: number): Promise<void> {
  if (isBatchRunning()) {
    $.ui.toast('A lista Arquivar já está sendo arquivada; espere terminar')
    return
  }
  const [saved, values] = await Promise.all([readStages($), readFilterValues($)])
  const filter = { ...values, waiting: new Set(values.waiting) }
  const { archivable } = splitArchiveBatch(list.filter(session => stageOf(session, saved) === ARCHIVE && isVisible(session, filter)))
  if (archivable.length !== confirmedCount) {
    $.ui.toast('A lista Arquivar mudou desde a confirmação; confira e confirme de novo')
    return
  }
  void archiveAll($, archivable)
}

export async function handleBoardMessage($: EngineInterface, message: unknown): Promise<void> {
  if (!isBoardMessage(message)) return
  const list = await readSessions($)
  const find = (id: string): Session | undefined => list.find(session => session.id === id)
  switch (message.type) {
    case 'move':
      await saveStage($, message.id, message.stage)
      break
    case 'showMore':
      await showMoreCards($, message.stage)
      break
    case 'askArchive':
      await writeConfirmingArchive($, message.id)
      break
    case 'archiveAll':
      await startArchiveAll($, list, message.count)
      break
    case 'open': {
      const session = find(message.id)
      if (session) void openSession($, session)
      break
    }
    case 'setSection': {
      const session = find(message.id)
      if (session) void setSection($, session, message.sectionId)
      break
    }
    case 'archive': {
      const session = find(message.id)
      if (session) void archiveOne($, session)
      break
    }
    case 'rename': {
      const session = find(message.id)
      if (session && typeof message.title === 'string') void renameSessionTitle($, session, message.title)
      break
    }
  }
}
