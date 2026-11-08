import type { ClientModule, ClientPointerEvent, ClientSurface, JsonValue, RenderElement } from 'claude-code'

import type { BoardMessage, BoardProps, Card, Lane } from '../types'
import { ARCHIVE, BLINK_MS, NO_SECTION_LABEL, PINNED_OPTION } from './constants'

// The lanes, drawn by a surface module so it receives the pointer: dragging a card onto another
// lane changes its stage. Everything sits on the cell grid, so the module knows where each card
// is. This environment has no JSX factory, so elements are called as functions.

type BoardState = {
  dragging: string | null
  pointerX: number
  pointerY: number
  targetLane: number
  expanded: string | null // card whose cut title is shown in full
  menu: { id: string; x: number; y: number } | null
  renaming: string | null
  confirmingArchiveAll: boolean
  blinkOn: boolean
}
type CardRect = { id: string; x: number; y: number; w: number; h: number; titleRows: number }
type Surface = ClientSurface<BoardState>
type SurfaceElements = Surface['elements']
type DrawContext = {
  ui: SurfaceElements
  surface: Surface
  props: BoardProps
  state: BoardState
  width: number // lane width in cells
  inner: number // inside the lane border
  sectionOptions: Array<{ value: string; label: string }>
}
type DrawnLane = { header: RenderElement; content: RenderElement[]; bottom: number }

const IDLE: BoardState = {
  dragging: null,
  pointerX: 0,
  pointerY: 0,
  targetLane: -1,
  expanded: null,
  menu: null,
  renaming: null,
  confirmingArchiveAll: false,
  blinkOn: false,
}
const GAP = 1
const ARCHIVE_ALL_LABEL = '[ARQUIVAR TODAS]'
const MENU_WIDTH = 16
const MENU_HEIGHT = 2 + 3 + 2 // borders, three actions, two gaps
const DRAG_THRESHOLD = 2
const TITLE_LINES = 2
const EXPANDED_TITLE_LINES = 8
const GHOST_MAX_WIDTH = 28

// What the pointer listener needs between draws (one board per pane).
const memory = {
  rects: [] as CardRect[],
  lanes: [] as Lane[],
  laneWidth: 0,
  pressed: null as { id: string; x: number; y: number } | null,
  dragging: false,
  listening: false,
  menuBox: { x: 0, y: 0, w: 0, h: 0 },
  hasWaiting: false,
}

const send = (surface: Surface, message: BoardMessage): void => surface.post(message as unknown as JsonValue)
const current = (surface: Surface): BoardState => surface.state ?? IDLE
const patch = (surface: Surface, change: Partial<BoardState>): void => surface.setState({ ...current(surface), ...change })
// The tree is serialized, so no key may hold undefined.
const compact = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
const allCards = (props: BoardProps): Card[] => props.lanes.flatMap(lane => lane.cards)

// Wraps a title into at most `maxLines` lines of `width` characters; the last line ends in "…" when text is left over.
const wrapTitle = (text: string, width: number, maxLines = TITLE_LINES): string[] => {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (!line) line = word
    else if (`${line} ${word}`.length <= width) line = `${line} ${word}`
    else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  const leftOver = words.join(' ').length > lines.join(' ').length
  return lines.map((text, index) => {
    const fitted = text.length > width ? text.slice(0, width) : text
    const isLast = index === lines.length - 1
    return isLast && (leftOver || text.length > width) ? `${fitted.slice(0, Math.max(1, width - 1))}…` : fitted
  })
}

// ---- pointer ----

const laneAt = (x: number): number => {
  const index = Math.floor(x / (memory.laneWidth + GAP))
  return index >= 0 && index < memory.lanes.length ? index : -1
}

const rectAt = (x: number, y: number): CardRect | undefined => memory.rects.find(rect => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h)

const insideMenu = (x: number, y: number): boolean => {
  const box = memory.menuBox
  return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h
}

