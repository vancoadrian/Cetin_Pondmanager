import { z } from 'zod'
import type {
  CatchRecord,
  LakeSlug,
  Peg,
  Tournament,
  TournamentCatch,
} from '~/data/pond'

export const FISH_MANAGER_CALL_THRESHOLD_KG = 18
export const FISH_MANAGER_TIME_ZONE = 'Europe/Bratislava'

export type FishRegistryStatus = 'active' | 'dead' | 'missing' | 'transferred'
export type FishTaggingContext = 'capture' | 'routine' | 'tournament'
export type FishObservationSource = 'import' | 'manager' | 'public-catch' | 'tournament'
export type FishManagerContactMode = 'email' | 'phone' | 'phone-or-email'

export interface FishManagerAvailabilityWindow {
  daysOfWeek: number[]
  endsAt: string
  id: string
  label: string
  startsAt: string
}

export interface FishManagerPresenceOverride {
  endsAt: string
  setBy: string
  startedAt: string
}

export interface FishLargeCatchRule {
  availabilityWindows: FishManagerAvailabilityWindow[]
  contactMode: FishManagerContactMode
  email: string
  enabled: boolean
  instruction: string
  lake: LakeSlug
  outsideAvailabilityInstruction: string
  phone: string
  presenceOverride?: FishManagerPresenceOverride
  thresholdKg: number
}

export interface FishRegistrySettings {
  largeCatchRules: FishLargeCatchRule[]
}

export interface FishManagerAvailabilityState {
  available: boolean
  checkedAt: string
  matchingWindow?: FishManagerAvailabilityWindow
  presenceOverride?: FishManagerPresenceOverride
  source: 'none' | 'presence' | 'schedule'
}

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

export interface FishCatchCandidate {
  anglerName: string
  bait: string
  catchId?: string
  caughtAt: string
  id: string
  lake: LakeSlug
  lengthCm: number
  locationLabel: string
  notes: string
  pegId?: string
  sectorId?: string
  source: 'public-catch' | 'tournament'
  species: string
  statusLabel: string
  thresholdKg: number
  tournamentCatchId?: string
  weightKg: number
}

export interface FishCatchCandidateResponse {
  candidates: FishCatchCandidate[]
  ok: true
  settings: FishRegistrySettings
  thresholdKg: number
  updatedAt: string
}

export interface FishLargeCatchRulesResponse {
  ok: true
  rules: FishLargeCatchRule[]
  updatedAt: string
}

export interface FishRegistrySettingsMutationSuccess {
  message: string
  ok: true
  settings: FishRegistrySettings
  statusCode: 200
  updatedAt: string
}

export interface FishManagerPresenceMutationSuccess extends FishRegistrySettingsMutationSuccess {
  lake?: LakeSlug
  lakes: LakeSlug[]
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

export interface FishRegistryImportSuccess extends FishRegistryStateResponse {
  createdFishCount: number
  importedObservationCount: number
  message: string
  skippedObservationCount: number
  statusCode: 200
  updatedFishCount: number
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

export const fishRegistryImportInputSchema = z.object({
  csv: z.string().min(1, 'Vyberte CSV súbor s údajmi.').max(5_000_000, 'CSV súbor je príliš veľký.'),
})

const fishManagerAvailabilityWindowSchema = z.object({
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6))
    .min(1, 'Vyberte aspoň jeden deň služby.')
    .max(7)
    .refine((days) => new Set(days).size === days.length, 'Deň služby je uvedený viackrát.'),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/, 'Koniec služby musí mať formát HH:mm.'),
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2, 'Pomenujte čas služby.').max(80),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/, 'Začiatok služby musí mať formát HH:mm.'),
})

const fishManagerPresenceOverrideSchema = z.object({
  endsAt: z.string().datetime(),
  setBy: z.string().trim().min(2).max(120),
  startedAt: z.string().datetime(),
})

