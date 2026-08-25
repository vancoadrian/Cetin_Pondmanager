import { describe, expect, it } from 'vitest'
import {
  OBSERVABILITY_REDACTED_VALUE,
  OBSERVABILITY_UI_SPAN_NAME,
  createPrivacyFirstSentryDataCollection,
  isValidSentryDsn,
  resolveSentryBuildIdentity,
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  resolveSentrySourceMapBuildSettings,
  resolveSentryTracesSampleRate,
  sanitizeObservabilityPayload,
  sanitizeSentryBreadcrumb,
  sanitizeSentrySpan,
  sanitizeSentryTransaction,
  shouldEnableSentry,
  shouldUseLocalClientErrorReporter,
  stripUrlDetails,
} from '~/app/utils/sentry'

describe('Sentry privacy and runtime configuration', () => {
  it('removes query strings, credentials and personal data from events', () => {
    const event = sanitizeObservabilityPayload({
      breadcrumbs: [{
        data: {
          from: '/konto?tab=security&token=breadcrumb-secret',
          to: '/obnova-hesla?step=confirm&token=breadcrumb-secret',
          url: 'https://rybolov-cetin.sk/api/logbooks/CETIN-CHAT-CAP123?token=reset-secret#formular',
        },
        message: 'Open https://rybolov-cetin.sk/konto?private=value for user@example.sk alebo +421 911 298 702',
      }],
      contexts: {
        nuxt: {
          path: '/obnova-hesla?token=context-secret',
        },
      },
      extra: {
        contactEmail: 'owner@example.sk',
        currentPassword: 'old-secret',
        networkMessage: 'peer=2001:db8::1',
        resetToken: 'reset-secret',
        safeCount: 2,
        supabasePublishableKey: 'sb_publishable_secret',
      },
      exception: {
        values: [{
          value: '[GET] /api/logbooks/CETIN-CHAT-ERROR1?token=exception-secret: 500 Internal Server Error',
        }],
      },
      request: {
        data: '{"anglerName":"Raw Body Person","note":"private body note"}',
        headers: {
          authorization: 'Bearer server-secret',
          cookie: 'session=abc',
        },
        query_string: 'token=reset-secret',
        url: '/obnova-hesla?token=reset-secret',
      },
      response: {
        data: '{"contactName":"Response Body Person"}',
      },
      route: 'https://rybolov-cetin.sk/obnova-hesla?token=referer-secret',
      server_name: 'internal-host.local',
      spans: [{
        data: {
          'http.client_ip': '2001:db8::2',
          'http.request.header.authorization': 'Bearer span-secret',
          'http.target': '/api/reservations?angler=Raw%20Span%20Person&token=span-token',
          'query.hladat': 'Meno Bez Rozpoznateľného Vzoru',
          'query.kod': 'VOLNY-PRISTUPOVY-KOD',
          'url.full': 'https://rybolov-cetin.sk/rezervacie?phone=0911298702',
        },
        description: 'POST /api/reservations?token=span-description-secret',
      }],
      transaction: 'GET /obnova-hesla?token=reset-secret',
      user: {
        id: 'account-123',
        username: 'angler@example.sk',
      },
      userAgent: 'Test Browser user@example.sk',
    })

    expect(event.request.url).toBe('/obnova-hesla')
    expect(event.request.data).toBe(OBSERVABILITY_REDACTED_VALUE)
    expect(event.request.query_string).toBe(OBSERVABILITY_REDACTED_VALUE)
    expect(event.request.headers).toEqual({})
    expect(event.response.data).toBe(OBSERVABILITY_REDACTED_VALUE)
    expect(event.route).toBe('https://rybolov-cetin.sk/obnova-hesla')
    expect(event.server_name).toBe(OBSERVABILITY_REDACTED_VALUE)
    expect(event.transaction).toBe('GET /obnova-hesla')
    expect(event.user).toEqual({})
    expect(event.breadcrumbs[0]?.data.url).toBe('https://rybolov-cetin.sk/api/logbooks/[code]')
    expect(event.breadcrumbs[0]?.message).toContain('https://rybolov-cetin.sk/konto')
    expect(event.breadcrumbs[0]?.message).not.toContain('private=value')
    expect(event.spans[0]?.description).toBe('POST /api/reservations')
    expect(event.spans[0]?.data['http.target']).toBe('/api/reservations')
    expect(event.spans[0]?.data['query.hladat']).toBe(OBSERVABILITY_REDACTED_VALUE)
    expect(event.spans[0]?.data['query.kod']).toBe(OBSERVABILITY_REDACTED_VALUE)
    expect(event.spans[0]?.data['url.full']).toBe('https://rybolov-cetin.sk/rezervacie')
    expect(event.extra.safeCount).toBe(2)

    const serialized = JSON.stringify(event)
    for (const privateValue of [
      'reset-secret',
      'server-secret',
      'old-secret',
      'owner@example.sk',
      'breadcrumb-secret',
      'context-secret',
      'CETIN-CHAT-CAP123',
      'CETIN-CHAT-ERROR1',
      'Raw Body Person',
      'Response Body Person',
      'Raw%20Span%20Person',
      'span-secret',
      'span-token',
      'Meno Bez Rozpoznateľného Vzoru',
      'VOLNY-PRISTUPOVY-KOD',
      '2001:db8',
      'sb_publishable_secret',
      'user@example.sk',
      '+421 911 298 702',
    ]) {
      expect(serialized).not.toContain(privateValue)
    }
  })

  it('uses conservative data collection defaults', () => {
    expect(createPrivacyFirstSentryDataCollection()).toMatchObject({
      cookies: false,
      databaseQueryData: false,
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
    })
  })

  it('drops console and DOM/UI breadcrumbs with free personal text', () => {
    expect(sanitizeSentryBreadcrumb({
      category: 'console.info',
      message: 'Ján Novák býva v modrom dome pri starej lipe a čaká pri zadnej bráne.',
    })).toBeNull()

    expect(sanitizeSentryBreadcrumb({
      category: 'ui.click',
      data: {
        'ui.aria_label': 'Otvoriť profil Márie Modrej',
      },
      message: 'Mária Modrá – súkromný profil',
    })).toBeNull()

    expect(sanitizeSentryBreadcrumb({
      message: 'DOM title Petra Zeleného',
      type: 'ui.action.open',
    })).toBeNull()

    expect(sanitizeSentryBreadcrumb({
      category: 'navigation',
      data: {
        to: '/konto?tab=sukromne',
      },
    })).toEqual({
      category: 'navigation',
      data: {
        to: '/konto',
      },
    })
  })

  it('normalizes UI spans and scrubs transaction child spans', () => {
    const span = sanitizeSentrySpan({
      data: {
        'query.hladat': 'Ľubovoľné osobné hľadanie',
        'sentry.op': 'ui.interaction',
        'ui.aria_label': 'Otvoriť profil Márie Modrej',
        'ui.component_name': 'Mária Modrá',
      },
      description: 'Klik na profil Márie Modrej',
      op: 'ui.interaction',
    })

    expect(span.description).toBe(OBSERVABILITY_UI_SPAN_NAME)
    expect(span.data).toEqual({
      'sentry.op': 'ui.interaction',
    })

    const transaction = sanitizeSentryTransaction({
      spans: [{
        attributes: {
          'sentry.op': 'ui.action.submit',
          'sentry.sample_rate': 0.05,
          'ui.title': 'Potvrdiť rezerváciu Petra Zeleného',
        },
        name: 'Potvrdiť rezerváciu Petra Zeleného',
      }],
    })

    expect(transaction.spans[0]).toEqual({
      attributes: {
        'sentry.op': 'ui.action.submit',
        'sentry.sample_rate': 0.05,
      },
      name: OBSERVABILITY_UI_SPAN_NAME,
    })

    expect(JSON.stringify({ span, transaction })).not.toContain('Mária Modrá')
    expect(JSON.stringify({ span, transaction })).not.toContain('Petra Zeleného')
    expect(JSON.stringify({ span, transaction })).not.toContain('Ľubovoľné osobné hľadanie')
  })

  it('disables every build map without upload credentials and delegates hidden maps with all credentials', () => {
    expect(resolveSentrySourceMapBuildSettings({
      SENTRY_AUTH_TOKEN: 'test-token',
      SENTRY_ORG: 'test-org',
    })).toEqual({
      nitroRollupSourceMap: false,
      nitroSourceMap: false,
      nuxtSourceMap: {
        client: false,
        server: false,
      },
      uploadEnabled: false,
      viteSourceMap: false,
    })

    expect(resolveSentrySourceMapBuildSettings({
      SENTRY_AUTH_TOKEN: 'test-token',
      SENTRY_ORG: 'test-org',
      SENTRY_PROJECT: 'test-project',
    })).toEqual({
      nitroRollupSourceMap: undefined,
      nitroSourceMap: undefined,
      nuxtSourceMap: undefined,
      uploadEnabled: true,
      viteSourceMap: undefined,
    })

    expect(resolveSentrySourceMapBuildSettings({
      SENTRY_AUTH_TOKEN: 'test-token',
      SENTRY_DISABLE_SOURCEMAP_UPLOAD: 'true',
      SENTRY_ORG: 'test-org',
      SENTRY_PROJECT: 'test-project',
    }).uploadEnabled).toBe(false)
  })

  it('freezes a preview build identity before lower-priority app environment values', () => {
    expect(resolveSentryBuildIdentity({
      NODE_ENV: 'production',
      RYBOLOV_ENVIRONMENT: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'preview-build-sha',
    }, 'git-fallback-sha')).toEqual({
      environment: 'staging',
      release: 'preview-build-sha',
    })

    expect(resolveSentryBuildIdentity({}, 'abcdef0123456789abcdef0123456789abcdef01')).toEqual({
      environment: 'development',
      release: 'abcdef0123456789abcdef0123456789abcdef01',
    })
  })

  it('normalizes environment, release, sampling and reporter selection', () => {
    const dsn = 'https://public@example.ingest.sentry.io/1'
    const invalidDsn = 'configured-but-not-a-sentry-dsn'

    expect(resolveSentryEnvironment('prod')).toBe('production')
    expect(resolveSentryEnvironment('preview')).toBe('staging')
    expect(resolveSentryEnvironment(undefined, 'dev')).toBe('development')
    expect(resolveSentryEnvironment(undefined, undefined, 'preview', 'production', 'production'))
      .toBe('staging')
    expect(resolveSentryRelease(undefined, '  commit-abc  ')).toBe('commit-abc')
    expect(resolveSentryTracesSampleRate('0.1')).toBe(0.1)
    expect(resolveSentryTracesSampleRate('2')).toBe(0.05)
    expect(isValidSentryDsn(dsn)).toBe(true)
    expect(isValidSentryDsn('https://public@example.ingest.sentry.io/')).toBe(false)
    expect(isValidSentryDsn('https://public:secret@example.ingest.sentry.io/1')).toBe(false)
    expect(resolveSentryDsn(invalidDsn, dsn)).toBe(dsn)
    expect(shouldEnableSentry(dsn, 'staging')).toBe(true)
    expect(shouldEnableSentry(dsn, 'development')).toBe(false)
    expect(shouldEnableSentry(invalidDsn, 'production')).toBe(false)
    expect(shouldUseLocalClientErrorReporter(dsn, 'production')).toBe(false)
    expect(shouldUseLocalClientErrorReporter('', 'production')).toBe(true)
    expect(shouldUseLocalClientErrorReporter(invalidDsn, 'production')).toBe(true)
    expect(stripUrlDetails('/konto?token=secret#profil')).toBe('/konto')
    expect(stripUrlDetails('GET /api/logbooks/CETIN-CHAT-CAP123?view=detail'))
      .toBe('GET /api/logbooks/[code]')
  })
})
