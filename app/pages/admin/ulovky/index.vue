<script setup lang="ts">
import type {
  CatchRecordStatus,
  CatchSavedReport,
  CatchSavedReportAudience,
  CatchSavedReportCadence,
  CatchSavedReportDelivery,
  LakeSlug,
} from '~/data/pond'
import type { CatchStateResponse } from '~/services/catchApiService'
import type { CatchCorrectionSuccess, CatchLogbookLinkMode } from '~/services/catchCorrectionService'
import type {
  CatchModerationDecisionMode,
  CatchModerationSuccess,
} from '~/services/catchModerationService'
import type {
  CatchReportMutationSuccess,
  CatchGeneratedReport,
  CatchReportEmailDraft,
  CatchReportEmailDraftSuccess,
  CatchReportGenerationSuccess,
  CatchReportScheduleRunSuccess,
  CatchReportStateResponse,
} from '~/services/catchReportService'
import {
  catchReportAudienceLabels,
  catchReportCadenceLabels,
  catchReportDeliveryLabels,
  catchReportDeliveryProviderLabels,
} from '~/services/catchReportService'
import {
  createDefaultFishRegistrySettings,
  formatFishManagerAvailability,
  getFishLargeCatchRule,
  getFishManagerAvailability,
  type FishCatchCandidateResponse,
} from '~/services/fishRegistryService'
import { catchCorrectionInputSchema, getValidationMessages } from '~/schemas/pondSchemas'
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

useHead({ title: 'Admin úlovky' })

type CatchReportScheduleRunRow = CatchReportScheduleRunSuccess['rows'][number]
type CatchReportScheduleRunSummary = Pick<
  CatchReportScheduleRunSuccess,
  'deliveryProvider' | 'dueCount' | 'failedCount' | 'preparedCount' | 'processedCount' | 'sentCount' | 'skippedCount'
>

const {
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  getLakeName,
  getPegLabel,
  lakes,
  pegs,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbookModeLabels,
  tripLogbooks: seedTripLogbooks,
  tripLogbookStatusLabels,
} = usePondData()
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-catch-closure-state' })

const fallbackCatchState = (): CatchStateResponse => ({
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  ok: true,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbooks: seedTripLogbooks,
  updatedAt: 'seed',
})
const fallbackCatchReportState = (): CatchReportStateResponse => ({
  deliveryLogs: [],
  ok: true,
  savedReports: [],
  updatedAt: 'seed',
})
const fallbackFishCandidateState = (): FishCatchCandidateResponse => ({
  candidates: [],
  ok: true,
  settings: createDefaultFishRegistrySettings(),
  thresholdKg: 18,
  updatedAt: 'seed',
})

const requestFetch = useRequestFetch()
const route = useRoute()
const { data: catchState, refresh: refreshCatchState } = await useAsyncData<CatchStateResponse>(
  'admin-catch-state',
  () => requestFetch<CatchStateResponse>('/api/admin/catches'),
  {
    default: fallbackCatchState,
  },
)
const { data: catchReportState, refresh: refreshCatchReports } = await useAsyncData<CatchReportStateResponse>(
  'admin-catch-report-state',
  () => requestFetch<CatchReportStateResponse>('/api/admin/catch-reports'),
  {
    default: fallbackCatchReportState,
  },
)
const { data: fishCandidateState } = await useAsyncData<FishCatchCandidateResponse>(
  'admin-catch-fish-candidates',
  () => requestFetch<FishCatchCandidateResponse>('/api/admin/fish-registry/candidates'),
  {
    default: fallbackFishCandidateState,
  },
)
const {
  canManage: canManageCatches,
  isReadOnly: catchesReadOnly,
  label: catchAccessLabel,
  readOnlyMessage: catchReadOnlyMessage,
} = useAdminModuleAccess('catches')

const statusFilter = ref<CatchRecordStatus | 'all'>('pending')
const statusFilterTouched = ref(false)
const selectedCatchId = ref('')
const openedQueryCatchId = ref('')
const scrolledQueryCatchId = ref('')
const catchDetailElement = ref<HTMLElement | null>(null)
const decisionMode = ref<CatchModerationDecisionMode>('approve')
const reviewNote = ref('')
const decisionSubmitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const decisionSubmitMessage = ref('')
const correctionForm = reactive({
  angler: '',
  bait: '',
  caughtAt: '',
  lake: 'velky-cetin' as LakeSlug,
  lengthCm: 0,
  logbookLinkMode: 'keep' as CatchLogbookLinkMode,
  notes: '',
  pegId: '',
  released: true,
  species: '',
  targetLogbookId: '',
  weightKg: 0,
})
const correctionSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const correctionSubmitMessage = ref('')
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
const generateReportMessage = ref('')
const reportEmailDraft = ref<CatchReportEmailDraft>()
const preparingEmailReportId = ref('')
const reportEmailDraftStatus = ref<'idle' | 'success' | 'error'>('idle')
const reportEmailDraftMessage = ref('')
const schedulerRunStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const schedulerRunMessage = ref('')
const schedulerRunRows = ref<CatchReportScheduleRunSuccess['rows']>([])
const schedulerRunSummary = ref<CatchReportScheduleRunSummary>()

const liveCatches = computed(() => catchState.value?.catches ?? seedCatches)
const liveCatchPhotos = computed(() => catchState.value?.catchPhotos ?? seedCatchPhotos)
const liveTripLogbookEntries = computed(() => catchState.value?.tripLogbookEntries ?? seedTripLogbookEntries)
const liveTripLogbooks = computed(() => catchState.value?.tripLogbooks ?? seedTripLogbooks)
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
const correctionPegs = computed(() => pegs.filter((peg) => peg.lake === correctionForm.lake))
const catchPhotoByCatchId = computed(() =>
  new Map(liveCatchPhotos.value.map((photo) => [photo.catchId, photo])),
)
const filteredCatches = computed(() =>
  liveCatches.value
    .filter((catchItem) => statusFilter.value === 'all' || catchItem.status === statusFilter.value)
    .sort((a, b) => b.caughtAt.localeCompare(a.caughtAt)),
)
const selectedCatch = computed(() =>
  liveCatches.value.find((catchItem) => catchItem.id === selectedCatchId.value),
)
const selectedCatchFishCandidate = computed(() =>
  fishCandidateState.value.candidates.find((candidate) => candidate.catchId === selectedCatch.value?.id),
)
const selectedCatchLargeFishRule = computed(() =>
  selectedCatch.value
    ? getFishLargeCatchRule(selectedCatch.value.lake, fishCandidateState.value.settings)
    : undefined,
)
const selectedCatchNeedsChipWorkflow = computed(() => {
  const catchItem = selectedCatch.value
  const rule = selectedCatchLargeFishRule.value
  return Boolean(
    catchItem
    && rule?.enabled
    && catchItem.status !== 'rejected'
    && catchItem.weightKg >= rule.thresholdKg,
  )
})
const selectedCatchManagerAvailability = computed(() => {
  const catchItem = selectedCatch.value
  const rule = selectedCatchLargeFishRule.value
  return catchItem && rule
    ? getFishManagerAvailability(rule, catchItem.caughtAt)
    : undefined
})
const selectedLogbookEntry = computed(() =>
  liveTripLogbookEntries.value.find((entry) => entry.catchId === selectedCatch.value?.id),
)
const selectedLogbook = computed(() =>
  selectedLogbookEntry.value
    ? liveTripLogbooks.value.find((logbook) => logbook.id === selectedLogbookEntry.value?.logbookId)
    : undefined,
)
const selectedCatchPhoto = computed(() =>
  selectedCatch.value ? catchPhotoByCatchId.value.get(selectedCatch.value.id) : undefined,
)
const compatibleCorrectionLogbooks = computed(() =>
  liveTripLogbooks.value
    .filter((logbook) =>
      logbook.status !== 'closed' &&
      logbook.lake === correctionForm.lake &&
      logbook.pegIds.includes(correctionForm.pegId),
    )
    .sort((a, b) => a.title.localeCompare(b.title, 'sk')),
)
const catchStats = computed(() => ({
  approved: liveCatches.value.filter((catchItem) => catchItem.status === 'approved').length,
  pending: liveCatches.value.filter((catchItem) => catchItem.status === 'pending').length,
  rejected: liveCatches.value.filter((catchItem) => catchItem.status === 'rejected').length,
  total: liveCatches.value.length,
}))
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
const correctionValidation = computed(() =>
  catchCorrectionInputSchema.safeParse({
    ...correctionForm,
    catchId: selectedCatch.value?.id ?? '',
  }),
)
const correctionLogbookMessages = computed(() => {
  if (!selectedCatch.value) return []

  if (
    correctionForm.logbookLinkMode === 'keep' &&
    selectedLogbook.value &&
    (
      selectedLogbook.value.lake !== correctionForm.lake ||
      !selectedLogbook.value.pegIds.includes(correctionForm.pegId)
    )
  ) {
    return ['Opravené miesto už nepatrí do pôvodného zápisníka. Vyberte presun alebo odpojenie.']
  }

  if (correctionForm.logbookLinkMode === 'move' && compatibleCorrectionLogbooks.value.length === 0) {
    return ['Pre vybrané jazero a miesto nie je dostupný otvorený zápisník.']
  }

  return []
})
const correctionValidationMessages = computed(() => [
  ...getValidationMessages(correctionValidation.value),
  ...correctionLogbookMessages.value,
])
const correctionReady = computed(() =>
  correctionValidation.value.success && correctionLogbookMessages.value.length === 0,
)

