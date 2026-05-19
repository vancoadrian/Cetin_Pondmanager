import type { CatchRecord, CatchRecordStatus, LakeClosure, LakeScope, LakeSlug } from '~/data/pond'

export interface CatchAnalyticsGroup {
  averageWeightKg: number
  count: number
  key: string
  label: string
  largestWeightKg: number
  latestCaughtAt: string
  totalWeightKg: number
}

export interface LakeCatchSummary extends CatchAnalyticsGroup {
  lake: LakeSlug
}

export interface CatchWeatherSummary {
  averageAirTempC: number
  averagePressureHpa: number
  averageWaterTempC: number
  averageWindKph: number
  topConditions: CatchAnalyticsGroup[]
  weatherCount: number
}

export interface CatchAnalyticsResult {
  averageWeightKg: number
  busiestHour?: CatchAnalyticsGroup
  catchCount: number
  largestCatch?: CatchRecord
  lakeSummaries: LakeCatchSummary[]
  releaseRatePercent: number
  statusCounts: Record<CatchRecordStatus, number>
  topBaits: CatchAnalyticsGroup[]
  topConditions: CatchAnalyticsGroup[]
  topGroupCount: number
  topPegs: CatchAnalyticsGroup[]
  topSpecies: CatchAnalyticsGroup[]
  totalWeightKg: number
  weatherSummary: CatchWeatherSummary
}

export interface CatchPeriodSummary {
  averageWeightKg: number
  catchCount: number
  from: string
  largestWeightKg: number
  releaseRatePercent: number
  to: string
  totalWeightKg: number
}

export interface CatchSeasonComparison {
  averageWeightChangePercent: number | null
  current: CatchPeriodSummary
  deltaAverageWeightKg: number
  deltaCatchCount: number
  deltaTotalWeightKg: number
  hasComparisonPeriod: boolean
  previous: CatchPeriodSummary
  totalWeightChangePercent: number | null
}

export interface CatchMonthlyTrendPoint {
  currentCatchCount: number
  currentTotalWeightKg: number
  deltaCatchCount: number
  deltaTotalWeightKg: number
  key: string
  label: string
  previousCatchCount: number
  previousKey: string
  previousTotalWeightKg: number
  totalWeightChangePercent: number | null
}

export interface CatchMonthlyTrend {
  currentFrom: string
  currentTo: string
  hasComparisonPeriod: boolean
  maxCatchCount: number
  maxTotalWeightKg: number
  months: CatchMonthlyTrendPoint[]
  previousFrom: string
  previousTo: string
}

export interface CatchSpeciesTrendRow {
  currentAverageWeightKg: number
  currentCatchCount: number
  currentTotalWeightKg: number
  deltaAverageWeightKg: number
  deltaCatchCount: number
  deltaTotalWeightKg: number
  key: string
  label: string
  previousAverageWeightKg: number
  previousCatchCount: number
  previousTotalWeightKg: number
  totalWeightChangePercent: number | null
}

export interface CatchSpeciesTrend {
  currentFrom: string
  currentTo: string
  hasComparisonPeriod: boolean
  maxCatchCount: number
  maxTotalWeightKg: number
  previousFrom: string
  previousTo: string
  rows: CatchSpeciesTrendRow[]
}

export interface CatchSpeciesPegTrendRow {
  currentAverageWeightKg: number
  currentCatchCount: number
  currentTotalWeightKg: number
  deltaAverageWeightKg: number
  deltaCatchCount: number
  deltaTotalWeightKg: number
  key: string
  label: string
  pegId: string
  pegLabel: string
  previousAverageWeightKg: number
  previousCatchCount: number
  previousTotalWeightKg: number
  speciesKey: string
  speciesLabel: string
  totalWeightChangePercent: number | null
}

export interface CatchSpeciesPegTrend {
  currentFrom: string
  currentTo: string
  hasComparisonPeriod: boolean
  maxCatchCount: number
  maxDeltaTotalWeightKg: number
  maxTotalWeightKg: number
  previousFrom: string
  previousTo: string
  rows: CatchSpeciesPegTrendRow[]
}

export interface CatchSeasonWindow {
  dateFrom: string
  dateTo: string
  description: string
  id: string
  lake: LakeScope
  label: string
  reason: 'main-season' | LakeClosure['reason']
  sourceClosureId?: string
}

interface CatchAnalyticsOptions {
  getLakeName?: (lake: LakeSlug) => string
  getPegLabel?: (pegId: string) => string
  statuses?: CatchRecordStatus[]
}

export interface CatchAnalyticsFilter {
  dateFrom?: string
  dateTo?: string
  lake?: LakeSlug | 'all'
  species?: string
  statuses?: CatchRecordStatus[]
}

export interface CatchCsvOptions {
  getLakeName?: (lake: LakeSlug) => string
  getPegLabel?: (pegId: string) => string
}

export interface CatchSpeciesPegTrendOptions {
  getPegLabel?: (pegId: string) => string
}

export interface CatchSeasonWindowOptions {
  getLakeName?: (lake: LakeSlug) => string
}

export interface CatchTrendSignalRow {
  context: string
  currentCatchCount: number
  currentPeriod: string
  currentTotalWeightKg: number
  deltaCatchCount: number
  deltaTotalWeightKg: number
  label: string
  previousCatchCount: number
  previousPeriod: string
  previousTotalWeightKg: number
  section: string
  signal: 'growth' | 'decline' | 'stable' | 'no-baseline'
  totalWeightChangePercent: number | null
}

