import type { CatchWeatherSnapshot, LakeSlug } from '~/data/pond'

export interface CatchWeatherLookupInput {
  caughtAt: string
  lake: LakeSlug
  pegId: string
}

export type CatchWeatherResolver = (input: CatchWeatherLookupInput) => CatchWeatherSnapshot | undefined
export type CatchWeatherProviderKind = 'disabled' | 'manual' | 'mock' | 'station' | 'weather-api'

export interface CatchWeatherProviderConfig {
  apiEndpoint?: string
  apiKey?: string
  fallbackToMock?: boolean
  provider?: CatchWeatherProviderKind
  stationSnapshot?: Partial<CatchWeatherSnapshot>
}

interface LakeWeatherProfile {
  airOffsetC: number
  pressureOffsetHpa: number
  waterOffsetC: number
  windOffset: number
}

const lakeWeatherProfiles: Record<LakeSlug, LakeWeatherProfile> = {
  'strkovisko-kocka': {
    airOffsetC: 0.8,
    pressureOffsetHpa: -1,
    waterOffsetC: 0.4,
    windOffset: 3,
  },
  'velky-cetin': {
    airOffsetC: 0,
    pressureOffsetHpa: 1,
    waterOffsetC: 0,
    windOffset: 0,
  },
}

const monthlyAirBaseC = [2, 4, 8, 13, 18, 22, 24, 24, 19, 13, 7, 3]
const monthlyWaterBaseC = [3, 4, 7, 12, 17, 21, 24, 24, 20, 15, 9, 5]
const windDirections = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ']

function roundOne(value: number) {
  return Math.round(value * 10) / 10
}

function dayOfYear(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

  return Math.floor((current - start) / 86_400_000)
}

function hourAdjustment(hour: number) {
  if (hour >= 5 && hour <= 8) return -2
  if (hour >= 12 && hour <= 17) return 3
  if (hour >= 21 || hour <= 3) return -3

  return 0
}

function conditionFromClouds(cloudCoverPct: number, pressureTrend: CatchWeatherSnapshot['pressureTrend']) {
  if (cloudCoverPct >= 72) return pressureTrend === 'falling' ? 'zamračené' : 'oblačno'
  if (cloudCoverPct >= 36) return 'polooblačno'

  return 'jasno'
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback

  return ['1', 'true', 'yes', 'ano', 'áno'].includes(value.trim().toLowerCase())
}

function parseNumber(value: string | undefined) {
  if (!value?.trim()) return undefined

  const parsed = Number(value.replace(',', '.'))

  return Number.isFinite(parsed) ? parsed : undefined
}

function parseProvider(value: string | undefined): CatchWeatherProviderKind {
  const provider = value?.trim().toLowerCase()
  if (
    provider === 'disabled' ||
    provider === 'manual' ||
    provider === 'mock' ||
    provider === 'station' ||
    provider === 'weather-api'
  ) {
    return provider
  }

  return 'mock'
}

function parsePressureTrend(value: string | undefined): CatchWeatherSnapshot['pressureTrend'] | undefined {
  const trend = value?.trim().toLowerCase()
  if (trend === 'falling' || trend === 'rising' || trend === 'stable') return trend

  return undefined
}

function resolveConfiguredSnapshot(
  source: Extract<CatchWeatherSnapshot['source'], 'manual' | 'station' | 'weather-api'>,
  snapshot: Partial<CatchWeatherSnapshot> | undefined,
) {
  if (!snapshot) return undefined

  const {
    airTempC,
    cloudCoverPct,
    condition,
    pressureHpa,
    pressureTrend,
    waterTempC,
    windDirection,
    windKph,
  } = snapshot

  if (
    typeof airTempC !== 'number' ||
    typeof cloudCoverPct !== 'number' ||
    typeof condition !== 'string' ||
    typeof pressureHpa !== 'number' ||
    !pressureTrend ||
    typeof waterTempC !== 'number' ||
    typeof windDirection !== 'string' ||
    typeof windKph !== 'number'
  ) {
    return undefined
  }

  return {
    airTempC,
    cloudCoverPct: Math.max(0, Math.min(100, Math.round(cloudCoverPct))),
    condition,
    pressureHpa,
    pressureTrend,
    source,
    waterTempC,
    windDirection,
    windKph,
  }
}

