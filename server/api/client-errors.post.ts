import { useRuntimeConfig } from '#imports'
import { defineEventHandler, getHeader, getRequestURL, readBody, setResponseStatus } from 'h3'
import {
  resolveSentryEnvironment,
  sanitizeObservabilityPayload,
  shouldUseLocalClientErrorReporter,
} from '~/utils/sentry'
import { appendLocalObservedError } from '../utils/localErrorLogStore'

export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)
  const publicSentryDsn = String(runtimeConfig.public.sentry.dsn || '')
  const environment = resolveSentryEnvironment(__SENTRY_BUILD_ENVIRONMENT__)

  // Do not keep a second externally writable error sink when browser Sentry is active.
  if (!shouldUseLocalClientErrorReporter(publicSentryDsn, environment)) {
    setResponseStatus(event, 204)
    return null
  }

  const body = await readBody(event).catch(() => ({}))
  const requestUrl = getRequestURL(event)
  const bodyRecord = sanitizeObservabilityPayload(
    body && typeof body === 'object' ? body as Record<string, unknown> : {},
  )
  const contextRecord = bodyRecord.context && typeof bodyRecord.context === 'object' && !Array.isArray(bodyRecord.context)
    ? bodyRecord.context as Record<string, unknown>
    : {}

  try {
    await appendLocalObservedError(sanitizeObservabilityPayload({
      ...bodyRecord,
      context: {
        ...contextRecord,
        reportedPath: requestUrl.pathname,
      },
      message: bodyRecord.message ?? bodyRecord.error ?? 'Client error report',
      route: bodyRecord.route ?? getHeader(event, 'referer'),
      source: 'client',
      stack: bodyRecord.stack,
      userAgent: getHeader(event, 'user-agent'),
    }))

    setResponseStatus(event, 202)

    return {
      ok: true,
      stored: true,
    }
  }
  catch (error) {
    console.warn('Nepodarilo sa uložiť client error report.', error)
    setResponseStatus(event, 202)

    return {
      ok: true,
      stored: false,
    }
  }
})