const onPointerDown = (surface: Surface, event: ClientPointerEvent): void => {
  const rect = rectAt(event.x, event.y)
  memory.pressed = null
  memory.dragging = false
  if (event.button === 'right') {
    patch(surface, { menu: rect ? { id: rect.id, x: event.x, y: event.y } : null })
    return
  }
  if (event.button && event.button !== 'left') return
  const state = current(surface)
  // with the menu open, a click outside only closes it; the menu's own buttons act inside it
  if (state.menu) {
    if (!insideMenu(event.x, event.y)) patch(surface, { menu: null })
    return
  }
  // a click outside the card being renamed cancels the rename
  if (state.renaming !== null && rect?.id !== state.renaming) {
    patch(surface, { renaming: null })
    return
  }
  memory.pressed = rect ? { id: rect.id, x: event.x, y: event.y } : null
  // a click outside the expanded title collapses it (the title's own button toggles it)
  const onExpandedTitle = rect && rect.id === state.expanded && event.y >= rect.y + 2 && event.y < rect.y + 1 + rect.titleRows
  if (state.expanded !== null && !onExpandedTitle) patch(surface, { expanded: null })
}

const onPointerMove = (surface: Surface, event: ClientPointerEvent): void => {
  const pressed = memory.pressed
  if (!pressed) return
  const distance = Math.max(Math.abs(event.x - pressed.x), Math.abs(event.y - pressed.y))
  if (!memory.dragging && distance < DRAG_THRESHOLD) return
  memory.dragging = true
  surface.setState({ ...IDLE, blinkOn: current(surface).blinkOn, dragging: pressed.id, pointerX: event.x, pointerY: event.y, targetLane: laneAt(event.x) })
}

const onPointerUp = (surface: Surface, event: ClientPointerEvent): void => {
  const pressed = memory.pressed
  const wasDragging = memory.dragging
  memory.pressed = null
  memory.dragging = false
  if (!wasDragging || !pressed) return
  const lane = memory.lanes[laneAt(event.x)]
  if (lane) send(surface, { type: 'move', id: pressed.id, stage: lane.id })
  surface.setState({ ...IDLE, blinkOn: current(surface).blinkOn })
}

const listenToPointer = (surface: Surface): void => {
  surface.onPointer(event => {
    if (event.type === 'down') onPointerDown(surface, event)
    else if (event.type === 'move') onPointerMove(surface, event)
    else if (event.type === 'up') onPointerUp(surface, event)
  })
}

// The yellow dot of a waiting session blinks on the surface's own clock, without redrawing the
// pane. The clock starts once per instance, while the local state is still unset.
const startBlinking = (surface: Surface): void => {
  surface.every(BLINK_MS, () => {
    const state = current(surface)
    if (memory.hasWaiting) surface.setState({ ...state, blinkOn: !state.blinkOn })
    else if (state.blinkOn) surface.setState({ ...state, blinkOn: false })
  })
  surface.setState(IDLE)
}

// ---- lane parts ----

// On "Arquivar" the button sits right of the name, in place of the count, which moves next to the
// name when the lane fits all three. Without the button (empty lane, question on screen or batch
// running) the line goes back to name and count.
const drawLaneHeader = (ctx: DrawContext, lane: Lane, index: number, x: number): RenderElement => {
  const { Box, Button, Text } = ctx.ui
  const { archivable, progress } = ctx.props.batch
  const name = Text({ color: lane.color, bold: true, wrap: 'truncate-end', children: lane.name })
  const count = Text({ dimColor: true, children: String(lane.total) })
  const withButton = lane.id === ARCHIVE && archivable > 0 && !progress && !ctx.state.confirmingArchiveAll
  const fitsCount = lane.name.length + 1 + String(lane.total).length + 1 + ARCHIVE_ALL_LABEL.length <= ctx.inner
  const askToArchiveAll = () => patch(ctx.surface, { confirmingArchiveAll: true, menu: null, expanded: null, renaming: null })
  const children = withButton
    ? [
        Box({ flexDirection: 'row', gap: 1, flexShrink: 1, overflow: 'hidden', children: fitsCount ? [name, count] : [name] }),
        Box({ flexShrink: 0, children: [Button({ key: 'archive-all', onPress: askToArchiveAll, children: ARCHIVE_ALL_LABEL })] }),
      ]
    : [name, count]
  return Box({ key: `h${index}`, position: 'absolute', left: x + 1, top: 0, width: ctx.inner, height: 1, flexDirection: 'row', justifyContent: 'space-between', children })
}

