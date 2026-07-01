import { describe, expect, it } from 'vitest'
import {
  createEnvironmentReadinessReport,
  resolveDeploymentEnvironment,
} from '~/app/services/environmentReadinessService'

describe('environmentReadinessService', () => {
  it('resolves deployment environment from explicit env or NODE_ENV', () => {
    expect(resolveDeploymentEnvironment({ RYBOLOV_ENVIRONMENT: 'stage' })).toBe('staging')
    expect(resolveDeploymentEnvironment({ RYBOLOV_ENVIRONMENT: 'prod' })).toBe('production')
    expect(resolveDeploymentEnvironment({ NODE_ENV: 'production' })).toBe('production')
    expect(resolveDeploymentEnvironment({})).toBe('development')
  })

  it('keeps development usable with mock providers', () => {
    const report = createEnvironmentReadinessReport(
      {
        RYBOLOV_PUSH_PROVIDER: 'mock',
        RYBOLOV_REPORT_DELIVERY_PROVIDER: 'mock',
        RYBOLOV_WEATHER_PROVIDER: 'mock',
      },
      '2026-06-04T09:00:00.000Z',
    )

    expect(report.environment).toBe('development')
    expect(report.missingRequiredCount).toBe(0)
    expect(report.status).toBe('attention')
  })

  it('blocks production when required values are missing', () => {
    const report = createEnvironmentReadinessReport(
      {
        NODE_ENV: 'production',
      },
      '2026-06-04T09:00:00.000Z',
    )

    expect(report.environment).toBe('production')
    expect(report.status).toBe('blocked')
    expect(report.items.filter((item) => item.severity === 'required' && item.status === 'missing').map((item) => item.key))
      .toEqual(expect.arrayContaining([
        'RYBOLOV_ENVIRONMENT',
        'NUXT_PUBLIC_SITE_URL',
        'RYBOLOV_LOCAL_DATA_DIR',
        'RYBOLOV_REPORT_SCHEDULER_SECRET',
      ]))
  })

  it('marks a fully configured production profile as ready', () => {
    const report = createEnvironmentReadinessReport(
      {
        NUXT_PUBLIC_REZERVACIE_PHONE: '+421 911 298 702',
        NUXT_PUBLIC_SITE_URL: 'https://rybolov-cetin.sk',
        NUXT_PUBLIC_VAPID_PUBLIC_KEY: 'public-key',
        RYBOLOV_ENVIRONMENT: 'production',
        RYBOLOV_LOCAL_DATA_DIR: '/var/lib/rybolov-cetin',
        RYBOLOV_PUSH_PROVIDER: 'web-push',
        RYBOLOV_PUSH_SUBJECT: 'mailto:spravca@rybolov-cetin.sk',
        RYBOLOV_REPORT_DELIVERY_PROVIDER: 'resend',
        RYBOLOV_REPORT_EMAIL_FROM: 'Rybolov Cetín <reporty@rybolov-cetin.sk>',
        RYBOLOV_REPORT_SCHEDULER_SECRET: 'secret',
        RYBOLOV_RESERVATION_DELIVERY_PROVIDER: 'resend',
        RYBOLOV_RESERVATION_EMAIL_FROM: 'Rybolov Cetín <rezervacie@rybolov-cetin.sk>',
        RYBOLOV_RESEND_API_KEY: 're_secret',
        RYBOLOV_VAPID_PRIVATE_KEY: 'private-key',
        RYBOLOV_WEATHER_API_ENDPOINT: 'https://weather.example/api',
        RYBOLOV_WEATHER_API_KEY: 'weather-secret',
        RYBOLOV_WEATHER_LATITUDE: '48.2',
        RYBOLOV_WEATHER_LONGITUDE: '18.2',
        RYBOLOV_WEATHER_PROVIDER: 'weather-api',
      },
      '2026-06-04T09:00:00.000Z',
    )

    expect(report.status).toBe('ready')
    expect(report.attentionCount).toBe(0)
    expect(report.missingRequiredCount).toBe(0)
  })
})