const logbookLinkOptions = computed(() => [
  {
    description: selectedLogbook.value
      ? `Zachová väzbu na ${selectedLogbook.value.shareCode}.`
      : 'Úlovok ostane bez zápisníka.',
    icon: 'i-heroicons-link',
    label: 'Ponechať',
    value: 'keep' as CatchLogbookLinkMode,
  },
  {
    description: 'Vyberie iný otvorený zápisník pre nové miesto.',
    icon: 'i-heroicons-arrow-right-circle',
    label: 'Presunúť',
    value: 'move' as CatchLogbookLinkMode,
  },
  {
    description: 'Úlovok ostane len ako samostatný záznam.',
    icon: 'i-heroicons-x-mark',
    label: 'Odpojiť',
    value: 'detach' as CatchLogbookLinkMode,
  },
])

const statusFilters = [
  { label: 'Na schválenie', value: 'pending' },
  { label: 'Schválené', value: 'approved' },
  { label: 'Zamietnuté', value: 'rejected' },
  { label: 'Všetky', value: 'all' },
] as const
const statusFilterModel = computed({
  get: () => statusFilter.value,
  set: (value: CatchRecordStatus | 'all') => {
    statusFilterTouched.value = true
    statusFilter.value = value
  },
})

const statusMeta: Record<CatchRecordStatus, { class: string, label: string }> = {
  approved: {
    class: 'bg-success-500/10 text-success-700',
    label: 'schválené',
  },
  pending: {
    class: 'bg-warning-500/10 text-warning-800',
    label: 'čaká',
  },
  rejected: {
    class: 'bg-error-500/10 text-error-700',
    label: 'zamietnuté',
  },
}