export const fishLargeCatchRuleSchema = z.object({
  availabilityWindows: z.array(fishManagerAvailabilityWindowSchema)
    .min(1, 'Doplňte aspoň jeden čas, kedy možno správcu kontaktovať.')
    .max(20),
  contactMode: z.enum(['email', 'phone', 'phone-or-email']),
  email: z.string().trim().email('E-mail nemá platný formát.').or(z.literal('')),
  enabled: z.boolean(),
  instruction: z.string().trim().min(10, 'Pokyn musí mať aspoň 10 znakov.').max(500),
  lake: z.enum(['velky-cetin', 'strkovisko-kocka']),
  outsideAvailabilityInstruction: z.string()
    .trim()
    .min(10, 'Doplňte pokyn mimo služby.')
    .max(500),
  phone: z.string().trim().max(40),
  presenceOverride: fishManagerPresenceOverrideSchema.optional(),
  thresholdKg: z.coerce.number().min(0.1, 'Limit musí byť väčší ako 0 kg.').max(80),
}).superRefine((value, ctx) => {
  if (value.enabled && value.contactMode !== 'email' && value.phone.length < 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pre telefonický kontakt doplňte telefón.',
      path: ['phone'],
    })
  }
  if (value.enabled && value.contactMode !== 'phone' && !value.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pre e-mailový kontakt doplňte e-mail.',
      path: ['email'],
    })
  }
})

const lakeSlugSchema = z.enum(['velky-cetin', 'strkovisko-kocka'])

export const fishManagerPresenceInputSchema = z.object({
  action: z.enum(['start', 'stop']),
  durationHours: z.coerce.number().int().min(1).max(12).default(4),
  lake: lakeSlugSchema.optional(),
  lakes: z.array(lakeSlugSchema).min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  if (!value.lake && !value.lakes?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Vyberte aspoň jedno jazero.',
      path: ['lakes'],
    })
  }
}).transform((value) => ({
  action: value.action,
  durationHours: value.durationHours,
  lakes: [...new Set(value.lakes ?? (value.lake ? [value.lake] : []))],
}))

export const fishRegistrySettingsInputSchema = z.object({
  largeCatchRules: z.array(fishLargeCatchRuleSchema)
    .min(1, 'Doplňte pravidlo aspoň pre jedno jazero.')
    .max(100),
}).superRefine((value, ctx) => {
  const lakeIds = value.largeCatchRules.map((rule) => rule.lake)
  if (new Set(lakeIds).size !== lakeIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Každé jazero môže mať iba jedno pravidlo veľkej ryby.',
      path: ['largeCatchRules'],
    })
  }
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

export const fishManagerContactModeLabels: Record<FishManagerContactMode, string> = {
  email: 'e-mail',
  phone: 'telefonicky',
  'phone-or-email': 'telefonicky alebo e-mailom',
}

export const fishManagerWeekdayOptions = [
  { label: 'Po', value: 1 },
  { label: 'Ut', value: 2 },
  { label: 'St', value: 3 },
  { label: 'Št', value: 4 },
  { label: 'Pi', value: 5 },
  { label: 'So', value: 6 },
  { label: 'Ne', value: 0 },
] as const

function createDefaultAvailabilityWindows(): FishManagerAvailabilityWindow[] {
  return [{
    daysOfWeek: [6, 0],
    endsAt: '18:00',
    id: 'weekend-service',
    label: 'Víkendová služba',
    startsAt: '07:00',
  }]
}

