export type SeedPrimitive = string | number | boolean | null
export type SeedValue = SeedPrimitive | SeedValue[] | { [key: string]: SeedValue }
export type SeedRow = Record<string, SeedValue>

export const CETIN_VENUE_SLUG = 'rybolov-cetin'
export const CETIN_VENUE_NAME = 'Rybolov Cetín'
export const CETIN_TIMEZONE = 'Europe/Bratislava'

function toHex(value: number) {
  return (value >>> 0).toString(16).padStart(8, '0')
}

function hash128(value: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  let h3 = 0xc0decafe
  let h4 = 0x9e3779b9

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
    h3 = Math.imul(h3 ^ code, 2246822507)
    h4 = Math.imul(h4 ^ code, 3266489909)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507)
  h4 = Math.imul(h4 ^ (h4 >>> 13), 3266489909)

  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`
}

export function stableSeedUuid(scope: string, key: string) {
  const chars = hash128(`${scope}:${key}`).split('')
  chars[12] = '5'
  chars[16] = ((Number.parseInt(chars[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const hex = chars.join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

export function snakeValue<T extends string>(value: T) {
  return value.replaceAll('-', '_')
}

export function rowId(table: string, key: string) {
  return stableSeedUuid(table, key)
}

export function dateOnly(value: string) {
  return value.slice(0, 10)
}

export function parseOperationalTimestamp(
  value: string | undefined,
  baseDate: string,
): string | null {
  if (!value || value === 'čaká') return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00+02:00`

  const todayMatch = value.match(/^dnes\s+(\d{1,2}):(\d{2})$/)
  if (todayMatch) {
    return `${baseDate}T${todayMatch[1]!.padStart(2, '0')}:${todayMatch[2]}:00+02:00`
  }

  if (value === 'pondelok') return '2026-05-18T23:59:00+02:00'

  return `${baseDate}T00:00:00+02:00`
}

export function parseTournamentRange(dateRange: string) {
  const match = dateRange.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/)
  if (!match) {
    return {
      endsAt: '2026-12-31T23:59:00+01:00',
      startsAt: '2026-01-01T00:00:00+01:00',
    }
  }

  const [, startDay, startMonth, endDay, endMonth, year] = match

  return {
    endsAt: `${year}-${endMonth!.padStart(2, '0')}-${endDay!.padStart(2, '0')}T16:00:00+02:00`,
    startsAt: `${year}-${startMonth!.padStart(2, '0')}-${startDay!.padStart(2, '0')}T07:00:00+02:00`,
  }
}

export function mapBy<T, K extends string>(items: T[], resolveKey: (item: T) => K, resolveId: (item: T) => string) {
  return Object.fromEntries(items.map((item) => [resolveKey(item), resolveId(item)])) as Record<K, string>
}
