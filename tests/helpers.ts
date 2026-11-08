import type { On } from 'claude-code'

// Shared fixtures and fakes for the tests. Lane names, labels and toasts are the mod's pt-BR UI copy.

export const PANE = {
  plugin: 'kanban-for-claude',
  component: 'Pane',
  requestId: 'kanban',
  props: { title: 'Kanban de Sessões', isFocused: false, bodyColumns: 180, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
export const BOARD = 'board'
export const SAVED_AT = '2026-11-08T10:00:00Z'

export type RawSession = {
  sessionId: string
  title: string
  group: { id: string; name: string } | null
  isRunning: boolean
  pinned: boolean
  lastActivityAt: string
  startedBy?: string
}

export const GROUPS = [
  { id: 'cg-1', name: 'SALES BOT' },
  { id: 'cg-2', name: 'PRIORITY' },
  { id: 'cg-3', name: 'DONE' },
]

// As the app lists them, most recent first. The lanes are 28 cells wide (26 inside the border),
// so card titles wrap at 24: a1 takes two lines, b2 is long enough to be cut, c3 takes one.
export const RAW_SESSIONS: RawSession[] = [
  { sessionId: 'local_a1', title: 'Weekly sales pipeline review', group: GROUPS[0] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-07T15:00:00Z' },
  { sessionId: 'local_b2', title: 'Tax reform guide for presumed profit companies', group: GROUPS[1] ?? null, isRunning: false, pinned: true, lastActivityAt: '2026-11-07T14:00:00Z' },
  { sessionId: 'local_c3', title: 'Sales proposal', group: GROUPS[2] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-06T10:00:00Z' },
  { sessionId: 'local_d4', title: 'October closing', group: GROUPS[0] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-05T10:00:00Z' },
]

// A family: the parent started the child, and the child started the grandchild.
export const FAMILY: RawSession[] = [
  { sessionId: 'local_m1', title: 'Payroll closing', group: GROUPS[0] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-08T12:00:00Z' },
  { sessionId: 'local_f1', title: 'Termination simulation', group: GROUPS[0] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-08T11:00:00Z', startedBy: 'local_m1' },
  { sessionId: 'local_n1', title: 'Check severance figures', group: GROUPS[0] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-08T10:00:00Z', startedBy: 'local_f1' },
  { sessionId: 'local_x1', title: 'Another conversation', group: GROUPS[1] ?? null, isRunning: false, pinned: false, lastActivityAt: '2026-11-08T09:00:00Z' },
]

export const toSession = (raw: RawSession) => ({
  id: raw.sessionId,
  title: raw.title,
  section: raw.group?.name ?? null,
  sectionId: raw.group?.id ?? null,
  running: raw.isRunning,
  pinned: raw.pinned,
  lastActivity: raw.lastActivityAt,
  createdAt: '',
  pr: null,
  parentId: raw.startedBy ?? null,
})

export const mcpText = (text: string) => ({ value: { content: [{ type: 'text', text }], isError: false } })

// Session start with the commands registered and nothing else in the way.
export const sessionStart = (on: On): void => {
  on('command.register', (_, e) => ({ value: { command: (e as { name: string }).name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

// Resolves when a state value is written the way a test waits for (a background refresh, a batch).
export const watchWrites = () => {
  const waiters: Array<{ key: string; matches: (value: unknown) => boolean; resolve: () => void }> = []
  return {
    onWrite: (key: string, value: unknown): void => {
      for (const waiter of [...waiters]) {
        if (waiter.key !== key || !waiter.matches(value)) continue
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve()
      }
    },
    next: (key: string, matches: (value: unknown) => boolean = () => true): Promise<void> => new Promise(resolve => waiters.push({ key, matches, resolve })),
  }
}

// State that remembers: what is written is read back, with versions and conditional writes.
export const realState = (on: On, values: Record<string, unknown>, onWrite?: (key: string, value: unknown) => void) => {
  const memory = new Map<string, { value: unknown; version: number }>(Object.entries(values).map(([key, value]) => [key, { value, version: 1 }]))
  on('state.get', (_, e) => ({ value: memory.get((e as { key: string }).key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_, e) => {
    const { key, value, ifVersion } = e as { key: string; value: unknown; ifVersion?: number }
    const stored = memory.get(key) ?? { value: undefined, version: 0 }
    if (ifVersion !== undefined && ifVersion !== stored.version) return { value: { isSet: false, version: stored.version } }
    memory.set(key, { value, version: stored.version + 1 })
    onWrite?.(key, value)
    return { value: { isSet: true, version: stored.version + 1 } }
  })
  return memory
}

// The board's state with the given sessions and saved stages already loaded.
export const boardState = (on: On, options: { sessions?: RawSession[]; stages?: Record<string, unknown>; onWrite?: (key: string, value: unknown) => void } = {}) =>
  realState(
    on,
    {
      sessions: { shape: 'sessions-1', value: (options.sessions ?? RAW_SESSIONS).map(toSession) },
      groups: { shape: 'groups-1', value: GROUPS },
      stages: { shape: 'stages-1', value: options.stages ?? {} },
      loadedAt: Date.now(),
    },
    options.onWrite,
  )

// State that always answers the same values and keeps no write: for tests that only draw.
export const fixedState = (on: On): void => {
  sessionStart(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const fixed: Record<string, unknown> = {
    sessions: { shape: 'sessions-1', value: RAW_SESSIONS.slice(0, 3).map(toSession) },
    groups: { shape: 'groups-1', value: GROUPS },
    stages: { shape: 'stages-1', value: {} },
    loadedAt: Date.now(),
  }
  on('state.get', (_, e) => {
    const key = (e as { key?: string }).key ?? ''
    return key in fixed ? { value: { value: fixed[key], version: 1 } } : { value: { value: undefined, version: 0 } }
  })
}

// The mod's store: the saved stages, which another board (another app window) may change from
// outside, and the other keys. By default the first-run mapping was answered, so the board opens.
export const fakeStore = (on: On, stages: unknown, others: Record<string, unknown> = { sectionMapping: { at: SAVED_AT, applied: false, mapping: {} } }) => {
  const store = { stages, stageWrites: 0, others: { ...others } as Record<string, unknown>, writtenKeys: [] as string[] }
  on('store.get', (_, e) => {
    const key = (e as { key: string }).key
    return { value: key === 'stages' ? store.stages : store.others[key] }
  })
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    if (key === 'stages') {
      store.stages = value
      store.stageWrites += 1
    } else {
      store.others[key] = value
      store.writtenKeys.push(key)
    }
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...(store.stages !== undefined ? ['stages'] : []), ...Object.keys(store.others)] }))
  on('store.delete', (_, e) => {
    const key = (e as { key: string }).key
    if (key === 'stages') store.stages = undefined
    else delete store.others[key]
    return { value: undefined }
  })
  return store
}

// No session registry folder: cards just show no creation date.
export const noAppRegistry = (on: On): void => {
  on('env.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
}

// The app's tools: lists the sessions not archived and records every call. Archiving and
// unarchiving change the list; each test says what the app archives along or refuses.
export const fakeApp = (
  on: On,
  all: RawSession[],
  archive: (id: string, archived: Set<string>) => string = (id, archived) => {
    archived.add(id)
    return `Archived ${id}`
  },
) => {
  const archived = new Set<string>()
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = []
  const toasts: string[] = []
  on('mcp.call', (_, e) => {
    const { tool, args } = e as { tool: string; args: Record<string, unknown> }
    calls.push({ tool, args })
    if (tool === 'list_sessions') return mcpText(JSON.stringify(all.filter(session => !archived.has(session.sessionId))))
    if (tool === 'list_groups') return mcpText(JSON.stringify(GROUPS))
    if (tool === 'archive_session') return mcpText(archive(String(args.session_id), archived))
    if (tool === 'unarchive_session') {
      archived.delete(String(args.session_id))
      return mcpText('Unarchived')
    }
    return mcpText('ok')
  })
  on('ui.toast', (_, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  return { archived, calls, toasts, lastToast: () => toasts[toasts.length - 1] ?? '' }
}

// Finds the drawn element with a key (the key may sit on the element or in its props).
export const findByKey = (node: unknown, key: string): unknown => {
  if (!node || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByKey(child, key)
      if (found) return found
    }
    return undefined
  }
  const record = node as Record<string, unknown>
  const props = (record.props ?? {}) as Record<string, unknown>
  if (record.key === key || props.key === key) return record
  for (const value of Object.values(record)) {
    const found = findByKey(value, key)
    if (found) return found
  }
  return undefined
}

export const drawnText = (node: unknown, key: string): string => JSON.stringify(findByKey(node, key)) ?? ''