export interface CatchTrendSignalInput {
  monthlyTrend: CatchMonthlyTrend
  seasonComparison: CatchSeasonComparison
  speciesPegTrend: CatchSpeciesPegTrend
  speciesTrend: CatchSpeciesTrend
}

export interface CatchTrendSignalOptions {
  maxMonthlyRows?: number
  maxSpeciesPegRows?: number
  maxSpeciesRows?: number
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10
}

function emptyStatusCounts(): Record<CatchRecordStatus, number> {
  return {
    approved: 0,
    pending: 0,
    rejected: 0,
  }
}

function compareGroups(a: CatchAnalyticsGroup, b: CatchAnalyticsGroup) {
  if (b.count !== a.count) return b.count - a.count
  if (b.totalWeightKg !== a.totalWeightKg) return b.totalWeightKg - a.totalWeightKg

  return a.label.localeCompare(b.label, 'sk-SK')
}

function createGroup(items: CatchRecord[], key: string, label: string): CatchAnalyticsGroup {
  const totalWeightKg = items.reduce((sum, catchItem) => sum + catchItem.weightKg, 0)
  const largestWeightKg = Math.max(...items.map((catchItem) => catchItem.weightKg))
  const latestCaughtAt = items
    .map((catchItem) => catchItem.caughtAt)
    .sort((a, b) => b.localeCompare(a))[0]!

  return {
    averageWeightKg: roundMetric(totalWeightKg / items.length),
    count: items.length,
    key,
    label,
    largestWeightKg: roundMetric(largestWeightKg),
    latestCaughtAt,
    totalWeightKg: roundMetric(totalWeightKg),
  }
}

function groupCatches(
  catches: CatchRecord[],
  keyForCatch: (catchItem: CatchRecord) => string,
  labelForKey: (key: string, groupCatches: CatchRecord[]) => string,
) {
  const groups = new Map<string, CatchRecord[]>()

  for (const catchItem of catches) {
    const key = keyForCatch(catchItem).trim()
    const normalizedKey = key || 'nezname'
    groups.set(normalizedKey, [...(groups.get(normalizedKey) ?? []), catchItem])
  }

  return [...groups.entries()]
    .map(([key, groupItems]) => createGroup(groupItems, key, labelForKey(key, groupItems)))
    .sort(compareGroups)
}

function hourLabel(hourKey: string) {
  return `${hourKey.padStart(2, '0')}:00`
}

function getCaughtHour(catchItem: CatchRecord) {
  const parsed = new Date(catchItem.caughtAt)
  const hour = Number.isFinite(parsed.getTime()) ? parsed.getHours() : 0

  return String(hour).padStart(2, '0')
}

function createWeatherSummary(catches: CatchRecord[]): CatchWeatherSummary {
  const weatherCatches = catches.filter((catchItem) => catchItem.weather)
  const sum = (valueForCatch: (catchItem: CatchRecord) => number) =>
    weatherCatches.reduce((total, catchItem) => total + valueForCatch(catchItem), 0)
  const average = (valueForCatch: (catchItem: CatchRecord) => number) =>
    weatherCatches.length > 0 ? roundMetric(sum(valueForCatch) / weatherCatches.length) : 0

  return {
    averageAirTempC: average((catchItem) => catchItem.weather!.airTempC),
    averagePressureHpa: average((catchItem) => catchItem.weather!.pressureHpa),
    averageWaterTempC: average((catchItem) => catchItem.weather!.waterTempC),
    averageWindKph: average((catchItem) => catchItem.weather!.windKph),
    topConditions: groupCatches(
      weatherCatches,
      (catchItem) => catchItem.weather?.condition ?? '',
      (key) => key || 'bez popisu',
    ),
    weatherCount: weatherCatches.length,
  }
}

function dateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)

  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return value.slice(0, 10)

  return parsed.toISOString().slice(0, 10)
}

function dateYear(value: string) {
  const parsed = dateOnly(value)
  if (!/^\d{4}-/.test(parsed)) return undefined

  const year = Number(parsed.slice(0, 4))

  return Number.isFinite(year) ? year : undefined
}

function lastDate(values: string[]) {
  return values.sort((a, b) => b.localeCompare(a))[0]
}

function firstDate(values: string[]) {
  return values.sort((a, b) => a.localeCompare(b))[0]
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function shiftDateYear(value: string, offset: number) {
  const [yearPart, monthPart, dayPart] = value.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return value

  const targetYear = year + offset
  const safeDay = Math.min(day, lastDayOfMonth(targetYear, month))

  return [
    String(targetYear).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(safeDay).padStart(2, '0'),
  ].join('-')
}

function addDays(value: string, days: number) {
  const [yearPart, monthPart, dayPart] = value.split('-')
  const date = new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, Number(dayPart) + days))
  if (!Number.isFinite(date.getTime())) return value

  return date.toISOString().slice(0, 10)
}

function monthKey(value: string) {
  const parsed = dateOnly(value)

  return /^\d{4}-\d{2}/.test(parsed) ? parsed.slice(0, 7) : ''
}

function shiftMonthYear(value: string, offset: number) {
  const [yearPart, monthPart] = value.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)

  if (!Number.isFinite(year) || !Number.isFinite(month)) return value

  return `${String(year + offset).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

function nextMonthKey(value: string) {
  const [yearPart, monthPart] = value.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)

  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  if (month === 12) return `${year + 1}-01`

  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}`
}