// Under the "Arquivar" name: the button's question, the batch progress and the notice about the
// sessions the app does not archive.
const drawBatchActions = (ctx: DrawContext, x: number, y: number): { element: RenderElement; height: number } | null => {
  const { Box, Button, Text } = ctx.ui
  const { archivable, skipped, progress } = ctx.props.batch
  const rows: RenderElement[] = []
  const addText = (text: string, options: { color?: string; small?: boolean } = {}): void => {
    for (const line of wrapTitle(text, ctx.inner, TITLE_LINES)) {
      rows.push(Text(compact({ color: options.color, dimColor: options.color ? undefined : true, size: options.small ? ('caption' as const) : undefined, wrap: 'truncate-end' as const, children: line })))
    }
  }
  const closeQuestion = () => patch(ctx.surface, { confirmingArchiveAll: false })
  if (progress) addText(`Arquivando ${progress.done} de ${progress.total}…`)
  else if (ctx.state.confirmingArchiveAll && archivable > 0) {
    addText(archivable === 1 ? 'Arquivar a sessão desta lista?' : `Arquivar as ${archivable} sessões desta lista?`, { color: 'warning' })
    const confirm = () => {
      closeQuestion()
      send(ctx.surface, { type: 'archiveAll', count: archivable })
    }
    rows.push(
      Box({
        flexDirection: 'row',
        gap: 1,
        children: [
          Button({ key: 'archive-all-yes', variant: 'primary', onPress: confirm, children: 'Sim' }),
          Button({ key: 'archive-all-no', onPress: closeQuestion, children: 'Não' }),
        ],
      }),
    )
  }
  // the app does not archive pinned or running sessions: the button leaves them in the lane and says so
  if (skipped > 0 && !progress) addText(skipped === 1 ? 'Fica 1 fixada ou em execução' : `Ficam ${skipped} fixadas ou em execução`, { small: true })
  if (!rows.length) return null
  return {
    element: Box({ key: 'batch-actions', position: 'absolute', left: x + 1, top: y, width: ctx.inner, height: rows.length, flexDirection: 'column', overflow: 'hidden', children: rows }),
    height: rows.length,
  }
}

// ---- card parts ----

const sectionRow = (ctx: DrawContext, card: Card, key: string): RenderElement => {
  const { Box, Select, Text } = ctx.ui
  const pickSection = (value: string) => send(ctx.surface, { type: 'setSection', id: card.id, sectionId: value })
  const items = [
    Box({ flexShrink: 0, children: [Text({ color: card.color, bold: true, children: '●' })] }),
    Box({ flexGrow: 1, flexShrink: 1, children: [Select({ key: `s${key}`, options: ctx.sectionOptions, value: card.pinned ? PINNED_OPTION : card.sectionId ?? '', onSelect: pickSection })] }),
  ]
  // waiting for the person: a blinking yellow dot in place of the green "running" one
  if (card.waiting) items.push(Box({ flexShrink: 0, width: 1, children: [Text({ color: 'warning', bold: true, children: ctx.state.blinkOn ? '●' : ' ' })] }))
  else if (card.running) items.push(Box({ flexShrink: 0, children: [Text({ color: 'success', children: '●' })] }))
  return Box({ flexDirection: 'row', gap: 1, overflow: 'hidden', children: items })
}

