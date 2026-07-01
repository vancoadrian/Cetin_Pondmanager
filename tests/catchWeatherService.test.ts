import { describe, expect, it, vi } from 'vitest'
import {
  createAsyncCatchWeatherResolver,
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

  it('resolves an async weather-api snapshot from Open-Meteo hourly data', async () => {
    const originalFetch = globalThis.fetch
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      hourly: {
        cloud_cover: [58, 72],
        surface_pressure: [1008.3, 1006.9],
        temperature_2m: [18.4, 17.9],
        time: ['2026-05-17T18:00', '2026-05-17T19:00'],
        wind_direction_10m: [315, 320],
        wind_speed_10m: [12.4, 13.1],
      },
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    }))
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const resolver = createAsyncCatchWeatherResolver({
        fallbackToMock: false,
        latitude: 48.2,
        longitude: 18.2,
        provider: 'weather-api',
        timeoutMs: 1000,
        waterTempOffsetC: 0.2,
      })
      const snapshot = await resolver({
        caughtAt: '2026-05-17T18:30',
        lake: 'velky-cetin',
        pegId: 'vc-03',
      })

      expect(snapshot).toMatchObject({
        airTempC: 18.4,
        cloudCoverPct: 58,
        condition: 'polooblačno',
        pressureHpa: 1008.3,
        pressureTrend: 'falling',
        source: 'weather-api',
        windDirection: 'SZ',
        windKph: 12.4,
      })
      expect(snapshot?.waterTempC).toBeGreaterThan(10)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('hourly=temperature_2m%2Csurface_pressure%2Ccloud_cover%2Cwind_speed_10m%2Cwind_direction_10m')
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  it('falls back to mock when the async weather-api lookup is not configured', async () => {
    const resolver = createAsyncCatchWeatherResolver({
      fallbackToMock: true,
      provider: 'weather-api',
    })

    const snapshot = await resolver({
      caughtAt: '2026-05-17T18:30',
      lake: 'velky-cetin',
      pegId: 'vc-03',
    })

    expect(snapshot).toMatchObject({
      source: 'mock',
    })
  })

  it('reads provider config from environment variables', () => {
    const config = readCatchWeatherProviderConfig({
      RYBOLOV_WEATHER_AIR_TEMP_C: '16,4',
      RYBOLOV_WEATHER_CLOUD_COVER_PCT: '54',
      RYBOLOV_WEATHER_CONDITION: 'polooblačno',
      RYBOLOV_WEATHER_FALLBACK_TO_MOCK: 'false',
      RYBOLOV_WEATHER_LATITUDE: '48,2',
      RYBOLOV_WEATHER_LONGITUDE: '18.2',
      RYBOLOV_WEATHER_PRESSURE_HPA: '1012',
      RYBOLOV_WEATHER_PRESSURE_TREND: 'falling',
      RYBOLOV_WEATHER_PROVIDER: 'manual',
      RYBOLOV_WEATHER_TIMEOUT_MS: '4200',
      RYBOLOV_WEATHER_WATER_TEMP_C: '18.1',
      RYBOLOV_WEATHER_WATER_TEMP_OFFSET_C: '0.4',
      RYBOLOV_WEATHER_WIND_DIRECTION: 'jz',
      RYBOLOV_WEATHER_WIND_KPH: '9',
    })

    expect(config).toMatchObject({
      fallbackToMock: false,
      latitude: 48.2,
      longitude: 18.2,
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
      timeoutMs: 4200,
      waterTempOffsetC: 0.4,
    })
  })
})