function monthRange(from: string, to: string) {
  const start = monthKey(from)
  const end = monthKey(to)
  const months: string[] = []

  if (!start || !end || start > end) return months

  let current = start
  while (current <= end && months.length < 36) {
    months.push(current)
    current = nextMonthKey(current)
  }

  return months
}

function monthLabel(value: string) {
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'máj', 'jún', 'júl', 'aug', 'sep', 'okt', 'nov', 'dec']
  const month = Number(value.slice(5, 7))
  const year = value.slice(0, 4)

  return `${monthNames[month - 1] ?? value} ${year}`
}

function groupByMonth(catches: CatchRecord[]) {
  const groups = new Map<string, CatchRecord[]>()

  for (const catchItem of catches) {
    const key = monthKey(catchItem.caughtAt)
    if (!key) continue

    groups.set(key, [...(groups.get(key) ?? []), catchItem])
  }

  return groups
}

function totalWeight(catches: CatchRecord[]) {
  return roundMetric(catches.reduce((sum, catchItem) => sum + catchItem.weightKg, 0))
}

function averageWeight(catches: CatchRecord[]) {
  return catches.length > 0 ? roundMetric(totalWeight(catches) / catches.length) : 0
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return null

  return roundMetric(((current - previous) / previous) * 100)
}

function summarizePeriod(catches: CatchRecord[], from: string, to: string): CatchPeriodSummary {
  const totalWeightKg = catches.reduce((sum, catchItem) => sum + catchItem.weightKg, 0)
  const releasedCount = catches.filter((catchItem) => catchItem.released).length
  const largestWeightKg = catches.length > 0
    ? Math.max(...catches.map((catchItem) => catchItem.weightKg))
    : 0

  return {
    averageWeightKg: catches.length > 0 ? roundMetric(totalWeightKg / catches.length) : 0,
    catchCount: catches.length,
    from,
    largestWeightKg: roundMetric(largestWeightKg),
    releaseRatePercent: catches.length > 0 ? Math.round((releasedCount / catches.length) * 100) : 0,
    to,
    totalWeightKg: roundMetric(totalWeightKg),
  }
}

function resolveComparisonPeriod(catches: CatchRecord[], filter: CatchAnalyticsFilter) {
  const availableDates = catches.map((catchItem) => dateOnly(catchItem.caughtAt))
  const fallbackTo = filter.dateTo ?? lastDate([...availableDates]) ?? ''
  const fallbackFrom = filter.dateFrom ?? firstDate([...availableDates]) ?? fallbackTo

  if (filter.dateFrom || filter.dateTo) {
    const currentFrom = filter.dateFrom ?? `${dateYear(fallbackTo) ?? dateYear(fallbackFrom) ?? '0000'}-01-01`
    const currentTo = filter.dateTo ?? fallbackTo

    return {
      currentFrom,
      currentTo,
      previousFrom: shiftDateYear(currentFrom, -1),
      previousTo: shiftDateYear(currentTo, -1),
    }
  }

  const latestYear = dateYear(fallbackTo)
  if (!latestYear) {
    return {
      currentFrom: '',
      currentTo: '',
      previousFrom: '',
      previousTo: '',
    }
  }

  return {
    currentFrom: `${latestYear}-01-01`,
    currentTo: `${latestYear}-12-31`,
    previousFrom: `${latestYear - 1}-01-01`,
    previousTo: `${latestYear - 1}-12-31`,
  }
}

function normalizeFilterValue(value?: string) {
  return value?.trim().toLocaleLowerCase('sk-SK') ?? ''
}

function yearRange(year: number) {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

function dateRangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string) {
  return aFrom <= bTo && bFrom <= aTo
}

function overlapsYear(from: string, to: string, year: number) {
  const range = yearRange(year)

  return dateRangesOverlap(from, to, range.from, range.to)
}

function groupBySpecies(catches: CatchRecord[]) {
  const groups = new Map<string, { catches: CatchRecord[], label: string }>()

  for (const catchItem of catches) {
    const label = catchItem.species.trim() || 'Neznámy druh'
    const key = normalizeFilterValue(label) || 'neznamy-druh'
    const current = groups.get(key)

    groups.set(key, {
      catches: [...(current?.catches ?? []), catchItem],
      label: current?.label ?? label,
    })
  }

  return groups
}

function groupBySpeciesPeg(catches: CatchRecord[], getPegLabel: (pegId: string) => string) {
  const groups = new Map<string, {
    catches: CatchRecord[]
    pegId: string
    pegLabel: string
    speciesKey: string
    speciesLabel: string
  }>()

  for (const catchItem of catches) {
    const speciesLabel = catchItem.species.trim() || 'Neznámy druh'
    const speciesKey = normalizeFilterValue(speciesLabel) || 'neznamy-druh'
    const pegId = catchItem.pegId.trim() || 'nezname-miesto'
    const pegLabel = pegId === 'nezname-miesto' ? 'Neznáme miesto' : getPegLabel(pegId)
    const key = `${speciesKey}::${pegId}`
    const current = groups.get(key)

    groups.set(key, {
      catches: [...(current?.catches ?? []), catchItem],
      pegId,
      pegLabel: current?.pegLabel ?? pegLabel,
      speciesKey,
      speciesLabel: current?.speciesLabel ?? speciesLabel,
    })
  }

  return groups
}

