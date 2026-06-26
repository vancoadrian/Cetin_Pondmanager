export type AvailabilityRangePreset = 'today' | 'weekend' | 'week'

export interface AvailabilityDateRange {
  dateFrom: string
  dateTo: string
}

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/

function toDateInput(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function parseDateInput(value: unknown) {
  const normalized = typeof value === 'string' ? value.slice(0, 10) : ''
  if (!dateInputPattern.test(normalized)) return undefined

  const parsed = new Date(`${normalized}T12:00:00`)
  return Number.isFinite(parsed.getTime()) && toDateInput(parsed) === normalized
    ? normalized
    : undefined
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

export function resolveAvailabilityDateRange(
  rawFrom: unknown,
  rawTo: unknown,
  now = new Date(),
  defaultSpanDays = 0,
): AvailabilityDateRange {
  const fallbackFrom = toDateInput(now)
  const dateFrom = parseDateInput(rawFrom) ?? fallbackFrom
  const parsedTo = parseDateInput(rawTo)
  const dateTo = parsedTo && parsedTo >= dateFrom
    ? parsedTo
    : addDays(dateFrom, defaultSpanDays)

  return { dateFrom, dateTo }
}

export function createAvailabilityRangePreset(
  preset: AvailabilityRangePreset,
  now = new Date(),
): AvailabilityDateRange {
  const today = toDateInput(now)
  if (preset === 'today') return { dateFrom: today, dateTo: today }
  if (preset === 'week') return { dateFrom: today, dateTo: addDays(today, 6) }

  const dayOfWeek = new Date(`${today}T12:00:00`).getDay()
  const daysUntilSaturday = dayOfWeek === 6 ? 0 : dayOfWeek === 0 ? 0 : 6 - dayOfWeek
  const dateFrom = addDays(today, daysUntilSaturday)
  const dateTo = dayOfWeek === 0 ? dateFrom : addDays(dateFrom, 1)
  return { dateFrom, dateTo }
}

export function formatAvailabilityDateRange(dateFrom: string, dateTo: string) {
  const formatter = new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const from = formatter.format(new Date(`${dateFrom}T12:00:00`))
  const to = formatter.format(new Date(`${dateTo}T12:00:00`))
  return dateFrom === dateTo ? from : `${from} – ${to}`
}
