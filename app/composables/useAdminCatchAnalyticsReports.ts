import type {
  CatchRecord,
  CatchSavedReport,
  CatchSavedReportAudience,
  CatchSavedReportCadence,
  CatchSavedReportDelivery,
  LakeSlug,
} from '~/data/pond'
import type {
  CatchGeneratedReport,
  CatchReportEmailDraft,
  CatchReportEmailDraftSuccess,
  CatchReportGenerationSuccess,
  CatchReportMutationSuccess,
  CatchReportScheduleRunSuccess,
  CatchReportStateResponse,
} from '~/services/catchReportService'
import type { StatusBadgeTone } from '~/utils/ui'
import {
  catchReportAudienceLabels,
  catchReportCadenceLabels,
  catchReportDeliveryLabels,
  catchReportDeliveryProviderLabels,
} from '~/services/catchReportService'
import {
  createCatchAnalytics,
  createCatchCsvExport,
  createCatchMonthlyTrend,
  createCatchSeasonComparison,
  createCatchSeasonWindows,
  createCatchSpeciesPegTrend,
  createCatchSpeciesTrend,
  createCatchTrendSignalCsvExport,
  createCatchTrendSignalRows,
  filterCatchesForAnalytics,
} from '~/utils/catchAnalytics'

type CatchReportScheduleRunRow = CatchReportScheduleRunSuccess['rows'][number]
type CatchReportScheduleRunSummary = Pick<
  CatchReportScheduleRunSuccess,
  'deliveryProvider' | 'dueCount' | 'failedCount' | 'preparedCount' | 'processedCount' | 'sentCount' | 'skippedCount'
>
type NoticeTone = 'error' | 'info' | 'success' | 'warning'

interface UseAdminCatchAnalyticsReportsOptions {
  canManageCatches: ComputedRef<boolean>
  catchReadOnlyMessage: ComputedRef<string>
  getLakeName: (slug: LakeSlug) => string
  getPegLabel: (id: string) => string
  liveCatches: ComputedRef<CatchRecord[]>
}

