import { z } from 'zod'
import type {
  LakeSlug,
  Peg,
} from '~/data/pond'
import type { FishRegistrySettings } from '~/services/fishRegistrySettingsService'

export type FishRegistryStatus = 'active' | 'dead' | 'missing' | 'transferred'
export type FishTaggingContext = 'capture' | 'routine' | 'tournament'
export type FishObservationSource = 'import' | 'manager' | 'public-catch' | 'tournament'

export interface TaggedFish {
  chipCode: string
  createdAt: string
  id: string
  lake: LakeSlug
  name: string
  notes: string
  species: string
  status: FishRegistryStatus
  taggedAt: string
  taggedLengthCm?: number
  taggedPegId: string
  taggedWeightKg?: number
  taggerName: string
  taggingContext: FishTaggingContext
  updatedAt: string
}

export interface FishObservation {
  anglerName: string
  bait: string
  catchId?: string
  chipReadBy: string
  createdAt: string
  fishId: string
  id: string
  lake: LakeSlug
  lengthCm: number
  notes: string
  observedAt: string
  pegId: string
  source: FishObservationSource
  tournamentCatchId?: string
  weightKg: number
}

export interface FishRegistryState {
  fish: TaggedFish[]
  observations: FishObservation[]
}

export interface FishRegistryStateResponse extends FishRegistryState {
  ok: true
  settings?: FishRegistrySettings
  updatedAt: string
}

export interface FishRegistryMutationSuccess extends FishRegistryStateResponse {
  fishRecord: TaggedFish
  message: string
  observation?: FishObservation
  statusCode: 200 | 201
}

export interface FishObservationMutationSuccess extends FishRegistryStateResponse {
  fishRecord: TaggedFish
  message: string
  observation: FishObservation
  statusCode: 201
}

export interface FishRegistryUpdateSuccess extends FishRegistryStateResponse {
  changeNote: string
  fishRecord: TaggedFish
  message: string
  previousStatus: FishRegistryStatus
  statusCode: 200
}

export interface FishRegistryValidationFailure {
  messages: string[]
  ok: false
  statusCode: 400 | 404 | 409 | 422
}

const optionalNumber = (minimum: number, maximum: number, label: string) =>
  z.preprocess(
    (value) => value === '' || value === null || value === undefined ? undefined : value,
    z.coerce.number()
      .min(minimum, `${label} musí byť aspoň ${minimum}.`)
      .max(maximum, `${label} môže byť najviac ${maximum}.`)
      .optional(),
  )

export const fishRegistrationInputSchema = z.object({
  anglerName: z.string().trim().max(120, 'Meno rybára môže mať najviac 120 znakov.').default(''),
  bait: z.string().trim().max(160, 'Nástraha môže mať najviac 160 znakov.').default(''),
  catchId: z.string().trim().max(120).optional(),
  chipCode: z.string()
    .trim()
    .min(6, 'Číslo čipu musí mať aspoň 6 znakov.')
    .max(64, 'Číslo čipu môže mať najviac 64 znakov.')
    .regex(/^[a-z0-9][a-z0-9._/-]*$/i, 'Číslo čipu obsahuje nepovolené znaky.'),
  lake: z.enum(['velky-cetin', 'strkovisko-kocka']),
  name: z.string().trim().max(80, 'Meno ryby môže mať najviac 80 znakov.').default(''),
  notes: z.string().trim().max(1000, 'Poznámka môže mať najviac 1000 znakov.').default(''),
  observationSource: z.enum(['import', 'manager', 'public-catch', 'tournament']).optional(),
  species: z.string().trim().min(2, 'Doplňte druh ryby.').max(100),
  status: z.enum(['active', 'dead', 'missing', 'transferred']).default('active'),
  taggedAt: z.string().min(10, 'Doplňte dátum označenia.'),
  taggedLengthCm: optionalNumber(1, 250, 'Dĺžka'),
  taggedPegId: z.string().trim().min(1, 'Vyberte miesto označenia.'),
  taggedWeightKg: optionalNumber(0.1, 80, 'Váha'),
  taggerName: z.string().trim().min(2, 'Doplňte osobu, ktorá rybu označila.').max(120),
  taggingContext: z.enum(['capture', 'routine', 'tournament']).default('capture'),
  tournamentCatchId: z.string().trim().max(120).optional(),
}).superRefine((value, ctx) => {
  if ((value.taggedWeightKg === undefined) !== (value.taggedLengthCm === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pri prvom meraní doplňte spolu váhu aj dĺžku.',
      path: ['taggedWeightKg'],
    })
  }
})

