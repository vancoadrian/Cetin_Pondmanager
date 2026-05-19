import { describe, expect, it } from 'vitest'
import {
  createEmptyCatchReportState,
  saveCatchSavedReport,
  type CatchReportState,
} from '~/app/services/catchReportService'

const now = '2026-05-19T08:00:00.000Z'

describe('catchReportService', () => {
  it('creates a saved catch report from the current analytics filter', () => {
    const result = saveCatchSavedReport(
      {
        audience: 'manager',
        cadence: 'weekly',
        delivery: 'email-ready',
        enabled: true,
        filter: {
          dateFrom: '2026-05-01',
          dateTo: '2026-05-31',
          lake: 'velky-cetin',
          seasonWindowId: 'main-2026',
          species: 'Kapor',
        },
        includeRawCsv: true,
        includeTrendSignals: true,
        recipients: 'spravca@example.test, majitel@example.test',
        title: 'Týždenný kaprový report',
      },
      createEmptyCatchReportState(),
      now,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Report should be valid.')

    expect(result.statusCode).toBe(201)
    expect(result.report.id).toBe('catch-report-20260519-tyzdenny-kaprovy-report')
    expect(result.report.recipients).toEqual(['spravca@example.test', 'majitel@example.test'])
    expect(result.report.filter).toMatchObject({
      dateFrom: '2026-05-01',
      lake: 'velky-cetin',
      seasonWindowId: 'main-2026',
      species: 'Kapor',
    })
    expect(result.savedReports).toHaveLength(1)
  })

  it('updates an existing saved report without changing its creation date', () => {
    const state: CatchReportState = {
      savedReports: [{
        audience: 'manager',
        cadence: 'weekly',
        createdAt: '2026-05-18T08:00:00.000Z',
        delivery: 'in-app',
        description: 'Pôvodný report.',
        enabled: true,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
        },
        id: 'catch-report-test',
        includeRawCsv: true,
        includeTrendSignals: false,
        recipients: [],
        title: 'Pôvodný report',
        updatedAt: '2026-05-18T08:00:00.000Z',
      }],
    }
    const result = saveCatchSavedReport(
      {
        audience: 'accountant',
        cadence: 'monthly',
        delivery: 'email-ready',
        enabled: false,
        filter: {
          lake: 'all',
          seasonWindowId: 'custom',
          species: 'all',
        },
        id: 'catch-report-test',
        includeRawCsv: false,
        includeTrendSignals: true,
        recipients: ['uctovnik@example.test', 'uctovnik@example.test'],
        title: 'Mesačný report pre účtovníka',
      },
      state,
      now,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Report update should be valid.')

    expect(result.statusCode).toBe(200)
    expect(result.report.createdAt).toBe('2026-05-18T08:00:00.000Z')
    expect(result.report.updatedAt).toBe(now)
    expect(result.report.enabled).toBe(false)
    expect(result.report.recipients).toEqual(['uctovnik@example.test'])
    expect(result.report.filter.species).toBeUndefined()
    expect(result.savedReports).toHaveLength(1)
  })

  it('rejects report definitions without any payload', () => {
    const result = saveCatchSavedReport({
      audience: 'manager',
      cadence: 'manual',
      delivery: 'in-app',
      enabled: true,
      filter: {
        lake: 'all',
        seasonWindowId: 'custom',
      },
      includeRawCsv: false,
      includeTrendSignals: false,
      title: 'Prázdny report',
    }, createEmptyCatchReportState(), now)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Empty report should be invalid.')

    expect(result.messages).toContain('Report musí obsahovať aspoň CSV úlovkov alebo trendové signály.')
  })
})
