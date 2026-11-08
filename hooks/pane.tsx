import type { Elements, EngineInterface } from 'claude-code'

import type { BoardProps, Card, Group, Lane, SavedStages, Session } from '../types'
import { scheduleTranscriptSearch } from './actions'
import {
  ARCHIVE,
  BOARD_ELEMENT,
  CARDS_PER_PAGE,
  DEFAULT_SHOW,
  LANES,
  MAX_CARDS_ON_BOARD,
  MAX_CARDS_PER_LANE,
  MIN_LANE_WIDTH,
  NO_SECTION_LABEL,
  SECTION_COLORS,
  SHOW_OPTIONS,
  SORT_OPTIONS,
  TRANSCRIPT_SEARCH_MIN_CHARS,
} from './constants'
import { compareSessions, isVisible, splitArchiveBatch } from './filters'
import { relativeTime, shortDate } from './format'
import { renderSetup } from './setup'
import { stageOf } from './stages'
import { clampFirstLane, readPaneView, resetPaging, shiftFirstLane, writeSearch, writeShow, writeSortBy, type PaneView } from './state'

// The pane: header, toolbar and the board, which the surface module in board.tsx draws.

// The section picker shows the longest section name plus its arrow; a lane fits dot, picker and borders.
const PICKER_EXTRA_WIDTH = 10

const groupByStage = (visible: Session[], saved: SavedStages): Map<string, Session[]> => {
  const byStage = new Map<string, Session[]>(LANES.map(lane => [lane.id, []]))
  for (const session of visible) byStage.get(stageOf(session, saved))?.push(session)
  return byStage
}

const cardFactory = (view: PaneView, waitingIds: ReadonlySet<string>, now: number): ((session: Session) => Card) => {
  const colorBySection = new Map(view.sectionGroups.map((group, index) => [group.id, SECTION_COLORS[index % SECTION_COLORS.length] ?? 'text']))
  const showCreated = view.sortBy === 'newest' || view.sortBy === 'oldest'
  const colorOf = (session: Session): string => {
    if (session.pinned) return 'text'
    return session.sectionId === null ? 'subtle' : colorBySection.get(session.sectionId) ?? 'text'
  }
  return session => ({
    id: session.id,
    title: session.title,
    sectionId: session.sectionId,
    color: colorOf(session),
    running: session.running,
    pinned: session.pinned,
    waiting: waitingIds.has(session.id),
    pr: session.pr,
    lastActivityLabel: relativeTime(session.lastActivity, now),
    createdLabel: showCreated && session.createdAt ? shortDate(session.createdAt) : '',
  })
}

// Cards are shown a page at a time per lane, within a budget for the whole board.
const buildLanes = (byStage: Map<string, Session[]>, view: PaneView, toCard: (session: Session) => Card): Lane[] => {
  let budget = MAX_CARDS_ON_BOARD
  return LANES.slice(clampFirstLane(view.firstLane)).map(lane => {
    const items = byStage.get(lane.id) ?? []
    const limit = Math.min(view.shownPerLane[lane.id] ?? CARDS_PER_PAGE, MAX_CARDS_PER_LANE, Math.max(CARDS_PER_PAGE, budget))
    budget = Math.max(0, budget - Math.min(limit, items.length))
    // "Mais" goes up to the per-lane limit; past it, search and filters narrow the lane
    const hidden = limit >= MAX_CARDS_PER_LANE ? 0 : Math.max(0, items.length - limit)
    return { id: lane.id, name: lane.name, color: lane.color, total: items.length, hidden, cards: items.slice(0, limit).map(toCard) }
  })
}

const laneWidthFor = (sectionGroups: Group[]): number =>
  Math.max(MIN_LANE_WIDTH, sectionGroups.reduce((max, group) => Math.max(max, group.name.length), NO_SECTION_LABEL.length) + PICKER_EXTRA_WIDTH)