export async function useAdminCatchAnalyticsReports(options: UseAdminCatchAnalyticsReportsOptions) {
  const { canManageCatches, catchReadOnlyMessage, getLakeName, getPegLabel, liveCatches } = options

  const requestFetch = useRequestFetch()
  const { liveClosures } = await useClosureState({ admin: true, key: 'admin-catch-closure-state' })

  const fallbackCatchReportState = (): CatchReportStateResponse => ({
    deliveryLogs: [],
    ok: true,
    savedReports: [],
    updatedAt: 'seed',
  })

  const { data: catchReportState, refresh: refreshCatchReports } = await useAsyncData<CatchReportStateResponse>(
    'admin-catch-report-state',
    () => requestFetch<CatchReportStateResponse>('/api/admin/catch-reports'),
    {
      default: fallbackCatchReportState,
    },
  )

  const analyticsFilter = reactive({
    dateFrom: '',
    dateTo: '',
    lake: 'all' as LakeSlug | 'all',
    seasonWindowId: 'custom',
    species: 'all',
  })
  const reportForm = reactive({
    audience: 'manager' as CatchSavedReportAudience,
    cadence: 'weekly' as CatchSavedReportCadence,
    delivery: 'email-ready' as CatchSavedReportDelivery,
    description: '',
    enabled: true,
    includeRawCsv: true,
    includeTrendSignals: true,
    recipients: 'spravca@rybolov-cetin.local',
    title: 'Týždenný report úlovkov',
  })
  const reportSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const reportSubmitMessage = ref('')
  const generatedCatchReport = ref<CatchGeneratedReport>()
  const generatingReportId = ref('')
  const generateReportStatus = ref<'idle' | 'success' | 'error'>('idle')
  const generateReportMessage = ref('')
  const reportEmailDraft = ref<CatchReportEmailDraft>()
  const preparingEmailReportId = ref('')
  const reportEmailDraftStatus = ref<'idle' | 'success' | 'error'>('idle')
  const reportEmailDraftMessage = ref('')
  const schedulerRunStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const schedulerRunMessage = ref('')
  const schedulerRunRows = ref<CatchReportScheduleRunSuccess['rows']>([])
  const schedulerRunSummary = ref<CatchReportScheduleRunSummary>()

  const reportSubmitNoticeTitle = computed(() =>
    reportSubmitStatus.value === 'success'
      ? 'Report je uložený'
      : 'Report sa nepodarilo uložiť',
  )
  const reportSubmitNoticeTone = computed<NoticeTone>(() =>
    reportSubmitStatus.value === 'success' ? 'success' : 'error',
  )
  const generateReportNoticeTitle = computed(() =>
    generateReportStatus.value === 'success'
      ? 'Report je vygenerovaný'
      : 'Report sa nepodarilo vygenerovať',
  )
  const generateReportNoticeTone = computed<NoticeTone>(() =>
    generateReportStatus.value === 'success' ? 'success' : 'error',
  )
  const reportEmailDraftNoticeTitle = computed(() =>
    reportEmailDraftStatus.value === 'success'
      ? 'E-mailový draft je pripravený'
      : 'E-mailový draft sa nepodarilo pripraviť',
  )
  const reportEmailDraftNoticeTone = computed<NoticeTone>(() =>
    reportEmailDraftStatus.value === 'success' ? 'success' : 'error',
  )
  const schedulerRunNoticeTitle = computed(() =>
    schedulerRunStatus.value === 'success'
      ? 'Plánovač reportov dobehol'
      : 'Plánovač reportov potrebuje kontrolu',
  )
  const schedulerRunNoticeTone = computed<NoticeTone>(() =>
    schedulerRunStatus.value === 'success' ? 'success' : 'error',
  )

  const catchReportDeliveryLogs = computed(() => catchReportState.value?.deliveryLogs ?? [])
  const savedCatchReports = computed(() => catchReportState.value?.savedReports ?? [])
  const scheduledCatchReports = computed(() => savedCatchReports.value.filter((report) => report.cadence !== 'manual'))
  const latestDeliveryLogByReportId = computed(() => {
    const logs = [...catchReportDeliveryLogs.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const logByReport = new Map<string, (typeof logs)[number]>()

    for (const log of logs) {
      if (!logByReport.has(log.reportId)) {
        logByReport.set(log.reportId, log)
      }
    }

    return logByReport
  })
  const approvedCatchCount = computed(() =>
    liveCatches.value.filter((catchItem) => catchItem.status === 'approved').length,
  )
  const analyticsSpeciesOptions = computed(() =>
    [...new Set(
      liveCatches.value
        .filter((catchItem) => catchItem.status === 'approved')
        .map((catchItem) => catchItem.species.trim())
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, 'sk-SK')),
  )
  const catchSeasonWindowOptions = computed(() =>
    createCatchSeasonWindows(
      liveCatches.value,
      liveClosures.value,
      {
        lake: analyticsFilter.lake,
        species: analyticsFilter.species === 'all' ? undefined : analyticsFilter.species,
        statuses: ['approved'],
      },
      {
        getLakeName,
      },
    ),
  )
  const selectedSeasonWindow = computed(() =>
    catchSeasonWindowOptions.value.find((window) => window.id === analyticsFilter.seasonWindowId),
  )
  const analyticsFilteredCatches = computed(() =>
    filterCatchesForAnalytics(liveCatches.value, {
      dateFrom: analyticsFilter.dateFrom || undefined,
      dateTo: analyticsFilter.dateTo || undefined,
      lake: analyticsFilter.lake,
      species: analyticsFilter.species === 'all' ? undefined : analyticsFilter.species,
      statuses: ['approved'],
    }),
  )
  const catchAnalytics = computed(() =>
    createCatchAnalytics(analyticsFilteredCatches.value, {
      getLakeName,
      getPegLabel,
    }),
  )
  const catchSeasonComparison = computed(() =>
    createCatchSeasonComparison(liveCatches.value, {
      dateFrom: analyticsFilter.dateFrom || undefined,
      dateTo: analyticsFilter.dateTo || undefined,
      lake: analyticsFilter.lake,
      species: analyticsFilter.species === 'all' ? undefined : analyticsFilter.species,
      statuses: ['approved'],
    }),
  )
  const catchMonthlyTrend = computed(() =>
    createCatchMonthlyTrend(liveCatches.value, {
      dateFrom: analyticsFilter.dateFrom || undefined,
      dateTo: analyticsFilter.dateTo || undefined,
      lake: analyticsFilter.lake,
      species: analyticsFilter.species === 'all' ? undefined : analyticsFilter.species,
      statuses: ['approved'],
    }),
  )
  const visibleMonthlyTrendMonths = computed(() =>
    catchMonthlyTrend.value.months.filter((month) =>
      month.currentCatchCount > 0 ||
      month.previousCatchCount > 0,
    ),
  )
  const catchSpeciesTrend = computed(() =>
    createCatchSpeciesTrend(liveCatches.value, {
      dateFrom: analyticsFilter.dateFrom || undefined,
      dateTo: analyticsFilter.dateTo || undefined,
      lake: analyticsFilter.lake,
      species: analyticsFilter.species === 'all' ? undefined : analyticsFilter.species,
      statuses: ['approved'],
    }),
  )
  const visibleSpeciesTrendRows = computed(() =>
    catchSpeciesTrend.value.rows
      .filter((row) => row.currentCatchCount > 0 || row.previousCatchCount > 0)
      .slice(0, 6),
  )
  const catchSpeciesPegTrend = computed(() =>
    createCatchSpeciesPegTrend(
      liveCatches.value,
      {
        dateFrom: analyticsFilter.dateFrom || undefined,
        dateTo: analyticsFilter.dateTo || undefined,
        lake: analyticsFilter.lake,
        species: analyticsFilter.species === 'all' ? undefined : analyticsFilter.species,
        statuses: ['approved'],
      },
      {
        getPegLabel,
      },
    ),
  )
  const visibleSpeciesPegTrendRows = computed(() =>
    catchSpeciesPegTrend.value.rows
      .filter((row) => row.currentCatchCount > 0 || row.previousCatchCount > 0)
      .slice(0, 4),
  )
  const catchTrendSignalRows = computed(() =>
    createCatchTrendSignalRows({
      monthlyTrend: catchMonthlyTrend.value,
      seasonComparison: catchSeasonComparison.value,
      speciesPegTrend: catchSpeciesPegTrend.value,
      speciesTrend: catchSpeciesTrend.value,
    }),
  )
  const analyticsFilterActive = computed(() =>
    Boolean(
      analyticsFilter.dateFrom ||
      analyticsFilter.dateTo ||
      analyticsFilter.lake !== 'all' ||
      analyticsFilter.seasonWindowId !== 'custom' ||
      analyticsFilter.species !== 'all',
    ),
  )
  const analyticsFilterLabel = computed(() => {
    const labels = []
    if (selectedSeasonWindow.value) labels.push(selectedSeasonWindow.value.label)
    if (analyticsFilter.dateFrom) labels.push(`od ${formatDateOnly(analyticsFilter.dateFrom)}`)
    if (analyticsFilter.dateTo) labels.push(`do ${formatDateOnly(analyticsFilter.dateTo)}`)
    if (analyticsFilter.lake !== 'all') labels.push(getLakeName(analyticsFilter.lake))
    if (analyticsFilter.species !== 'all') labels.push(analyticsFilter.species)

    return labels.length > 0 ? labels.join(' · ') : 'všetky schválené úlovky'
  })
  const analyticsGroups = computed(() => [
    {
      label: 'Druhy rýb',
      rows: catchAnalytics.value.topSpecies.slice(0, 4),
    },
    {
      label: 'Nástrahy',
      rows: catchAnalytics.value.topBaits.slice(0, 4),
    },
    {
      label: 'Lovné miesta',
      rows: catchAnalytics.value.topPegs.slice(0, 4),
    },
  ])

  function formatDateOnly(value: string) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('sk-SK', { dateStyle: 'short' })
  }

  function formatWeight(value: number) {
    return `${value.toLocaleString('sk-SK', { maximumFractionDigits: 1 })} kg`
  }

  function formatMetric(value: number) {
    return value.toLocaleString('sk-SK', { maximumFractionDigits: 1 })
  }

  function formatSignedMetric(value: number) {
    const sign = value > 0 ? '+' : ''

    return `${sign}${formatMetric(value)}`
  }

  function formatTemperature(value: number) {
    return `${formatMetric(value)} °C`
  }

  function formatSignedWeight(value: number) {
    return `${formatSignedMetric(value)} kg`
  }

  function formatSignedPercent(value: number | null) {
    if (value === null) return 'bez bázy'

    return `${formatSignedMetric(value)} %`
  }

  function getTrendWeightWidth(value: number) {
    if (value <= 0) return '0%'

    return `${Math.max(8, Math.round((value / catchMonthlyTrend.value.maxTotalWeightKg) * 100))}%`
  }

  function getSpeciesTrendWeightWidth(value: number) {
    if (value <= 0) return '0%'

    return `${Math.max(8, Math.round((value / catchSpeciesTrend.value.maxTotalWeightKg) * 100))}%`
  }

  function getSpeciesPegTrendWeightWidth(value: number) {
    if (value <= 0) return '0%'

    return `${Math.max(8, Math.round((value / catchSpeciesPegTrend.value.maxTotalWeightKg) * 100))}%`
  }

  function getTrendDeltaClass(value: number) {
    if (value > 0) return 'text-success-700'
    if (value < 0) return 'text-error-700'

    return 'text-foreground-muted'
  }

  function formatPeriodRange(period: { from: string, to: string }) {
    if (!period.from || !period.to) return 'bez dát'
    if (
      period.from.endsWith('-01-01') &&
      period.to.endsWith('-12-31') &&
      period.from.slice(0, 4) === period.to.slice(0, 4)
    ) {
      return `sezóna ${period.from.slice(0, 4)}`
    }
    if (period.from === period.to) return formatDateOnly(period.from)

    return `${formatDateOnly(period.from)} - ${formatDateOnly(period.to)}`
  }

  function formatSavedReportFilter(report: CatchSavedReport) {
    const labels = []
    if (report.filter.dateFrom) labels.push(`od ${formatDateOnly(report.filter.dateFrom)}`)
    if (report.filter.dateTo) labels.push(`do ${formatDateOnly(report.filter.dateTo)}`)
    if (report.filter.lake !== 'all') labels.push(getLakeName(report.filter.lake))
    if (report.filter.species) labels.push(report.filter.species)

    return labels.length > 0 ? labels.join(' · ') : 'všetky schválené úlovky'
  }

  function formatReportRecipients(report: CatchSavedReport) {
    if (report.recipients.length === 0) return 'bez príjemcov'
    if (report.recipients.length === 1) return report.recipients[0]

    return `${report.recipients.length} príjemcov`
  }

  function formatReportPayload(report: CatchSavedReport) {
    const parts = []
    if (report.includeRawCsv) parts.push('zoznam úlovkov')
    if (report.includeTrendSignals) parts.push('trendové signály')

    return parts.join(' + ')
  }

  function formatReportGeneratedAt(value?: string) {
    if (!value) return 'ešte negenerovaný'

    return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
  }

  function formatDeliveryLog(report: CatchSavedReport) {
    const log = latestDeliveryLogByReportId.value.get(report.id)
    if (!log) return 'e-mail ešte nepripravený'

    return `${log.status === 'prepared' ? 'pripravené' : log.status} · ${log.recipients.length} príjemcov · ${formatReportGeneratedAt(log.createdAt)}`
  }

  function formatSchedulerAction(row: CatchReportScheduleRunRow) {
    if (row.action === 'generated') return 'v appke'
    if (row.action === 'prepared') return 'draft'
    if (row.action === 'sent') return 'odoslané'
    if (row.action === 'failed') return 'chyba'

    return row.due ? 'preskočené' : 'čaká'
  }

  function getSchedulerActionTone(row: CatchReportScheduleRunRow): StatusBadgeTone {
    if (row.action === 'failed') return 'error'
    if (row.action === 'sent' || row.action === 'prepared' || row.action === 'generated') {
      return 'success'
    }
    if (row.due) return 'warning'

    return 'neutral'
  }

  function getSchedulerActionIcon(row: CatchReportScheduleRunRow) {
    if (row.action === 'failed') return 'i-heroicons-exclamation-triangle'
    if (row.action === 'sent') return 'i-heroicons-paper-airplane'
    if (row.action === 'prepared') return 'i-heroicons-envelope'
    if (row.action === 'generated') return 'i-heroicons-document-chart-bar'
    if (row.due) return 'i-heroicons-clock'

    return 'i-heroicons-minus-circle'
  }

  function savedReportStatusTone(enabled: boolean): StatusBadgeTone {
    return enabled ? 'success' : 'neutral'
  }

  function savedReportStatusIcon(enabled: boolean) {
    return enabled ? 'i-heroicons-check-circle' : 'i-heroicons-pause-circle'
  }

  function formatSchedulerRowMeta(row: CatchReportScheduleRunRow) {
    const parts = [
      catchReportCadenceLabels[row.cadence],
      catchReportDeliveryLabels[row.delivery],
    ]

    if (row.generatedAt) {
      parts.push(`výstup ${formatReportGeneratedAt(row.generatedAt)}`)
    }
    if (row.nextEligibleAt) {
      parts.push(`ďalšie ${formatReportGeneratedAt(row.nextEligibleAt)}`)
    }

    return parts.join(' · ')
  }

  function formatEmailDraftAttachments(draft: CatchReportEmailDraft) {
    if (draft.attachments.length === 0) return 'bez príloh'

    return draft.attachments.map((attachment) => attachment.fileName).join(', ')
  }

  function getGroupWidth(count: number) {
    return `${Math.max(8, Math.round((count / catchAnalytics.value.topGroupCount) * 100))}%`
  }

  function resetAnalyticsFilter() {
    Object.assign(analyticsFilter, {
      dateFrom: '',
      dateTo: '',
      lake: 'all',
      seasonWindowId: 'custom',
      species: 'all',
    })
  }

  function formatSeasonWindowOption(window: (typeof catchSeasonWindowOptions.value)[number]) {
    const lakeLabel = window.lake === 'all' ? 'všetky jazerá' : getLakeName(window.lake)

    return `${window.label} · ${lakeLabel}`
  }

  function applySeasonWindow() {
    const window = selectedSeasonWindow.value
    if (!window) return

    analyticsFilter.dateFrom = window.dateFrom
    analyticsFilter.dateTo = window.dateTo
    if (window.lake !== 'all') {
      analyticsFilter.lake = window.lake
    }
  }

  function markCustomSeasonWindow() {
    analyticsFilter.seasonWindowId = 'custom'
  }

  function exportAnalyticsCsv() {
    if (!import.meta.client || analyticsFilteredCatches.value.length === 0) return

    const csv = createCatchCsvExport(analyticsFilteredCatches.value, {
      getLakeName,
      getPegLabel,
    })
    const fileNameDate = new Date().toISOString().slice(0, 10)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rybolov-cetin-ulovky-${fileNameDate}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function exportTrendSignalsCsv() {
    if (!import.meta.client || catchTrendSignalRows.value.length === 0) return

    const csv = createCatchTrendSignalCsvExport(catchTrendSignalRows.value)
    const fileNameDate = new Date().toISOString().slice(0, 10)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rybolov-cetin-trendove-signaly-${fileNameDate}.csv`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function getApiErrorMessage(error: unknown, fallback = 'Rozhodnutie sa nepodarilo uložiť.') {
    const fetchError = error as {
      data?: {
        data?: {
          messages?: string[]
        }
        message?: string
        statusMessage?: string
      }
    }

    return fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      fallback
  }

  async function saveCurrentCatchReport() {
    if (!canManageCatches.value) {
      reportSubmitStatus.value = 'error'
      reportSubmitMessage.value = catchReadOnlyMessage.value
      return
    }

    if (!reportForm.includeRawCsv && !reportForm.includeTrendSignals) {
      reportSubmitStatus.value = 'error'
      reportSubmitMessage.value = 'Report musí obsahovať aspoň zoznam úlovkov alebo trendové signály.'
      return
    }

    reportSubmitStatus.value = 'submitting'
    reportSubmitMessage.value = ''

    try {
      const result = await $fetch<CatchReportMutationSuccess>('/api/admin/catch-reports', {
        body: {
          ...reportForm,
          filter: {
            dateFrom: analyticsFilter.dateFrom,
            dateTo: analyticsFilter.dateTo,
            lake: analyticsFilter.lake,
            seasonWindowId: analyticsFilter.seasonWindowId,
            species: analyticsFilter.species === 'all' ? '' : analyticsFilter.species,
          },
        },
        method: 'POST',
      })

      reportSubmitStatus.value = 'success'
      reportSubmitMessage.value = result.message
      await refreshCatchReports()
    }
    catch (error) {
      reportSubmitStatus.value = 'error'
      reportSubmitMessage.value = getApiErrorMessage(error, 'Report sa nepodarilo uložiť.')
    }
  }

  async function generateSavedCatchReport(report: CatchSavedReport) {
    if (!canManageCatches.value) {
      generateReportStatus.value = 'error'
      generateReportMessage.value = catchReadOnlyMessage.value
      return
    }

    generatingReportId.value = report.id
    generateReportStatus.value = 'idle'
    generateReportMessage.value = ''

    try {
      const result = await $fetch<CatchReportGenerationSuccess>(`/api/admin/catch-reports/${report.id}/generate`, {
        method: 'POST',
      })

      generatedCatchReport.value = result.generatedReport
      generateReportStatus.value = 'success'
      generateReportMessage.value = result.message
      await refreshCatchReports()
    }
    catch (error) {
      generateReportStatus.value = 'error'
      generateReportMessage.value = getApiErrorMessage(error, 'Report sa nepodarilo vygenerovať.')
    }
    finally {
      generatingReportId.value = ''
    }
  }

  async function prepareSavedCatchReportEmail(report: CatchSavedReport) {
    if (!canManageCatches.value) {
      reportEmailDraftStatus.value = 'error'
      reportEmailDraftMessage.value = catchReadOnlyMessage.value
      return
    }

    preparingEmailReportId.value = report.id
    reportEmailDraftStatus.value = 'idle'
    reportEmailDraftMessage.value = ''

    try {
      const result = await $fetch<CatchReportEmailDraftSuccess>(`/api/admin/catch-reports/${report.id}/email-draft`, {
        method: 'POST',
      })

      generatedCatchReport.value = result.generatedReport
      reportEmailDraft.value = result.emailDraft
      reportEmailDraftStatus.value = result.deliveryLog.status === 'failed' ? 'error' : 'success'
      reportEmailDraftMessage.value = result.message
      await refreshCatchReports()
    }
    catch (error) {
      reportEmailDraftStatus.value = 'error'
      reportEmailDraftMessage.value = getApiErrorMessage(error, 'E-mailový draft sa nepodarilo pripraviť.')
    }
    finally {
      preparingEmailReportId.value = ''
    }
  }

  async function runCatchReportScheduler() {
    if (!canManageCatches.value) {
      schedulerRunStatus.value = 'error'
      schedulerRunMessage.value = catchReadOnlyMessage.value
      schedulerRunRows.value = []
      schedulerRunSummary.value = undefined
      return
    }

    schedulerRunStatus.value = 'submitting'
    schedulerRunMessage.value = ''
    schedulerRunRows.value = []
    schedulerRunSummary.value = undefined

    try {
      const result = await $fetch<CatchReportScheduleRunSuccess>('/api/admin/catch-reports/run-due', {
        method: 'POST',
      })

      schedulerRunRows.value = result.rows
      schedulerRunSummary.value = {
        deliveryProvider: result.deliveryProvider,
        dueCount: result.dueCount,
        failedCount: result.failedCount,
        preparedCount: result.preparedCount,
        processedCount: result.processedCount,
        sentCount: result.sentCount,
        skippedCount: result.skippedCount,
      }
      schedulerRunStatus.value = result.rows.some((row) => row.action === 'failed') ? 'error' : 'success'
      schedulerRunMessage.value = result.message
      await refreshCatchReports()
    }
    catch (error) {
      schedulerRunStatus.value = 'error'
      schedulerRunMessage.value = getApiErrorMessage(error, 'Plánovač reportov sa nepodarilo spustiť.')
      schedulerRunSummary.value = undefined
    }
  }

  watch(
    catchSeasonWindowOptions,
    (windows) => {
      if (analyticsFilter.seasonWindowId === 'custom') return
      if (windows.some((window) => window.id === analyticsFilter.seasonWindowId)) return

      analyticsFilter.seasonWindowId = 'custom'
    },
  )

  return {
    analyticsFilter,
    analyticsFilterActive,
    analyticsFilterLabel,
    analyticsFilteredCatches,
    analyticsGroups,
    analyticsSpeciesOptions,
    applySeasonWindow,
    approvedCatchCount,
    catchAnalytics,
    catchMonthlyTrend,
    catchReportAudienceLabels,
    catchReportCadenceLabels,
    catchReportDeliveryLabels,
    catchReportDeliveryProviderLabels,
    catchSeasonComparison,
    catchSeasonWindowOptions,
    catchSpeciesPegTrend,
    catchSpeciesTrend,
    catchTrendSignalRows,
    exportAnalyticsCsv,
    exportTrendSignalsCsv,
    formatDateOnly,
    formatDeliveryLog,
    formatEmailDraftAttachments,
    formatMetric,
    formatPeriodRange,
    formatReportGeneratedAt,
    formatReportPayload,
    formatReportRecipients,
    formatSavedReportFilter,
    formatSchedulerAction,
    formatSchedulerRowMeta,
    formatSeasonWindowOption,
    formatSignedMetric,
    formatSignedPercent,
    formatSignedWeight,
    formatTemperature,
    formatWeight,
    generateReportMessage,
    generateReportNoticeTitle,
    generateReportNoticeTone,
    generateReportStatus,
    generateSavedCatchReport,
    generatedCatchReport,
    generatingReportId,
    getGroupWidth,
    getSchedulerActionIcon,
    getSchedulerActionTone,
    getSpeciesPegTrendWeightWidth,
    getSpeciesTrendWeightWidth,
    getTrendDeltaClass,
    getTrendWeightWidth,
    latestDeliveryLogByReportId,
    markCustomSeasonWindow,
    prepareSavedCatchReportEmail,
    preparingEmailReportId,
    reportEmailDraft,
    reportEmailDraftMessage,
    reportEmailDraftNoticeTitle,
    reportEmailDraftNoticeTone,
    reportEmailDraftStatus,
    reportForm,
    reportSubmitMessage,
    reportSubmitNoticeTitle,
    reportSubmitNoticeTone,
    reportSubmitStatus,
    resetAnalyticsFilter,
    runCatchReportScheduler,
    savedCatchReports,
    savedReportStatusIcon,
    savedReportStatusTone,
    scheduledCatchReports,
    schedulerRunMessage,
    schedulerRunNoticeTitle,
    schedulerRunNoticeTone,
    schedulerRunRows,
    schedulerRunStatus,
    schedulerRunSummary,
    saveCurrentCatchReport,
    selectedSeasonWindow,
    visibleMonthlyTrendMonths,
    visibleSpeciesPegTrendRows,
    visibleSpeciesTrendRows,
  }
}