function csvCell(value: string | number | boolean) {
  const text = String(value)

  if (!/[;"\n\r]/.test(text)) return text

  return `"${text.replaceAll('"', '""')}"`
}

function csvNumber(value: number) {
  return value.toLocaleString('sk-SK', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  })
}

function signalForDelta(deltaTotalWeightKg: number, totalWeightChangePercent: number | null): CatchTrendSignalRow['signal'] {
  if (totalWeightChangePercent === null) return 'no-baseline'
  if (deltaTotalWeightKg > 0) return 'growth'
  if (deltaTotalWeightKg < 0) return 'decline'

  return 'stable'
}

function compareSignalRows(a: Pick<CatchTrendSignalRow, 'deltaTotalWeightKg' | 'currentTotalWeightKg' | 'label'>, b: Pick<CatchTrendSignalRow, 'deltaTotalWeightKg' | 'currentTotalWeightKg' | 'label'>) {
  const deltaDifference = Math.abs(b.deltaTotalWeightKg) - Math.abs(a.deltaTotalWeightKg)
  if (deltaDifference !== 0) return deltaDifference
  if (b.currentTotalWeightKg !== a.currentTotalWeightKg) return b.currentTotalWeightKg - a.currentTotalWeightKg

  return a.label.localeCompare(b.label, 'sk-SK')
}

export function filterCatchesForAnalytics(
  catches: CatchRecord[],
  filter: CatchAnalyticsFilter = {},
) {
  const statuses = filter.statuses ?? ['approved']
  const species = normalizeFilterValue(filter.species)

  return catches
    .filter((catchItem) => statuses.includes(catchItem.status))
    .filter((catchItem) => !filter.lake || filter.lake === 'all' || catchItem.lake === filter.lake)
    .filter((catchItem) => !species || normalizeFilterValue(catchItem.species) === species)
    .filter((catchItem) => {
      const caughtDate = dateOnly(catchItem.caughtAt)
      if (filter.dateFrom && caughtDate < filter.dateFrom) return false
      if (filter.dateTo && caughtDate > filter.dateTo) return false

      return true
    })
    .sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))
}

export function createCatchSeasonWindows(
  catches: CatchRecord[],
  closures: LakeClosure[],
  filter: CatchAnalyticsFilter = {},
  options: CatchSeasonWindowOptions = {},
): CatchSeasonWindow[] {
  const getLakeName = options.getLakeName ?? ((lake: LakeSlug) => lake)
  const comparisonPool = filterCatchesForAnalytics(catches, {
    ...filter,
    dateFrom: undefined,
    dateTo: undefined,
    statuses: filter.statuses ?? ['approved'],
  })
  const catchFallbackDate = lastDate(comparisonPool.map((catchItem) => dateOnly(catchItem.caughtAt)))
  const closureFallbackDate = lastDate(closures.flatMap((closure) => [closure.from, closure.to]))
  const fallbackDate = catchFallbackDate ?? closureFallbackDate ?? ''
  const fallbackYear = dateYear(filter.dateTo ?? filter.dateFrom ?? fallbackDate) ?? new Date().getFullYear()
  const lakeFilter = filter.lake
  const mainSeasonClosure = closures
    .filter((closure) =>
      closure.reason === 'season' &&
      closure.affectsReservations &&
      (closure.lake === 'all' || !lakeFilter || lakeFilter === 'all' || closure.lake === lakeFilter) &&
      overlapsYear(closure.from, closure.to, fallbackYear),
    )
    .sort((a, b) => a.from.localeCompare(b.from))[0]
  const mainSeasonTo = mainSeasonClosure && mainSeasonClosure.from.slice(0, 4) === String(fallbackYear)
    ? addDays(mainSeasonClosure.from, -1)
    : `${fallbackYear}-11-30`
  const mainSeason: CatchSeasonWindow = {
    dateFrom: `${fallbackYear}-03-01`,
    dateTo: mainSeasonTo,
    description: 'Prevádzkové obdobie mimo zimnej prestávky a mimoriadnych uzávierok.',
    id: `main-season-${fallbackYear}`,
    label: `Hlavná sezóna ${fallbackYear}`,
    lake: lakeFilter && lakeFilter !== 'all' ? lakeFilter : 'all',
    reason: 'main-season',
  }
  const closureWindows = closures
    .filter((closure) =>
      closure.affectsReservations &&
      overlapsYear(closure.from, closure.to, fallbackYear) &&
      (closure.lake === 'all' || !lakeFilter || lakeFilter === 'all' || closure.lake === lakeFilter),
    )
    .map((closure) => {
      const lakeLabel = closure.lake === 'all' ? 'všetky jazerá' : getLakeName(closure.lake)

      return {
        dateFrom: closure.from,
        dateTo: closure.to,
        description: `${lakeLabel} · ${closure.notes}`,
        id: `closure-${closure.id}`,
        label: closure.title,
        lake: closure.lake,
        reason: closure.reason,
        sourceClosureId: closure.id,
      }
    })
    .sort((a, b) => {
      if (a.dateFrom !== b.dateFrom) return a.dateFrom.localeCompare(b.dateFrom)

      return a.label.localeCompare(b.label, 'sk-SK')
    })

  return [mainSeason, ...closureWindows]
}