export const fishObservationInputSchema = z.object({
  anglerName: z.string().trim().max(120, 'Meno rybára môže mať najviac 120 znakov.').default(''),
  bait: z.string().trim().max(160, 'Nástraha môže mať najviac 160 znakov.').default(''),
  catchId: z.string().trim().max(120).optional(),
  chipReadBy: z.string().trim().min(2, 'Doplňte osobu, ktorá načítala čip.').max(120),
  lake: z.enum(['velky-cetin', 'strkovisko-kocka']),
  lengthCm: z.coerce.number().min(1, 'Dĺžka musí byť väčšia ako 0 cm.').max(250),
  notes: z.string().trim().max(1000, 'Poznámka môže mať najviac 1000 znakov.').default(''),
  observedAt: z.string().min(10, 'Doplňte dátum a čas záznamu.'),
  pegId: z.string().trim().min(1, 'Vyberte lovné miesto.'),
  source: z.enum(['import', 'manager', 'public-catch', 'tournament']).default('manager'),
  tournamentCatchId: z.string().trim().max(120).optional(),
  weightKg: z.coerce.number().min(0.1, 'Váha musí byť väčšia ako 0 kg.').max(80),
})

export const fishIdentityUpdateInputSchema = z.object({
  changeNote: z.string().trim().max(500, 'Dôvod zmeny môže mať najviac 500 znakov.').default(''),
  name: z.string().trim().max(80, 'Meno ryby môže mať najviac 80 znakov.').default(''),
  notes: z.string().trim().max(1000, 'Poznámka môže mať najviac 1000 znakov.').default(''),
  species: z.string().trim().min(2, 'Doplňte druh ryby.').max(100),
  status: z.enum(['active', 'dead', 'missing', 'transferred']),
})

export const fishRegistryStatusLabels: Record<FishRegistryStatus, string> = {
  active: 'aktívna',
  dead: 'uhynutá',
  missing: 'dlho nepotvrdená',
  transferred: 'premiestnená',
}

export const fishTaggingContextLabels: Record<FishTaggingContext, string> = {
  capture: 'označená po úlovku',
  routine: 'prevádzkové čipovanie',
  tournament: 'čipovanie na súťaži',
}

export const fishObservationSourceLabels: Record<FishObservationSource, string> = {
  import: 'CSV import',
  manager: 'správca',
  'public-catch': 'bežný úlovok',
  tournament: 'súťaž',
}

export function validationFailure(messages: string[], statusCode: FishRegistryValidationFailure['statusCode'] = 422): FishRegistryValidationFailure {
  return {
    messages,
    ok: false,
    statusCode,
  }
}

export function normalizeChipCode(value: string) {
  return value.trim().toUpperCase()
}

function isValidDate(value: string) {
  return Number.isFinite(Date.parse(value))
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'ryba'
}

