import { describe, expect, it } from 'vitest'
import {
  addMonths,
  buildCalendarDays,
  buildMonthCalendarDays,
  getMonthStart,
} from '~/app/utils/calendar'

describe('calendar utilities', () => {
  it('builds a fixed range from the provided day', () => {
    const days = buildCalendarDays('2026-05-16', 3)

    expect(days.map((day) => day.iso)).toEqual(['2026-05-16', '2026-05-17', '2026-05-18'])
    expect(days[0]?.dayNumber).toBe('16.')
  })

  it('normalizes to month start and builds the full month', () => {
    const days = buildMonthCalendarDays('2026-02-14')

    expect(getMonthStart('2026-02-14')).toBe('2026-02-01')
    expect(days).toHaveLength(28)
    expect(days[0]?.iso).toBe('2026-02-01')
    expect(days.at(-1)?.iso).toBe('2026-02-28')
  })

  it('moves month navigation to the first day of the target month', () => {
    expect(addMonths('2026-05-16', 1)).toBe('2026-06-01')
    expect(addMonths('2026-05-16', -1)).toBe('2026-04-01')
  })
})
