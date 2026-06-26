import { z } from 'zod'
import type { LakeSlug } from '~/data/pond'
import type { FishRegistrySettings } from '~/services/fishRegistryService'
import {
  getFishLargeCatchRule,
  getFishManagerAvailability,
} from '~/services/fishRegistryService'
import { pondService, type PondService } from '~/services/pondService'

export type LargeFishAssistanceStatus =
  | 'cancelled'
  | 'completed'
  | 'expired'
  | 'on-route'
  | 'release-without-manager'
  | 'waiting'

export const LARGE_FISH_ASSISTANCE_PHONE_FALLBACK_MINUTES = 5
export const LARGE_FISH_ASSISTANCE_WAITING_EXPIRY_MINUTES = 30
export const LARGE_FISH_ASSISTANCE_ON_ROUTE_GRACE_MINUTES = 45

export interface LargeFishAssistanceRequest {
  anglerName: string
  caughtAt: string
  createdAt: string
  etaMinutes?: number
  id: string
  lake: LakeSlug
  lengthCm: number
  managerName?: string
  managerPhone: string
  note: string
  pegId: string
  pegLabel: string
  phone: string
  publicToken: string
  respondedAt?: string
  responseMessage?: string
  resolvedAt?: string
  species: string
  status: LargeFishAssistanceStatus
  updatedAt: string
  weightKg: number
}

export interface LargeFishAssistanceState {
  requests: LargeFishAssistanceRequest[]
}

export interface LargeFishAssistanceStateResponse extends LargeFishAssistanceState {
  ok: true
  updatedAt: string
}

export interface LargeFishAssistanceMutationSuccess extends LargeFishAssistanceState {
  message: string
  ok: true
  request: LargeFishAssistanceRequest
  statusCode: 200 | 201
}

export interface LargeFishAssistancePublicResponse {
  ok: true
  request: LargeFishAssistanceRequest
  updatedAt: string
}

export interface LargeFishAssistanceValidationFailure {
  messages: string[]
  ok: false
  statusCode: 400 | 403 | 404 | 409 | 422
}

export const largeFishAssistanceStatusLabels: Record<LargeFishAssistanceStatus, string> = {
  cancelled: 'zrušené',
  completed: 'vybavené',
  expired: 'vypršalo',
  'on-route': 'správca je na ceste',
  'release-without-manager': 'pustiť bez správcu',
  waiting: 'čaká na odpoveď',
}

export const largeFishAssistanceInputSchema = z.object({
  anglerName: z.string().trim().min(2, 'Doplňte meno rybára.').max(120),
  caughtAt: z.string().min(10, 'Doplňte čas úlovku.'),
  lake: z.enum(['velky-cetin', 'strkovisko-kocka']),
  lengthCm: z.coerce.number().min(1, 'Dĺžka musí byť väčšia ako 0.').max(250),
  note: z.string().trim().max(500, 'Poznámka môže mať najviac 500 znakov.').default(''),
  pegId: z.string().trim().min(1, 'Vyberte lovné miesto.'),
  phone: z.string().trim().min(7, 'Doplňte telefónne číslo.').max(30),
  species: z.string().trim().min(2, 'Doplňte druh ryby.').max(100),
  weightKg: z.coerce.number().min(0.1, 'Váha musí byť väčšia ako 0.').max(80),
})

export const largeFishAssistanceActionSchema = z.object({
  action: z.enum(['cancelled', 'completed', 'on-route', 'release-without-manager']),
  etaMinutes: z.preprocess(
    (value) => value === '' || value === null || value === undefined ? undefined : value,
    z.coerce.number().int().min(1).max(120).optional(),
  ),
  responseMessage: z.string().trim().max(500).default(''),
}).superRefine((value, ctx) => {
  if (value.action === 'on-route' && value.etaMinutes === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pri odpovedi Som na ceste vyberte odhad príchodu.',
      path: ['etaMinutes'],
    })
  }
})

function failure(
  messages: string[],
  statusCode: LargeFishAssistanceValidationFailure['statusCode'] = 422,
): LargeFishAssistanceValidationFailure {
  return {
    messages: [...new Set(messages)],
    ok: false,
    statusCode,
  }
}

