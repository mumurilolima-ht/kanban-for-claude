import type { Session } from '../types'
import { NO_SECTION_LABEL } from './constants'

export type BoardFilter = {
  query: string
  show: string
  transcriptHits: string[] | null
  waiting: ReadonlySet<string>
}

const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const passesShowFilter = (session: Session, { show, waiting }: BoardFilter): boolean => {
  switch (show) {
    case 'running':
      return session.running
    case 'pinned':
      return session.pinned
    case 'waiting':
      return waiting.has(session.id)
    case 'with-section':
      return session.section !== null || session.running || session.pinned || waiting.has(session.id)
    default:
      return true
  }
}

// Title, section and PR match at once; the app's transcript search adds its hits when it answers.
const matchesQuery = (session: Session, { query, transcriptHits }: BoardFilter): boolean => {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = fold(`${session.title} ${session.section ?? NO_SECTION_LABEL} ${session.pr ?? ''}`)
  return terms.every(term => haystack.includes(term)) || (transcriptHits?.includes(session.id) ?? false)
}

export const isVisible = (session: Session, filter: BoardFilter): boolean => passesShowFilter(session, filter) && matchesQuery(session, filter)

// Sessions without a known creation date go last.
const compareOldestFirst = (a: string, b: string): number => {
  if (!a) return b ? 1 : 0
  return b ? a.localeCompare(b) : -1
}

export const compareSessions = (sortBy: string): ((a: Session, b: Session) => number) => {
  switch (sortBy) {
    case 'idle':
      return (a, b) => a.lastActivity.localeCompare(b.lastActivity)
    case 'newest':
      return (a, b) => b.createdAt.localeCompare(a.createdAt)
    case 'oldest':
      return (a, b) => compareOldestFirst(a.createdAt, b.createdAt)
    case 'title':
      return (a, b) => a.title.localeCompare(b.title, 'pt-BR')
    default:
      return (a, b) => Number(b.running) - Number(a.running) || b.lastActivity.localeCompare(a.lastActivity)
  }
}

// The app refuses to archive pinned or running sessions, so "[ARQUIVAR TODAS]" leaves them in the lane.
export const splitArchiveBatch = (lane: Session[]): { archivable: Session[]; skipped: Session[] } => ({
  archivable: lane.filter(session => !session.pinned && !session.running),
  skipped: lane.filter(session => session.pinned || session.running),
})
