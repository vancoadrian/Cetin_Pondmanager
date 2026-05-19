import { describe, expect, it } from 'vitest'
import {
  createCatchWeatherResolver,
  readCatchWeatherProviderConfig,
  resolveCatchWeatherSnapshot,
} from '~/app/services/catchWeatherService'

describe('catchWeatherService', () => {
  it('creates deterministic mock weather snapshots for a catch context', () => {
    const input = {
      caughtAt: '2026-05-17T18:30',
      lake: 'velky-cetin' as const,
      pegId: 'vc-03',
    }

    const first = resolveCatchWeatherSnapshot(input)
    const second = resolveCatchWeatherSnapshot(input)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      source: 'mock',
      windDirection: expect.any(String),
    })
    expect(first?.airTempC).toBeGreaterThan(0)
    expect(first?.waterTempC).toBeGreaterThan(0)
    expect(first?.pressureHpa).toBeGreaterThan(990)
    expect(first?.cloudCoverPct).toBeGreaterThanOrEqual(5)
    expect(first?.cloudCoverPct).toBeLessThanOrEqual(95)
  })

  it('returns no snapshot for invalid dates', () => {
    expect(resolveCatchWeatherSnapshot({
      caughtAt: 'nie je datum',
      lake: 'velky-cetin',
      pegId: 'vc-03',
    })).toBeUndefined()
  })

  it('varies snapshots by lake, peg and time', () => {
    const morning = resolveCatchWeatherSnapshot({
      caughtAt: '2026-05-17T05:30',
      lake: 'velky-cetin',
      pegId: 'vc-03',
    })
    const eveningKocka = resolveCatchWeatherSnapshot({
      caughtAt: '2026-05-17T18:30',
      lake: 'strkovisko-kocka',
      pegId: 'sk-03',
    })

    expect(morning).toBeDefined()
    expect(eveningKocka).toBeDefined()
    expect(morning).not.toEqual(eveningKocka)
  })

  it('can resolve a station snapshot from provider config', () => {
    const resolver = createCatchWeatherResolver({
      fallbackToMock: true,
      provider: 'station',
      stationSnapshot: {
        airTempC: 17.5,
        cloudCoverPct: 65,
        condition: 'vietor po búrke',
        pressureHpa: 1008,
        pressureTrend: 'rising',
        waterTempC: 18.3,
        windDirection: 'SZ',
        windKph: 14,
      },
    })

    expect(resolver({
      caughtAt: '2026-05-17T18:30',
      lake: 'velky-cetin',
      pegId: 'vc-03',
    })).toEqual({
      airTempC: 17.5,
      cloudCoverPct: 65,
      condition: 'vietor po búrke',
      pressureHpa: 1008,
      pressureTrend: 'rising',
      source: 'station',
      waterTempC: 18.3,
      windDirection: 'SZ',
      windKph: 14,
    })
  })

  it('falls back to mock when a configured provider is incomplete', () => {
    const resolver = createCatchWeatherResolver({
      fallbackToMock: true,
      provider: 'station',
      stationSnapshot: {
        condition: 'neúplná stanica',
      },
    })
    const snapshot = resolver({
      caughtAt: '2026-05-17T18:30',
      lake: 'velky-cetin',
      pegId: 'vc-03',
    })

    expect(snapshot).toMatchObject({
      source: 'mock',
    })
  })

  it('can disable automatic weather snapshots', () => {
    const resolver = createCatchWeatherResolver({
      provider: 'disabled',
    })

    expect(resolver({
      caughtAt: '2026-05-17T18:30',
      lake: 'velky-cetin',
      pegId: 'vc-03',
    })).toBeUndefined()
  })

  it('reads provider config from environment variables', () => {
    const config = readCatchWeatherProviderConfig({
      RYBOLOV_WEATHER_AIR_TEMP_C: '16,4',
      RYBOLOV_WEATHER_CLOUD_COVER_PCT: '54',
      RYBOLOV_WEATHER_CONDITION: 'polooblačno',
      RYBOLOV_WEATHER_FALLBACK_TO_MOCK: 'false',
      RYBOLOV_WEATHER_PRESSURE_HPA: '1012',
      RYBOLOV_WEATHER_PRESSURE_TREND: 'falling',
      RYBOLOV_WEATHER_PROVIDER: 'manual',
      RYBOLOV_WEATHER_WATER_TEMP_C: '18.1',
      RYBOLOV_WEATHER_WIND_DIRECTION: 'jz',
      RYBOLOV_WEATHER_WIND_KPH: '9',
    })

    expect(config).toMatchObject({
      fallbackToMock: false,
      provider: 'manual',
      stationSnapshot: {
        airTempC: 16.4,
        cloudCoverPct: 54,
        condition: 'polooblačno',
        pressureHpa: 1012,
        pressureTrend: 'falling',
        waterTempC: 18.1,
        windDirection: 'JZ',
        windKph: 9,
      },
    })
  })
})
