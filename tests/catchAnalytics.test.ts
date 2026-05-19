import { describe, expect, it } from 'vitest'
import type { CatchRecord, LakeClosure } from '~/app/data/pond'
import {
  createCatchAnalytics,
  createCatchCsvExport,
  createCatchMonthlyTrend,
  createCatchSeasonWindows,
  createCatchSeasonComparison,
  createCatchSpeciesPegTrend,
  createCatchSpeciesTrend,
  createCatchTrendSignalCsvExport,
  createCatchTrendSignalRows,
  filterCatchesForAnalytics,
} from '~/app/utils/catchAnalytics'

const catchRecord = (overrides: Partial<CatchRecord> = {}): CatchRecord => ({
  angler: 'Test Rybár',
  bait: 'krill boilies',
  caughtAt: '2026-06-10T05:30:00',
  id: 'catch-1',
  lake: 'velky-cetin',
  lengthCm: 90,
  notes: 'Test.',
  pegId: 'vc-01',
  photoLabel: 'foto.jpg',
  released: true,
  species: 'Kapor',
  status: 'approved',
  weather: {
    airTempC: 16,
    cloudCoverPct: 50,
    condition: 'stabilný tlak',
    pressureHpa: 1014,
    pressureTrend: 'stable',
    source: 'mock',
    waterTempC: 18,
    windDirection: 'SV',
    windKph: 8,
  },
  weightKg: 10,
  ...overrides,
})

