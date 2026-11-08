import type { EngineInterface } from 'claude-code'

import type { Session } from '../types'
import { errorMessage, listGroups, listRawSessions, type RawSession } from './app'
import { SECTION_MAPPING_KEY } from './constants'
import { fillCreatedDates, knownCreatedAt } from './session-dates'
import { reloadSavedStages } from './stages'
import { readSetupDone, writeGroups, writeLoaded, writeLoading, writeNotice, writeSessions, writeSetupDone } from './state'

const toSession = (raw: RawSession): Session => {
  const group = raw.group as { id?: string; name?: string } | null | undefined
  const id = String(raw.sessionId)
  return {
    id,
    title: String(raw.title ?? '(sem título)'),
    section: group?.name ?? null,
    sectionId: group?.id ?? null,
    running: raw.isRunning === true,
    pinned: raw.pinned === true,
    lastActivity: typeof raw.lastActivityAt === 'string' ? raw.lastActivityAt : '',
    createdAt: knownCreatedAt(id),
    pr: raw.prNumber ? `#${String(raw.prNumber)} ${String(raw.prState ?? '')}`.trim() : null,
    parentId: typeof raw.startedBy === 'string' ? raw.startedBy : null,
  }
}

// The first-run question may have been answered in another session or window meanwhile.
async function refreshSetupDone($: EngineInterface): Promise<void> {
  if ((await readSetupDone($)) !== false) return
  try {
    if ((await $.store.get(SECTION_MAPPING_KEY)) !== undefined) await writeSetupDone($, true)
  } catch {
    // store unavailable: keep asking
  }
}

// Re-reads sessions, sections and saved stages; answers whether it worked.
export async function refreshBoard($: EngineInterface): Promise<boolean> {
  await writeLoading($, true)
  try {
    const [rawSessions, sectionGroups] = await Promise.all([listRawSessions($), listGroups($)])
    const list = rawSessions.map(toSession)
    await writeSessions($, () => list)
    await writeGroups($, sectionGroups)
    await reloadSavedStages($)
    await refreshSetupDone($)
    await writeLoaded($)
    // runs in the background; if the session closes meanwhile, the dates wait for the next refresh
    void fillCreatedDates($, list).catch(() => undefined)
    return true
  } catch (error) {
    await writeNotice($, `Não consegui ler as sessões do app: ${errorMessage(error).slice(0, 160)}`)
    return false
  } finally {
    await writeLoading($, false)
  }
}
