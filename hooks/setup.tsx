import type { Elements, EngineInterface } from 'claude-code'

import type { Group, SavedStages, Session } from '../types'
import { errorMessage } from './app'
import { LANES, LANE_IDS, NO_STATUS, SECTION_MAPPING_KEY } from './constants'
import { countSessions } from './format'
import { changeSavedStages, isUnplaced } from './stages'
import { readGroups, readSectionChoices, readSessions, readStages, writeSectionChoice, writeSetupDone } from './state'

// The first-run section mapping. Once per machine, the board lists the sidebar sections and asks
// which lane each section's unplaced sessions go to; sessions already in a lane never move.
// Skipping counts as an answer too, so no session or window asks again.

export type SetupView = {
  list: Session[]
  sectionGroups: Group[]
  saved: SavedStages
  choices: Record<string, string>
  loaded: boolean
}

const NAME_WIDTH_MIN = 8
const COUNT_WIDTH = 14

const placeBySection = (list: Session[], mapping: ReadonlyMap<string, string>, at: string) =>
  (current: SavedStages): SavedStages => {
    const placed = list.filter(session => session.sectionId && mapping.has(session.sectionId) && isUnplaced(session, current))
    if (!placed.length) return current
    return { ...current, ...Object.fromEntries(placed.map(session => [session.id, { stage: mapping.get(session.sectionId ?? '') ?? NO_STATUS, at }])) }
  }

// Kept in the store with section and lane names, so the answer reads well later.
const describeMapping = (mapping: ReadonlyMap<string, string>, sectionGroups: Group[]): Record<string, string> => {
  const sectionName = new Map(sectionGroups.map(group => [group.id, group.name]))
  const laneName = new Map(LANES.map(lane => [lane.id, lane.name]))
  return Object.fromEntries([...mapping].map(([sectionId, stage]) => [sectionName.get(sectionId) ?? sectionId, laneName.get(stage) ?? stage]))
}

async function recordAnswer($: EngineInterface, answer: Record<string, unknown>): Promise<void> {
  try {
    await $.store.set(SECTION_MAPPING_KEY, answer)
  } catch (error) {
    $.ui.toast(`O quadro pode perguntar de novo em outra sessão: ${errorMessage(error).slice(0, 80)}`)
  }
}

const setupNotice = (applied: boolean, placed: number): string => {
  if (!applied) return 'Tudo fica em Sem status; mova os cartões quando quiser'
  if (!placed) return 'Nenhuma sessão para levar; tudo fica em Sem status'
  return `${countSessions(placed)} ${placed === 1 ? 'levada' : 'levadas'} para as listas escolhidas`
}

export async function applySectionMapping($: EngineInterface, apply: boolean): Promise<void> {
  const [list, sectionGroups, choices] = await Promise.all([readSessions($), readGroups($), readSectionChoices($)])
  const mapping = new Map(apply ? Object.entries(choices).filter(([, stage]) => LANE_IDS.has(stage) && stage !== NO_STATUS) : [])
  const at = new Date().toISOString()
  if (mapping.size) await changeSavedStages($, placeBySection(list, mapping, at))
  const placed = Object.values(await readStages($)).filter(saved => saved.at === at).length
  await recordAnswer($, { at, applied: apply, mapping: describeMapping(mapping, sectionGroups) })
  await writeSetupDone($, true)
  $.ui.toast(setupNotice(apply, placed))
}

const countUnplacedBySection = (list: Session[], saved: SavedStages): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const session of list) {
    if (session.sectionId && isUnplaced(session, saved)) counts.set(session.sectionId, (counts.get(session.sectionId) ?? 0) + 1)
  }
  return counts
}

export function renderSetup($: EngineInterface, ui: Elements['desktop'], view: SetupView) {
  const { Box, Button, Select, Text } = ui
  const unplaced = countUnplacedBySection(view.list, view.saved)
  const options = LANES.map(lane => ({ value: lane.id, label: lane.name }))
  const nameWidth = view.sectionGroups.reduce((max, group) => Math.max(max, group.name.length), NAME_WIDTH_MIN) + 2
  const sectionRows = view.sectionGroups.map(group => (
    <Box key={`setup-row-${group.id}`} flexDirection="row" gap={1} alignItems="center">
      <Box width={nameWidth} flexShrink={0}>
        <Text wrap="truncate-end">{group.name}</Text>
      </Box>
      <Box width={COUNT_WIDTH} flexShrink={0}>
        <Text dimColor>{countSessions(unplaced.get(group.id) ?? 0)}</Text>
      </Box>
      <Select
        key={`setup-${group.id}`}
        options={options}
        value={view.choices[group.id] ?? NO_STATUS}
        onSelect={value => void writeSectionChoice($, group.id, value)}
      />
    </Box>
  ))
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Primeira configuração do Kanban de Sessões</Text>
      <Text>As sessões que ainda não estão em nenhuma lista ficam em Sem status, e a seção da barra lateral não muda mais a lista de ninguém.</Text>
      <Text>Se quiser, aproveite agora para levar as sessões de cada seção para uma lista do quadro. Isto aparece uma vez só, e as sessões que já estão numa lista não mudam.</Text>
      {!view.loaded ? <Text dimColor>Carregando as seções…</Text> : null}
      {view.loaded && !view.sectionGroups.length ? <Text dimColor>A barra lateral não tem seções: não há nada para levar.</Text> : null}
      {view.loaded && view.sectionGroups.length ? <Box flexDirection="column">{sectionRows}</Box> : null}
      <Box flexDirection="row" gap={1}>
        <Button key="setup-apply" variant="primary" label="Aplicar" onPress={() => void applySectionMapping($, true)} />
        <Button key="setup-skip" label="Pular" onPress={() => void applySectionMapping($, false)} />
      </Box>
    </Box>
  )
}
