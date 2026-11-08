import type { EngineInterface } from 'claude-code'

import type { Session } from '../types'
import { errorMessage, moveThisSessionToOwnWindow, moveToSection, openSessionLink, renameSession, searchTranscripts, setPinned } from './app'
import { PINNED_OPTION, TRANSCRIPT_SEARCH_DELAY_MS, TRANSCRIPT_SEARCH_MIN_CHARS } from './constants'
import { refreshBoard } from './refresh'
import { writeTranscriptHits } from './state'

const SESSION_ID = /^local_[0-9a-f-]+$/i

let searchTimer: { cancel: () => void } | null = null

// The card's section picker shows "Fixado" for a pinned session.
const shownSection = (session: Session): string => (session.pinned ? PINNED_OPTION : session.sectionId ?? '')

export async function setSection($: EngineInterface, session: Session, choice: string): Promise<void> {
  if (shownSection(session) === choice) return
  try {
    if (choice === PINNED_OPTION) {
      await setPinned($, session.id, true)
      $.ui.toast(`"${session.title}" fixada`)
    } else {
      if ((session.sectionId ?? '') !== choice) await moveToSection($, session.id, choice)
      // Picking a section takes the session out of "Fixado". The app unpins a session moved into a
      // section, but one moved to "Sem seção", or kept in the section under its pin, stays pinned.
      if (session.pinned) await setPinned($, session.id, false)
      $.ui.toast(`"${session.title}" mudou de seção`)
    }
    await refreshBoard($)
  } catch (error) {
    $.ui.toast(`Não consegui mover de seção: ${errorMessage(error).slice(0, 100)}`)
  }
}

export async function openSession($: EngineInterface, session: Session): Promise<void> {
  if (!SESSION_ID.test(session.id)) {
    $.ui.toast('Esta sessão não tem link para abrir')
    return
  }
  try {
    const failure = await openSessionLink($, session.id)
    if (failure !== null) $.ui.toast(`Não consegui abrir: ${failure.slice(0, 100) || 'o sistema recusou o link'}`)
  } catch (error) {
    $.ui.toast(`Não consegui abrir: ${errorMessage(error).slice(0, 100)}`)
  }
}

export async function renameSessionTitle($: EngineInterface, session: Session, title: string): Promise<void> {
  const trimmed = title.trim()
  if (!trimmed || trimmed === session.title) return
  try {
    await renameSession($, session.id, trimmed)
    $.ui.toast(`Renomeada: "${trimmed}"`)
    await refreshBoard($)
  } catch (error) {
    $.ui.toast(`Não consegui renomear: ${errorMessage(error).slice(0, 100)}`)
  }
}

// With three letters or more, the app's transcript search runs a moment after the last keystroke.
export function scheduleTranscriptSearch($: EngineInterface, query: string): void {
  searchTimer?.cancel()
  searchTimer = null
  const trimmed = query.trim()
  if (trimmed.length < TRANSCRIPT_SEARCH_MIN_CHARS) {
    void writeTranscriptHits($, null)
    return
  }
  searchTimer = $.clock.after(TRANSCRIPT_SEARCH_DELAY_MS, () => {
    void searchTranscripts($, trimmed)
      .then(ids => writeTranscriptHits($, ids))
      .catch(() => writeTranscriptHits($, []))
  })
}

export async function keepBoardInOwnWindow($: EngineInterface): Promise<void> {
  try {
    if (await moveThisSessionToOwnWindow($)) $.ui.toast('Quadro em janela própria: Abrir mostra a sessão na janela principal')
  } catch (error) {
    $.ui.toast(`Não consegui pôr o quadro em janela própria: ${errorMessage(error).slice(0, 100)}`)
  }
}
