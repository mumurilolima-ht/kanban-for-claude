// Shared by the hooks module and the board's surface module. Labels are UI copy (pt-BR).

export const PANE_ID = 'kanban'
export const PANE_TITLE = 'Kanban de Sessões'
export const BOARD_ELEMENT = 'board'

export type LaneDefinition = { id: string; name: string; color: string }

// Colors are keys of the app's theme, which follow light and dark mode.
export const LANES: readonly LaneDefinition[] = [
  { id: 'no-status', name: 'Sem status', color: 'inactive' },
  { id: 'todo', name: 'A fazer', color: 'subtle' },
  { id: 'attention', name: 'Precisa de atenção', color: 'warning' },
  { id: 'doing', name: 'Fazendo', color: 'claude' },
  { id: 'done', name: 'Feito', color: 'success' },
  { id: 'review', name: 'Revisar', color: 'merged' },
  { id: 'archive', name: 'Arquivar', color: 'inactive' },
]
export const NO_STATUS = 'no-status'
export const DOING = 'doing'
export const ARCHIVE = 'archive'
export const LANE_IDS: ReadonlySet<string> = new Set(LANES.map(lane => lane.id))

export const SORT_OPTIONS = [
  { id: 'recent', label: 'Atividade mais recente' },
  { id: 'idle', label: 'Mais tempo parada' },
  { id: 'newest', label: 'Criadas por último' },
  { id: 'oldest', label: 'Criadas primeiro' },
  { id: 'title', label: 'Título de A a Z' },
] as const
export const DEFAULT_SORT = 'recent'

export const SHOW_OPTIONS = [
  { id: 'with-section', label: 'Só com seção' },
  { id: 'all', label: 'Todas' },
  { id: 'running', label: 'Só em execução' },
  { id: 'pinned', label: 'Só fixadas' },
  { id: 'waiting', label: 'Só aguardando sua ação' },
] as const
export const DEFAULT_SHOW = 'with-section'

// Card dot colors, assigned to the sidebar sections in their order.
export const SECTION_COLORS = ['claude', 'success', 'warning', 'error', 'merged', 'permission', 'planMode', 'suggestion', 'remember', 'autoAccept', 'ide', 'bashBorder']
export const NO_SECTION_LABEL = 'Sem seção'
// The "Fixado" entry of the card's section picker: it pins the session in the sidebar.
export const PINNED_OPTION = '__pinned'

// Store keys, shared by every session and app window on the machine.
export const STAGES_KEY = 'stages'
export const SECTION_MAPPING_KEY = 'sectionMapping'
export const WAITING_KEY_PREFIX = 'waiting:'

// The drawn region has a size limit, so each lane shows a few cards at a time.
export const CARDS_PER_PAGE = 6
export const MAX_CARDS_PER_LANE = 12
export const MAX_CARDS_ON_BOARD = 36
export const MIN_LANE_WIDTH = 22

export const REFRESH_MS = 30_000
export const WAITING_REFRESH_MS = 5_000
// An ask answered faster than this (auto mode, the app itself) never shows on the board.
export const WAITING_GRACE_MS = 2_000
export const WAITING_HEARTBEAT_MS = 30_000
// A report not renewed for this long belongs to a session that closed while waiting.
export const WAITING_STALE_MS = 90_000
export const TRANSCRIPT_SEARCH_DELAY_MS = 450
export const TRANSCRIPT_SEARCH_MIN_CHARS = 3
export const BLINK_MS = 600
