import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from '#imports'
import {
  createPrivacyFirstSentryDataCollection,
  resolveSentryEnvironment,
  resolveSentryRelease,
  resolveSentryTracesSampleRate,
  sanitizeObservabilityPayload,
  sanitizeSentryBreadcrumb,
  sanitizeSentrySpan,
  sanitizeSentryTransaction,
  shouldEnableSentry,
} from './app/utils/sentry'

const runtimeConfig = useRuntimeConfig()
const dsn = String(runtimeConfig.public.sentry.dsn || '').trim()
const environment = resolveSentryEnvironment(__SENTRY_BUILD_ENVIRONMENT__)
const release = resolveSentryRelease(__SENTRY_BUILD_RELEASE__)
const enabled = shouldEnableSentry(dsn, environment)

if (enabled) {
  Sentry.init({
    beforeBreadcrumb: sanitizeSentryBreadcrumb,
    beforeSend: sanitizeObservabilityPayload,
    beforeSendSpan: sanitizeSentrySpan,
    beforeSendTransaction: sanitizeSentryTransaction,
    dataCollection: createPrivacyFirstSentryDataCollection(),
    debug: false,
    dsn,
    enabled,
    environment,
    initialScope: {
      tags: {
        'app.runtime': 'client',
      },
    },
    ...(release ? { release } : {}),
    tracesSampleRate: resolveSentryTracesSampleRate(runtimeConfig.public.sentry.tracesSampleRate, 0.05),
  })
}
