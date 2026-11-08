import type { EngineInterface } from 'claude-code'

import type { Group } from '../types'

// The desktop app's own tools (Code tab), reached through its MCP servers.

type ToolResult = { content?: ReadonlyArray<{ type: string; text?: string }>; isError?: boolean }
export type RawSession = Record<string, unknown>

const SESSION_LIST_LIMIT = 3000
const TRANSCRIPT_HITS_LIMIT = 200
const OPEN_LINK_TIMEOUT_MS = 10_000
// The app saves an oversized result to a file and answers with an error that names the path.
const SAVED_TO_FILE = /saved to (\/[^\s"']+?\.txt)\b/

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const textOf = (result: ToolResult | undefined): string =>
  (result?.content ?? []).filter(block => block.type === 'text').map(block => block.text ?? '').join('\n')

async function callApp($: EngineInterface, server: string, tool: string, args?: Record<string, unknown>): Promise<string> {
  const result = (await $.mcp.call(server, tool, args)) as unknown as ToolResult | undefined
  const text = textOf(result)
  if (result?.isError) throw new Error(text || `${server} ${tool} failed`)
  const savedTo = SAVED_TO_FILE.exec(text)
  if (savedTo?.[1] && text.trimStart().startsWith('Error:')) {
    const full = await $.fs.read(savedTo[1])
    return typeof full === 'string' ? full : ''
  }
  return text
}

export async function listRawSessions($: EngineInterface): Promise<RawSession[]> {
  return JSON.parse(await callApp($, 'ccd_session_mgmt', 'list_sessions', { limit: SESSION_LIST_LIMIT })) as RawSession[]
}

export async function listGroups($: EngineInterface): Promise<Group[]> {
  const raw = JSON.parse(await callApp($, 'ccd_sidebar', 'list_groups')) as Array<{ id: string; name: string }>
  return raw.map(group => ({ id: group.id, name: group.name }))
}

export function archiveSession($: EngineInterface, id: string, reason: string): Promise<string> {
  return callApp($, 'ccd_session_mgmt', 'archive_session', { session_id: id, reason })
}

export function unarchiveSession($: EngineInterface, id: string): Promise<string> {
  return callApp($, 'ccd_session_mgmt', 'unarchive_session', { session_id: id })
}

export function renameSession($: EngineInterface, id: string, title: string): Promise<string> {
  return callApp($, 'ccd_session_mgmt', 'set_session_title', { session_id: id, title })
}

export function setPinned($: EngineInterface, id: string, pinned: boolean): Promise<string> {
  return callApp($, 'ccd_sidebar', 'set_pinned', { session_id: id, pinned })
}

// An empty section id moves the session back to the ungrouped list.
export function moveToSection($: EngineInterface, id: string, sectionId: string): Promise<string> {
  return callApp($, 'ccd_sidebar', 'move_sessions', sectionId ? { session_ids: [id], group_id: sectionId } : { session_ids: [id], section_id: 'sessions' })
}

export async function searchTranscripts($: EngineInterface, query: string): Promise<string[]> {
  const text = await callApp($, 'ccd_session_mgmt', 'search_session_transcripts', { query, limit: TRANSCRIPT_HITS_LIMIT })
  const ids = new Set<string>()
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (typeof record.sessionId === 'string') ids.add(record.sessionId)
    Object.values(record).forEach(collect)
  }
  collect(JSON.parse(text))
  return [...ids]
}

export async function fetchThisSessionId($: EngineInterface): Promise<string | null> {
  const session = JSON.parse(await callApp($, 'ccd_session_mgmt', 'get_session', { session_id: 'self' })) as { sessionId?: unknown }
  return typeof session.sessionId === 'string' ? session.sessionId : null
}

// The pane belongs to this session. In a window of its own, the board stays on screen when
// "Abrir" brings another session to the main window. Answers whether it moved the session.
export async function moveThisSessionToOwnWindow($: EngineInterface): Promise<boolean> {
  const layout = JSON.parse(await callApp($, 'ccd_window', 'get_window_layout')) as { this_session?: { shown_in?: string } }
  if ((layout.this_session?.shown_in ?? '').includes('pop-out')) return false
  await callApp($, 'ccd_window', 'open_session_in', { session_id: 'self', target: 'window' })
  return true
}

// The app's window tool only opens sessions this one started, so any session opens through the
// app's own link, handed to macOS. Answers null on success, or what the system said.
export async function openSessionLink($: EngineInterface, id: string): Promise<string | null> {
  const result = await $.process.run(['open', `claude://claude.ai/epitaxy/${id}`], { timeoutMs: OPEN_LINK_TIMEOUT_MS })
  return result.exitCode === 0 ? null : (result.stderr || result.stdout).trim()
}