// The desktop only links https, so the title is text and "Abrir" opens the session. A cut title is
// a borderless button: a click grows the card to show the whole title, another click collapses it.
const titleBlock = (ctx: DrawContext, card: Card, key: string, lines: string[], isCut: boolean): RenderElement => {
  const { Box, Button, Text } = ctx.ui
  const toggle = () => patch(ctx.surface, { expanded: current(ctx.surface).expanded === card.id ? null : card.id })
  const rows = lines.map((line, index) =>
    isCut
      ? Box({ alignSelf: 'flex-start', children: [Button({ key: `t${key}${index}`, plain: true, onPress: toggle, children: [Text({ bold: true, wrap: 'truncate-end', children: line })] })] })
      : Text({ bold: true, wrap: 'truncate-end', children: line }),
  )
  return Box({ flexDirection: 'column', marginTop: 'xs', children: rows })
}

// Enter saves the new title in the app; a click outside the card cancels.
const renameField = (ctx: DrawContext, card: Card, key: string, rows: number): RenderElement => {
  const { Box, Input } = ctx.ui
  const submit = (value: string) => {
    patch(ctx.surface, { renaming: null })
    send(ctx.surface, { type: 'rename', id: card.id, title: value })
  }
  return Box({ marginTop: 'xs', height: Math.max(1, rows), overflow: 'hidden', children: [Input({ key: `r${key}`, value: card.title, autoFocus: true, placeholder: 'Novo título', onSubmit: submit })] })
}

const footer = (ctx: DrawContext, card: Card, key: string): RenderElement => {
  const { Box, Button, Text } = ctx.ui
  const activity = card.createdLabel ? `${card.createdLabel} · ${card.lastActivityLabel}` : card.lastActivityLabel
  const details = [activity, card.waiting ? 'aguarda você' : '', card.pinned ? 'fixada' : '', card.pr ? `PR ${card.pr}` : ''].filter(Boolean).join(' · ')
  return Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    children: [
      Box({ flexShrink: 1, children: [Text({ dimColor: true, wrap: 'truncate-end', children: details })] }),
      Box({ flexShrink: 0, children: [Button({ key: `o${key}`, variant: 'primary', onPress: () => send(ctx.surface, { type: 'open', id: card.id }), children: 'Abrir' })] }),
    ],
  })
}

const archiveQuestion = (ctx: DrawContext, card: Card, key: string): RenderElement[] => {
  const { Box, Button, Text } = ctx.ui
  const buttons = [
    Button({ key: `y${key}`, variant: 'primary', onPress: () => send(ctx.surface, { type: 'archive', id: card.id }), children: 'Sim' }),
    Button({ key: `n${key}`, onPress: () => send(ctx.surface, { type: 'askArchive', id: null }), children: 'Não' }),
  ]
  // a pinned session is unpinned before it is archived, and the question says so
  if (card.pinned) return [Text({ color: 'warning', children: 'Desafixar e arquivar?' }), Box({ flexDirection: 'row', gap: 1, children: buttons })]
  return [Box({ flexDirection: 'row', gap: 1, children: [Text({ color: 'warning', children: 'Arquivar?' }), ...buttons] })]
}

