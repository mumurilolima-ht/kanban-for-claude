import type { EngineInterface } from 'claude-code'

import type { SavedStages, Session } from '../types'
import { archiveSession, errorMessage, setPinned, unarchiveSession } from './app'
import { ARCHIVE } from './constants'
import { countSessions } from './format'
import { refreshBoard } from './refresh'
import { changeSavedStages } from './stages'
import { readSessions, writeBatchProgress, writeConfirmingArchive } from './state'

type LinkedResult = { restored: number; stuck: number }

const SINGLE_REASON = 'Arquivada pelo Kanban de Sessões'
const BATCH_REASON = 'Na lista Arquivar do Kanban de Sessões'

let batchRunning = false

export const isBatchRunning = (): boolean => batchRunning

async function activeIds($: EngineInterface): Promise<Set<string>> {
  return new Set((await readSessions($)).map(session => session.id))
}

// Active sessions linked to the targets (the ones they started, and the ones those started),
// targets excluded. The app archives finished linked sessions together with a session; the
// board archives only the sessions the person chose.
export const linkedDescendants = (list: Session[], targetIds: ReadonlySet<string>): Session[] => {
  const childrenOf = new Map<string, Session[]>()
  for (const session of list) {
    if (session.parentId) childrenOf.set(session.parentId, [...(childrenOf.get(session.parentId) ?? []), session])
  }
  const seen = new Set(targetIds)
  const linked: Session[] = []
  const pending = [...targetIds]
  while (pending.length) {
    for (const child of childrenOf.get(pending.shift() as string) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      linked.push(child)
      pending.push(child.id)
    }
  }
  return linked
}

// Unarchives the linked sessions the app archived along, then checks the re-read list.
async function restoreLinked($: EngineInterface, linked: Session[]): Promise<LinkedResult> {
  if (!linked.length) return { restored: 0, stuck: 0 }
  const active = await activeIds($)
  const taken = linked.filter(session => !active.has(session.id))
  if (!taken.length) return { restored: 0, stuck: 0 }
  for (const session of taken) await unarchiveSession($, session.id).catch(() => undefined)
  if (!(await refreshBoard($))) return { restored: 0, stuck: taken.length }
  const activeNow = await activeIds($)
  const restored = taken.filter(session => activeNow.has(session.id)).length
  return { restored, stuck: taken.length - restored }
}

const linkedNotice = ({ restored, stuck }: LinkedResult): string =>
  (restored ? `; ${restored === 1 ? '1 sessão ligada continua ativa' : `${restored} sessões ligadas continuam ativas`}` : '') +
  (stuck ? `; ${stuck === 1 ? '1 sessão ligada foi arquivada junto e não voltou' : `${stuck} sessões ligadas foram arquivadas junto e não voltaram`}` : '')

// Only drops entries still in "Arquivar" in what the store holds now (another board may have moved them).
const withoutArchiveStage = (current: SavedStages, ids: ReadonlySet<string>): SavedStages => {
  if (![...ids].some(id => current[id]?.stage === ARCHIVE)) return current
  return Object.fromEntries(Object.entries(current).filter(([id, saved]) => !(ids.has(id) && saved.stage === ARCHIVE)))
}

// After a re-read, a target missing from the active list was really archived: the app answers a
// refusal (a working or on-screen session) as plain text, not as an error. Their saved "Arquivar"
// stage is dropped, so an unarchived session comes back unplaced instead of landing in "Arquivar".
async function forgetArchived($: EngineInterface, targets: Session[]): Promise<Session[]> {
  const active = await activeIds($)
  const archived = targets.filter(session => !active.has(session.id))
  const ids = new Set(archived.map(session => session.id))
  if (ids.size) await changeSavedStages($, current => withoutArchiveStage(current, ids))
  return archived
}

async function repin($: EngineInterface, session: Session): Promise<void> {
  try {
    await setPinned($, session.id, true)
    await refreshBoard($)
  } catch {
    // stays unpinned; the toast already says it was not archived
  }
}

// Right-click "Arquivar". The app refuses pinned sessions, so the board unpins first and pins
// again when the archive does not happen (a running session, for example).
export async function archiveOne($: EngineInterface, session: Session): Promise<void> {
  await writeConfirmingArchive($, null)
  const linked = linkedDescendants(await readSessions($), new Set([session.id]))
  let unpinned = false
  try {
    if (session.pinned) {
      await setPinned($, session.id, false)
      unpinned = true
    }
    const answer = await archiveSession($, session.id, SINGLE_REASON)
    if (!(await refreshBoard($))) {
      $.ui.toast(answer.slice(0, 120) || 'Pedi o arquivamento, mas não consegui reler a lista para conferir')
      return
    }
    const [archived] = await forgetArchived($, [session])
    if (!archived) {
      if (unpinned) await repin($, session)
      $.ui.toast(`Não arquivou: ${answer.slice(0, 110) || 'o app recusou'}`)
      return
    }
    const linkedResult = await restoreLinked($, linked)
    $.ui.toast(`${unpinned ? 'Desafixada e arquivada' : 'Sessão arquivada'}${linkedNotice(linkedResult)}`)
  } catch (error) {
    if (unpinned) await repin($, session)
    $.ui.toast(`Não arquivou: ${errorMessage(error).slice(0, 100)}`)
  }
}

const batchNotice = (total: number, archived: number, answersLeft: string[]): string => {
  if (!answersLeft.length) return archived === 1 ? '1 sessão arquivada' : `${archived} sessões arquivadas`
  const reason = answersLeft.find(Boolean) ?? ''
  const left = answersLeft.length === 1 ? '1 ficou' : `${answersLeft.length} ficaram`
  return `${archived} de ${total} arquivadas; ${left} na lista${reason ? `: ${reason.slice(0, 100)}` : ''}`
}

// "[ARQUIVAR TODAS]": archives the lane one session at a time, shows the progress on the board,
// then checks the re-read list for what really left.
export async function archiveAll($: EngineInterface, targets: Session[]): Promise<void> {
  if (batchRunning || !targets.length) return
  batchRunning = true
  const answers = new Map<string, string>()
  const linked = linkedDescendants(await readSessions($), new Set(targets.map(session => session.id)))
  try {
    await writeBatchProgress($, { done: 0, total: targets.length })
    for (const [index, session] of targets.entries()) {
      answers.set(session.id, await archiveSession($, session.id, BATCH_REASON).catch(errorMessage))
      await writeBatchProgress($, { done: index + 1, total: targets.length })
    }
    if (!(await refreshBoard($))) {
      $.ui.toast(`Pedi o arquivamento de ${countSessions(targets.length)}, mas não consegui reler a lista para conferir`)
      return
    }
    const archived = await forgetArchived($, targets)
    const answersLeft = targets.filter(session => !archived.includes(session)).map(session => answers.get(session.id) ?? '')
    const linkedResult = await restoreLinked($, linked)
    $.ui.toast(batchNotice(targets.length, archived.length, answersLeft) + linkedNotice(linkedResult))
  } finally {
    batchRunning = false
    await writeBatchProgress($, null)
  }
}