export function createCatchSeasonComparison(
  catches: CatchRecord[],
  filter: CatchAnalyticsFilter = {},
): CatchSeasonComparison {
  const statuses = filter.statuses ?? ['approved']
  const baseFilter = {
    ...filter,
    dateFrom: undefined,
    dateTo: undefined,
    statuses,
  }
  const comparisonPool = filterCatchesForAnalytics(catches, baseFilter)
  const period = resolveComparisonPeriod(comparisonPool, filter)
  const currentCatches = period.currentFrom && period.currentTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.currentFrom,
        dateTo: period.currentTo,
        statuses,
      })
    : []
  const previousCatches = period.previousFrom && period.previousTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.previousFrom,
        dateTo: period.previousTo,
        statuses,
      })
    : []
  const current = summarizePeriod(currentCatches, period.currentFrom, period.currentTo)
  const previous = summarizePeriod(previousCatches, period.previousFrom, period.previousTo)

  return {
    averageWeightChangePercent: percentChange(current.averageWeightKg, previous.averageWeightKg),
    current,
    deltaAverageWeightKg: roundMetric(current.averageWeightKg - previous.averageWeightKg),
    deltaCatchCount: current.catchCount - previous.catchCount,
    deltaTotalWeightKg: roundMetric(current.totalWeightKg - previous.totalWeightKg),
    hasComparisonPeriod: previous.catchCount > 0,
    previous,
    totalWeightChangePercent: percentChange(current.totalWeightKg, previous.totalWeightKg),
  }
}

export function createCatchMonthlyTrend(
  catches: CatchRecord[],
  filter: CatchAnalyticsFilter = {},
): CatchMonthlyTrend {
  const statuses = filter.statuses ?? ['approved']
  const baseFilter = {
    ...filter,
    dateFrom: undefined,
    dateTo: undefined,
    statuses,
  }
  const comparisonPool = filterCatchesForAnalytics(catches, baseFilter)
  const period = resolveComparisonPeriod(comparisonPool, filter)
  const currentCatches = period.currentFrom && period.currentTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.currentFrom,
        dateTo: period.currentTo,
        statuses,
      })
    : []
  const previousCatches = period.previousFrom && period.previousTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.previousFrom,
        dateTo: period.previousTo,
        statuses,
      })
    : []
  const currentByMonth = groupByMonth(currentCatches)
  const previousByMonth = groupByMonth(previousCatches)
  const months = monthRange(period.currentFrom, period.currentTo).map((key) => {
    const previousKey = shiftMonthYear(key, -1)
    const currentMonthCatches = currentByMonth.get(key) ?? []
    const previousMonthCatches = previousByMonth.get(previousKey) ?? []
    const currentTotalWeightKg = totalWeight(currentMonthCatches)
    const previousTotalWeightKg = totalWeight(previousMonthCatches)

    return {
      currentCatchCount: currentMonthCatches.length,
      currentTotalWeightKg,
      deltaCatchCount: currentMonthCatches.length - previousMonthCatches.length,
      deltaTotalWeightKg: roundMetric(currentTotalWeightKg - previousTotalWeightKg),
      key,
      label: monthLabel(key),
      previousCatchCount: previousMonthCatches.length,
      previousKey,
      previousTotalWeightKg,
      totalWeightChangePercent: percentChange(currentTotalWeightKg, previousTotalWeightKg),
    }
  })

  return {
    currentFrom: period.currentFrom,
    currentTo: period.currentTo,
    hasComparisonPeriod: previousCatches.length > 0,
    maxCatchCount: Math.max(1, ...months.map((item) => item.currentCatchCount), ...months.map((item) => item.previousCatchCount)),
    maxTotalWeightKg: Math.max(1, ...months.map((item) => item.currentTotalWeightKg), ...months.map((item) => item.previousTotalWeightKg)),
    months,
    previousFrom: period.previousFrom,
    previousTo: period.previousTo,
  }
}