function validationMessages(error: z.ZodError) {
  return error.issues.map((issue) => issue.message)
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'miesto'
}

function createRequestId(
  pegLabel: string,
  state: LargeFishAssistanceState,
  now: string,
) {
  const date = now.slice(0, 10).replaceAll('-', '')
  const base = `fish-help-${date}-${slugify(pegLabel).slice(0, 24)}`
  if (!state.requests.some((request) => request.id === base)) return base

  let index = 2
  while (state.requests.some((request) => request.id === `${base}-${index}`)) index += 1
  return `${base}-${index}`
}

function defaultResponseMessage(
  action: z.infer<typeof largeFishAssistanceActionSchema>['action'],
  etaMinutes?: number,
) {
  if (action === 'on-route') {
    return `Správca je na ceste, odhadovaný príchod je do ${etaMinutes} min. Rybu bezpečne držte vo vode a pripravte podložku.`
  }
  if (action === 'release-without-manager') {
    return 'Správca teraz nepríde. Rybu zdokumentujte, šetrne pustite späť a úlovok uložte do denníka.'
  }
  if (action === 'completed') return 'Kontrola ryby je vybavená.'
  return 'Privolanie správcu bolo zrušené.'
}

function timestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function expiryAt(request: LargeFishAssistanceRequest) {
  if (request.status === 'waiting') {
    return timestamp(request.createdAt) + LARGE_FISH_ASSISTANCE_WAITING_EXPIRY_MINUTES * 60_000
  }
  if (request.status === 'on-route') {
    const responseAt = timestamp(request.respondedAt ?? request.updatedAt)
    return responseAt + ((request.etaMinutes ?? 0) + LARGE_FISH_ASSISTANCE_ON_ROUTE_GRACE_MINUTES) * 60_000
  }
  return Number.POSITIVE_INFINITY
}

export function cloneLargeFishAssistanceState(
  state: LargeFishAssistanceState,
): LargeFishAssistanceState {
  return {
    requests: state.requests.map((request) => ({ ...request })),
  }
}

export function expireLargeFishAssistanceRequests(
  state: LargeFishAssistanceState,
  now = new Date().toISOString(),
): LargeFishAssistanceState {
  const nowTimestamp = timestamp(now)

  return {
    requests: state.requests.map((request) => {
      if (!['waiting', 'on-route'].includes(request.status) || nowTimestamp < expiryAt(request)) {
        return { ...request }
      }

      return {
        ...request,
        resolvedAt: now,
        responseMessage: request.status === 'waiting'
          ? 'Správca v časovom limite neodpovedal. Rybu zbytočne nezadržiavajte; zavolajte na uvedené číslo alebo postupujte podľa pravidiel revíru.'
          : 'Odhadovaný čas príchodu už uplynul. Zavolajte správcovi a rybu zbytočne nezadržiavajte.',
        status: 'expired' as const,
        updatedAt: now,
      }
    }),
  }
}

export function submitLargeFishAssistanceRequest(
  rawInput: unknown,
  state: LargeFishAssistanceState,
  settings: FishRegistrySettings,
  publicToken: string,
  service: PondService = pondService,
  now = new Date().toISOString(),
): LargeFishAssistanceMutationSuccess | LargeFishAssistanceValidationFailure {
  const parsed = largeFishAssistanceInputSchema.safeParse(rawInput)
  if (!parsed.success) return failure(validationMessages(parsed.error))

  const input = parsed.data
  const lake = service.getLakeBySlug(input.lake)
  if (!lake) return failure(['Vybrané jazero neexistuje.'], 404)

  const peg = service.pegs.find((item) => item.id === input.pegId && item.lake === input.lake)
  if (!peg) return failure(['Vybrané lovné miesto neexistuje pre toto jazero.'], 404)

  const rule = getFishLargeCatchRule(input.lake, settings)
  if (!rule?.enabled) return failure(['Privolanie správcu pre toto jazero nie je zapnuté.'], 403)
  if (input.weightKg < rule.thresholdKg) {
    return failure([`Správcu možno privolať pri rybe od ${rule.thresholdKg} kg.`], 422)
  }

  const availability = getFishManagerAvailability(rule, now)
  if (!availability.available) {
    return failure([rule.outsideAvailabilityInstruction], 403)
  }

  const normalizedState = expireLargeFishAssistanceRequests(state, now)
  const duplicate = normalizedState.requests.find((request) =>
    request.lake === input.lake
    && request.pegId === input.pegId
    && request.phone === input.phone
    && ['waiting', 'on-route'].includes(request.status),
  )
  if (duplicate) {
    return failure(['Pre toto miesto a telefón už existuje otvorené privolanie správcu.'], 409)
  }

  const request: LargeFishAssistanceRequest = {
    ...input,
    createdAt: now,
    id: createRequestId(peg.label, state, now),
    managerPhone: rule.phone,
    pegLabel: peg.label,
    publicToken,
    status: 'waiting',
    updatedAt: now,
  }

  return {
    message: 'Správca bol privolaný. Počkajte na jeho odpoveď v tejto obrazovke.',
    ok: true,
    request,
    requests: [request, ...normalizedState.requests],
    statusCode: 201,
  }
}

