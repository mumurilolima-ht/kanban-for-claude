import type { EngineInterface } from 'claude-code'

import type { SavedStages, Session } from '../types'
import { errorMessage } from './app'
import { DOING, LANE_IDS, NO_STATUS, STAGES_KEY } from './constants'
import { writeStages } from './state'

// The saved stages live in one store file shared by every session and app window, while each
// board keeps the copy it read last. No write starts from that copy: each change re-reads the
// store, applies only its own cards and writes back. The engine re-reads the file on every get,
// so two boards can only collide within the milliseconds between a read and a write.

let queue: Promise<unknown> = Promise.resolve()
// Bumped by every local change; a reload requested before a change is dropped.
let localVersion = 0

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const turn = queue.then(task, task)
  queue = turn.catch(() => undefined)
  return turn
}

// What the store holds now; null when the store cannot be read.
export async function readSavedStages($: EngineInterface): Promise<SavedStages | null> {
  try {
    const value = await $.store.get(STAGES_KEY)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as SavedStages) : {}
  } catch {
    return null
  }
}

// Shows the change at once, then applies the same change to what the store holds now.
export async function changeSavedStages($: EngineInterface, change: (current: SavedStages) => SavedStages): Promise<void> {
  const version = ++localVersion
  await writeStages($, change)
  await enqueue(async () => {
    try {
      const stored = await readSavedStages($)
      if (stored === null) {
        $.ui.toast('Não consegui ler as etapas guardadas; a mudança vale só nesta sessão')
        return
      }
      const next = change(stored)
      if (next !== stored) await $.store.set(STAGES_KEY, next)
      // the board also picks up what other boards saved; a later local change redraws with its own write
      if (version === localVersion) await writeStages($, () => next)
    } catch (error) {
      $.ui.toast(`A mudança vale só nesta sessão: ${errorMessage(error).slice(0, 80)}`)
    }
  })
}

// Brings in what other boards saved, without undoing a local change made meanwhile.
export function reloadSavedStages($: EngineInterface): Promise<void> {
  const versionAtRequest = localVersion
  return enqueue(async () => {
    const stored = await readSavedStages($)
    if (stored !== null && versionAtRequest === localVersion) await writeStages($, () => stored)
  })
}

export async function saveStage($: EngineInterface, id: string, stage: string): Promise<void> {
  if (!LANE_IDS.has(stage)) return
  const saved = { stage, at: new Date().toISOString() }
  await changeSavedStages($, current => ({ ...current, [id]: saved }))
}

// A session nobody placed shows in "Fazendo" while it runs and in "Sem status" otherwise. The
// sidebar section never decides the lane; it only feeds the first-run section mapping.
const defaultStage = (session: Session): string => (session.running ? DOING : NO_STATUS)

export const stageOf = (session: Session, saved: SavedStages): string => {
  const stage = saved[session.id]?.stage
  return stage && LANE_IDS.has(stage) ? stage : defaultStage(session)
}

// Not really placed: nothing saved, "Sem status" saved, or a lane that no longer exists.
export const isUnplaced = (session: Session, saved: SavedStages): boolean => {
  const stage = saved[session.id]?.stage
  return !stage || stage === NO_STATUS || !LANE_IDS.has(stage)
}