const drawCard = (ctx: DrawContext, card: Card, key: string, x: number, y: number): { element: RenderElement; rect: CardRect } => {
  const titleWidth = ctx.inner - 2
  const shortLines = wrapTitle(card.title, titleWidth)
  const isCut = shortLines.join(' ') !== card.title
  const lines = isCut && ctx.state.expanded === card.id ? wrapTitle(card.title, titleWidth, EXPANDED_TITLE_LINES) : shortLines
  const confirming = ctx.props.confirmingArchive === card.id
  const questionRows = confirming ? (card.pinned ? 2 : 1) : 0
  const height = 2 + 1 + lines.length + 1 + 1 + questionRows // borders, section, title, spacer, footer, question
  const dragged = ctx.state.dragging === card.id
  const children = [
    sectionRow(ctx, card, key),
    ctx.state.renaming === card.id ? renameField(ctx, card, key, lines.length) : titleBlock(ctx, card, key, lines, isCut),
    ctx.ui.Box({ flexGrow: 1 }), // keeps the footer at the bottom of the card
    footer(ctx, card, key),
    ...(confirming ? archiveQuestion(ctx, card, key) : []),
  ]
  const element = ctx.ui.Box(
    compact({
      key: `c${key}`,
      position: 'absolute' as const,
      left: x + 1,
      top: y,
      width: ctx.inner,
      height,
      flexDirection: 'column' as const,
      borderStyle: 'round' as const,
      borderDimColor: !dragged,
      borderColor: dragged ? 'claude' : undefined,
      paddingX: 1,
      overflow: 'hidden' as const,
      children,
    }),
  )
  return { element, rect: { id: card.id, x: x + 1, y, w: ctx.inner, h: height, titleRows: 1 + lines.length } }
}

// ---- board ----

const drawLane = (ctx: DrawContext, lane: Lane, index: number, rects: CardRect[]): DrawnLane => {
  const { Box, Button, Text } = ctx.ui
  const x = index * (ctx.width + GAP)
  const content: RenderElement[] = []
  let y = 1
  const batchActions = lane.id === ARCHIVE ? drawBatchActions(ctx, x, y) : null
  if (batchActions) {
    content.push(batchActions.element)
    y += batchActions.height
  }
  lane.cards.forEach((card, cardIndex) => {
    const drawn = drawCard(ctx, card, `${index}.${cardIndex}`, x, y)
    rects.push(drawn.rect)
    content.push(drawn.element)
    y += drawn.rect.h
  })
  if (!lane.cards.length) {
    content.push(Box({ key: `e${index}`, position: 'absolute', left: x + 1, top: y, width: ctx.inner, height: 1, children: [Text({ dimColor: true, children: ctx.state.dragging ? 'solte aqui' : 'vazia' })] }))
    y += 1
  }
  if (lane.hidden > 0) {
    const showMore = () => send(ctx.surface, { type: 'showMore', stage: lane.id })
    content.push(
      Box({
        key: `more${index}`,
        position: 'absolute',
        left: x + 1,
        top: y,
        width: ctx.inner,
        height: 1,
        children: [Button({ key: `more-button${index}`, plain: true, dimColor: true, onPress: showMore, children: `Mais ${lane.hidden}` })],
      }),
    )
    y += 1
  }
  return { header: drawLaneHeader(ctx, lane, index, x), content, bottom: y + 1 }
}

// Lane frames need the final height, so they are drawn last.
const drawFrames = (ctx: DrawContext, height: number): RenderElement[] =>
  ctx.props.lanes.map((_, index) => {
    const isTarget = ctx.state.targetLane === index && ctx.state.dragging !== null
    return ctx.ui.Box(
      compact({
        key: `f${index}`,
        position: 'absolute' as const,
        left: index * (ctx.width + GAP),
        top: 0,
        width: ctx.width,
        height,
        borderStyle: 'single' as const,
        borderDimColor: !isTarget,
        borderColor: isTarget ? 'claude' : undefined,
      }),
    )
  })

const drawGhost = (ctx: DrawContext): RenderElement[] => {
  const card = ctx.state.dragging ? allCards(ctx.props).find(item => item.id === ctx.state.dragging) : undefined
  if (!card) return []
  const { Box, Text } = ctx.ui
  return [
    Box({
      key: 'ghost',
      position: 'absolute',
      left: Math.max(0, ctx.state.pointerX - 3),
      top: Math.max(0, ctx.state.pointerY - 1),
      width: Math.min(ctx.inner, GHOST_MAX_WIDTH),
      height: 3,
      borderStyle: 'round',
      borderColor: 'claude',
      paddingX: 1,
      overflow: 'hidden',
      children: [Text({ bold: true, wrap: 'truncate-end', children: card.title })],
    }),
  ]
}

