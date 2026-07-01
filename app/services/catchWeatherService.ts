import type { CatchWeatherSnapshot, LakeSlug } from '~/data/pond'

export interface CatchWeatherLookupInput {
  caughtAt: string
  lake: LakeSlug
  pegId: string
}

export type CatchWeatherResolver = (input: CatchWeatherLookupInput) => CatchWeatherSnapshot | undefined
export type AsyncCatchWeatherResolver = (input: CatchWeatherLookupInput) => Promise<CatchWeatherSnapshot | undefined>
export type CatchWeatherProviderKind = 'disabled' | 'manual' | 'mock' | 'station' | 'weather-api'

export interface CatchWeatherProviderConfig {
  apiEndpoint?: string
  apiKey?: string
  fallbackToMock?: boolean
  latitude?: number
  longitude?: number
  provider?: CatchWeatherProviderKind
  stationSnapshot?: Partial<CatchWeatherSnapshot>
  timeoutMs?: number
  waterTempOffsetC?: number
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
const catchWeatherTimeZone = 'Europe/Bratislava'
const defaultOpenMeteoArchiveEndpoint = 'https://archive-api.open-meteo.com/v1/archive'
const openMeteoHourlyVariables = [
  'temperature_2m',
  'surface_pressure',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
]

interface OpenMeteoHourlyResponse {
  hourly?: {
    cloud_cover?: Array<number | null>
    surface_pressure?: Array<number | null>
    temperature_2m?: Array<number | null>
    time?: string[]
    wind_direction_10m?: Array<number | null>
    wind_speed_10m?: Array<number | null>
  }
}

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

function parseInteger(value: string | undefined) {
  const parsed = parseNumber(value)
  return parsed === undefined ? undefined : Math.round(parsed)
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

function dateOnly(value: string) {
  const directDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (directDate) return directDate

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : undefined
}

function hourKey(value: string) {
  const directHour = value.match(/^\d{4}-\d{2}-\d{2}T\d{2}/)?.[0]
  if (directHour) return directHour

  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return undefined

  const localDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 13)
}

function getFiniteNumber(values: Array<number | null> | undefined, index: number) {
  const value = values?.[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function closestHourlyIndex(times: string[] | undefined, caughtAt: string) {
  if (!times?.length) return -1

  const targetHour = hourKey(caughtAt)
  if (targetHour) {
    const exactIndex = times.findIndex((time) => time.startsWith(targetHour))
    if (exactIndex >= 0) return exactIndex
  }

  const targetTime = Date.parse(caughtAt)
  if (!Number.isFinite(targetTime)) return -1

  return times.reduce((bestIndex, time, index) => {
    const current = Date.parse(time)
    if (!Number.isFinite(current)) return bestIndex
    if (bestIndex < 0) return index

    const best = Date.parse(times[bestIndex] ?? '')
    return Math.abs(current - targetTime) < Math.abs(best - targetTime) ? index : bestIndex
  }, -1)
}

function pressureTrendFromApi(values: Array<number | null> | undefined, index: number, current: number) {
  const previous = getFiniteNumber(values, index - 1)
  const next = getFiniteNumber(values, index + 1)
  const reference = previous ?? next

  if (reference === undefined) return 'stable'

  const delta = previous === undefined ? next! - current : current - previous
  if (delta >= 0.8) return 'rising'
  if (delta <= -0.8) return 'falling'

  return 'stable'
}

function windDirectionFromDegrees(degrees: number) {
  const normalized = ((degrees % 360) + 360) % 360
  return windDirections[Math.round(normalized / 45) % windDirections.length] ?? 'S'
}

function waterTempFromApi(input: CatchWeatherLookupInput, config: CatchWeatherProviderConfig) {
  const configured = config.stationSnapshot?.waterTempC
  if (typeof configured === 'number' && Number.isFinite(configured)) return configured

  const mockWaterTemp = resolveCatchWeatherSnapshot(input)?.waterTempC
  if (typeof mockWaterTemp === 'number') return roundOne(mockWaterTemp + (config.waterTempOffsetC ?? 0))

  return undefined
}

function createWeatherApiUrl(input: CatchWeatherLookupInput, config: CatchWeatherProviderConfig) {
  const date = dateOnly(input.caughtAt)
  if (!date || config.latitude === undefined || config.longitude === undefined) return undefined

  const url = new URL(config.apiEndpoint || defaultOpenMeteoArchiveEndpoint)
  url.searchParams.set('latitude', String(config.latitude))
  url.searchParams.set('longitude', String(config.longitude))
  url.searchParams.set('hourly', openMeteoHourlyVariables.join(','))
  url.searchParams.set('timezone', catchWeatherTimeZone)
  url.searchParams.set('start_date', date)
  url.searchParams.set('end_date', date)
  url.searchParams.set('wind_speed_unit', 'kmh')
  if (config.apiKey) url.searchParams.set('apikey', config.apiKey)

  return url
}

async function fetchWeatherApiJson(url: URL, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) return undefined

    return await response.json() as OpenMeteoHourlyResponse
  }
  catch {
    return undefined
  }
  finally {
    clearTimeout(timeout)
  }
}

function snapshotFromOpenMeteoResponse(
  input: CatchWeatherLookupInput,
  response: OpenMeteoHourlyResponse | undefined,
  config: CatchWeatherProviderConfig,
) {
  const hourly = response?.hourly
  const index = closestHourlyIndex(hourly?.time, input.caughtAt)
  if (!hourly || index < 0) return undefined

  const airTempC = getFiniteNumber(hourly.temperature_2m, index)
  const cloudCoverPct = getFiniteNumber(hourly.cloud_cover, index)
  const pressureHpa = getFiniteNumber(hourly.surface_pressure, index)
  const windDirectionDegrees = getFiniteNumber(hourly.wind_direction_10m, index)
  const windKph = getFiniteNumber(hourly.wind_speed_10m, index)
  const waterTempC = waterTempFromApi(input, config)

  if (
    airTempC === undefined ||
    cloudCoverPct === undefined ||
    pressureHpa === undefined ||
    windDirectionDegrees === undefined ||
    windKph === undefined ||
    waterTempC === undefined
  ) {
    return undefined
  }

  const pressureTrend = pressureTrendFromApi(hourly.surface_pressure, index, pressureHpa)
  const normalizedCloudCover = Math.max(0, Math.min(100, Math.round(cloudCoverPct)))

  return {
    airTempC: roundOne(airTempC),
    cloudCoverPct: normalizedCloudCover,
    condition: conditionFromClouds(normalizedCloudCover, pressureTrend),
    pressureHpa: roundOne(pressureHpa),
    pressureTrend,
    source: 'weather-api',
    waterTempC,
    windDirection: windDirectionFromDegrees(windDirectionDegrees),
    windKph: roundOne(windKph),
  } satisfies CatchWeatherSnapshot
}

export async function resolveWeatherApiSnapshot(
  input: CatchWeatherLookupInput,
  config: CatchWeatherProviderConfig = readCatchWeatherProviderConfig(),
) {
  const url = createWeatherApiUrl(input, config)
  if (!url) return undefined

  const response = await fetchWeatherApiJson(url, config.timeoutMs ?? 5000)
  return snapshotFromOpenMeteoResponse(input, response, config)
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

export function createAsyncCatchWeatherResolver(
  config: CatchWeatherProviderConfig = readCatchWeatherProviderConfig(),
): AsyncCatchWeatherResolver {
  const provider = config.provider ?? 'mock'
  const fallbackToMock = config.fallbackToMock ?? true
  const syncResolver = createCatchWeatherResolver(config)

  if (provider !== 'weather-api') {
    return async (input) => syncResolver(input)
  }

  return async (input) => {
    const apiSnapshot = await resolveWeatherApiSnapshot(input, config)
    return apiSnapshot ??
      resolveConfiguredSnapshot('weather-api', config.stationSnapshot) ??
      fallbackSnapshot(input, fallbackToMock)
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
    latitude: parseNumber(env.RYBOLOV_WEATHER_LATITUDE),
    longitude: parseNumber(env.RYBOLOV_WEATHER_LONGITUDE),
    provider: parseProvider(env.RYBOLOV_WEATHER_PROVIDER),
    stationSnapshot,
    timeoutMs: parseInteger(env.RYBOLOV_WEATHER_TIMEOUT_MS),
    waterTempOffsetC: parseNumber(env.RYBOLOV_WEATHER_WATER_TEMP_OFFSET_C),
  }
}