describe('createCatchAnalytics', () => {
  it('summarizes approved catches by species, peg, bait, lake and hour', () => {
    const result = createCatchAnalytics(
      [
        catchRecord({ id: 'c-1', pegId: 'vc-01', weightKg: 10 }),
        catchRecord({ id: 'c-2', bait: 'scopex boilies', caughtAt: '2026-06-10T05:45:00', pegId: 'vc-01', weightKg: 20 }),
        catchRecord({ id: 'c-3', lake: 'strkovisko-kocka', pegId: 'sk-03', species: 'Amur', weightKg: 12 }),
        catchRecord({ id: 'c-4', status: 'pending', weightKg: 30 }),
      ],
      {
        getLakeName: (lake) => (lake === 'velky-cetin' ? 'Veľký Cetín' : 'Štrkovisko Kocka'),
        getPegLabel: (pegId) => (pegId === 'vc-01' ? 'Miesto 1' : pegId),
      },
    )

    expect(result.catchCount).toBe(3)
    expect(result.statusCounts).toEqual({
      approved: 3,
      pending: 1,
      rejected: 0,
    })
    expect(result.totalWeightKg).toBe(42)
    expect(result.averageWeightKg).toBe(14)
    expect(result.largestCatch?.id).toBe('c-2')
    expect(result.topSpecies[0]).toMatchObject({ count: 2, label: 'Kapor', totalWeightKg: 30 })
    expect(result.topPegs[0]).toMatchObject({ count: 2, label: 'Miesto 1' })
    expect(result.topBaits[0]).toMatchObject({ count: 2, label: 'krill boilies' })
    expect(result.lakeSummaries[0]).toMatchObject({ count: 2, label: 'Veľký Cetín' })
    expect(result.busiestHour).toMatchObject({ count: 3, label: '05:00' })
    expect(result.weatherSummary).toMatchObject({
      averagePressureHpa: 1014,
      averageWaterTempC: 18,
      averageWindKph: 8,
      weatherCount: 3,
    })
    expect(result.topConditions[0]).toMatchObject({ count: 3, label: 'stabilný tlak' })
  })

  it('can include pending catches when an internal report asks for them', () => {
    const result = createCatchAnalytics(
      [
        catchRecord({ id: 'approved', status: 'approved', weightKg: 10 }),
        catchRecord({ id: 'pending', status: 'pending', weightKg: 15 }),
        catchRecord({ id: 'rejected', status: 'rejected', weightKg: 30 }),
      ],
      {
        statuses: ['approved', 'pending'],
      },
    )

    expect(result.catchCount).toBe(2)
    expect(result.totalWeightKg).toBe(25)
    expect(result.largestCatch?.id).toBe('pending')
  })

  it('returns empty-safe metrics without approved catches', () => {
    const result = createCatchAnalytics([catchRecord({ status: 'pending' })])

    expect(result.catchCount).toBe(0)
    expect(result.averageWeightKg).toBe(0)
    expect(result.releaseRatePercent).toBe(0)
    expect(result.largestCatch).toBeUndefined()
    expect(result.topSpecies).toEqual([])
  })

  it('filters report catches by date, lake and species', () => {
    const filtered = filterCatchesForAnalytics(
      [
        catchRecord({ id: 'c-1', caughtAt: '2026-05-16T05:40:00+02:00', lake: 'velky-cetin', species: 'Kapor' }),
        catchRecord({ id: 'c-2', caughtAt: '2026-05-15T19:10:00+02:00', lake: 'strkovisko-kocka', species: 'Amur' }),
        catchRecord({ id: 'c-3', caughtAt: '2026-05-17T06:00:00+02:00', lake: 'velky-cetin', species: 'Kapor' }),
        catchRecord({ id: 'pending', caughtAt: '2026-05-16T06:00:00+02:00', status: 'pending' }),
      ],
      {
        dateFrom: '2026-05-16',
        dateTo: '2026-05-16',
        lake: 'velky-cetin',
        species: 'kapor',
      },
    )

    expect(filtered.map((catchItem) => catchItem.id)).toEqual(['c-1'])
  })

  it('creates a semicolon CSV export with escaped notes', () => {
    const csv = createCatchCsvExport(
      [
        catchRecord({
          bait: 'krill; scopex',
          id: 'c-1',
          notes: 'Poznámka s "úvodzovkami"',
          weightKg: 10.5,
        }),
      ],
      {
        getLakeName: () => 'Veľký Cetín',
        getPegLabel: () => 'Miesto 1',
      },
    )

    expect(csv.split('\n')[0]).toContain('ID;Stav;Rybár')
    expect(csv).toContain('Veľký Cetín;Miesto 1')
    expect(csv).toContain('"krill; scopex"')
    expect(csv).toContain('"Poznámka s ""úvodzovkami"""')
    expect(csv).toContain('10,5')
    expect(csv).toContain('stabilný tlak;16;18;1014;stable;8;SV;50')
  })

  it('compares the latest approved season with the previous calendar season', () => {
    const comparison = createCatchSeasonComparison([
      catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'current-1', weightKg: 10 }),
      catchRecord({ caughtAt: '2026-08-12T20:00:00', id: 'current-2', weightKg: 20 }),
      catchRecord({ caughtAt: '2025-06-10T05:30:00', id: 'previous-1', weightKg: 8 }),
      catchRecord({ caughtAt: '2026-06-10T05:30:00', id: 'pending', status: 'pending', weightKg: 40 }),
    ])

    expect(comparison.current).toMatchObject({
      averageWeightKg: 15,
      catchCount: 2,
      from: '2026-01-01',
      to: '2026-12-31',
      totalWeightKg: 30,
    })
    expect(comparison.previous).toMatchObject({
      averageWeightKg: 8,
      catchCount: 1,
      from: '2025-01-01',
      to: '2025-12-31',
      totalWeightKg: 8,
    })
    expect(comparison.deltaCatchCount).toBe(1)
    expect(comparison.deltaTotalWeightKg).toBe(22)
    expect(comparison.totalWeightChangePercent).toBe(275)
    expect(comparison.averageWeightChangePercent).toBe(87.5)
    expect(comparison.hasComparisonPeriod).toBe(true)
  })

  it('compares a filtered date range with the same range in the previous year', () => {
    const comparison = createCatchSeasonComparison(
      [
        catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'current-kapor', lake: 'velky-cetin', species: 'Kapor', weightKg: 12 }),
        catchRecord({ caughtAt: '2025-05-11T05:30:00', id: 'previous-kapor', lake: 'velky-cetin', species: 'Kapor', weightKg: 9 }),
        catchRecord({ caughtAt: '2025-05-12T05:30:00', id: 'previous-amur', lake: 'velky-cetin', species: 'Amur', weightKg: 18 }),
        catchRecord({ caughtAt: '2026-05-13T05:30:00', id: 'other-lake', lake: 'strkovisko-kocka', species: 'Kapor', weightKg: 20 }),
      ],
      {
        dateFrom: '2026-05-01',
        dateTo: '2026-05-31',
        lake: 'velky-cetin',
        species: 'Kapor',
      },
    )

    expect(comparison.current).toMatchObject({
      catchCount: 1,
      from: '2026-05-01',
      to: '2026-05-31',
      totalWeightKg: 12,
    })
    expect(comparison.previous).toMatchObject({
      catchCount: 1,
      from: '2025-05-01',
      to: '2025-05-31',
      totalWeightKg: 9,
    })
    expect(comparison.deltaTotalWeightKg).toBe(3)
    expect(comparison.totalWeightChangePercent).toBe(33.3)
  })

  it('marks season comparison as missing when the previous period has no catches', () => {
    const comparison = createCatchSeasonComparison([
      catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'current-only', weightKg: 12 }),
    ])

    expect(comparison.current.catchCount).toBe(1)
    expect(comparison.previous.catchCount).toBe(0)
    expect(comparison.hasComparisonPeriod).toBe(false)
    expect(comparison.totalWeightChangePercent).toBeNull()
  })

  it('creates report season windows from lake rules and closures', () => {
    const closures: LakeClosure[] = [
      {
        affectsReservations: true,
        from: '2026-12-15',
        id: 'winter',
        lake: 'all',
        notes: 'Zimný režim.',
        reason: 'season',
        title: 'Zimná prestávka',
        to: '2027-02-15',
        visibility: 'public',
      },
      {
        affectsReservations: true,
        from: '2026-05-01',
        id: 'spawning',
        lake: 'velky-cetin',
        notes: 'Šetrný režim pre ryby.',
        reason: 'spawning',
        title: 'Neres',
        to: '2026-05-20',
        visibility: 'public',
      },
      {
        affectsReservations: true,
        from: '2026-08-21',
        id: 'tournament',
        lake: 'strkovisko-kocka',
        notes: 'Test pretekov.',
        reason: 'tournament',
        title: 'Preteky na Kocke',
        to: '2026-08-25',
        visibility: 'public',
      },
    ]

    const windows = createCatchSeasonWindows(
      [
        catchRecord({ caughtAt: '2026-06-10T05:30:00', id: 'approved' }),
        catchRecord({ caughtAt: '2027-06-10T05:30:00', id: 'pending-next-year', status: 'pending' }),
      ],
      closures,
      { lake: 'velky-cetin' },
      { getLakeName: (lake) => (lake === 'velky-cetin' ? 'Veľký Cetín' : 'Kocka') },
    )

    expect(windows.map((window) => window.id)).toEqual([
      'main-season-2026',
      'closure-spawning',
      'closure-winter',
    ])
    expect(windows[0]).toMatchObject({
      dateFrom: '2026-03-01',
      dateTo: '2026-12-14',
      lake: 'velky-cetin',
      label: 'Hlavná sezóna 2026',
      reason: 'main-season',
    })
    expect(windows.find((window) => window.id === 'closure-spawning')).toMatchObject({
      description: 'Veľký Cetín · Šetrný režim pre ryby.',
      lake: 'velky-cetin',
      reason: 'spawning',
      sourceClosureId: 'spawning',
    })
  })

  it('builds a monthly trend against the same months in the previous year', () => {
    const trend = createCatchMonthlyTrend(
      [
        catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'may-current-1', weightKg: 12 }),
        catchRecord({ caughtAt: '2026-06-10T05:30:00', id: 'jun-current-1', weightKg: 20 }),
        catchRecord({ caughtAt: '2025-05-10T05:30:00', id: 'may-previous-1', weightKg: 8 }),
        catchRecord({ caughtAt: '2025-06-10T05:30:00', id: 'jun-previous-1', weightKg: 10 }),
        catchRecord({ caughtAt: '2025-06-12T05:30:00', id: 'jun-previous-2', weightKg: 5 }),
      ],
      {
        dateFrom: '2026-05-01',
        dateTo: '2026-06-30',
      },
    )

    expect(trend.months).toHaveLength(2)
    expect(trend.months[0]).toMatchObject({
      currentCatchCount: 1,
      currentTotalWeightKg: 12,
      deltaCatchCount: 0,
      deltaTotalWeightKg: 4,
      key: '2026-05',
      previousCatchCount: 1,
      previousKey: '2025-05',
      previousTotalWeightKg: 8,
      totalWeightChangePercent: 50,
    })
    expect(trend.months[1]).toMatchObject({
      currentCatchCount: 1,
      currentTotalWeightKg: 20,
      deltaCatchCount: -1,
      deltaTotalWeightKg: 5,
      key: '2026-06',
      previousCatchCount: 2,
      previousTotalWeightKg: 15,
    })
    expect(trend.hasComparisonPeriod).toBe(true)
    expect(trend.maxTotalWeightKg).toBe(20)
  })

  it('builds a species trend against the previous year', () => {
    const trend = createCatchSpeciesTrend([
      catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'kapor-current-1', species: 'Kapor', weightKg: 12 }),
      catchRecord({ caughtAt: '2026-05-11T05:30:00', id: 'kapor-current-2', species: 'Kapor', weightKg: 18 }),
      catchRecord({ caughtAt: '2026-05-12T05:30:00', id: 'amur-current-1', species: 'Amur', weightKg: 9 }),
      catchRecord({ caughtAt: '2025-05-10T05:30:00', id: 'kapor-previous-1', species: 'Kapor', weightKg: 10 }),
      catchRecord({ caughtAt: '2025-05-11T05:30:00', id: 'sumec-previous-1', species: 'Sumec', weightKg: 22 }),
    ])

    expect(trend.rows[0]).toMatchObject({
      currentAverageWeightKg: 15,
      currentCatchCount: 2,
      currentTotalWeightKg: 30,
      deltaCatchCount: 1,
      deltaTotalWeightKg: 20,
      key: 'kapor',
      label: 'Kapor',
      previousAverageWeightKg: 10,
      previousCatchCount: 1,
      previousTotalWeightKg: 10,
      totalWeightChangePercent: 200,
    })
    expect(trend.rows.find((row) => row.label === 'Sumec')).toMatchObject({
      currentCatchCount: 0,
      previousCatchCount: 1,
      previousTotalWeightKg: 22,
      totalWeightChangePercent: -100,
    })
    expect(trend.hasComparisonPeriod).toBe(true)
    expect(trend.maxTotalWeightKg).toBe(30)
  })

  it('builds a species and peg trend by strongest weight movement', () => {
    const trend = createCatchSpeciesPegTrend(
      [
        catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'kapor-vc-current-1', pegId: 'vc-01', species: 'Kapor', weightKg: 12 }),
        catchRecord({ caughtAt: '2026-05-11T05:30:00', id: 'kapor-vc-current-2', pegId: 'vc-01', species: 'Kapor', weightKg: 18 }),
        catchRecord({ caughtAt: '2025-05-10T05:30:00', id: 'kapor-vc-previous-1', pegId: 'vc-01', species: 'Kapor', weightKg: 10 }),
        catchRecord({ caughtAt: '2026-05-12T05:30:00', id: 'amur-sk-current-1', lake: 'strkovisko-kocka', pegId: 'sk-03', species: 'Amur', weightKg: 9 }),
        catchRecord({ caughtAt: '2025-05-11T05:30:00', id: 'sumec-sk-previous-1', lake: 'strkovisko-kocka', pegId: 'sk-03', species: 'Sumec', weightKg: 22 }),
      ],
      {},
      {
        getPegLabel: (pegId) => (pegId === 'vc-01' ? 'Miesto 1' : 'Miesto 3'),
      },
    )

    expect(trend.rows[0]).toMatchObject({
      currentCatchCount: 0,
      deltaTotalWeightKg: -22,
      label: 'Sumec · Miesto 3',
      previousCatchCount: 1,
      previousTotalWeightKg: 22,
      totalWeightChangePercent: -100,
    })
    expect(trend.rows[1]).toMatchObject({
      currentCatchCount: 2,
      currentTotalWeightKg: 30,
      deltaCatchCount: 1,
      deltaTotalWeightKg: 20,
      key: 'kapor::vc-01',
      label: 'Kapor · Miesto 1',
      pegId: 'vc-01',
      pegLabel: 'Miesto 1',
      previousCatchCount: 1,
      previousTotalWeightKg: 10,
      speciesKey: 'kapor',
      speciesLabel: 'Kapor',
      totalWeightChangePercent: 200,
    })
    expect(trend.hasComparisonPeriod).toBe(true)
    expect(trend.maxDeltaTotalWeightKg).toBe(22)
    expect(trend.maxTotalWeightKg).toBe(30)
  })

  it('exports manager trend signals as semicolon CSV', () => {
    const catches = [
      catchRecord({ caughtAt: '2026-05-10T05:30:00', id: 'kapor-current-1', pegId: 'vc-01', species: 'Kapor', weightKg: 12 }),
      catchRecord({ caughtAt: '2026-05-11T05:30:00', id: 'kapor-current-2', pegId: 'vc-01', species: 'Kapor', weightKg: 18 }),
      catchRecord({ caughtAt: '2026-06-12T05:30:00', id: 'amur-current-1', lake: 'strkovisko-kocka', pegId: 'sk-03', species: 'Amur', weightKg: 9 }),
      catchRecord({ caughtAt: '2025-05-10T05:30:00', id: 'kapor-previous-1', pegId: 'vc-01', species: 'Kapor', weightKg: 10 }),
      catchRecord({ caughtAt: '2025-06-11T05:30:00', id: 'sumec-previous-1', lake: 'strkovisko-kocka', pegId: 'sk-03', species: 'Sumec', weightKg: 22 }),
    ]
    const filter = {
      dateFrom: '2026-05-01',
      dateTo: '2026-06-30',
    }
    const speciesPegTrend = createCatchSpeciesPegTrend(
      catches,
      filter,
      {
        getPegLabel: (pegId) => (pegId === 'vc-01' ? 'Miesto 1' : 'Miesto 3'),
      },
    )
    const rows = createCatchTrendSignalRows(
      {
        monthlyTrend: createCatchMonthlyTrend(catches, filter),
        seasonComparison: createCatchSeasonComparison(catches, filter),
        speciesPegTrend,
        speciesTrend: createCatchSpeciesTrend(catches, filter),
      },
      {
        maxMonthlyRows: 2,
        maxSpeciesPegRows: 2,
        maxSpeciesRows: 2,
      },
    )
    const csv = createCatchTrendSignalCsvExport(rows)

    expect(rows[0]).toMatchObject({
      currentCatchCount: 3,
      previousCatchCount: 2,
      section: 'Sezónne porovnanie',
      signal: 'growth',
    })
    expect(rows.find((row) => row.section === 'Druh a lovné miesto' && row.label === 'Sumec')).toMatchObject({
      context: 'Miesto 3',
      previousTotalWeightKg: 22,
      signal: 'decline',
      totalWeightChangePercent: -100,
    })
    expect(csv.split('\n')[0]).toContain('Sekcia;Signál;Kontext')
    expect(csv).toContain('Trend podľa druhu;Kapor;Kapor')
    expect(csv).toContain('Druh a lovné miesto;Sumec;Miesto 3')
    expect(csv).toContain('pokles')
  })
})