// Right-click menu (Abrir, Renomear, Arquivar), drawn on top; it closes on a pick or on a click outside.
const drawMenu = (ctx: DrawContext, boardWidth: number): { element: RenderElement; bottom: number } | null => {
  memory.menuBox = { x: 0, y: 0, w: 0, h: 0 }
  const menu = ctx.state.menu
  const card = menu ? allCards(ctx.props).find(item => item.id === menu.id) : undefined
  if (!menu || !card) return null
  const { Box, Button, Text } = ctx.ui
  const x = Math.max(0, Math.min(menu.x, boardWidth - MENU_WIDTH))
  const y = Math.max(0, menu.y)
  memory.menuBox = { x, y, w: MENU_WIDTH, h: MENU_HEIGHT }
  const close = () => patch(ctx.surface, { menu: null })
  const item = (key: string, label: string, onPress: () => void) => Button({ key, plain: true, onPress, children: [Text({ color: 'text', children: label })] })
  const element = Box({
    position: 'absolute',
    left: x,
    top: y,
    width: MENU_WIDTH,
    height: MENU_HEIGHT,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 1,
    borderStyle: 'round',
    borderDimColor: true,
    backgroundColor: 'inverseText',
    paddingX: 1,
    overflow: 'hidden',
    children: [
      item('menu-open', 'Abrir', () => {
        close()
        send(ctx.surface, { type: 'open', id: card.id })
      }),
      item('menu-rename', 'Renomear', () => patch(ctx.surface, { menu: null, expanded: null, renaming: card.id })),
      item('menu-archive', 'Arquivar…', () => {
        close()
        send(ctx.surface, { type: 'askArchive', id: card.id })
      }),
    ],
  })
  return { element, bottom: y + MENU_HEIGHT + 1 }
}

// A lane is never too narrow for the "Arquivar" name and its button on one line (two border cells and one spare).
const laneWidthFor = (props: BoardProps): number => {
  const archiveName = props.lanes.find(lane => lane.id === ARCHIVE)?.name ?? ''
  return Math.max(props.laneWidth, archiveName ? archiveName.length + 1 + ARCHIVE_ALL_LABEL.length + 3 : 0)
}

const sectionOptionsFor = (props: BoardProps): Array<{ value: string; label: string }> => [
  { value: PINNED_OPTION, label: 'Fixado' },
  ...props.sections.map(section => ({ value: section.id, label: section.name })),
  { value: '', label: NO_SECTION_LABEL },
]

const Board: ClientModule<BoardProps, BoardState> = (props, surface) => {
  const width = laneWidthFor(props)
  memory.laneWidth = width
  memory.lanes = props.lanes
  memory.hasWaiting = props.lanes.some(lane => lane.cards.some(card => card.waiting))
  if (surface.state === undefined) startBlinking(surface)
  if (!memory.listening) {
    memory.listening = true
    listenToPointer(surface)
  }

  const ctx: DrawContext = { ui: surface.elements, surface, props, state: current(surface), width, inner: width - 2, sectionOptions: sectionOptionsFor(props) }
  const rects: CardRect[] = []
  const lanes = props.lanes.map((lane, index) => drawLane(ctx, lane, index, rects))
  const boardWidth = props.lanes.length * (width + GAP)
  const menu = drawMenu(ctx, boardWidth)
  const height = Math.max(3, ...lanes.map(lane => lane.bottom), menu?.bottom ?? 0)
  memory.rects = rects
  return ctx.ui.Box({
    width: boardWidth,
    height,
    children: [...drawFrames(ctx, height), ...lanes.map(lane => lane.header), ...lanes.flatMap(lane => lane.content), ...drawGhost(ctx), ...(menu ? [menu.element] : [])],
  })
}

export default Board
