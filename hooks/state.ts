import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { BatchProgress, Group, SavedStages, Session } from '../types'
import { CARDS_PER_PAGE, DEFAULT_SHOW, DEFAULT_SORT, LANES } from './constants'

// Values kept for the session. The pane reads them while drawing, and a write redraws it.
// The engine only accepts state references declared in the file that reads or writes them, so
// every other module goes through the functions below.

const search = atom({ plugin: 'kanban-for-claude', key: 'search' } as const, '')
const show = atom({ plugin: 'kanban-for-claude', key: 'show' } as const, DEFAULT_SHOW as string)
const sortBy = atom({ plugin: 'kanban-for-claude', key: 'sortBy' } as const, DEFAULT_SORT as string)
const transcriptHits = atom({ plugin: 'kanban-for-claude', key: 'transcriptHits' } as const, null as string[] | null)
const confirmingArchive = atom({ plugin: 'kanban-for-claude', key: 'confirmingArchive' } as const, null as string | null)
const notice = atom({ plugin: 'kanban-for-claude', key: 'notice' } as const, '')
const loadedAt = atom({ plugin: 'kanban-for-claude', key: 'loadedAt' } as const, 0)
const loading = atom({ plugin: 'kanban-for-claude', key: 'loading' } as const, false)
const shownPerLane = atom({ plugin: 'kanban-for-claude', key: 'shownPerLane' } as const, {} as Record<string, number>)
const firstLane = atom({ plugin: 'kanban-for-claude', key: 'firstLane' } as const, 0)
const batchProgress = atom({ plugin: 'kanban-for-claude', key: 'batchProgress' } as const, null as BatchProgress | null)
// null when the store cannot be read: the board then opens without the first-run question
const setupDone = atom({ plugin: 'kanban-for-claude', key: 'setupDone' } as const, null as boolean | null)
const sectionChoices = atom({ plugin: 'kanban-for-claude', key: 'sectionChoices' } as const, {} as Record<string, string>)
const waiting = atom({ plugin: 'kanban-for-claude', key: 'waiting' } as const, [] as string[])
const sessions = atom({ plugin: 'kanban-for-claude', key: 'sessions' } as const, [] as Session[], { shape: 'sessions-1' })
const groups = atom({ plugin: 'kanban-for-claude', key: 'groups' } as const, [] as Group[], { shape: 'groups-1' })
const stages = atom({ plugin: 'kanban-for-claude', key: 'stages' } as const, {} as SavedStages, { shape: 'stages-1' })

// Everything the pane draws from.
export type PaneView = {
  list: Session[]
  sectionGroups: Group[]
  saved: SavedStages
  query: string
  show: string
  sortBy: string
  hits: string[] | null
  confirming: string | null
  notice: string
  loadedAt: number
  shownPerLane: Record<string, number>
  firstLane: number
  progress: BatchProgress | null
  setupDone: boolean | null
  choices: Record<string, string>
  waiting: string[]
}

export type FilterValues = { query: string; show: string; transcriptHits: string[] | null; waiting: string[] }

// The board shifts sideways with the arrows: lanes keep a fixed width and never wrap.
export const clampFirstLane = (value: number): number => Math.min(Math.max(0, Number.isFinite(value) ? value : 0), LANES.length - 1)

// Reading while drawing subscribes the pane: a later write to any of these redraws it.
export async function readPaneView($: EngineInterface): Promise<PaneView> {
  const [list, sectionGroups, saved, query, showValue, sortValue, hits, confirming, noticeText, loaded, shown, first, progress, done, choices, waitingIds] =
    await Promise.all([
      read($, sessions),
      read($, groups),
      read($, stages),
      read($, search),
      read($, show),
      read($, sortBy),
      read($, transcriptHits),
      read($, confirmingArchive),
      read($, notice),
      read($, loadedAt),
      read($, shownPerLane),
      read($, firstLane),
      read($, batchProgress),
      read($, setupDone),
      read($, sectionChoices),
      read($, waiting),
    ])
  return {
    list,
    sectionGroups,
    saved,
    query,
    show: showValue,
    sortBy: sortValue,
    hits,
    confirming,
    notice: noticeText,
    loadedAt: loaded,
    shownPerLane: shown,
    firstLane: first,
    progress,
    setupDone: done,
    choices,
    waiting: waitingIds,
  }
}

export async function readFilterValues($: EngineInterface): Promise<FilterValues> {
  const [query, showValue, hits, waitingIds] = await Promise.all([read($, search), read($, show), read($, transcriptHits), read($, waiting)])
  return { query, show: showValue, transcriptHits: hits, waiting: waitingIds }
}

export function readSessions($: EngineInterface): Promise<Session[]> {
  return read($, sessions)
}

export function readGroups($: EngineInterface): Promise<Group[]> {
  return read($, groups)
}

export function readStages($: EngineInterface): Promise<SavedStages> {
  return read($, stages)
}

export function readSetupDone($: EngineInterface): Promise<boolean | null> {
  return read($, setupDone)
}

export function readSectionChoices($: EngineInterface): Promise<Record<string, string>> {
  return read($, sectionChoices)
}

export function readWaiting($: EngineInterface): Promise<string[]> {
  return read($, waiting)
}

export async function writeSessions($: EngineInterface, change: (current: Session[]) => Session[]): Promise<void> {
  await update($, sessions, change)
}

export async function writeGroups($: EngineInterface, value: Group[]): Promise<void> {
  await update($, groups, () => value)
}

export async function writeStages($: EngineInterface, change: (current: SavedStages) => SavedStages): Promise<void> {
  await update($, stages, change)
}

export async function writeLoading($: EngineInterface, value: boolean): Promise<void> {
  await update($, loading, () => value)
}

export async function writeLoaded($: EngineInterface): Promise<void> {
  await update($, loadedAt, () => Date.now())
  await update($, notice, () => '')
}

export async function writeNotice($: EngineInterface, text: string): Promise<void> {
  await update($, notice, () => text)
}

export async function writeSetupDone($: EngineInterface, value: boolean | null): Promise<void> {
  await update($, setupDone, () => value)
}

export async function writeSectionChoice($: EngineInterface, sectionId: string, stage: string): Promise<void> {
  await update($, sectionChoices, current => ({ ...current, [sectionId]: stage }))
}

export async function writeWaiting($: EngineInterface, ids: string[]): Promise<void> {
  await update($, waiting, () => ids)
}

export async function writeBatchProgress($: EngineInterface, value: BatchProgress | null): Promise<void> {
  await update($, batchProgress, () => value)
}

export async function writeConfirmingArchive($: EngineInterface, id: string | null): Promise<void> {
  await update($, confirmingArchive, () => id)
}

export async function writeTranscriptHits($: EngineInterface, ids: string[] | null): Promise<void> {
  await update($, transcriptHits, () => ids)
}

export async function writeSearch($: EngineInterface, query: string): Promise<void> {
  await update($, search, () => query)
}

export async function writeShow($: EngineInterface, value: string): Promise<void> {
  await update($, show, () => value)
}

export async function writeSortBy($: EngineInterface, value: string): Promise<void> {
  await update($, sortBy, () => value)
}

export async function showMoreCards($: EngineInterface, stage: string): Promise<void> {
  await update($, shownPerLane, current => ({ ...current, [stage]: (current[stage] ?? CARDS_PER_PAGE) + CARDS_PER_PAGE }))
}

export async function resetPaging($: EngineInterface): Promise<void> {
  await update($, shownPerLane, () => ({}))
}

export async function shiftFirstLane($: EngineInterface, step: number): Promise<void> {
  await update($, firstLane, current => clampFirstLane(current + step))
}