export function respondToLargeFishAssistanceRequest(
  requestId: string,
  rawInput: unknown,
  state: LargeFishAssistanceState,
  managerName: string,
  now = new Date().toISOString(),
): LargeFishAssistanceMutationSuccess | LargeFishAssistanceValidationFailure {
  const parsed = largeFishAssistanceActionSchema.safeParse(rawInput)
  if (!parsed.success) return failure(validationMessages(parsed.error))

  const existing = state.requests.find((request) => request.id === requestId)
  if (!existing) return failure(['Privolanie správcu sa nenašlo.'], 404)
  if (['completed', 'cancelled', 'expired', 'release-without-manager'].includes(existing.status)) {
    return failure(['Toto privolanie je už uzavreté.'], 409)
  }

  const input = parsed.data
  const responseMessage = input.responseMessage || defaultResponseMessage(input.action, input.etaMinutes)
  const request: LargeFishAssistanceRequest = {
    ...existing,
    etaMinutes: input.action === 'on-route' ? input.etaMinutes : undefined,
    managerName,
    respondedAt: now,
    responseMessage,
    resolvedAt: ['cancelled', 'completed', 'release-without-manager'].includes(input.action)
      ? now
      : undefined,
    status: input.action,
    updatedAt: now,
  }

  return {
    message: responseMessage,
    ok: true,
    request,
    requests: state.requests.map((item) => item.id === request.id ? request : item),
    statusCode: 200,
  }
}

export function cancelLargeFishAssistanceRequest(
  requestId: string,
  publicToken: string,
  state: LargeFishAssistanceState,
  now = new Date().toISOString(),
): LargeFishAssistanceMutationSuccess | LargeFishAssistanceValidationFailure {
  const normalizedState = expireLargeFishAssistanceRequests(state, now)
  const existing = normalizedState.requests.find((request) => request.id === requestId)
  if (!existing || existing.publicToken !== publicToken) {
    return failure(['Privolanie správcu sa nenašlo alebo odkaz nie je platný.'], 404)
  }
  if (!['waiting', 'on-route'].includes(existing.status)) {
    return failure(['Toto privolanie už nie je možné zrušiť.'], 409)
  }

  const request: LargeFishAssistanceRequest = {
    ...existing,
    resolvedAt: now,
    responseMessage: 'Rybár privolanie zrušil.',
    status: 'cancelled',
    updatedAt: now,
  }

  return {
    message: 'Rybár privolanie zrušil.',
    ok: true,
    request,
    requests: normalizedState.requests.map((item) => item.id === request.id ? request : item),
    statusCode: 200,
  }
}

export function getLargeFishAssistanceRequest(
  requestId: string,
  publicToken: string,
  state: LargeFishAssistanceState,
  now = new Date().toISOString(),
) {
  const normalizedState = expireLargeFishAssistanceRequests(state, now)
  const request = normalizedState.requests.find((item) => item.id === requestId)
  if (!request || request.publicToken !== publicToken) {
    return failure(['Privolanie správcu sa nenašlo alebo odkaz nie je platný.'], 404)
  }

  return {
    ok: true as const,
    request: { ...request },
  }
}