function compactTimestamp(now: string) {
  const date = new Date(now)
  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function uniqueId(base: string, ids: Set<string>) {
  if (!ids.has(base)) return base

  let suffix = 2
  while (ids.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function validatePeg(lake: LakeSlug, pegId: string, pegs: Pick<Peg, 'id' | 'lake'>[]) {
  const peg = pegs.find((item) => item.id === pegId)
  if (!peg) return `Lovné miesto ${pegId} neexistuje.`
  if (peg.lake !== lake) return `Lovné miesto ${pegId} nepatrí k vybranému jazeru.`
  return undefined
}

export function cloneFishRegistryState(state: FishRegistryState): FishRegistryState {
  return {
    fish: state.fish.map((item) => ({ ...item })),
    observations: state.observations.map((item) => ({ ...item })),
  }
}

export function registerTaggedFish(
  rawInput: unknown,
  state: FishRegistryState,
  pegs: Pick<Peg, 'id' | 'lake'>[],
  now = new Date().toISOString(),
): FishRegistryMutationSuccess | FishRegistryValidationFailure {
  const parsed = fishRegistrationInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return validationFailure(parsed.error.issues.map((issue) => issue.message))
  }

  const input = parsed.data
  if (!isValidDate(input.taggedAt)) return validationFailure(['Dátum označenia nemá platný formát.'])

  const chipCode = normalizeChipCode(input.chipCode)
  if (state.fish.some((item) => normalizeChipCode(item.chipCode) === chipCode)) {
    return validationFailure([`Ryba s čipom ${chipCode} už v registri existuje.`], 409)
  }

  const pegError = validatePeg(input.lake, input.taggedPegId, pegs)
  if (pegError) return validationFailure([pegError])

  const fishRecord: TaggedFish = {
    ...input,
    chipCode,
    id: uniqueId(
      `fish-${slugify(chipCode).slice(0, 32)}`,
      new Set(state.fish.map((item) => item.id)),
    ),
    createdAt: now,
    updatedAt: now,
  }
  const observations = [...state.observations]
  let observation: FishObservation | undefined

  if (input.taggedWeightKg !== undefined && input.taggedLengthCm !== undefined) {
    observation = {
      anglerName: input.anglerName,
      bait: input.bait,
      catchId: input.catchId || undefined,
      chipReadBy: input.taggerName,
      createdAt: now,
      fishId: fishRecord.id,
      id: uniqueId(
        `fish-observation-${compactTimestamp(input.taggedAt)}-${slugify(chipCode).slice(0, 20)}`,
        new Set(observations.map((item) => item.id)),
      ),
      lake: input.lake,
      lengthCm: input.taggedLengthCm,
      notes: 'Prvé meranie pri označení ryby.',
      observedAt: input.taggedAt,
      pegId: input.taggedPegId,
      source: input.observationSource
        ?? (input.taggingContext === 'tournament' ? 'tournament' : 'manager'),
      tournamentCatchId: input.tournamentCatchId || undefined,
      weightKg: input.taggedWeightKg,
    }
    observations.unshift(observation)
  }

  return {
    fish: [fishRecord, ...state.fish],
    fishRecord,
    message: observation
      ? `Ryba s čipom ${chipCode} bola pridaná aj s prvým meraním.`
      : `Ryba s čipom ${chipCode} bola pridaná do registra.`,
    observation,
    observations,
    ok: true,
    statusCode: 201,
    updatedAt: now,
  }
}

export function addFishObservation(
  fishId: string,
  rawInput: unknown,
  state: FishRegistryState,
  pegs: Pick<Peg, 'id' | 'lake'>[],
  now = new Date().toISOString(),
): FishObservationMutationSuccess | FishRegistryValidationFailure {
  const fishRecord = state.fish.find((item) => item.id === fishId)
  if (!fishRecord) return validationFailure(['Ryba sa v registri nenašla.'], 404)

  const parsed = fishObservationInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return validationFailure(parsed.error.issues.map((issue) => issue.message))
  }

  const input = parsed.data
  if (!isValidDate(input.observedAt)) return validationFailure(['Dátum pozorovania nemá platný formát.'])

  const pegError = validatePeg(input.lake, input.pegId, pegs)
  if (pegError) return validationFailure([pegError])

  const observation: FishObservation = {
    ...input,
    catchId: input.catchId || undefined,
    createdAt: now,
    fishId,
    id: uniqueId(
      `fish-observation-${compactTimestamp(input.observedAt)}-${slugify(fishRecord.chipCode).slice(0, 20)}`,
      new Set(state.observations.map((item) => item.id)),
    ),
    tournamentCatchId: input.tournamentCatchId || undefined,
  }
  const nextFish = state.fish.map((item) =>
    item.id === fishId
      ? { ...item, lake: input.lake, updatedAt: now }
      : { ...item },
  )

  return {
    fish: nextFish,
    fishRecord: nextFish.find((item) => item.id === fishId)!,
    message: `Meranie ryby ${fishRecord.name || fishRecord.chipCode} bolo uložené.`,
    observation,
    observations: [observation, ...state.observations],
    ok: true,
    statusCode: 201,
    updatedAt: now,
  }
}

export function updateTaggedFishIdentity(
  fishId: string,
  rawInput: unknown,
  state: FishRegistryState,
  now = new Date().toISOString(),
): FishRegistryUpdateSuccess | FishRegistryValidationFailure {
  const existing = state.fish.find((item) => item.id === fishId)
  if (!existing) return validationFailure(['Ryba sa v registri nenašla.'], 404)

  const parsed = fishIdentityUpdateInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return validationFailure(parsed.error.issues.map((issue) => issue.message))
  }

  const input = parsed.data
  const statusChanged = input.status !== existing.status
  if (statusChanged && input.changeNote.length < 3) {
    return validationFailure(['Pri zmene stavu doplňte stručný dôvod.'])
  }

  const identityChanged = (
    input.name !== existing.name
    || input.notes !== existing.notes
    || input.species !== existing.species
    || statusChanged
  )
  if (!identityChanged) {
    return validationFailure(['Na rybe nie sú žiadne zmeny na uloženie.'])
  }

  const fishRecord: TaggedFish = {
    ...existing,
    name: input.name,
    notes: input.notes,
    species: input.species,
    status: input.status,
    updatedAt: now,
  }

  return {
    changeNote: input.changeNote,
    fish: state.fish.map((item) => item.id === fishId ? fishRecord : { ...item }),
    fishRecord,
    message: statusChanged
      ? `Ryba ${fishRecord.name || fishRecord.chipCode} má nový stav: ${fishRegistryStatusLabels[fishRecord.status]}.`
      : `Údaje ryby ${fishRecord.name || fishRecord.chipCode} boli aktualizované.`,
    observations: state.observations.map((item) => ({ ...item })),
    ok: true,
    previousStatus: existing.status,
    statusCode: 200,
    updatedAt: now,
  }
}

export function getFishObservations(fishId: string, observations: FishObservation[]) {
  return observations
    .filter((item) => item.fishId === fishId)
    .sort((first, second) => Date.parse(first.observedAt) - Date.parse(second.observedAt))
}

export function searchFishRegistry(fish: TaggedFish[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('sk')
  if (!normalizedQuery) return fish

  return fish.filter((item) =>
    item.chipCode.toLocaleLowerCase('sk').includes(normalizedQuery)
    || item.name.toLocaleLowerCase('sk').includes(normalizedQuery)
    || item.species.toLocaleLowerCase('sk').includes(normalizedQuery),
  )
}
