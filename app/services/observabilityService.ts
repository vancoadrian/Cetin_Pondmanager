import type { EnvironmentReadinessReport } from './environmentReadinessService'

export type SystemHealthStatus = 'degraded' | 'down' | 'ok'
export type ObservedErrorSeverity = 'critical' | 'error' | 'info' | 'warning'
export type ObservedErrorSource = 'client' | 'health' | 'scheduler' | 'server'

export interface SystemHealthCheck {
  checkedAt: string
  detail: string
  id: string
  label: string
  metadata?: Record<string, boolean | number | string | null>
  status: SystemHealthStatus
}

export interface RecentErrorStats {
  critical24h: number
  latestAt?: string
  total24h: number
  warning24h: number
}

export interface SystemHealthResponse {
  checkedAt: string
  checks: SystemHealthCheck[]
  environment: string
  ok: boolean
  recentErrors: RecentErrorStats
  service: string
  status: SystemHealthStatus
}

export interface AdminSystemHealthResponse extends SystemHealthResponse {
  dataDirectory?: string
  environmentReadiness?: EnvironmentReadinessReport
  recentErrorEntries: ObservedErrorEntry[]
}

export interface ObservedErrorInput {
  context?: Record<string, unknown>
  message: unknown
  route?: unknown
  severity?: ObservedErrorSeverity
  source?: ObservedErrorSource
  stack?: unknown
  userAgent?: unknown
}

export interface ObservedErrorEntry {
  context: Record<string, boolean | number | string | null>
  createdAt: string
  id: string
  message: string
  route?: string
  severity: ObservedErrorSeverity
  source: ObservedErrorSource
  stack?: string
  userAgent?: string
}

export interface ErrorLogState {
  errors: ObservedErrorEntry[]
}

interface NormalizedObservedErrorInput {
  context: Record<string, boolean | number | string | null>
  message: string
  route?: string
  severity: ObservedErrorSeverity
  source: ObservedErrorSource
  stack?: string
  userAgent?: string
}

const healthStatusRank: Record<SystemHealthStatus, number> = {
  ok: 1,
  degraded: 2,
  down: 3,
}

const supportedSeverities = new Set<ObservedErrorSeverity>(['critical', 'error', 'info', 'warning'])
const supportedSources = new Set<ObservedErrorSource>(['client', 'health', 'scheduler', 'server'])

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function normalizeString(value: unknown, fallback: string, maxLength: number) {
  if (value instanceof Error) return truncate(value.message || fallback, maxLength)
  if (typeof value === 'string' && value.trim()) return truncate(value.trim(), maxLength)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  return fallback
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== 'string' || !value.trim()) return undefined

  return truncate(value.trim(), maxLength)
}

function normalizeSeverity(value: unknown): ObservedErrorSeverity {
  return supportedSeverities.has(value as ObservedErrorSeverity) ? value as ObservedErrorSeverity : 'error'
}

function normalizeSource(value: unknown): ObservedErrorSource {
  return supportedSources.has(value as ObservedErrorSource) ? value as ObservedErrorSource : 'client'
}

function compactTimestamp(now: string) {
  const parsed = Date.parse(now)
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date()

  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function uniqueId(baseId: string, existingIds: Set<string>) {
  if (!existingIds.has(baseId)) return baseId

  let index = 2
  while (existingIds.has(`${baseId}-${index}`)) {
    index += 1
  }

  return `${baseId}-${index}`
}

export function resolveSystemHealthStatus(checks: SystemHealthCheck[]) {
  return checks.reduce<SystemHealthStatus>((current, check) =>
    healthStatusRank[check.status] > healthStatusRank[current] ? check.status : current,
  'ok')
}

export function cloneObservedErrors(errors: ObservedErrorEntry[]) {
  return errors.map((error) => ({
    ...error,
    context: { ...error.context },
  }))
}

export function normalizeObservedErrorInput(input: ObservedErrorInput): NormalizedObservedErrorInput {
  return {
    ...input,
    context: normalizeObservedErrorContext(input.context),
    message: normalizeString(input.message, 'Neznáma chyba aplikácie.', 500),
    route: normalizeOptionalString(input.route, 240),
    severity: normalizeSeverity(input.severity),
    source: normalizeSource(input.source),
    stack: normalizeOptionalString(input.stack, 2_000),
    userAgent: normalizeOptionalString(input.userAgent, 500),
  }
}

export function normalizeObservedErrorContext(context: unknown): Record<string, boolean | number | string | null> {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return {}

  return Object.fromEntries(
    Object.entries(context as Record<string, unknown>)
      .slice(0, 12)
      .map(([key, value]) => {
        const normalizedKey = truncate(key, 80)
        if (typeof value === 'string') return [normalizedKey, truncate(value, 240)]
        if (typeof value === 'number' && Number.isFinite(value)) return [normalizedKey, value]
        if (typeof value === 'boolean' || value === null) return [normalizedKey, value]

        return [normalizedKey, truncate(JSON.stringify(value) ?? String(value), 240)]
      }),
  )
}

export function createObservedErrorEntry(
  input: ObservedErrorInput,
  existingErrors: ObservedErrorEntry[] = [],
  now = new Date().toISOString(),
): ObservedErrorEntry {
  const normalized = normalizeObservedErrorInput(input)
  const idBase = [
    'err',
    compactTimestamp(now),
    normalized.source,
    normalized.severity,
  ].join('-')

  return {
    context: normalized.context,
    createdAt: now,
    id: uniqueId(idBase, new Set(existingErrors.map((error) => error.id))),
    message: normalized.message,
    route: normalized.route,
    severity: normalized.severity,
    source: normalized.source,
    stack: normalized.stack,
    userAgent: normalized.userAgent,
  }
}

export function getRecentErrorStats(
  errors: ObservedErrorEntry[],
  now = new Date().toISOString(),
): RecentErrorStats {
  const nowMs = Date.parse(now)
  const cutoff = Number.isFinite(nowMs) ? nowMs - 24 * 60 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000
  const recent = errors.filter((error) => {
    const createdMs = Date.parse(error.createdAt)

    return Number.isFinite(createdMs) && createdMs >= cutoff
  })

  return {
    critical24h: recent.filter((error) => error.severity === 'critical').length,
    latestAt: recent[0]?.createdAt,
    total24h: recent.length,
    warning24h: recent.filter((error) => error.severity === 'warning').length,
  }
}

export function createErrorPressureCheck(
  errors: ObservedErrorEntry[],
  checkedAt = new Date().toISOString(),
): SystemHealthCheck {
  const stats = getRecentErrorStats(errors, checkedAt)
  const status: SystemHealthStatus = stats.critical24h > 0 || stats.total24h >= 10
    ? 'degraded'
    : 'ok'

  return {
    checkedAt,
    detail: stats.total24h === 0
      ? 'Za posledných 24 hodín nie sú uložené žiadne chyby.'
      : `Za posledných 24 hodín je uložených ${stats.total24h} chýb.`,
    id: 'error-pressure',
    label: 'Error reporting',
    metadata: {
      critical24h: stats.critical24h,
      total24h: stats.total24h,
      warning24h: stats.warning24h,
    },
    status,
  }
}
