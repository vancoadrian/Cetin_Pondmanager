import { describe, expect, it } from 'vitest'
import {
  createAvailabilityRangePreset,
  resolveAvailabilityDateRange,
} from '~/app/utils/availabilityDateRange'

describe('availability date range', () => {
  const monday = new Date('2026-06-22T10:00:00+02:00')

  it('normalizes URL values and repairs an invalid end date', () => {
    expect(resolveAvailabilityDateRange('2026-07-10', '2026-07-09', monday)).toEqual({
      dateFrom: '2026-07-10',
      dateTo: '2026-07-10',
    })
    expect(resolveAvailabilityDateRange('invalid', undefined, monday)).toEqual({
      dateFrom: '2026-06-22',
      dateTo: '2026-06-22',
    })
  })

  it('creates today, weekend and seven-day presets', () => {
    expect(createAvailabilityRangePreset('today', monday)).toEqual({
      dateFrom: '2026-06-22',
      dateTo: '2026-06-22',
    })
    expect(createAvailabilityRangePreset('weekend', monday)).toEqual({
      dateFrom: '2026-06-27',
      dateTo: '2026-06-28',
    })
    expect(createAvailabilityRangePreset('week', monday)).toEqual({
      dateFrom: '2026-06-22',
      dateTo: '2026-06-28',
    })
  })
})