export function createCatchSpeciesTrend(
  catches: CatchRecord[],
  filter: CatchAnalyticsFilter = {},
): CatchSpeciesTrend {
  const statuses = filter.statuses ?? ['approved']
  const baseFilter = {
    ...filter,
    dateFrom: undefined,
    dateTo: undefined,
    statuses,
  }
  const comparisonPool = filterCatchesForAnalytics(catches, baseFilter)
  const period = resolveComparisonPeriod(comparisonPool, filter)
  const currentCatches = period.currentFrom && period.currentTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.currentFrom,
        dateTo: period.currentTo,
        statuses,
      })
    : []
  const previousCatches = period.previousFrom && period.previousTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.previousFrom,
        dateTo: period.previousTo,
        statuses,
      })
    : []
  const currentBySpecies = groupBySpecies(currentCatches)
  const previousBySpecies = groupBySpecies(previousCatches)
  const speciesKeys = [...new Set([...currentBySpecies.keys(), ...previousBySpecies.keys()])]
  const rows = speciesKeys
    .map((key) => {
      const current = currentBySpecies.get(key)
      const previous = previousBySpecies.get(key)
      const currentItems = current?.catches ?? []
      const previousItems = previous?.catches ?? []
      const currentTotalWeightKg = totalWeight(currentItems)
      const previousTotalWeightKg = totalWeight(previousItems)
      const currentAverageWeightKg = averageWeight(currentItems)
      const previousAverageWeightKg = averageWeight(previousItems)

      return {
        currentAverageWeightKg,
        currentCatchCount: currentItems.length,
        currentTotalWeightKg,
        deltaAverageWeightKg: roundMetric(currentAverageWeightKg - previousAverageWeightKg),
        deltaCatchCount: currentItems.length - previousItems.length,
        deltaTotalWeightKg: roundMetric(currentTotalWeightKg - previousTotalWeightKg),
        key,
        label: current?.label ?? previous?.label ?? key,
        previousAverageWeightKg,
        previousCatchCount: previousItems.length,
        previousTotalWeightKg,
        totalWeightChangePercent: percentChange(currentTotalWeightKg, previousTotalWeightKg),
      }
    })
    .sort((a, b) => {
      if (b.currentTotalWeightKg !== a.currentTotalWeightKg) return b.currentTotalWeightKg - a.currentTotalWeightKg
      if (b.previousTotalWeightKg !== a.previousTotalWeightKg) return b.previousTotalWeightKg - a.previousTotalWeightKg

      return a.label.localeCompare(b.label, 'sk-SK')
    })

  return {
    currentFrom: period.currentFrom,
    currentTo: period.currentTo,
    hasComparisonPeriod: previousCatches.length > 0,
    maxCatchCount: Math.max(1, ...rows.map((item) => item.currentCatchCount), ...rows.map((item) => item.previousCatchCount)),
    maxTotalWeightKg: Math.max(1, ...rows.map((item) => item.currentTotalWeightKg), ...rows.map((item) => item.previousTotalWeightKg)),
    previousFrom: period.previousFrom,
    previousTo: period.previousTo,
    rows,
  }
}

export function createCatchSpeciesPegTrend(
  catches: CatchRecord[],
  filter: CatchAnalyticsFilter = {},
  options: CatchSpeciesPegTrendOptions = {},
): CatchSpeciesPegTrend {
  const statuses = filter.statuses ?? ['approved']
  const getPegLabel = options.getPegLabel ?? ((pegId: string) => pegId)
  const baseFilter = {
    ...filter,
    dateFrom: undefined,
    dateTo: undefined,
    statuses,
  }
  const comparisonPool = filterCatchesForAnalytics(catches, baseFilter)
  const period = resolveComparisonPeriod(comparisonPool, filter)
  const currentCatches = period.currentFrom && period.currentTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.currentFrom,
        dateTo: period.currentTo,
        statuses,
      })
    : []
  const previousCatches = period.previousFrom && period.previousTo
    ? filterCatchesForAnalytics(catches, {
        ...filter,
        dateFrom: period.previousFrom,
        dateTo: period.previousTo,
        statuses,
      })
    : []
  const currentBySignal = groupBySpeciesPeg(currentCatches, getPegLabel)
  const previousBySignal = groupBySpeciesPeg(previousCatches, getPegLabel)
  const signalKeys = [...new Set([...currentBySignal.keys(), ...previousBySignal.keys()])]
  const rows = signalKeys
    .map((key) => {
      const current = currentBySignal.get(key)
      const previous = previousBySignal.get(key)
      const currentItems = current?.catches ?? []
      const previousItems = previous?.catches ?? []
      const currentTotalWeightKg = totalWeight(currentItems)
      const previousTotalWeightKg = totalWeight(previousItems)
      const currentAverageWeightKg = averageWeight(currentItems)
      const previousAverageWeightKg = averageWeight(previousItems)
      const speciesLabel = current?.speciesLabel ?? previous?.speciesLabel ?? 'Neznámy druh'
      const pegId = current?.pegId ?? previous?.pegId ?? 'nezname-miesto'
      const pegLabel = current?.pegLabel ?? previous?.pegLabel ?? getPegLabel(pegId)

      return {
        currentAverageWeightKg,
        currentCatchCount: currentItems.length,
        currentTotalWeightKg,
        deltaAverageWeightKg: roundMetric(currentAverageWeightKg - previousAverageWeightKg),
        deltaCatchCount: currentItems.length - previousItems.length,
        deltaTotalWeightKg: roundMetric(currentTotalWeightKg - previousTotalWeightKg),
        key,
        label: `${speciesLabel} · ${pegLabel}`,
        pegId,
        pegLabel,
        previousAverageWeightKg,
        previousCatchCount: previousItems.length,
        previousTotalWeightKg,
        speciesKey: current?.speciesKey ?? previous?.speciesKey ?? normalizeFilterValue(speciesLabel),
        speciesLabel,
        totalWeightChangePercent: percentChange(currentTotalWeightKg, previousTotalWeightKg),
      }
    })
    .sort((a, b) => {
      const deltaDifference = Math.abs(b.deltaTotalWeightKg) - Math.abs(a.deltaTotalWeightKg)
      if (deltaDifference !== 0) return deltaDifference
      if (b.currentTotalWeightKg !== a.currentTotalWeightKg) return b.currentTotalWeightKg - a.currentTotalWeightKg
      if (b.previousTotalWeightKg !== a.previousTotalWeightKg) return b.previousTotalWeightKg - a.previousTotalWeightKg

      return a.label.localeCompare(b.label, 'sk-SK')
    })

  return {
    currentFrom: period.currentFrom,
    currentTo: period.currentTo,
    hasComparisonPeriod: previousCatches.length > 0,
    maxCatchCount: Math.max(1, ...rows.map((item) => item.currentCatchCount), ...rows.map((item) => item.previousCatchCount)),
    maxDeltaTotalWeightKg: Math.max(1, ...rows.map((item) => Math.abs(item.deltaTotalWeightKg))),
    maxTotalWeightKg: Math.max(1, ...rows.map((item) => item.currentTotalWeightKg), ...rows.map((item) => item.previousTotalWeightKg)),
    previousFrom: period.previousFrom,
    previousTo: period.previousTo,
    rows,
  }
}

