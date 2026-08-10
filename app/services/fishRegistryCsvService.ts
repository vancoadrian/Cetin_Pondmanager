import { z } from 'zod'
import type { Peg } from '~/data/pond'
import type {
  FishRegistryState,
  FishRegistryStateResponse,
  FishRegistryStatus,
  FishRegistryValidationFailure,
} from '~/services/fishRegistryService'
import {
  addFishObservation,
  cloneFishRegistryState,
  fishRegistryStatusLabels,
  getFishObservations,
  normalizeChipCode,
  registerTaggedFish,
  validationFailure,
} from '~/services/fishRegistryService'

export interface FishRegistryImportSuccess extends FishRegistryStateResponse {
  createdFishCount: number
  importedObservationCount: number
  message: string
  skippedObservationCount: number
  statusCode: 200
  updatedFishCount: number
}

export const fishRegistryImportInputSchema = z.object({
  csv: z.string().min(1, 'Vyberte CSV súbor s údajmi.').max(5_000_000, 'CSV súbor je príliš veľký.'),
})

function escapeCsvCell(value: unknown) {
  const normalized = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized
}

export const fishRegistryCsvHeaders = [
  'chip_code',
  'name',
  'species',
  'status',
  'tagged_at',
  'tagged_lake',
  'tagged_peg_id',
  'tagging_context',
  'tagger_name',
  'observed_at',
  'lake',
  'peg_id',
  'weight_kg',
  'length_cm',
  'bait',
  'angler_name',
  'chip_read_by',
  'source',
  'catch_id',
  'tournament_catch_id',
  'notes',
] as const

