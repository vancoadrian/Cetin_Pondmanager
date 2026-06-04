import { defineEventHandler, getHeader, getRequestURL, readBody, setResponseStatus } from 'h3'
import { appendLocalObservedError } from '../utils/localErrorLogStore'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const requestUrl = getRequestURL(event)
  const bodyRecord = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const contextRecord = bodyRecord.context && typeof bodyRecord.context === 'object' && !Array.isArray(bodyRecord.context)
    ? bodyRecord.context as Record<string, unknown>
    : {}

  try {
    await appendLocalObservedError({
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
    })

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