export function createDefaultFishRegistrySettings(): FishRegistrySettings {
  const instruction = 'Rybár privolá správcu. Správca načíta čip, uloží meranie alebo rybu označí novým čipom.'
  const outsideAvailabilityInstruction = 'Úlovok hneď zapíšte s fotkou. Mimo služby správcu nevolajte a rybu zbytočne nezadržiavajte; správca záznam preverí neskôr.'

  return {
    largeCatchRules: [
      {
        availabilityWindows: createDefaultAvailabilityWindows(),
        contactMode: 'phone',
        email: '',
        enabled: true,
        instruction,
        lake: 'velky-cetin',
        outsideAvailabilityInstruction,
        phone: '0911 298 702',
        thresholdKg: FISH_MANAGER_CALL_THRESHOLD_KG,
      },
      {
        availabilityWindows: createDefaultAvailabilityWindows(),
        contactMode: 'phone',
        email: '',
        enabled: true,
        instruction,
        lake: 'strkovisko-kocka',
        outsideAvailabilityInstruction,
        phone: '0911 298 702',
        thresholdKg: FISH_MANAGER_CALL_THRESHOLD_KG,
      },
    ],
  }
}

export function normalizeFishRegistrySettings(settings?: Partial<FishRegistrySettings>): FishRegistrySettings {
  const defaults = createDefaultFishRegistrySettings()
  const suppliedRules = settings?.largeCatchRules ?? []
  const suppliedByLake = new Map(suppliedRules.map((rule) => [rule.lake, rule]))

  return {
    largeCatchRules: defaults.largeCatchRules.map((defaultRule) => {
      const suppliedRule = suppliedByLake.get(defaultRule.lake)
      const suppliedWindows = suppliedRule?.availabilityWindows

      return {
        ...defaultRule,
        ...suppliedRule,
        availabilityWindows: Array.isArray(suppliedWindows) && suppliedWindows.length > 0
          ? suppliedWindows.map((window) => ({
              ...window,
              daysOfWeek: [...window.daysOfWeek],
            }))
          : defaultRule.availabilityWindows.map((window) => ({
              ...window,
              daysOfWeek: [...window.daysOfWeek],
            })),
        lake: defaultRule.lake,
        outsideAvailabilityInstruction: suppliedRule?.outsideAvailabilityInstruction
          || defaultRule.outsideAvailabilityInstruction,
        presenceOverride: suppliedRule?.presenceOverride
          ? { ...suppliedRule.presenceOverride }
          : undefined,
      }
    }),
  }
}

export function getFishLargeCatchRule(
  lake: LakeSlug,
  settings = createDefaultFishRegistrySettings(),
) {
  return settings.largeCatchRules.find((rule) => rule.lake === lake)
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

function getVenueDateParts(value: string | Date) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    const [datePart = '', timePart = ''] = value.split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    const date = new Date(Date.UTC(year!, (month ?? 1) - 1, day))

    return {
      dayOfWeek: date.getUTCDay(),
      minutes: (hour ?? 0) * 60 + (minute ?? 0),
    }
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) return undefined
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: FISH_MANAGER_TIME_ZONE,
    weekday: 'short',
  }).formatToParts(parsed)
  const weekday = parts.find((part) => part.type === 'weekday')?.value
  const weekdayMap: Record<string, number> = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 0,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  }

  return {
    dayOfWeek: weekday ? weekdayMap[weekday] : undefined,
    minutes: Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60
      + Number(parts.find((part) => part.type === 'minute')?.value ?? 0),
  }
}

function getVenueDateTimeKey(value: string | Date) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return Number(value.replace(/\D/g, '').slice(0, 12))
  }

  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) return undefined
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: FISH_MANAGER_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(parsed)
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return Number([
    getPart('year'),
    getPart('month'),
    getPart('day'),
    getPart('hour'),
    getPart('minute'),
  ].join(''))
}

function availabilityWindowMatches(
  window: FishManagerAvailabilityWindow,
  dayOfWeek: number,
  minutes: number,
) {
  const startsAt = timeToMinutes(window.startsAt)
  const endsAt = timeToMinutes(window.endsAt)

  if (startsAt <= endsAt) {
    return window.daysOfWeek.includes(dayOfWeek)
      && minutes >= startsAt
      && minutes <= endsAt
  }

  const previousDay = (dayOfWeek + 6) % 7
  return (
    window.daysOfWeek.includes(dayOfWeek) && minutes >= startsAt
  ) || (
    window.daysOfWeek.includes(previousDay) && minutes <= endsAt
  )
}