export function exportFishRegistryCsv(state: FishRegistryState) {
  const rows: string[][] = [Array.from(fishRegistryCsvHeaders)]

  for (const fishRecord of state.fish) {
    const observations = getFishObservations(fishRecord.id, state.observations)
    const rowsForFish = observations.length > 0 ? observations : [undefined]

    for (const observation of rowsForFish) {
      rows.push([
        fishRecord.chipCode,
        fishRecord.name,
        fishRecord.species,
        fishRecord.status,
        fishRecord.taggedAt,
        fishRecord.lake,
        fishRecord.taggedPegId,
        fishRecord.taggingContext,
        fishRecord.taggerName,
        observation?.observedAt ?? '',
        observation?.lake ?? '',
        observation?.pegId ?? '',
        observation?.weightKg?.toString() ?? '',
        observation?.lengthCm?.toString() ?? '',
        observation?.bait ?? '',
        observation?.anglerName ?? '',
        observation?.chipReadBy ?? '',
        observation?.source ?? '',
        observation?.catchId ?? '',
        observation?.tournamentCatchId ?? '',
        observation?.notes ?? fishRecord.notes,
      ])
    }
  }

  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`
}

export function parseCsvRows(csv: string) {
  const rows: string[][] = []
  let currentCell = ''
  let currentRow: string[] = []
  let quoted = false
  const value = csv.replace(/^\uFEFF/, '')

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        currentCell += '"'
        index += 1
      }
      else {
        quoted = !quoted
      }
    }
    else if (character === ',' && !quoted) {
      currentRow.push(currentCell)
      currentCell = ''
    }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && value[index + 1] === '\n') index += 1
      currentRow.push(currentCell)
      if (currentRow.some((cell) => cell.trim() !== '')) rows.push(currentRow)
      currentCell = ''
      currentRow = []
    }
    else {
      currentCell += character
    }
  }

  currentRow.push(currentCell)
  if (currentRow.some((cell) => cell.trim() !== '')) rows.push(currentRow)

  return rows
}

function rowRecord(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? '']))
}

function numberFromCsv(value?: string) {
  if (!value) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function importFishRegistryCsv(
  csv: string,
  state: FishRegistryState,
  pegs: Pick<Peg, 'id' | 'lake'>[],
  now = new Date().toISOString(),
): FishRegistryImportSuccess | FishRegistryValidationFailure {
  const rows = parseCsvRows(csv)
  if (rows.length < 2) return validationFailure(['CSV neobsahuje žiadne dátové riadky.'], 400)

  const headers = rows[0]!.map((header) => header.trim().toLowerCase())
  const missingHeaders = fishRegistryCsvHeaders.filter((header) => !headers.includes(header))
  if (missingHeaders.length > 0) {
    return validationFailure([`CSV nemá povinné stĺpce: ${missingHeaders.join(', ')}.`], 400)
  }

  let workingState = cloneFishRegistryState(state)
  let createdFishCount = 0
  let updatedFishCount = 0
  let importedObservationCount = 0
  let skippedObservationCount = 0
  const errors: string[] = []
  const updatedFishIds = new Set<string>()

  rows.slice(1).forEach((row, rowIndex) => {
    const record = rowRecord(headers, row)
    const chipCode = normalizeChipCode(record.chip_code ?? '')
    const lineNumber = rowIndex + 2
    if (!chipCode) {
      errors.push(`Riadok ${lineNumber}: chýba chip_code.`)
      return
    }

    let fishRecord = workingState.fish.find((item) => normalizeChipCode(item.chipCode) === chipCode)
    if (!fishRecord) {
      const registration = registerTaggedFish({
        chipCode,
        lake: record.tagged_lake,
        name: record.name,
        notes: record.notes,
        species: record.species,
        status: record.status || 'active',
        taggedAt: record.tagged_at,
        taggedPegId: record.tagged_peg_id,
        taggerName: record.tagger_name || record.chip_read_by || 'CSV import',
        taggingContext: record.tagging_context || 'capture',
      }, workingState, pegs, now)

      if (!registration.ok) {
        errors.push(...registration.messages.map((message) => `Riadok ${lineNumber}: ${message}`))
        return
      }

      workingState = {
        fish: registration.fish,
        observations: registration.observations,
      }
      fishRecord = registration.fishRecord
      createdFishCount += 1
    }
    else {
      const nextName = record.name || fishRecord.name
      const nextSpecies = record.species || fishRecord.species
      const requestedStatus = record.status || fishRecord.status
      if (!(requestedStatus in fishRegistryStatusLabels)) {
        errors.push(`Riadok ${lineNumber}: neznámy stav ryby ${requestedStatus}.`)
        return
      }
      const nextStatus = requestedStatus as FishRegistryStatus
      workingState.fish = workingState.fish.map((item) =>
        item.id === fishRecord!.id
          ? {
              ...item,
              name: nextName,
              species: nextSpecies,
              status: nextStatus,
              updatedAt: now,
            }
          : item,
      )
      fishRecord = workingState.fish.find((item) => item.id === fishRecord!.id)!
      if (!updatedFishIds.has(fishRecord.id)) {
        updatedFishIds.add(fishRecord.id)
        updatedFishCount += 1
      }
    }

    if (!record.observed_at) return

    const duplicate = workingState.observations.some((observation) =>
      observation.fishId === fishRecord!.id
      && observation.observedAt === record.observed_at
      && observation.pegId === record.peg_id,
    )
    if (duplicate) {
      skippedObservationCount += 1
      return
    }

    const observation = addFishObservation(fishRecord.id, {
      anglerName: record.angler_name,
      bait: record.bait,
      catchId: record.catch_id || undefined,
      chipReadBy: record.chip_read_by || record.tagger_name || 'CSV import',
      lake: record.lake,
      lengthCm: numberFromCsv(record.length_cm),
      notes: record.notes,
      observedAt: record.observed_at,
      pegId: record.peg_id,
      source: record.source || 'import',
      tournamentCatchId: record.tournament_catch_id || undefined,
      weightKg: numberFromCsv(record.weight_kg),
    }, workingState, pegs, now)

    if (!observation.ok) {
      errors.push(...observation.messages.map((message) => `Riadok ${lineNumber}: ${message}`))
      return
    }

    workingState = {
      fish: observation.fish,
      observations: observation.observations,
    }
    importedObservationCount += 1
  })

  if (errors.length > 0) return validationFailure(errors.slice(0, 50))

  return {
    ...workingState,
    createdFishCount,
    importedObservationCount,
    message: `CSV import pridal ${createdFishCount} rýb a ${importedObservationCount} pozorovaní.`,
    ok: true,
    skippedObservationCount,
    statusCode: 200,
    updatedAt: now,
    updatedFishCount,
  }
}