watch(
  filteredCatches,
  (rows) => {
    if (!rows.some((catchItem) => catchItem.id === selectedCatchId.value)) {
      selectedCatchId.value = rows[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(
  liveCatches,
  () => {
    if (statusFilterTouched.value || filteredCatches.value.length > 0) return

    const firstAvailableFilter = statusFilters.find((filter) =>
      filter.value === 'all'
        ? liveCatches.value.length > 0
        : liveCatches.value.some((catchItem) => catchItem.status === filter.value),
    )

    if (firstAvailableFilter) {
      statusFilter.value = firstAvailableFilter.value
      selectedCatchId.value = [...liveCatches.value]
        .filter((catchItem) => firstAvailableFilter.value === 'all' || catchItem.status === firstAvailableFilter.value)
        .sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(
  [() => route.query.catchId, liveCatches],
  ([queryCatchId, catches]) => {
    const catchId = typeof queryCatchId === 'string' ? queryCatchId : ''
    if (!catchId || openedQueryCatchId.value === catchId) return

    const catchItem = catches.find((item) => item.id === catchId)
    if (!catchItem) return

    openedQueryCatchId.value = catchId
    scrolledQueryCatchId.value = ''
    statusFilter.value = catchItem.status
    selectedCatchId.value = catchItem.id
  },
  { immediate: true },
)

watch(
  [selectedCatchId, () => route.query.catchId, catchDetailElement],
  async ([selectedId, queryCatchId, detailElement]) => {
    const catchId = typeof queryCatchId === 'string' ? queryCatchId : ''
    if (
      !import.meta.client
      || !catchId
      || selectedId !== catchId
      || scrolledQueryCatchId.value === catchId
      || !detailElement
    ) return

    scrolledQueryCatchId.value = catchId
    await nextTick()
    detailElement.scrollIntoView({ behavior: 'auto', block: 'start' })
  },
  { flush: 'post', immediate: true },
)

watch(
  selectedCatch,
  (catchItem) => {
    if (!catchItem) {
      reviewNote.value = ''
      decisionMode.value = 'approve'
      return
    }

    const currentLogbookEntry = liveTripLogbookEntries.value.find((entry) => entry.catchId === catchItem.id)

    reviewNote.value = catchItem.reviewNote ?? ''
    Object.assign(correctionForm, {
      angler: catchItem.angler,
      bait: catchItem.bait,
      caughtAt: toDateTimeLocal(catchItem.caughtAt),
      lake: catchItem.lake,
      lengthCm: catchItem.lengthCm,
      logbookLinkMode: currentLogbookEntry ? 'keep' : 'detach',
      notes: catchItem.notes,
      pegId: catchItem.pegId,
      released: catchItem.released,
      species: catchItem.species,
      targetLogbookId: currentLogbookEntry?.logbookId ?? '',
      weightKg: catchItem.weightKg,
    })
    decisionMode.value = catchItem.status === 'rejected'
      ? 'reject'
      : catchItem.status === 'pending'
        ? 'approve'
        : 'pending'
    decisionSubmitStatus.value = 'idle'
    decisionSubmitMessage.value = ''
    correctionSubmitStatus.value = 'idle'
    correctionSubmitMessage.value = ''
  },
  { immediate: true },
)

watch(
  () => correctionForm.lake,
  () => {
    if (correctionPegs.value.some((peg) => peg.id === correctionForm.pegId)) return

    correctionForm.pegId = correctionPegs.value[0]?.id ?? ''
  },
)

watch(
  [
    () => correctionForm.lake,
    () => correctionForm.pegId,
    () => correctionForm.logbookLinkMode,
  ],
  ensureCorrectionTargetLogbook,
)

watch(
  catchSeasonWindowOptions,
  (windows) => {
    if (analyticsFilter.seasonWindowId === 'custom') return
    if (windows.some((window) => window.id === analyticsFilter.seasonWindowId)) return

    analyticsFilter.seasonWindowId = 'custom'
  },
)

function formatCatchTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}

function formatDateOnly(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('sk-SK', { dateStyle: 'short' })
}

function formatLogbookSummary(logbookId: string) {
  const logbook = liveTripLogbooks.value.find((item) => item.id === logbookId)
  if (!logbook) return 'Neznámy zápisník'

  return `${logbook.title} · ${logbook.shareCode} · ${tripLogbookStatusLabels[logbook.status]}`
}

function ensureCorrectionTargetLogbook() {
  if (correctionForm.logbookLinkMode === 'detach') {
    correctionForm.targetLogbookId = ''
    return
  }

  if (correctionForm.logbookLinkMode === 'keep') {
    correctionForm.targetLogbookId = selectedLogbookEntry.value?.logbookId ?? ''
    return
  }

  if (compatibleCorrectionLogbooks.value.some((logbook) => logbook.id === correctionForm.targetLogbookId)) return

  correctionForm.targetLogbookId = compatibleCorrectionLogbooks.value[0]?.id ?? ''
}


function toDateTimeLocal(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value.slice(0, 16)
  const pad = (part: number) => String(part).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
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

function formatPressureTrend(value: string) {
  if (value === 'falling') return 'klesá'
  if (value === 'rising') return 'rastie'

  return 'stabilný'
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

function getSchedulerActionClass(row: CatchReportScheduleRunRow) {
  if (row.action === 'failed') return 'border-error-500/25 bg-error-500/10 text-error-700'
  if (row.action === 'sent' || row.action === 'prepared' || row.action === 'generated') {
    return 'border-success-500/25 bg-success-500/10 text-success-700'
  }
  if (row.due) return 'border-warning-500/25 bg-warning-500/10 text-warning-800'

  return 'border-border bg-muted text-foreground-muted'
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

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

  return `${(bytes / 1024 / 1024).toLocaleString('sk-SK', { maximumFractionDigits: 1 })} MB`
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
    generateReportMessage.value = catchReadOnlyMessage.value
    return
  }

  generatingReportId.value = report.id
  generateReportMessage.value = ''

  try {
    const result = await $fetch<CatchReportGenerationSuccess>(`/api/admin/catch-reports/${report.id}/generate`, {
      method: 'POST',
    })

    generatedCatchReport.value = result.generatedReport
    generateReportMessage.value = result.message
    await refreshCatchReports()
  }
  catch (error) {
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

async function saveDecision() {
  const catchItem = selectedCatch.value
  if (!catchItem) return
  if (!canManageCatches.value) {
    decisionSubmitStatus.value = 'error'
    decisionSubmitMessage.value = catchReadOnlyMessage.value
    return
  }

  decisionSubmitStatus.value = 'submitting'
  decisionSubmitMessage.value = ''

  try {
    const result = await $fetch<CatchModerationSuccess>(`/api/admin/catches/${catchItem.id}/decision`, {
      body: {
        decisionMode: decisionMode.value,
        note: reviewNote.value,
      },
      method: 'POST',
    })

    decisionSubmitStatus.value = 'idle'
    decisionSubmitMessage.value = result.message
    statusFilter.value = result.catch.status
    selectedCatchId.value = result.catch.id
    await refreshCatchState()
  }
  catch (error) {
    decisionSubmitStatus.value = 'error'
    decisionSubmitMessage.value = getApiErrorMessage(error)
  }
}

async function saveCorrection() {
  const catchItem = selectedCatch.value
  if (!catchItem) return
  if (!canManageCatches.value) {
    correctionSubmitStatus.value = 'error'
    correctionSubmitMessage.value = catchReadOnlyMessage.value
    return
  }

  const validation = correctionValidation.value
  if (!validation.success || !correctionReady.value) {
    correctionSubmitStatus.value = 'error'
    correctionSubmitMessage.value = correctionValidationMessages.value[0] ?? 'Skontrolujte údaje úlovku.'
    return
  }

  correctionSubmitStatus.value = 'submitting'
  correctionSubmitMessage.value = ''

  try {
    const result = await $fetch<CatchCorrectionSuccess>(`/api/admin/catches/${catchItem.id}/correction`, {
      body: validation.data,
      method: 'POST',
    })

    correctionSubmitStatus.value = 'success'
    correctionSubmitMessage.value = result.message
    selectedCatchId.value = result.catch.id
    await refreshCatchState()
  }
  catch (error) {
    correctionSubmitStatus.value = 'error'
    correctionSubmitMessage.value = getApiErrorMessage(error)
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Schvaľovanie úlovkov"
      description="Pracovisko správcu pre kontrolu verejných úlovkov pred zverejnením, spätnú väzbu a audit rozhodnutí."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="catchesReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ catchAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ catchReadOnlyMessage }}</p>
        <p class="mt-1 text-sm">
          Exporty ostávajú dostupné, schvaľovanie, korekcie a ukladanie reportov sú vypnuté.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Na schválenie</p>
          <p class="mt-2 text-3xl font-bold">{{ catchStats.pending }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Schválené</p>
          <p class="mt-2 text-3xl font-bold">{{ catchStats.approved }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Zamietnuté</p>
          <p class="mt-2 text-3xl font-bold">{{ catchStats.rejected }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Spolu</p>
          <p class="mt-2 text-3xl font-bold">{{ catchStats.total }}</p>
        </div>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Filtre reportu</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              {{ catchAnalytics.catchCount }} z {{ approvedCatchCount }} schválených ·
              {{ catchTrendSignalRows.length }} signálov · {{ analyticsFilterLabel }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              icon="i-heroicons-arrow-down-tray"
              variant="soft"
              :disabled="analyticsFilteredCatches.length === 0"
              @click="exportAnalyticsCsv"
            >
              Stiahnuť report
            </UButton>
            <UButton
              icon="i-heroicons-chart-bar-square"
              variant="soft"
              :disabled="catchTrendSignalRows.length === 0"
              @click="exportTrendSignalsCsv"
            >
              Stiahnuť signály
            </UButton>
            <UButton
              v-if="analyticsFilterActive"
              icon="i-heroicons-x-mark"
              variant="ghost"
              @click="resetAnalyticsFilter"
            >
              Vyčistiť
            </UButton>
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label class="block">
            <span class="text-sm font-semibold">Sezónne okno</span>
            <select
              v-model="analyticsFilter.seasonWindowId"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              @change="applySeasonWindow"
            >
              <option value="custom">Vlastný rozsah</option>
              <option
                v-for="window in catchSeasonWindowOptions"
                :key="window.id"
                :value="window.id"
              >
                {{ formatSeasonWindowOption(window) }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Od</span>
            <input
              v-model="analyticsFilter.dateFrom"
              type="date"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              @change="markCustomSeasonWindow"
            >
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Do</span>
            <input
              v-model="analyticsFilter.dateTo"
              type="date"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              @change="markCustomSeasonWindow"
            >
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Jazero</span>
            <select
              v-model="analyticsFilter.lake"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
            >
              <option value="all">Všetky jazerá</option>
              <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Druh</span>
            <select
              v-model="analyticsFilter.species"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
            >
              <option value="all">Všetky druhy</option>
              <option v-for="species in analyticsSpeciesOptions" :key="species" :value="species">{{ species }}</option>
            </select>
          </label>
        </div>
        <p v-if="selectedSeasonWindow" class="text-foreground-muted mt-3 text-sm">
          {{ selectedSeasonWindow.description }}
        </p>

        <div class="mt-5 grid gap-5 border-t border-border pt-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 class="font-bold">Uložiť report</h3>
                <p class="text-foreground-muted mt-1 text-sm">
                  Aktuálny filter sa uloží ako interný report pre správcu, majiteľa alebo účtovníka.
                </p>
              </div>
              <span class="w-fit rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">
                bez odosielania
              </span>
            </div>

            <fieldset :disabled="!canManageCatches" class="contents">
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Názov</span>
                  <input
                    v-model="reportForm.title"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Príjemcovia</span>
                  <input
                    v-model="reportForm.recipients"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    placeholder="emaily oddelené čiarkou"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Pre koho</span>
                  <select
                    v-model="reportForm.audience"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="manager">{{ catchReportAudienceLabels.manager }}</option>
                    <option value="owner">{{ catchReportAudienceLabels.owner }}</option>
                    <option value="accountant">{{ catchReportAudienceLabels.accountant }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Periodicita</span>
                  <select
                    v-model="reportForm.cadence"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="manual">{{ catchReportCadenceLabels.manual }}</option>
                    <option value="weekly">{{ catchReportCadenceLabels.weekly }}</option>
                    <option value="monthly">{{ catchReportCadenceLabels.monthly }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Doručenie</span>
                  <select
                    v-model="reportForm.delivery"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option value="in-app">{{ catchReportDeliveryLabels['in-app'] }}</option>
                    <option value="email-ready">{{ catchReportDeliveryLabels['email-ready'] }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Popis</span>
                  <input
                    v-model="reportForm.description"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    placeholder="voliteľná poznámka"
                  >
                </label>
              </div>

              <div class="mt-3 flex flex-wrap gap-4 text-sm">
                <label class="flex items-center gap-2">
                  <input v-model="reportForm.includeRawCsv" type="checkbox" class="h-4 w-4 accent-primary-700">
                  Zoznam úlovkov
                </label>
                <label class="flex items-center gap-2">
                  <input v-model="reportForm.includeTrendSignals" type="checkbox" class="h-4 w-4 accent-primary-700">
                  Trendové signály
                </label>
                <label class="flex items-center gap-2">
                  <input v-model="reportForm.enabled" type="checkbox" class="h-4 w-4 accent-primary-700">
                  Aktívny report
                </label>
              </div>
            </fieldset>

            <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-bookmark-square"
                :disabled="!canManageCatches"
                :loading="reportSubmitStatus === 'submitting'"
                @click="saveCurrentCatchReport"
              >
                Uložiť aktuálny report
              </UButton>
              <p
                v-if="reportSubmitMessage"
                class="text-sm"
                :class="reportSubmitStatus === 'error' ? 'text-error-700' : 'text-success-700'"
              >
                {{ reportSubmitMessage }}
              </p>
            </div>
          </div>

          <div>
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold">Uložené reporty</h3>
                <p class="text-foreground-muted mt-1 text-sm">
                  Uložené nastavenia pravidelných e-mailových reportov.
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-2">
                <span class="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  {{ savedCatchReports.length }}
                </span>
                <UButton
                  icon="i-heroicons-clock"
                  size="xs"
                  variant="soft"
                  :disabled="!canManageCatches || scheduledCatchReports.length === 0"
                  :loading="schedulerRunStatus === 'submitting'"
                  @click="runCatchReportScheduler"
                >
                  Spustiť plánovač
                </UButton>
              </div>
            </div>

            <div
              v-if="schedulerRunMessage"
              class="mt-4 rounded-md border p-3"
              :class="schedulerRunStatus === 'error' ? 'border-error-500/25 bg-error-500/10' : 'border-success-500/25 bg-success-500/10'"
            >
              <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-xs font-bold uppercase" :class="schedulerRunStatus === 'error' ? 'text-error-700' : 'text-success-700'">
                    Plánovač reportov
                  </p>
                  <p class="mt-1 text-sm font-semibold" :class="schedulerRunStatus === 'error' ? 'text-error-700' : 'text-success-700'">
                    {{ schedulerRunMessage }}
                  </p>
                </div>
                <span class="text-foreground-muted text-xs">
                  {{ scheduledCatchReports.length }} plánovaných
                </span>
              </div>
              <div v-if="schedulerRunSummary" class="mt-3 flex flex-wrap gap-2">
                <span class="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                  Provider: {{ catchReportDeliveryProviderLabels[schedulerRunSummary.deliveryProvider] }}
                </span>
                <span class="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                  Splatné: {{ schedulerRunSummary.dueCount }}
                </span>
                <span class="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                  Odoslané: {{ schedulerRunSummary.sentCount }}
                </span>
                <span class="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                  Pripravené: {{ schedulerRunSummary.preparedCount }}
                </span>
                <span class="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                  Preskočené: {{ schedulerRunSummary.skippedCount }}
                </span>
                <span class="rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
                  Chyby: {{ schedulerRunSummary.failedCount }}
                </span>
              </div>
              <div v-if="schedulerRunRows.length > 0" class="mt-3 grid gap-2">
                <div
                  v-for="row in schedulerRunRows"
                  :key="row.reportId"
                  class="rounded-md border bg-white p-2"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="text-sm font-semibold">{{ row.title }}</p>
                      <p class="text-foreground-muted mt-0.5 text-xs">{{ row.message }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">{{ formatSchedulerRowMeta(row) }}</p>
                    </div>
                    <span
                      class="shrink-0 rounded-md border px-2 py-1 text-xs font-bold"
                      :class="getSchedulerActionClass(row)"
                    >
                      {{ formatSchedulerAction(row) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="savedCatchReports.length > 0" class="mt-4 space-y-3">
              <article
                v-for="report in savedCatchReports"
                :key="report.id"
                class="rounded-md border border-border bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h4 class="font-semibold">{{ report.title }}</h4>
                    <p class="text-foreground-muted mt-1 text-xs">{{ formatSavedReportFilter(report) }}</p>
                  </div>
                  <span
                    class="w-fit rounded-md px-2 py-1 text-xs font-bold"
                    :class="report.enabled ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
                  >
                    {{ report.enabled ? 'aktívny' : 'pozastavený' }}
                  </span>
                </div>
                <div class="text-foreground-muted mt-3 grid gap-1 text-xs sm:grid-cols-2">
                  <span>{{ catchReportCadenceLabels[report.cadence] }} · {{ catchReportAudienceLabels[report.audience] }}</span>
                  <span>{{ catchReportDeliveryLabels[report.delivery] }}</span>
                  <span>{{ formatReportPayload(report) }}</span>
                  <span>{{ formatReportRecipients(report) }}</span>
                  <span class="sm:col-span-2">E-mail: {{ formatDeliveryLog(report) }}</span>
                </div>
                <div class="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="text-foreground-muted text-xs">
                    Posledný výstup: {{ formatReportGeneratedAt(report.lastGeneratedAt) }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      icon="i-heroicons-play"
                      size="xs"
                      variant="soft"
                      :disabled="!canManageCatches"
                      :loading="generatingReportId === report.id"
                      @click="generateSavedCatchReport(report)"
                    >
                      Vygenerovať
                    </UButton>
                    <UButton
                      icon="i-heroicons-envelope"
                      size="xs"
                      variant="soft"
                      :disabled="!canManageCatches || report.delivery !== 'email-ready'"
                      :loading="preparingEmailReportId === report.id"
                      @click="prepareSavedCatchReportEmail(report)"
                    >
                      Pripraviť e-mail
                    </UButton>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="text-foreground-muted mt-4 rounded-md border border-dashed border-border p-4 text-sm">
              Zatiaľ nie je uložený žiadny report. Nastav filter a ulož prvú šablónu pre správcu.
            </p>
            <div
              v-if="generatedCatchReport"
              class="mt-4 rounded-md border border-primary-200 bg-primary-50 p-3"
            >
              <p class="text-xs font-bold uppercase text-primary-700">Posledný vygenerovaný výstup</p>
              <h4 class="mt-1 font-semibold">
                {{ generatedCatchReport.summary.catchCount }} úlovkov ·
                {{ formatWeight(generatedCatchReport.summary.totalWeightKg) }}
              </h4>
              <div class="text-foreground-muted mt-2 grid gap-1 text-xs sm:grid-cols-2">
                <span>Obdobie: {{ generatedCatchReport.summary.periodLabel }}</span>
                <span>Signály: {{ generatedCatchReport.summary.trendSignalCount }}</span>
                <span>Top druh: {{ generatedCatchReport.summary.topSpeciesLabel }}</span>
                <span>Top miesto: {{ generatedCatchReport.summary.topPegLabel }}</span>
              </div>
              <p v-if="generateReportMessage" class="mt-2 text-sm text-success-700">
                {{ generateReportMessage }}
              </p>
            </div>
            <div
              v-if="reportEmailDraft"
              class="mt-4 rounded-md border border-accent-200 bg-accent-50 p-3"
            >
              <p class="text-xs font-bold uppercase text-accent-700">E-mailový draft</p>
              <h4 class="mt-1 font-semibold">{{ reportEmailDraft.subject }}</h4>
              <div class="text-foreground-muted mt-2 grid gap-1 text-xs">
                <span>Príjemcovia: {{ reportEmailDraft.recipients.join(', ') || 'bez príjemcov' }}</span>
                <span>Prílohy: {{ formatEmailDraftAttachments(reportEmailDraft) }}</span>
                <span>{{ reportEmailDraft.previewText }}</span>
              </div>
              <p
                v-if="reportEmailDraftMessage"
                class="mt-2 text-sm"
                :class="reportEmailDraftStatus === 'error' ? 'text-error-700' : 'text-success-700'"
              >
                {{ reportEmailDraftMessage }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div class="rounded-card bg-primary-950 p-5 text-white">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-accent-300">Report schválených úlovkov</p>
              <h2 class="mt-1 text-2xl font-bold">{{ catchAnalytics.catchCount }} záznamov</h2>
            </div>
            <span class="w-fit rounded-md bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
              bez zamietnutých
            </span>
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <div class="rounded-md bg-white/10 p-3">
              <p class="text-xs text-white/65">Spolu váha</p>
              <p class="mt-1 text-xl font-bold">{{ formatWeight(catchAnalytics.totalWeightKg) }}</p>
            </div>
            <div class="rounded-md bg-white/10 p-3">
              <p class="text-xs text-white/65">Priemer</p>
              <p class="mt-1 text-xl font-bold">{{ formatWeight(catchAnalytics.averageWeightKg) }}</p>
            </div>
            <div class="rounded-md bg-white/10 p-3">
              <p class="text-xs text-white/65">Pustené späť</p>
              <p class="mt-1 text-xl font-bold">{{ catchAnalytics.releaseRatePercent }} %</p>
            </div>
          </div>
          <div class="mt-4 rounded-md border border-white/15 p-4">
            <p class="text-xs font-semibold text-white/60">Najväčší úlovok</p>
            <p v-if="catchAnalytics.largestCatch" class="mt-1 font-bold">
              {{ catchAnalytics.largestCatch.species }} {{ formatWeight(catchAnalytics.largestCatch.weightKg) }}
            </p>
            <p v-if="catchAnalytics.largestCatch" class="text-sm text-white/65">
              {{ catchAnalytics.largestCatch.angler }} · {{ getPegLabel(catchAnalytics.largestCatch.pegId) }}
            </p>
            <p v-else class="mt-1 text-sm text-white/65">Zatiaľ bez schválených úlovkov.</p>
          </div>
          <div class="mt-4 rounded-md border border-white/15 p-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-xs font-semibold text-white/60">Sezónne porovnanie</p>
                <p class="mt-1 text-sm text-white/70">
                  {{ formatPeriodRange(catchSeasonComparison.current) }} vs
                  {{ formatPeriodRange(catchSeasonComparison.previous) }}
                </p>
              </div>
              <span
                class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                :class="catchSeasonComparison.hasComparisonPeriod ? 'bg-success-500/15 text-success-100' : 'bg-white/10 text-white/65'"
              >
                {{ catchSeasonComparison.hasComparisonPeriod ? 'porovnateľné' : 'minulý rok bez dát' }}
              </span>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-3">
              <div class="rounded-md bg-white/10 p-3">
                <p class="text-xs text-white/60">Aktuálne obdobie</p>
                <p class="mt-1 text-lg font-bold">{{ catchSeasonComparison.current.catchCount }} ks</p>
                <p class="text-xs text-white/65">{{ formatWeight(catchSeasonComparison.current.totalWeightKg) }}</p>
              </div>
              <div class="rounded-md bg-white/10 p-3">
                <p class="text-xs text-white/60">Minulý rok</p>
                <p class="mt-1 text-lg font-bold">{{ catchSeasonComparison.previous.catchCount }} ks</p>
                <p class="text-xs text-white/65">{{ formatWeight(catchSeasonComparison.previous.totalWeightKg) }}</p>
              </div>
              <div class="rounded-md bg-white/10 p-3">
                <p class="text-xs text-white/60">Rozdiel</p>
                <p class="mt-1 text-lg font-bold">{{ formatSignedMetric(catchSeasonComparison.deltaCatchCount) }} ks</p>
                <p class="text-xs text-white/65">
                  {{ formatSignedWeight(catchSeasonComparison.deltaTotalWeightKg) }} ·
                  {{ formatSignedPercent(catchSeasonComparison.totalWeightChangePercent) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Najsilnejšie signály</h2>
              <p class="text-foreground-muted text-sm">Rýchly prehľad miest, času a nástrah.</p>
            </div>
            <span class="w-fit rounded-md bg-muted px-3 py-1 text-xs font-bold text-foreground-muted">
              interné
            </span>
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-md border border-border bg-white p-3">
              <p class="text-foreground-muted text-xs">Miesto</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.topPegs[0]?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.topPegs[0]?.count ?? 0 }} úlovkov</p>
            </div>
            <div class="rounded-md border border-border bg-white p-3">
              <p class="text-foreground-muted text-xs">Čas</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.busiestHour?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.busiestHour?.count ?? 0 }} úlovkov</p>
            </div>
            <div class="rounded-md border border-border bg-white p-3">
              <p class="text-foreground-muted text-xs">Nástraha</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.topBaits[0]?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.topBaits[0]?.count ?? 0 }} úlovkov</p>
            </div>
            <div class="rounded-md border border-border bg-white p-3">
              <p class="text-foreground-muted text-xs">Počasie</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.topConditions[0]?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.weatherSummary.weatherCount }} zápisov s počasím</p>
            </div>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-4">
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Voda</p>
              <p class="font-bold">{{ formatTemperature(catchAnalytics.weatherSummary.averageWaterTempC) }}</p>
            </div>
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Vzduch</p>
              <p class="font-bold">{{ formatTemperature(catchAnalytics.weatherSummary.averageAirTempC) }}</p>
            </div>
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Tlak</p>
              <p class="font-bold">{{ formatMetric(catchAnalytics.weatherSummary.averagePressureHpa) }} hPa</p>
            </div>
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Vietor</p>
              <p class="font-bold">{{ formatMetric(catchAnalytics.weatherSummary.averageWindKph) }} km/h</p>
            </div>
          </div>
          <div class="mt-4 space-y-3">
            <div v-for="lake in catchAnalytics.lakeSummaries" :key="lake.key">
              <div class="mb-1 flex items-center justify-between text-sm">
                <span class="font-semibold">{{ lake.label }}</span>
                <span class="text-foreground-muted">{{ lake.count }} ks · {{ formatWeight(lake.totalWeightKg) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary-700" :style="{ width: getGroupWidth(lake.count) }" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Mesačný trend</h2>
            <p class="text-foreground-muted text-sm">
              Mesiace s aktivitou oproti rovnakým mesiacom minulého roka.
            </p>
          </div>
          <span
            class="w-fit rounded-md px-3 py-1 text-xs font-bold"
            :class="catchMonthlyTrend.hasComparisonPeriod ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
          >
            {{ catchMonthlyTrend.hasComparisonPeriod ? 's porovnaním' : 'bez minuloročnej bázy' }}
          </span>
        </div>

        <div v-if="visibleMonthlyTrendMonths.length > 0" class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="month in visibleMonthlyTrendMonths"
            :key="month.key"
            class="rounded-md border border-border bg-white p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold">{{ month.label }}</p>
                <p class="text-foreground-muted text-xs">
                  {{ month.currentCatchCount }} ks teraz · {{ month.previousCatchCount }} ks pred rokom
                </p>
              </div>
              <p class="shrink-0 text-sm font-bold" :class="getTrendDeltaClass(month.deltaTotalWeightKg)">
                {{ formatSignedWeight(month.deltaTotalWeightKg) }}
              </p>
            </div>
            <div class="mt-4 space-y-3">
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Aktuálne</span>
                  <span class="font-semibold">{{ formatWeight(month.currentTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary-700"
                    :style="{ width: getTrendWeightWidth(month.currentTotalWeightKg) }"
                  />
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Minulý rok</span>
                  <span class="font-semibold">{{ formatWeight(month.previousTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-accent-500"
                    :style="{ width: getTrendWeightWidth(month.previousTotalWeightKg) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-else
          class="mt-5"
          title="Bez trendu"
          description="Pre zvolený filter zatiaľ nie je dostupné obdobie na mesačné porovnanie."
        />
      </div>

      <div class="mt-4 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Trend podľa druhu</h2>
            <p class="text-foreground-muted text-sm">
              Ktoré druhy tvoria váhu úlovkov oproti rovnakému obdobiu minulého roka.
            </p>
          </div>
          <span
            class="w-fit rounded-md px-3 py-1 text-xs font-bold"
            :class="catchSpeciesTrend.hasComparisonPeriod ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
          >
            {{ catchSpeciesTrend.hasComparisonPeriod ? 's porovnaním' : 'bez minuloročnej bázy' }}
          </span>
        </div>

        <div v-if="visibleSpeciesTrendRows.length > 0" class="mt-5 divide-y divide-border">
          <div
            v-for="row in visibleSpeciesTrendRows"
            :key="row.key"
            class="py-4 first:pt-0 last:pb-0"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p class="font-bold">{{ row.label }}</p>
                <p class="text-foreground-muted text-xs">
                  {{ row.currentCatchCount }} ks teraz · {{ row.previousCatchCount }} ks pred rokom · priemer
                  {{ formatWeight(row.currentAverageWeightKg) }}
                </p>
              </div>
              <p class="shrink-0 text-sm font-bold" :class="getTrendDeltaClass(row.deltaTotalWeightKg)">
                {{ formatSignedWeight(row.deltaTotalWeightKg) }}
              </p>
            </div>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Aktuálne</span>
                  <span class="font-semibold">{{ formatWeight(row.currentTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary-700"
                    :style="{ width: getSpeciesTrendWeightWidth(row.currentTotalWeightKg) }"
                  />
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Minulý rok</span>
                  <span class="font-semibold">{{ formatWeight(row.previousTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-accent-500"
                    :style="{ width: getSpeciesTrendWeightWidth(row.previousTotalWeightKg) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-else
          class="mt-5"
          title="Bez druhového trendu"
          description="Pre zvolený filter zatiaľ nie sú dostupné druhy rýb na porovnanie."
        />
      </div>

      <div class="mt-4 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Druh a lovné miesto</h2>
            <p class="text-foreground-muted text-sm">
              Najsilnejšie posuny podľa kombinácie ryby a konkrétneho miesta.
            </p>
          </div>
          <span
            class="w-fit rounded-md px-3 py-1 text-xs font-bold"
            :class="catchSpeciesPegTrend.hasComparisonPeriod ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
          >
            {{ catchSpeciesPegTrend.hasComparisonPeriod ? 's porovnaním' : 'bez minuloročnej bázy' }}
          </span>
        </div>

        <div v-if="visibleSpeciesPegTrendRows.length > 0" class="mt-5 grid gap-3 lg:grid-cols-2">
          <div
            v-for="row in visibleSpeciesPegTrendRows"
            :key="row.key"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="font-bold">{{ row.speciesLabel }}</p>
                <p class="text-foreground-muted text-sm">{{ row.pegLabel }}</p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ row.currentCatchCount }} ks teraz · {{ row.previousCatchCount }} ks pred rokom
                </p>
              </div>
              <div class="shrink-0 text-left sm:text-right">
                <p class="text-sm font-bold" :class="getTrendDeltaClass(row.deltaTotalWeightKg)">
                  {{ formatSignedWeight(row.deltaTotalWeightKg) }}
                </p>
                <p class="text-foreground-muted text-xs">{{ formatSignedPercent(row.totalWeightChangePercent) }}</p>
              </div>
            </div>
            <div class="mt-4 space-y-3">
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Aktuálne</span>
                  <span class="font-semibold">{{ formatWeight(row.currentTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary-700"
                    :style="{ width: getSpeciesPegTrendWeightWidth(row.currentTotalWeightKg) }"
                  />
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Minulý rok</span>
                  <span class="font-semibold">{{ formatWeight(row.previousTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-accent-500"
                    :style="{ width: getSpeciesPegTrendWeightWidth(row.previousTotalWeightKg) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-else
          class="mt-5"
          title="Bez signálov podľa miesta"
          description="Pre zvolený filter zatiaľ nie je dostupná kombinácia ryby a lovného miesta na porovnanie."
        />
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div
          v-for="group in analyticsGroups"
          :key="group.label"
          class="rounded-card border border-border bg-surface p-5"
        >
          <h2 class="text-base font-bold">{{ group.label }}</h2>
          <div class="mt-4 space-y-4">
            <div v-for="row in group.rows" :key="row.key">
              <div class="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p class="font-semibold">{{ row.label }}</p>
                  <p class="text-foreground-muted text-xs">{{ row.count }} ks · priemer {{ formatWeight(row.averageWeightKg) }}</p>
                </div>
                <p class="shrink-0 text-sm font-bold">{{ formatWeight(row.totalWeightKg) }}</p>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-accent-500" :style="{ width: getGroupWidth(row.count) }" />
              </div>
            </div>
            <p v-if="group.rows.length === 0" class="text-foreground-muted text-sm">Bez schválených dát.</p>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Úlovky</h2>
              <p class="text-foreground-muted text-sm">Nové verejné zápisy zostávajú skryté, kým ich správca neschváli.</p>
            </div>
            <select
              v-model="statusFilterModel"
              aria-label="Filtrovať úlovky podľa stavu"
              class="h-10 rounded-md border border-border bg-white px-3 text-sm"
            >
              <option v-for="filter in statusFilters" :key="filter.value" :value="filter.value">
                {{ filter.label }}
              </option>
            </select>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="catchItem in filteredCatches"
              :key="catchItem.id"
              type="button"
              class="w-full rounded-md border p-4 text-left transition-colors hover:bg-muted"
              :class="selectedCatchId === catchItem.id ? 'border-primary-600 bg-primary-50' : 'border-border bg-white'"
              @click="selectedCatchId = catchItem.id"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ catchItem.species }} {{ catchItem.weightKg }} kg</p>
                  <p class="text-foreground-muted text-sm">
                    {{ catchItem.angler }} · {{ getLakeName(catchItem.lake) }} · {{ getPegLabel(catchItem.pegId) }}
                  </p>
                </div>
                <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="statusMeta[catchItem.status].class">
                  {{ statusMeta[catchItem.status].label }}
                </span>
              </div>
              <div class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Miera</p>
                  <p class="font-semibold">{{ catchItem.lengthCm }} cm</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Nástraha</p>
                  <p class="font-semibold">{{ catchItem.bait }}</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Čas</p>
                  <p class="font-semibold">{{ formatCatchTime(catchItem.caughtAt) }}</p>
                </div>
              </div>
            </button>
            <AppState
              v-if="filteredCatches.length === 0"
              compact
              title="Bez úlovkov"
              description="Pre zvolený filter zatiaľ nie je žiadny úlovok."
            />
          </div>
        </div>

        <aside class="space-y-6">
          <div
            v-if="selectedCatch"
            ref="catchDetailElement"
            class="rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Detail úlovku</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedCatch.angler }} · {{ formatCatchTime(selectedCatch.caughtAt) }}
                </p>
              </div>
              <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="statusMeta[selectedCatch.status].class">
                {{ statusMeta[selectedCatch.status].label }}
              </span>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Jazero a miesto</p>
                <p class="font-semibold">{{ getLakeName(selectedCatch.lake) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ getPegLabel(selectedCatch.pegId) }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Ryba</p>
                <p class="font-semibold">{{ selectedCatch.species }} · {{ selectedCatch.weightKg }} kg</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ selectedCatch.lengthCm }} cm</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Nástraha</p>
                <p class="font-semibold">{{ selectedCatch.bait }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Fotka</p>
                <p class="font-semibold">{{ selectedCatchPhoto?.label ?? selectedCatch.photoLabel }}</p>
                <p v-if="selectedCatchPhoto" class="text-foreground-muted mt-1 text-xs">
                  {{ formatFileSize(selectedCatchPhoto.sizeBytes) }} · {{ selectedCatchPhoto.aiStatus }}
                </p>
              </div>
              <div v-if="selectedCatch.weather" class="rounded-md bg-muted p-3 sm:col-span-2">
                <p class="text-foreground-muted text-xs">Podmienky pri zábere</p>
                <p class="font-semibold">
                  {{ selectedCatch.weather.condition }} · voda {{ formatTemperature(selectedCatch.weather.waterTempC) }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">
                  vzduch {{ formatTemperature(selectedCatch.weather.airTempC) }} · tlak
                  {{ formatMetric(selectedCatch.weather.pressureHpa) }} hPa {{ formatPressureTrend(selectedCatch.weather.pressureTrend) }} · vietor
                  {{ formatMetric(selectedCatch.weather.windKph) }} km/h {{ selectedCatch.weather.windDirection }}
                </p>
              </div>
            </div>

            <div v-if="selectedCatchPhoto" class="mt-5 overflow-hidden rounded-md border border-border bg-white">
              <img
                :src="selectedCatchPhoto.publicUrl"
                :alt="`Fotka úlovku ${selectedCatch.species}`"
                class="h-56 w-full object-cover"
              >
              <div class="p-4">
                <p class="text-sm font-bold">AI metadata</p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedCatchPhoto.aiNotes }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span class="rounded-md bg-primary-50 px-2.5 py-1 text-primary-800">
                    {{ selectedCatchPhoto.status }}
                  </span>
                  <span class="rounded-md bg-muted px-2.5 py-1 text-foreground-muted">
                    {{ selectedCatchPhoto.storagePath }}
                  </span>
                </div>
              </div>
            </div>

            <div
              v-if="selectedCatchNeedsChipWorkflow"
              class="mt-5 rounded-md border p-4"
              :class="selectedCatchFishCandidate
                ? 'border-warning-500/30 bg-warning-500/10'
                : 'border-success-500/30 bg-success-500/10'"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold">
                    {{ selectedCatchFishCandidate ? 'Vyžaduje kontrolu čipu' : 'Kontrola čipu je spracovaná' }}
                  </p>
                  <p class="mt-1 text-sm text-foreground-muted">
                    {{ getLakeName(selectedCatch.lake) }} má nastavený limit
                    {{ selectedCatchLargeFishRule?.thresholdKg }} kg.
                  </p>
                  <p
                    class="mt-2 text-xs font-bold"
                    :class="selectedCatchManagerAvailability?.available ? 'text-success-700' : 'text-warning-800'"
                  >
                    {{ selectedCatchManagerAvailability?.available
                      ? `Úlovok vznikol počas služby: ${selectedCatchManagerAvailability.matchingWindow?.label}`
                      : 'Úlovok vznikol mimo služby správcu' }}
                  </p>
                  <p v-if="selectedCatchLargeFishRule" class="mt-1 text-xs text-foreground-muted">
                    Služba: {{ formatFishManagerAvailability(selectedCatchLargeFishRule) }}
                  </p>
                </div>
                <StatusBadge
                  :icon="selectedCatchFishCandidate ? 'i-heroicons-identification' : 'i-heroicons-check-circle'"
                  :label="selectedCatchFishCandidate ? 'čaká' : 'prepojené'"
                  :tone="selectedCatchFishCandidate ? 'warning' : 'success'"
                  size="xs"
                />
              </div>
              <UButton
                v-if="selectedCatchFishCandidate"
                class="mt-4"
                :to="{ path: '/admin/ryby', query: { catchId: selectedCatch.id } }"
                icon="i-heroicons-arrow-top-right-on-square"
                color="warning"
              >
                Spracovať v registri rýb
              </UButton>
              <UButton
                v-else
                class="mt-4"
                to="/admin/ryby"
                icon="i-heroicons-tag"
                variant="soft"
              >
                Otvoriť register rýb
              </UButton>
            </div>

            <form class="mt-5 rounded-md border border-border bg-white p-4" @submit.prevent="saveCorrection">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold">Oprava údajov</p>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Korekcia vie ponechať, presunúť alebo odpojiť väzbu na zápisník výpravy.
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  pred zverejnením
                </span>
              </div>

              <fieldset :disabled="!canManageCatches" class="contents">
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Rybár</span>
                    <input
                      v-model="correctionForm.angler"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Druh</span>
                    <input
                      v-model="correctionForm.species"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Jazero</span>
                    <select
                      v-model="correctionForm.lake"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Miesto</span>
                    <select
                      v-model="correctionForm.pegId"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option v-for="peg in correctionPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Váha kg</span>
                    <input
                      v-model.number="correctionForm.weightKg"
                      type="number"
                      min="0"
                      step="0.1"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Miera cm</span>
                    <input
                      v-model.number="correctionForm.lengthCm"
                      type="number"
                      min="0"
                      step="1"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="text-sm font-semibold">Nástraha</span>
                    <input
                      v-model="correctionForm.bait"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Čas úlovku</span>
                    <input
                      v-model="correctionForm.caughtAt"
                      type="datetime-local"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <label class="flex items-center gap-2 self-end rounded-md bg-muted p-3 text-sm font-semibold">
                    <input v-model="correctionForm.released" type="checkbox" class="h-4 w-4 accent-primary-700">
                    Ryba pustená späť
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="text-sm font-semibold">Poznámka rybára</span>
                    <textarea
                      v-model="correctionForm.notes"
                      rows="3"
                      class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                    />
                  </label>
                  <div class="sm:col-span-2 rounded-md border border-border bg-muted/40 p-4">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p class="text-sm font-bold">Zápisník výpravy</p>
                        <p class="text-foreground-muted mt-1 text-sm">
                          {{ selectedLogbook ? `${selectedLogbook.title} · ${selectedLogbook.shareCode}` : 'Úlovok zatiaľ nie je v žiadnom zápisníku.' }}
                        </p>
                      </div>
                      <span
                        v-if="selectedLogbook"
                        class="w-fit rounded-md bg-white px-2.5 py-1 text-xs font-bold text-foreground-muted"
                      >
                        {{ tripLogbookModeLabels[selectedLogbook.mode] }}
                      </span>
                    </div>

                    <div class="mt-4 grid gap-2 sm:grid-cols-3">
                      <button
                        v-for="option in logbookLinkOptions"
                        :key="option.value"
                        type="button"
                        :disabled="!canManageCatches"
                        class="rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        :class="
                          correctionForm.logbookLinkMode === option.value
                            ? 'border-primary-600 bg-primary-50 text-primary-950'
                            : 'border-border bg-white text-foreground hover:bg-muted'
                        "
                        @click="correctionForm.logbookLinkMode = option.value"
                      >
                        <span class="flex items-center gap-2 text-sm font-bold">
                          <UIcon :name="option.icon" class="h-4 w-4 shrink-0" />
                          {{ option.label }}
                        </span>
                        <span class="text-foreground-muted mt-1 block text-xs leading-5">
                          {{ option.description }}
                        </span>
                      </button>
                    </div>

                    <label v-if="correctionForm.logbookLinkMode === 'move'" class="mt-4 block">
                      <span class="text-sm font-semibold">Cieľový zápisník</span>
                      <select
                        v-model="correctionForm.targetLogbookId"
                        class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                        :disabled="!canManageCatches || compatibleCorrectionLogbooks.length === 0"
                      >
                        <option v-if="compatibleCorrectionLogbooks.length === 0" value="">
                          Žiadny otvorený zápisník pre toto miesto
                        </option>
                        <option
                          v-for="logbook in compatibleCorrectionLogbooks"
                          :key="logbook.id"
                          :value="logbook.id"
                        >
                          {{ formatLogbookSummary(logbook.id) }}
                        </option>
                      </select>
                    </label>
                    <p v-else-if="correctionForm.logbookLinkMode === 'detach'" class="text-foreground-muted mt-4 text-sm">
                      Po uložení nebude tento úlovok patriť do žiadnej skupinovej tabuľky, ale ostane v interných úlovkoch.
                    </p>
                  </div>
                </div>
              </fieldset>

              <ValidationSummary
                class="mt-4"
                :messages="correctionValidationMessages"
                valid-title="Oprava je pripravená"
                valid-description="Údaje majú platné miesto, čas, rozmery aj nástrahu."
              />

              <p
                v-if="correctionSubmitMessage"
                class="mt-3 rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  correctionSubmitStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ correctionSubmitMessage }}
              </p>

              <UButton
                class="mt-4"
                type="submit"
                icon="i-heroicons-pencil-square"
                variant="soft"
                :disabled="!canManageCatches || !correctionReady || correctionSubmitStatus === 'submitting'"
                :loading="correctionSubmitStatus === 'submitting'"
              >
                Uložiť opravu
              </UButton>
            </form>

            <div class="mt-5 rounded-md border border-border bg-white p-4">
              <p class="text-sm font-bold">Poznámka rybára</p>
              <p class="text-foreground-muted mt-2 text-sm">{{ selectedCatch.notes }}</p>
            </div>

            <div v-if="selectedLogbookEntry && selectedLogbook" class="mt-5 rounded-md border border-primary-200 bg-primary-50 p-4">
              <p class="text-sm font-bold text-primary-900">Aktuálny zápisník</p>
              <p class="text-primary-800 mt-1 text-sm">
                {{ selectedLogbook.title }} · {{ selectedLogbook.shareCode }} · {{ tripLogbookStatusLabels[selectedLogbook.status] }}
              </p>
            </div>

            <div class="mt-5 rounded-md border border-border bg-white p-4">
              <p class="text-sm font-bold">Rozhodnutie správcu</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canManageCatches"
                  :class="decisionMode === 'approve' ? 'border-success-500 bg-success-500/10 text-success-700' : 'border-border bg-white'"
                  @click="decisionMode = 'approve'"
                >
                  Schváliť
                </button>
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canManageCatches"
                  :class="decisionMode === 'pending' ? 'border-warning-500 bg-warning-500/10 text-warning-800' : 'border-border bg-white'"
                  @click="decisionMode = 'pending'"
                >
                  Nechať čakať
                </button>
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canManageCatches"
                  :class="decisionMode === 'reject' ? 'border-error-500 bg-error-500/10 text-error-700' : 'border-border bg-white'"
                  @click="decisionMode = 'reject'"
                >
                  Zamietnuť
                </button>
              </div>
              <label class="mt-4 block">
                <span class="text-sm font-semibold">Poznámka ku kontrole</span>
                <textarea
                  v-model="reviewNote"
                  rows="4"
                  :readonly="!canManageCatches"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
              <UButton
                class="mt-4"
                icon="i-heroicons-check"
                variant="soft"
                :disabled="!canManageCatches || decisionSubmitStatus === 'submitting'"
                :loading="decisionSubmitStatus === 'submitting'"
                @click="saveDecision"
              >
                Uložiť rozhodnutie
              </UButton>
              <p
                v-if="decisionSubmitMessage"
                class="mt-3 rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  decisionSubmitStatus === 'error'
                    ? 'bg-error-500/10 text-error-700'
                    : 'bg-primary-50 text-primary-800'
                "
              >
                {{ decisionSubmitMessage }}
              </p>
            </div>
          </div>

          <AppState
            v-else
            compact
            title="Vyberte úlovok"
            description="Detail schvaľovania sa zobrazí po výbere úlovku zo zoznamu."
          />
        </aside>
      </div>
    </section>
  </div>
</template>
