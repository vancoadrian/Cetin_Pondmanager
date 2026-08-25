import * as Sentry from '@sentry/nuxt'
import {
  createPrivacyFirstSentryDataCollection,
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  resolveSentryTracesSampleRate,
  sanitizeObservabilityPayload,
  sanitizeSentryBreadcrumb,
  sanitizeSentrySpan,
  sanitizeSentryTransaction,
  shouldEnableSentry,
} from './app/utils/sentry'

const dsn = resolveSentryDsn(
  process.env.SENTRY_DSN,
  process.env.NUXT_PUBLIC_SENTRY_DSN,
  process.env.NEXT_PUBLIC_SENTRY_DSN,
) || ''
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
        'app.runtime': 'server',
      },
    },
    ...(release ? { release } : {}),
    tracesSampleRate: resolveSentryTracesSampleRate(
      process.env.SENTRY_TRACES_SAMPLE_RATE || process.env.NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
      0.02,
    ),
  })
}
