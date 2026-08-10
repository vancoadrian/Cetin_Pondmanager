import type {
  CatchRecord,
  CatchSavedReport,
  CatchSavedReportFilter,
  LakeSlug,
} from '~/data/pond'
import {
  createCatchAnalytics,
  createCatchCsvExport,
  createCatchMonthlyTrend,
  createCatchSeasonComparison,
  createCatchSpeciesPegTrend,
  createCatchSpeciesTrend,
  createCatchTrendSignalCsvExport,
  createCatchTrendSignalRows,
  filterCatchesForAnalytics,
  type CatchTrendSignalRow,
} from '~/utils/catchAnalytics'
import {
  cloneReport,
  failure,
  type CatchReportState,
  type CatchReportValidationFailure,
} from '~/services/catchReportService'

export interface CatchGeneratedReport {
  generatedAt: string
  rawCsv?: string
  reportId: string
  signalCsv?: string
  summary: {
    averageWeightKg: number
    catchCount: number
    largestCatchLabel: string
    periodLabel: string
    releaseRatePercent: number
    topBaitLabel: string
    topPegLabel: string
    topSpeciesLabel: string
    totalWeightKg: number
    trendSignalCount: number
  }
  trendSignals: CatchTrendSignalRow[]
}

export interface CatchReportGenerationSuccess {
  generatedReport: CatchGeneratedReport
  message: string
  ok: true
  report: CatchSavedReport
  savedReports: CatchSavedReport[]
  statusCode: 200
}

export type CatchReportGenerationResult = CatchReportGenerationSuccess | CatchReportValidationFailure

export interface CatchReportGenerationOptions {
  getLakeName?: (lake: LakeSlug) => string
  getPegLabel?: (pegId: string) => string
}

function formatReportPeriod(filter: CatchSavedReportFilter) {
  if (filter.dateFrom && filter.dateTo) return `${filter.dateFrom} až ${filter.dateTo}`
  if (filter.dateFrom) return `od ${filter.dateFrom}`
  if (filter.dateTo) return `do ${filter.dateTo}`

  return 'všetky schválené úlovky'
}

function reportFilterToAnalyticsFilter(filter: CatchSavedReportFilter) {
  return {
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    lake: filter.lake,
    species: filter.species,
    statuses: ['approved' as const],
  }
}

function updateReportInState(
  state: CatchReportState,
  report: CatchSavedReport,
) {
  return state.savedReports.map((item) => item.id === report.id ? report : item)
}

export function generateCatchSavedReport(
  reportId: string,
  state: CatchReportState,
  catches: CatchRecord[],
  options: CatchReportGenerationOptions = {},
  now = new Date().toISOString(),
): CatchReportGenerationResult {
  const existingReport = state.savedReports.find((report) => report.id === reportId)
  if (!existingReport) {
    return failure(['Uložený report sa nenašiel.'], 404)
  }

  const report: CatchSavedReport = {
    ...cloneReport(existingReport),
    lastGeneratedAt: now,
    updatedAt: now,
  }
  const analyticsFilter = reportFilterToAnalyticsFilter(report.filter)
  const filteredCatches = filterCatchesForAnalytics(catches, analyticsFilter)
  const analytics = createCatchAnalytics(filteredCatches, options)
  const seasonComparison = createCatchSeasonComparison(catches, analyticsFilter)
  const monthlyTrend = createCatchMonthlyTrend(catches, analyticsFilter)
  const speciesTrend = createCatchSpeciesTrend(catches, analyticsFilter)
  const speciesPegTrend = createCatchSpeciesPegTrend(catches, analyticsFilter, {
    getPegLabel: options.getPegLabel,
  })
  const trendSignals = createCatchTrendSignalRows({
    monthlyTrend,
    seasonComparison,
    speciesPegTrend,
    speciesTrend,
  })
  const generatedReport: CatchGeneratedReport = {
    generatedAt: now,
    rawCsv: report.includeRawCsv
      ? createCatchCsvExport(filteredCatches, options)
      : undefined,
    reportId: report.id,
    signalCsv: report.includeTrendSignals
      ? createCatchTrendSignalCsvExport(trendSignals)
      : undefined,
    summary: {
      averageWeightKg: analytics.averageWeightKg,
      catchCount: analytics.catchCount,
      largestCatchLabel: analytics.largestCatch
        ? `${analytics.largestCatch.species} ${analytics.largestCatch.weightKg} kg`
        : 'bez úlovku',
      periodLabel: formatReportPeriod(report.filter),
      releaseRatePercent: analytics.releaseRatePercent,
      topBaitLabel: analytics.topBaits[0]?.label ?? 'bez dát',
      topPegLabel: analytics.topPegs[0]?.label ?? 'bez dát',
      topSpeciesLabel: analytics.topSpecies[0]?.label ?? 'bez dát',
      totalWeightKg: analytics.totalWeightKg,
      trendSignalCount: trendSignals.length,
    },
    trendSignals,
  }

  return {
    generatedReport,
    message: 'Report je vygenerovaný a pripravený na odoslanie alebo export.',
    ok: true,
    report,
    savedReports: updateReportInState(state, report),
    statusCode: 200,
  }
}
