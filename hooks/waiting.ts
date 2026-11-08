import type { EngineInterface } from 'claude-code'

import { fetchThisSessionId } from './app'
import { WAITING_GRACE_MS, WAITING_HEARTBEAT_MS, WAITING_KEY_PREFIX, WAITING_STALE_MS } from './constants'
import { readWaiting, writeWaiting } from './state'

// Every session reports in the store when it stops to wait for the person: one key per session,
// renewed while it waits and deleted once the person answers. Boards read those keys.

type Timer = { cancel: () => void }

// ---- reporting side, in every session ----

let thisSessionId: string | null | undefined // the app's id for this session (local_…); undefined until asked
const pendingCalls = new Set<string>()
let reported = false
let waitingSince = ''
let waitingTool = ''
let graceTimer: Timer | null = null
let heartbeat: Timer | null = null

async function ownSessionId($: EngineInterface): Promise<string | null> {
  if (thisSessionId !== undefined) return thisSessionId
  try {
    thisSessionId = await fetchThisSessionId($)
  } catch {
    thisSessionId = null // outside the desktop app there is no board to tell
  }
  return thisSessionId
}

async function writeReport($: EngineInterface): Promise<void> {
  const id = await ownSessionId($)
  if (!id || !reported) return
  try {
    await $.store.set(`${WAITING_KEY_PREFIX}${id}`, { since: waitingSince, seen: new Date().toISOString(), tool: waitingTool })
  } catch {
    // store unavailable: boards just do not learn about it
  }
}

// A tool call is about to be put to the person; it is reported if still unanswered after the grace period.
export function startWaiting($: EngineInterface, toolUseId: string, tool: string): void {
  pendingCalls.add(toolUseId)
  if (reported || graceTimer) return
  graceTimer = $.clock.after(WAITING_GRACE_MS, () => {
    graceTimer = null
    if (!pendingCalls.size) return
    reported = true
    waitingSince = new Date().toISOString()
    waitingTool = tool
    void writeReport($)
  })
}

export const isWaiting = (): boolean => pendingCalls.size > 0 || reported

export async function stopWaiting($: EngineInterface): Promise<void> {
  pendingCalls.clear()
  graceTimer?.cancel()
  graceTimer = null
  if (!reported) return
  reported = false
  const id = await ownSessionId($)
  if (!id) return
  try {
    await $.store.delete(`${WAITING_KEY_PREFIX}${id}`)
  } catch {
    // boards drop the report once it goes stale
  }
}

// An approved call runs with the same tool_use_id as its ask.
export function resolveCall($: EngineInterface, toolUseId: string | undefined): void {
  if (!toolUseId || !pendingCalls.delete(toolUseId)) return
  if (!pendingCalls.size) void stopWaiting($)
}

// Keeps the report fresh; without renewals, boards treat it as a session that closed while waiting.
export function startHeartbeat($: EngineInterface): void {
  heartbeat?.cancel()
  heartbeat = $.clock.every(WAITING_HEARTBEAT_MS, () => {
    if (reported) void writeReport($)
  })
}

// ---- board side ----

// Ids of the sessions waiting now; stale reports are deleted.
async function readWaitingIds($: EngineInterface): Promise<string[] | null> {
  try {
    const keys = (await $.store.keys()).filter(key => key.startsWith(WAITING_KEY_PREFIX))
    const now = Date.now()
    const ids: string[] = []
    for (const key of keys) {
      const report = (await $.store.get(key)) as { seen?: unknown } | undefined
      const seen = typeof report?.seen === 'string' ? Date.parse(report.seen) : NaN
      if (Number.isFinite(seen) && now - seen <= WAITING_STALE_MS) ids.push(key.slice(WAITING_KEY_PREFIX.length))
      else void $.store.delete(key).catch(() => undefined)
    }
    return ids
  } catch {
    return null
  }
}

export async function reloadWaiting($: EngineInterface): Promise<void> {
  const ids = await readWaitingIds($)
  if (ids === null) return
  const current = await readWaiting($)
  const changed = current.length !== ids.length || ids.some(id => !current.includes(id))
  if (changed) await writeWaiting($, ids)
}
