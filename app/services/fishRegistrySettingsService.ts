import { z } from 'zod'
import type { LakeSlug } from '~/data/pond'
import type { FishRegistryValidationFailure } from '~/services/fishRegistryService'
import { validationFailure } from '~/services/fishRegistryService'

export const FISH_MANAGER_CALL_THRESHOLD_KG = 18
export const FISH_MANAGER_TIME_ZONE = 'Europe/Bratislava'

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
