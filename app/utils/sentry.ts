export const OBSERVABILITY_REDACTED_VALUE = '[Filtered]'
export const OBSERVABILITY_UI_SPAN_NAME = 'UI interaction'

const MAX_SANITIZE_DEPTH = 8

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const bearerPattern = /\bBearer\s+[A-Z0-9._~+/-]+=*/gi
const authorizationHeaderPattern = /(\bauthorization\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n,;}&]+)/gi
const cookieHeaderPattern = /(\b(?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi
const secretAssignmentPattern = /(\b(?:api[-_ ]?key|auth|authorization|cookie|password|secret|session|token|vapid)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}&]+)/gi
const sensitiveQueryPattern = /([?&](?:api[-_]?key|auth|code|email|password|phone|secret|session|token|vapid)[^=]*=)[^&#\s]*/gi
const embeddedUrlDetailsPattern = /((?:https?:\/\/|\/)[^\s?#"'<>]+)[?#][^\s"'<>]*/gi
const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const ipv6Pattern = /(^|[^A-F0-9:])((?:(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:){1,7}:|(?:[A-F0-9]{1,4}:){1,6}:[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:){1,5}(?::[A-F0-9]{1,4}){1,2}|(?:[A-F0-9]{1,4}:){1,4}(?::[A-F0-9]{1,4}){1,3}|(?:[A-F0-9]{1,4}:){1,3}(?::[A-F0-9]{1,4}){1,4}|(?:[A-F0-9]{1,4}:){1,2}(?::[A-F0-9]{1,4}){1,5}|[A-F0-9]{1,4}:(?:(?::[A-F0-9]{1,4}){1,6})|:(?:(?::[A-F0-9]{1,4}){1,7}|:)))(?=$|[^A-F0-9:])/gi
const internationalPhonePattern = /(^|[^\w])((?:\+|00)\d(?:[\s().-]*\d){7,14})(?=$|[^\w])/g
const groupedPhonePattern = /(^|[^\w])((?:0\d{8,10}|\d{3,4}(?:[\s.-]\d{3}){2}))(?=$|[^\w])/g
const logbookCapabilityPathPattern = /(\/api\/logbooks\/)[^/?#\s"'<>]+/gi
const droppedBreadcrumbPattern = /^(?:console(?:[.:/_-].*)?|dom(?:[.:/_-].*)?|log(?:ger|ging)?(?:[.:/_-].*)?|stderr|stdout|ui(?:[.:/_-].*)?)$/i
const uiSpanOperationPattern = /^(?:browser[.:/_-])?ui(?:[.:/_-].*)?$/i

const sensitiveKeySegments = new Set([
  'auth',
  'authorization',
  'cookie',
  'cookies',
  'email',
  'header',
  'headers',
  'ip',
  'password',
  'phone',
  'query',
  'secret',
  'session',
  'token',
  'vapid',
])

const exactSensitiveKeys = new Set([
  'apikey',
  'anglername',
  'auth',
  'authorization',
  'clientaddress',
  'contactname',
  'cookie',
  'cookies',
  'coordinates',
  'dsn',
  'email',
  'firstname',
  'fullname',
  'ip',
  'ipaddress',
  'lastname',
  'latitude',
  'longitude',
  'p256dh',
  'password',
  'phone',
  'phonenumber',
  'proxyauthorization',
  'query',
  'queryparams',
  'querystring',
  'remoteaddress',
  'secret',
  'servername',
  'session',
  'setcookie',
  'supabasepublishablekey',
  'telephone',
  'token',
  'useragent',
  'username',
  'vars',
])

const urlKeys = new Set([
  'description',
  'filename',
  'from',
  'href',
  'location',
  'path',
  'referer',
  'referrer',
  'requesturl',
  'route',
  'to',
  'transaction',
  'url',
])

function keySegments(key: string) {
  return key.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function normalizedKey(key: string) {
  return keySegments(key).join('')
}

function isSensitiveKey(key: string) {
  const normalized = normalizedKey(key)
  const segments = keySegments(key)
  const lastSegment = segments.at(-1)

  return exactSensitiveKeys.has(normalized)
    || segments.some((segment) => sensitiveKeySegments.has(segment))
    || (segments.some((segment) => segment === 'http' || segment === 'request' || segment === 'response' || segment === 'url')
      && segments.some((segment) => segment === 'body' || segment === 'query' || segment === 'search'))
    || (lastSegment === 'address' && segments.some((segment) => segment === 'client' || segment === 'peer' || segment === 'remote'))
    || normalized.endsWith('apikey')
    || normalized.endsWith('email')
    || normalized.endsWith('password')
    || normalized.endsWith('phone')
    || normalized.endsWith('secret')
    || normalized.endsWith('session')
    || normalized.endsWith('token')
    || normalized.includes('vapid')
}

function isUrlLikeKey(key: string) {
  const normalized = normalizedKey(key)
  const segments = keySegments(key)

  return urlKeys.has(normalized)
    || segments.some((segment) => segment === 'uri' || segment === 'url')
    || (segments.includes('http')
      && segments.some((segment) => segment === 'path' || segment === 'route' || segment === 'target'))
}

function isRequestOrResponseBody(path: string[], key: string) {
  const parent = normalizedKey(path.at(-1) ?? '')
  const current = normalizedKey(key)

  return (parent === 'request' || parent === 'response')
    && (current === 'body' || current === 'data' || current === 'env')
}

function sanitizeString(value: string) {
  return value
    .replace(logbookCapabilityPathPattern, '$1[code]')
    .replace(embeddedUrlDetailsPattern, '$1')
    .replace(bearerPattern, 'Bearer ' + OBSERVABILITY_REDACTED_VALUE)
    .replace(authorizationHeaderPattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
    .replace(cookieHeaderPattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
    .replace(secretAssignmentPattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
    .replace(sensitiveQueryPattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
    .replace(emailPattern, OBSERVABILITY_REDACTED_VALUE)
    .replace(ipv6Pattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
    .replace(ipv4Pattern, OBSERVABILITY_REDACTED_VALUE)
    .replace(internationalPhonePattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
    .replace(groupedPhonePattern, '$1' + OBSERVABILITY_REDACTED_VALUE)
}

export function stripUrlDetails(value: string) {
  const withoutCapabilityCodes = value.replace(logbookCapabilityPathPattern, '$1[code]')
  const queryIndex = withoutCapabilityCodes.indexOf('?')
  const fragmentIndex = withoutCapabilityCodes.indexOf('#')
  const indexes = [queryIndex, fragmentIndex].filter((index) => index >= 0)

  return indexes.length > 0
    ? withoutCapabilityCodes.slice(0, Math.min(...indexes))
    : withoutCapabilityCodes
}

function sanitizeValue(
  value: unknown,
  key: string,
  depth: number,
  seen: WeakSet<object>,
  path: string[],
): unknown {
  const normalized = normalizedKey(key)

  if (normalized === 'headers' || normalized === 'user') return {}
  if (isRequestOrResponseBody(path, key)) return OBSERVABILITY_REDACTED_VALUE
  if (isSensitiveKey(key)) return OBSERVABILITY_REDACTED_VALUE

  if (typeof value === 'string') {
    const withoutUrlDetails = isUrlLikeKey(key) ? stripUrlDetails(value) : value

    return sanitizeString(withoutUrlDetails)
  }

  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_SANITIZE_DEPTH) return '[Truncated]'
  if (seen.has(value)) return '[Circular]'

  seen.add(value)

  const sanitized = Array.isArray(value)
    ? value.map((item) => sanitizeValue(item, '', depth + 1, seen, [...path, key]))
    : Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          sanitizeValue(entryValue, entryKey, depth + 1, seen, [...path, key]),
        ]),
      )

  seen.delete(value)

  return sanitized
}

/**
 * Final privacy boundary shared by Sentry and the local development fallback.
 * SDK dataCollection options prevent automatic collection; this also protects
 * values explicitly attached by application code.
 */
export function sanitizeObservabilityPayload<T>(value: T): T {
  return sanitizeValue(value, '', 0, new WeakSet(), []) as T
}

/**
 * Console and DOM/UI breadcrumbs can contain arbitrary personal text that no
 * finite PII pattern can safely recognize. Drop them instead of redacting them.
 */
export function sanitizeSentryBreadcrumb<T>(breadcrumb: T): T | null {
  if (breadcrumb && typeof breadcrumb === 'object') {
    const record = breadcrumb as Record<string, unknown>
    const category = typeof record.category === 'string' ? record.category.trim() : ''
    const type = typeof record.type === 'string' ? record.type.trim() : ''

    if (droppedBreadcrumbPattern.test(category) || droppedBreadcrumbPattern.test(type)) {
      return null
    }
  }

  return sanitizeObservabilityPayload(breadcrumb)
}

function spanOperation(span: Record<string, unknown>) {
  if (typeof span.op === 'string') return span.op

  for (const containerKey of ['data', 'attributes']) {
    const container = span[containerKey]
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue

    const operation = (container as Record<string, unknown>)['sentry.op']
    if (typeof operation === 'string') return operation
  }

  return ''
}

function safeUiSpanAttributes(value: unknown, operation: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const attributes = value as Record<string, unknown>
  const safeAttributes: Record<string, unknown> = {}

  for (const key of ['sentry.op', 'sentry.origin', 'sentry.sample_rate', 'sentry.source']) {
    if (attributes[key] !== undefined) safeAttributes[key] = attributes[key]
  }

  if (!safeAttributes['sentry.op'] && operation) safeAttributes['sentry.op'] = operation

  return safeAttributes
}

/**
 * UI span names and attributes can embed DOM text, aria-labels and titles.
 * Keep only the operation and low-risk Sentry metadata for those spans.
 */
export function sanitizeSentrySpan<T>(span: T): T {
  const sanitized = sanitizeObservabilityPayload(span)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return sanitized

  const record = sanitized as Record<string, unknown>
  const operation = spanOperation(record)
  if (!uiSpanOperationPattern.test(operation)) return sanitized

  const result: Record<string, unknown> = { ...record }

  if ('description' in record || 'op' in record) result.description = OBSERVABILITY_UI_SPAN_NAME
  if ('name' in record) result.name = OBSERVABILITY_UI_SPAN_NAME
  if ('data' in record || 'op' in record) result.data = safeUiSpanAttributes(record.data, operation)
  if ('attributes' in record) result.attributes = safeUiSpanAttributes(record.attributes, operation)

  return result as T
}

/** Final transaction boundary, including the legacy child spans in the event. */
export function sanitizeSentryTransaction<T>(event: T): T {
  const sanitized = sanitizeObservabilityPayload(event)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return sanitized

  const record = sanitized as Record<string, unknown>
  if (!Array.isArray(record.spans)) return sanitized

  return {
    ...record,
    spans: record.spans.map((span) => sanitizeSentrySpan(span)),
  } as T
}

export function resolveSentryEnvironment(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim().toLowerCase()
    if (!normalized) continue

    if (normalized === 'prod' || normalized === 'production') return 'production'
    if (normalized === 'preview' || normalized === 'stage' || normalized === 'staging') return 'staging'
    if (normalized === 'dev' || normalized === 'development' || normalized === 'local' || normalized === 'test') {
      return 'development'
    }

    return normalized.replace(/[^a-z0-9_.-]/g, '-').slice(0, 64)
  }

  return 'development'
}

export function resolveSentryRelease(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = value?.trim().replace(/[\r\n]/g, '')
    if (normalized) return normalized.slice(0, 200)
  }

  return undefined
}

export function resolveSentryBuildIdentity(
  env: Record<string, string | undefined>,
  gitRelease?: string,
) {
  return {
    environment: resolveSentryEnvironment(
      env.SENTRY_ENVIRONMENT,
      env.NUXT_PUBLIC_SENTRY_ENVIRONMENT,
      env.VERCEL_ENV,
      env.RYBOLOV_ENVIRONMENT,
      env.NODE_ENV,
    ),
    release: resolveSentryRelease(
      env.SENTRY_RELEASE,
      env.NUXT_PUBLIC_SENTRY_RELEASE,
      env.VERCEL_GIT_COMMIT_SHA,
      env.GITHUB_SHA,
      env.COMMIT_REF,
      gitRelease,
    ),
  }
}

export function resolveSentrySourceMapBuildSettings(env: Record<string, string | undefined>) {
  const uploadEnabled = env.SENTRY_DISABLE_SOURCEMAP_UPLOAD?.trim().toLowerCase() !== 'true'
    && Boolean(env.SENTRY_AUTH_TOKEN?.trim())
    && Boolean(env.SENTRY_ORG?.trim())
    && Boolean(env.SENTRY_PROJECT?.trim())

  return {
    uploadEnabled,
    nuxtSourceMap: uploadEnabled
      ? undefined
      : { client: false as const, server: false as const },
    nitroSourceMap: uploadEnabled ? undefined : false as const,
    nitroRollupSourceMap: uploadEnabled ? undefined : false as const,
    viteSourceMap: uploadEnabled ? undefined : false as const,
  }
}

export function resolveSentryTracesSampleRate(value: number | string | undefined, fallback = 0.05) {
  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback
}

export function isValidSentryDsn(value: string | undefined) {
  const candidate = value?.trim()
  if (!candidate) return false

  try {
    const parsed = new URL(candidate)
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    const projectId = pathSegments.at(-1) ?? ''

    return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
      && /^[A-Za-z0-9_]+$/.test(parsed.username)
      && !parsed.password
      && Boolean(parsed.hostname)
      && !parsed.search
      && !parsed.hash
      && /^\d+$/.test(projectId)
  }
  catch {
    return false
  }
}

export function resolveSentryDsn(...values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .find((value): value is string => isValidSentryDsn(value))
}

export function shouldEnableSentry(dsn: string | undefined, environment: string) {
  return isValidSentryDsn(dsn) && environment !== 'development'
}

export function shouldUseLocalClientErrorReporter(dsn: string | undefined, environment: string) {
  return !shouldEnableSentry(dsn, environment)
}

export function createPrivacyFirstSentryDataCollection() {
  return {
    cookies: false,
    databaseQueryData: false,
    frameContextLines: 5,
    genAI: {
      inputs: false,
      outputs: false,
    },
    graphQL: {
      document: false,
      variables: false,
    },
    httpBodies: [],
    httpHeaders: {
      request: false,
      response: false,
    },
    stackFrameVariables: false,
    urlQueryParams: false,
    userInfo: false,
  }
}