export function createCatchTrendSignalRows(
  input: CatchTrendSignalInput,
  options: CatchTrendSignalOptions = {},
): CatchTrendSignalRow[] {
  const maxMonthlyRows = options.maxMonthlyRows ?? 12
  const maxSpeciesRows = options.maxSpeciesRows ?? 12
  const maxSpeciesPegRows = options.maxSpeciesPegRows ?? 16
  const season = input.seasonComparison
  const seasonRow: CatchTrendSignalRow = {
    context: `${season.current.from} až ${season.current.to} vs ${season.previous.from} až ${season.previous.to}`,
    currentCatchCount: season.current.catchCount,
    currentPeriod: `${season.current.from} až ${season.current.to}`,
    currentTotalWeightKg: season.current.totalWeightKg,
    deltaCatchCount: season.deltaCatchCount,
    deltaTotalWeightKg: season.deltaTotalWeightKg,
    label: 'Celé filtrované obdobie',
    previousCatchCount: season.previous.catchCount,
    previousPeriod: `${season.previous.from} až ${season.previous.to}`,
    previousTotalWeightKg: season.previous.totalWeightKg,
    section: 'Sezónne porovnanie',
    signal: signalForDelta(season.deltaTotalWeightKg, season.totalWeightChangePercent),
    totalWeightChangePercent: season.totalWeightChangePercent,
  }
  const monthlyRows = input.monthlyTrend.months
    .filter((month) => month.currentCatchCount > 0 || month.previousCatchCount > 0)
    .map((month) => ({
      context: `${month.key} vs ${month.previousKey}`,
      currentCatchCount: month.currentCatchCount,
      currentPeriod: month.key,
      currentTotalWeightKg: month.currentTotalWeightKg,
      deltaCatchCount: month.deltaCatchCount,
      deltaTotalWeightKg: month.deltaTotalWeightKg,
      label: month.label,
      previousCatchCount: month.previousCatchCount,
      previousPeriod: month.previousKey,
      previousTotalWeightKg: month.previousTotalWeightKg,
      section: 'Mesačný trend',
      signal: signalForDelta(month.deltaTotalWeightKg, month.totalWeightChangePercent),
      totalWeightChangePercent: month.totalWeightChangePercent,
    }))
    .sort(compareSignalRows)
    .slice(0, maxMonthlyRows)
  const speciesRows = input.speciesTrend.rows
    .filter((row) => row.currentCatchCount > 0 || row.previousCatchCount > 0)
    .map((row) => ({
      context: row.label,
      currentCatchCount: row.currentCatchCount,
      currentPeriod: `${input.speciesTrend.currentFrom} až ${input.speciesTrend.currentTo}`,
      currentTotalWeightKg: row.currentTotalWeightKg,
      deltaCatchCount: row.deltaCatchCount,
      deltaTotalWeightKg: row.deltaTotalWeightKg,
      label: row.label,
      previousCatchCount: row.previousCatchCount,
      previousPeriod: `${input.speciesTrend.previousFrom} až ${input.speciesTrend.previousTo}`,
      previousTotalWeightKg: row.previousTotalWeightKg,
      section: 'Trend podľa druhu',
      signal: signalForDelta(row.deltaTotalWeightKg, row.totalWeightChangePercent),
      totalWeightChangePercent: row.totalWeightChangePercent,
    }))
    .sort(compareSignalRows)
    .slice(0, maxSpeciesRows)
  const speciesPegRows = input.speciesPegTrend.rows
    .filter((row) => row.currentCatchCount > 0 || row.previousCatchCount > 0)
    .map((row) => ({
      context: row.pegLabel,
      currentCatchCount: row.currentCatchCount,
      currentPeriod: `${input.speciesPegTrend.currentFrom} až ${input.speciesPegTrend.currentTo}`,
      currentTotalWeightKg: row.currentTotalWeightKg,
      deltaCatchCount: row.deltaCatchCount,
      deltaTotalWeightKg: row.deltaTotalWeightKg,
      label: row.speciesLabel,
      previousCatchCount: row.previousCatchCount,
      previousPeriod: `${input.speciesPegTrend.previousFrom} až ${input.speciesPegTrend.previousTo}`,
      previousTotalWeightKg: row.previousTotalWeightKg,
      section: 'Druh a lovné miesto',
      signal: signalForDelta(row.deltaTotalWeightKg, row.totalWeightChangePercent),
      totalWeightChangePercent: row.totalWeightChangePercent,
    }))
    .sort(compareSignalRows)
    .slice(0, maxSpeciesPegRows)

  return [
    seasonRow,
    ...monthlyRows,
    ...speciesRows,
    ...speciesPegRows,
  ]
}

