export interface CalendarDay {
  iso: string
  dayName: string
  dayNumber: string
  monthName: string
}

const toUtcDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10)

export function addDays(iso: string, days: number) {
  const date = toUtcDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

export function buildCalendarDays(startIso: string, count = 7): CalendarDay[] {
  return Array.from({ length: count }, (_, index) => {
    const iso = addDays(startIso, index)
    const date = toUtcDate(iso)

    return {
      iso,
      dayName: new Intl.DateTimeFormat('sk-SK', { weekday: 'short', timeZone: 'UTC' }).format(date),
      dayNumber: new Intl.DateTimeFormat('sk-SK', { day: '2-digit', timeZone: 'UTC' }).format(date),
      monthName: new Intl.DateTimeFormat('sk-SK', { month: 'short', timeZone: 'UTC' }).format(date),
    }
  })
}

