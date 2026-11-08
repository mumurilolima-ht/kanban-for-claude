import type { EngineInterface } from 'claude-code'

import type { Session } from '../types'
import { writeSessions } from './state'

// Creation dates are not in the app's session list. They come from the registry the app keeps on
// disk, one JSON file per session, read in the background in batches.

const BATCH_SIZE = 300
const createdAtById = new Map<string, string>()
let registryFolders: string[] | null = null
let filling = false

export const knownCreatedAt = (id: string): string => createdAtById.get(id) ?? ''

async function findRegistryFolders($: EngineInterface): Promise<string[]> {
  if (registryFolders) return registryFolders
  const home = (await $.env.get('HOME')) ?? $.plugin.root.split('/.claude/')[0] ?? ''
  const base = `${home}/Library/Application Support/Claude/claude-code-sessions`
  const found: string[] = []
  try {
    for (const account of await $.fs.list(base)) {
      if (account.kind !== 'dir') continue
      for (const org of await $.fs.list(`${base}/${account.name}`)) if (org.kind === 'dir') found.push(`${base}/${account.name}/${org.name}`)
    }
  } catch {
    // no registry folder: cards just show no creation date
  }
  registryFolders = found
  return found
}

async function readCreatedAt($: EngineInterface, folders: string[], id: string): Promise<string> {
  for (const folder of folders) {
    try {
      const record = JSON.parse(String(await $.fs.read(`${folder}/${id}.json`))) as { createdAt?: unknown }
      return typeof record.createdAt === 'number' ? new Date(record.createdAt).toISOString() : ''
    } catch {
      // not in this folder
    }
  }
  return ''
}

const withCreatedAt = (session: Session): Session => {
  const createdAt = createdAtById.get(session.id)
  return !session.createdAt && createdAt ? { ...session, createdAt } : session
}

export async function fillCreatedDates($: EngineInterface, list: Session[]): Promise<void> {
  if (filling) return
  const missing = list.filter(session => !createdAtById.has(session.id)).slice(0, BATCH_SIZE)
  if (!missing.length) return
  filling = true
  try {
    const folders = await findRegistryFolders($)
    for (const session of missing) createdAtById.set(session.id, await readCreatedAt($, folders, session.id))
    await writeSessions($, current => current.map(withCreatedAt))
  } finally {
    filling = false
  }
  if (list.some(session => !createdAtById.has(session.id))) void fillCreatedDates($, list).catch(() => undefined)
}