export function getFishManagerAvailability(
  rule: FishLargeCatchRule,
  at: string | Date,
): FishManagerAvailabilityState {
  const checkedAtKey = getVenueDateTimeKey(at)
  const presenceStartedAtKey = rule.presenceOverride
    ? getVenueDateTimeKey(rule.presenceOverride.startedAt)
    : undefined
  const presenceEndsAtKey = rule.presenceOverride
    ? getVenueDateTimeKey(rule.presenceOverride.endsAt)
    : undefined
  const presenceActive = checkedAtKey !== undefined
    && presenceStartedAtKey !== undefined
    && presenceEndsAtKey !== undefined
    && checkedAtKey >= presenceStartedAtKey
    && checkedAtKey <= presenceEndsAtKey

  if (rule.enabled && presenceActive) {
    return {
      available: true,
      checkedAt: at instanceof Date ? at.toISOString() : at,
      presenceOverride: rule.presenceOverride,
      source: 'presence',
    }
  }

  const dateParts = getVenueDateParts(at)
  const matchingWindow = dateParts?.dayOfWeek === undefined
    ? undefined
    : rule.availabilityWindows.find((window) =>
        availabilityWindowMatches(window, dateParts.dayOfWeek!, dateParts.minutes),
      )

  return {
    available: Boolean(rule.enabled && matchingWindow),
    checkedAt: at instanceof Date ? at.toISOString() : at,
    matchingWindow,
    source: rule.enabled && matchingWindow ? 'schedule' : 'none',
  }
}

export function setFishManagerPresence(
  rawInput: unknown,
  settings: FishRegistrySettings,
  setBy: string,
  now = new Date().toISOString(),
): FishRegistrySettingsMutationSuccess | FishRegistryValidationFailure {
  const parsed = fishManagerPresenceInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return validationFailure(parsed.error.issues.map((issue) => issue.message))
  }

  const missingLakes = parsed.data.lakes.filter((lake) => !getFishLargeCatchRule(lake, settings))
  if (missingLakes.length > 0) {
    return validationFailure([`Pravidlo sa nenašlo pre: ${missingLakes.join(', ')}.`], 404)
  }

  const nextSettings = normalizeFishRegistrySettings(settings)
  const startedAt = new Date(now)
  const presenceOverride: FishManagerPresenceOverride = {
    endsAt: new Date(startedAt.getTime() + parsed.data.durationHours * 60 * 60 * 1000).toISOString(),
    setBy,
    startedAt: startedAt.toISOString(),
  }

  for (const lake of parsed.data.lakes) {
    const nextRule = getFishLargeCatchRule(lake, nextSettings)!
    if (parsed.data.action === 'start') {
      nextRule.presenceOverride = { ...presenceOverride }
    }
    else {
      delete nextRule.presenceOverride
    }
  }

  const lakeCount = parsed.data.lakes.length
  return {
    message: parsed.data.action === 'start'
      ? `Dočasná dostupnosť bola zapnutá pre ${lakeCount} ${lakeCount === 1 ? 'jazero' : 'jazerá'} na ${parsed.data.durationHours} h.`
      : `Dočasná dostupnosť bola ukončená pre ${lakeCount} ${lakeCount === 1 ? 'jazero' : 'jazerá'}.`,
    ok: true,
    settings: nextSettings,
    statusCode: 200,
    updatedAt: now,
  }
}

function formatWeekdayRange(daysOfWeek: number[]) {
  const labels = fishManagerWeekdayOptions
    .filter((option) => daysOfWeek.includes(option.value))
    .map((option) => option.label)

  if (labels.length === 7) return 'Po-Ne'
  if (daysOfWeek.length === 2 && daysOfWeek.includes(6) && daysOfWeek.includes(0)) return 'So-Ne'
  return labels.join(', ')
}