function fallbackSnapshot(input: CatchWeatherLookupInput, fallbackToMock: boolean) {
  return fallbackToMock ? resolveCatchWeatherSnapshot(input) : undefined
}

export function resolveCatchWeatherSnapshot(input: CatchWeatherLookupInput): CatchWeatherSnapshot | undefined {
  const date = new Date(input.caughtAt)
  if (!Number.isFinite(date.getTime())) return undefined

  const profile = lakeWeatherProfiles[input.lake]
  if (!profile) return undefined

  const monthIndex = date.getUTCMonth()
  const hour = date.getHours()
  const day = dayOfYear(date)
  const pegSeed = [...input.pegId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const weatherSeed = (day * 37 + hour * 11 + pegSeed) % 31
  const daySwing = ((day % 7) - 3) * 0.4
  const pressureTrend: CatchWeatherSnapshot['pressureTrend'] =
    weatherSeed < 10 ? 'falling' : weatherSeed > 20 ? 'rising' : 'stable'
  const cloudBase = pressureTrend === 'falling'
    ? 62
    : pressureTrend === 'rising'
      ? 24
      : 42
  const cloudCoverPct = Math.max(5, Math.min(95, cloudBase + (weatherSeed % 13) * 2))
  const windKph = 4 + ((day + hour + profile.windOffset + pegSeed) % 18)

  return {
    airTempC: roundOne((monthlyAirBaseC[monthIndex] ?? 12) + hourAdjustment(hour) + profile.airOffsetC + daySwing),
    cloudCoverPct,
    condition: conditionFromClouds(cloudCoverPct, pressureTrend),
    pressureHpa: 1002 + weatherSeed + profile.pressureOffsetHpa,
    pressureTrend,
    source: 'mock',
    waterTempC: roundOne((monthlyWaterBaseC[monthIndex] ?? 12) + profile.waterOffsetC + daySwing * 0.3),
    windDirection: windDirections[(day + pegSeed) % windDirections.length] ?? 'SV',
    windKph,
  }
}

export function createCatchWeatherResolver(config: CatchWeatherProviderConfig = readCatchWeatherProviderConfig()): CatchWeatherResolver {
  const provider = config.provider ?? 'mock'
  const fallbackToMock = config.fallbackToMock ?? true

  return (input) => {
    if (provider === 'disabled') return undefined
    if (provider === 'mock') return resolveCatchWeatherSnapshot(input)
    if (provider === 'manual' || provider === 'station') {
      return resolveConfiguredSnapshot(provider, config.stationSnapshot) ?? fallbackSnapshot(input, fallbackToMock)
    }

    // The API adapter keeps the workflow ready for a real weather service while the
    // current public catch submission remains synchronous.
    return resolveConfiguredSnapshot('weather-api', config.stationSnapshot) ?? fallbackSnapshot(input, fallbackToMock)
  }
}

export function readCatchWeatherProviderConfig(env: Record<string, string | undefined> = process.env): CatchWeatherProviderConfig {
  const stationSnapshot: Partial<CatchWeatherSnapshot> = {
    airTempC: parseNumber(env.RYBOLOV_WEATHER_AIR_TEMP_C),
    cloudCoverPct: parseNumber(env.RYBOLOV_WEATHER_CLOUD_COVER_PCT),
    condition: env.RYBOLOV_WEATHER_CONDITION?.trim(),
    pressureHpa: parseNumber(env.RYBOLOV_WEATHER_PRESSURE_HPA),
    pressureTrend: parsePressureTrend(env.RYBOLOV_WEATHER_PRESSURE_TREND),
    waterTempC: parseNumber(env.RYBOLOV_WEATHER_WATER_TEMP_C),
    windDirection: env.RYBOLOV_WEATHER_WIND_DIRECTION?.trim().toUpperCase(),
    windKph: parseNumber(env.RYBOLOV_WEATHER_WIND_KPH),
  }

  return {
    apiEndpoint: env.RYBOLOV_WEATHER_API_ENDPOINT?.trim(),
    apiKey: env.RYBOLOV_WEATHER_API_KEY?.trim(),
    fallbackToMock: parseBoolean(env.RYBOLOV_WEATHER_FALLBACK_TO_MOCK, true),
    provider: parseProvider(env.RYBOLOV_WEATHER_PROVIDER),
    stationSnapshot,
  }
}
