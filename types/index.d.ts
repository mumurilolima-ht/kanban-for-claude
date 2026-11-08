// What the hooks module keeps, and what the board's surface module receives and sends back.

export type Session = {
  id: string
  title: string
  section: string | null
  sectionId: string | null
  running: boolean
  pinned: boolean
  lastActivity: string
  createdAt: string // '' until it is read from the app's session registry
  pr: string | null
  parentId: string | null // the session that started this one, for a linked side session
}

export type Group = { id: string; name: string }

export type SavedStage = { stage: string; at: string }
export type SavedStages = Record<string, SavedStage>

export type Card = {
  id: string
  title: string
  sectionId: string | null
  color: string
  running: boolean
  pinned: boolean
  waiting: boolean // stopped, waiting for the person to approve or answer something
  pr: string | null
  lastActivityLabel: string
  createdLabel: string
}
export type Lane = { id: string; name: string; color: string; total: number; hidden: number; cards: Card[] }
export type BatchProgress = { done: number; total: number }
// The "Arquivar" lane: what its button archives, what the app would refuse (pinned or running) and the progress.
export type ArchiveBatch = { archivable: number; skipped: number; progress: BatchProgress | null }
export type BoardProps = {
  lanes: Lane[]
  laneWidth: number
  confirmingArchive: string | null
  sections: Group[]
  batch: ArchiveBatch
}
export type BoardMessage =
  | { type: 'move'; id: string; stage: string }
  | { type: 'open'; id: string }
  | { type: 'showMore'; stage: string }
  | { type: 'setSection'; id: string; sectionId: string }
  | { type: 'askArchive'; id: string | null }
  | { type: 'archive'; id: string }
  | { type: 'rename'; id: string; title: string }
  | { type: 'archiveAll'; count: number }

declare module 'claude-code' {
  interface PluginState {
    'kanban-for-claude': {
      search: string
      show: string
      sortBy: string
      transcriptHits: string[] | null
      confirmingArchive: string | null
      notice: string
      loadedAt: number
      loading: boolean
      shownPerLane: Record<string, number>
      firstLane: number
      batchProgress: BatchProgress | null
      setupDone: boolean | null
      sectionChoices: Record<string, string>
      waiting: string[]
      sessions: Shaped<Session[]>
      groups: Shaped<Group[]>
      stages: Shaped<SavedStages>
    }
  }
}