const buildBoard = (view: PaneView, now: number): { visibleCount: number; props: BoardProps } => {
  const waitingIds = new Set(view.waiting)
  const filter = { query: view.query, show: view.show, transcriptHits: view.hits, waiting: waitingIds }
  const visible = view.list.filter(session => isVisible(session, filter)).sort(compareSessions(view.sortBy))
  const byStage = groupByStage(visible, view.saved)
  const batch = splitArchiveBatch(byStage.get(ARCHIVE) ?? [])
  return {
    visibleCount: visible.length,
    props: {
      lanes: buildLanes(byStage, view, cardFactory(view, waitingIds, now)),
      laneWidth: laneWidthFor(view.sectionGroups),
      confirmingArchive: view.confirming,
      sections: [...view.sectionGroups].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      batch: { archivable: batch.archivable.length, skipped: batch.skipped.length, progress: view.progress },
    },
  }
}

function renderToolbar($: EngineInterface, ui: Elements['desktop'], view: PaneView) {
  const { Box, Button, Input, Select } = ui
  const firstLane = clampFirstLane(view.firstLane)
  const setQuery = (value: string): void => {
    void writeSearch($, value)
    scheduleTranscriptSearch($, value)
  }
  return (
    <Box flexDirection="row" flexWrap="nowrap" gap={1} alignItems="center" justifyContent="space-between">
      <Box flexDirection="row" flexWrap="nowrap" gap={1} alignItems="center" flexGrow={1} flexShrink={1}>
        <Box flexGrow={0} flexShrink={1} minWidth={12}>
          <Input
            key="search"
            placeholder="Buscar no título, na seção ou no texto da conversa…"
            value={view.query}
            onInput={value => {
              setQuery(value)
              void resetPaging($)
            }}
            onSubmit={setQuery}
          />
        </Box>
        <Box flexShrink={0}>
          <Select key="sort" label="Ordenar" options={SORT_OPTIONS.map(option => ({ value: option.id, label: option.label }))} value={view.sortBy} onSelect={value => void writeSortBy($, value)} />
        </Box>
        <Box flexShrink={0}>
          <Select
            key="show"
            label="Mostrar"
            options={SHOW_OPTIONS.map(option => ({ value: option.id, label: option.label }))}
            value={SHOW_OPTIONS.some(option => option.id === view.show) ? view.show : DEFAULT_SHOW}
            onSelect={value => {
              void writeShow($, value)
              void resetPaging($)
            }}
          />
        </Box>
      </Box>
      <Box flexDirection="row" flexWrap="nowrap" gap={1} flexShrink={0}>
        <Button key="lanes-left" plain dimColor={firstLane === 0} label="◀" onPress={() => void shiftFirstLane($, -1)} />
        <Button key="lanes-right" plain dimColor={firstLane >= LANES.length - 1} label="▶" onPress={() => void shiftFirstLane($, 1)} />
      </Box>
    </Box>
  )
}

export async function renderPane($: EngineInterface, ui: Elements['desktop']) {
  const view = await readPaneView($)
  if (view.setupDone === false) {
    return renderSetup($, ui, { list: view.list, sectionGroups: view.sectionGroups, saved: view.saved, choices: view.choices, loaded: view.loadedAt > 0 })
  }
  const now = Date.now()
  const board = buildBoard(view, now)
  const searchesTranscripts = view.hits !== null && view.query.trim().length >= TRANSCRIPT_SEARCH_MIN_CHARS
  const { Box, Client, Text } = ui
  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" flexWrap="wrap" gap={1} justifyContent="space-between">
        <Text bold>Kanban de Sessões</Text>
        <Text dimColor>
          {view.loadedAt ? `${board.visibleCount} de ${view.list.length} sessões · lida ${relativeTime(new Date(view.loadedAt).toISOString(), now)}` : 'carregando…'}
        </Text>
      </Box>
      {renderToolbar($, ui, view)}
      {view.notice ? <Text color="warning">{view.notice}</Text> : null}
      {searchesTranscripts ? <Text dimColor>{`Texto das conversas: ${view.hits?.length ?? 0} sessões com "${view.query.trim()}"`}</Text> : null}
      <Client key={BOARD_ELEMENT} module="./board.tsx" props={board.props} />
    </Box>
  )
}