export function createCatchTrendSignalCsvExport(rows: CatchTrendSignalRow[]) {
  const signalLabels: Record<CatchTrendSignalRow['signal'], string> = {
    decline: 'pokles',
    growth: 'rast',
    'no-baseline': 'bez porovnávacej bázy',
    stable: 'bez zmeny',
  }
  const header = [
    'Sekcia',
    'Signál',
    'Kontext',
    'Aktuálne obdobie',
    'Minulé obdobie',
    'Aktuálne ks',
    'Minulé ks',
    'Rozdiel ks',
    'Aktuálna váha kg',
    'Minulá váha kg',
    'Rozdiel váha kg',
    'Zmena váhy %',
    'Typ signálu',
  ]
  const exportRows = rows.map((row) => [
    row.section,
    row.label,
    row.context,
    row.currentPeriod,
    row.previousPeriod,
    row.currentCatchCount,
    row.previousCatchCount,
    row.deltaCatchCount,
    csvNumber(row.currentTotalWeightKg),
    csvNumber(row.previousTotalWeightKg),
    csvNumber(row.deltaTotalWeightKg),
    row.totalWeightChangePercent === null ? '' : csvNumber(row.totalWeightChangePercent),
    signalLabels[row.signal],
  ])

  return [header, ...exportRows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\n')
}

export function createCatchCsvExport(catches: CatchRecord[], options: CatchCsvOptions = {}) {
  const getLakeName = options.getLakeName ?? ((lake: LakeSlug) => lake)
  const getPegLabel = options.getPegLabel ?? ((pegId: string) => pegId)
  const header = [
    'ID',
    'Stav',
    'Rybár',
    'Jazero',
    'Miesto',
    'Druh',
    'Váha kg',
    'Miera cm',
    'Nástraha',
    'Čas úlovku',
    'Pustená späť',
    'Počasie',
    'Vzduch °C',
    'Voda °C',
    'Tlak hPa',
    'Trend tlaku',
    'Vietor km/h',
    'Smer vetra',
    'Oblačnosť %',
    'Poznámka',
  ]
  const rows = catches.map((catchItem) => [
    catchItem.id,
    catchItem.status,
    catchItem.angler,
    getLakeName(catchItem.lake),
    getPegLabel(catchItem.pegId),
    catchItem.species,
    csvNumber(catchItem.weightKg),
    catchItem.lengthCm,
    catchItem.bait,
    catchItem.caughtAt,
    catchItem.released ? 'áno' : 'nie',
    catchItem.weather?.condition ?? '',
    catchItem.weather ? csvNumber(catchItem.weather.airTempC) : '',
    catchItem.weather ? csvNumber(catchItem.weather.waterTempC) : '',
    catchItem.weather?.pressureHpa ?? '',
    catchItem.weather?.pressureTrend ?? '',
    catchItem.weather ? csvNumber(catchItem.weather.windKph) : '',
    catchItem.weather?.windDirection ?? '',
    catchItem.weather?.cloudCoverPct ?? '',
    catchItem.notes,
  ])

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\n')
}

export function createCatchAnalytics(
  catches: CatchRecord[],
  options: CatchAnalyticsOptions = {},
): CatchAnalyticsResult {
  const statuses = options.statuses ?? ['approved']
  const getLakeName = options.getLakeName ?? ((lake: LakeSlug) => lake)
  const getPegLabel = options.getPegLabel ?? ((pegId: string) => pegId)
  const statusCounts = emptyStatusCounts()

  for (const catchItem of catches) {
    statusCounts[catchItem.status] += 1
  }

  const scopedCatches = catches.filter((catchItem) => statuses.includes(catchItem.status))
  const totalWeightKg = scopedCatches.reduce((sum, catchItem) => sum + catchItem.weightKg, 0)
  const largestCatch = scopedCatches
    .slice()
    .sort((a, b) => b.weightKg - a.weightKg)[0]
  const releasedCount = scopedCatches.filter((catchItem) => catchItem.released).length
  const topSpecies = groupCatches(scopedCatches, (catchItem) => catchItem.species, (key) => key)
  const topBaits = groupCatches(scopedCatches, (catchItem) => catchItem.bait, (key) => key)
  const topPegs = groupCatches(scopedCatches, (catchItem) => catchItem.pegId, (key) => getPegLabel(key))
  const weatherSummary = createWeatherSummary(scopedCatches)
  const lakeSummaries = groupCatches(
    scopedCatches,
    (catchItem) => catchItem.lake,
    (key) => getLakeName(key as LakeSlug),
  ).map((group) => ({
    ...group,
    lake: group.key as LakeSlug,
  }))
  const hourGroups = groupCatches(scopedCatches, getCaughtHour, (key) => hourLabel(key))
  const topGroupCount = Math.max(
    1,
    ...topSpecies.map((group) => group.count),
    ...topBaits.map((group) => group.count),
    ...topPegs.map((group) => group.count),
  )

  return {
    averageWeightKg: scopedCatches.length > 0 ? roundMetric(totalWeightKg / scopedCatches.length) : 0,
    busiestHour: hourGroups[0],
    catchCount: scopedCatches.length,
    largestCatch,
    lakeSummaries,
    releaseRatePercent: scopedCatches.length > 0 ? Math.round((releasedCount / scopedCatches.length) * 100) : 0,
    statusCounts,
    topBaits,
    topConditions: weatherSummary.topConditions,
    topGroupCount,
    topPegs,
    topSpecies,
    totalWeightKg: roundMetric(totalWeightKg),
    weatherSummary,
  }
}
