import type { ObservedErrorSeverity } from '~/services/observabilityService'

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }

  if (typeof error === 'string') {
    return {
      message: error,
    }
  }

  return {
    message: 'Neznáma chyba klienta.',
    stack: JSON.stringify(error),
  }
}

function postClientError(payload: {
  context?: Record<string, unknown>
  message: string
  severity?: ObservedErrorSeverity
  stack?: string
}) {
  const body = JSON.stringify({
    ...payload,
    route: window.location.href,
  })

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' })
    if (navigator.sendBeacon('/api/client-errors', blob)) return
  }

  void fetch('/api/client-errors', {
    body,
    headers: {
      'content-type': 'application/json',
    },
    keepalive: true,
    method: 'POST',
  }).catch(() => {})
}

export default defineNuxtPlugin((nuxtApp) => {
  const previousErrorHandler = nuxtApp.vueApp.config.errorHandler

  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    const serialized = serializeError(error)
    postClientError({
      ...serialized,
      context: {
        component: instance?.$options?.name ?? 'anonymous',
        info,
      },
      severity: 'error',
    })
    previousErrorHandler?.(error, instance, info)
  }

  window.addEventListener('error', (event) => {
    const serialized = serializeError(event.error ?? event.message)
    postClientError({
      ...serialized,
      context: {
        column: event.colno,
        filename: event.filename,
        line: event.lineno,
        type: 'window.error',
      },
      severity: 'error',
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const serialized = serializeError(event.reason)
    postClientError({
      ...serialized,
      context: {
        type: 'unhandledrejection',
      },
      severity: 'error',
    })
  })
})