export function formatFishManagerAvailability(rule: FishLargeCatchRule) {
  return rule.availabilityWindows
    .map((window) => `${formatWeekdayRange(window.daysOfWeek)} ${window.startsAt}-${window.endsAt}`)
    .join(' · ')
}

function validationFailure(messages: string[], statusCode: FishRegistryValidationFailure['statusCode'] = 422): FishRegistryValidationFailure {
  return {
    messages,
    ok: false,
    statusCode,
  }
}

function normalizeChipCode(value: string) {
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

export function createFishCatchCandidates(
  catches: CatchRecord[],
  tournamentCatches: TournamentCatch[],
  tournaments: Tournament[],
  observations: FishObservation[],
  settings = createDefaultFishRegistrySettings(),
): FishCatchCandidate[] {
  const linkedCatchIds = new Set(
    observations.map((observation) => observation.catchId).filter(Boolean),
  )
  const linkedTournamentCatchIds = new Set(
    observations.map((observation) => observation.tournamentCatchId).filter(Boolean),
  )
  const tournamentById = new Map(tournaments.map((tournament) => [tournament.id, tournament]))

  const publicCandidates: FishCatchCandidate[] = catches
    .flatMap((catchItem) => {
      const rule = getFishLargeCatchRule(catchItem.lake, settings)
      if (
        !rule?.enabled
        || catchItem.status === 'rejected'
        || catchItem.weightKg < rule.thresholdKg
        || linkedCatchIds.has(catchItem.id)
      ) {
        return []
      }

      return [{
      anglerName: catchItem.angler,
      bait: catchItem.bait,
      catchId: catchItem.id,
      caughtAt: catchItem.caughtAt,
      id: `public-catch:${catchItem.id}`,
      lake: catchItem.lake,
      lengthCm: catchItem.lengthCm,
      locationLabel: catchItem.pegId,
      notes: catchItem.notes,
      pegId: catchItem.pegId,
      source: 'public-catch',
      species: catchItem.species,
      statusLabel: catchItem.status === 'approved' ? 'schválený úlovok' : 'čaká na schválenie',
      thresholdKg: rule.thresholdKg,
      weightKg: catchItem.weightKg,
      }]
    })

  const tournamentCandidates: FishCatchCandidate[] = tournamentCatches
    .filter((catchItem) =>
      catchItem.status !== 'disputed'
      && !linkedTournamentCatchIds.has(catchItem.id),
    )
    .flatMap((catchItem) => {
      const tournament = tournamentById.get(catchItem.tournamentId)
      if (!tournament) return []
      const rule = getFishLargeCatchRule(tournament.lake, settings)
      if (!rule?.enabled || catchItem.weightKg < rule.thresholdKg) return []
      const sector = tournament.sectors.find((item) => item.id === catchItem.sectorId)

      return [{
        anglerName: catchItem.team,
        bait: '',
        caughtAt: catchItem.caughtAt,
        id: `tournament:${catchItem.id}`,
        lake: tournament.lake,
        lengthCm: catchItem.lengthCm,
        locationLabel: `Sektor ${sector?.label ?? catchItem.sectorId.toUpperCase()}`,
        notes: catchItem.notes,
        sectorId: catchItem.sectorId,
        source: 'tournament' as const,
        species: catchItem.species,
        statusLabel: catchItem.status === 'verified' ? 'overené kontrolórom' : 'čaká na kontrolóra',
        thresholdKg: rule.thresholdKg,
        tournamentCatchId: catchItem.id,
        weightKg: catchItem.weightKg,
      }]
    })

  return [...publicCandidates, ...tournamentCandidates]
    .sort((first, second) => second.weightKg - first.weightKg)
}

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
