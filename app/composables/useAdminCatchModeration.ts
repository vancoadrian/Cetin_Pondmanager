import type {
  CatchPhoto,
  CatchRecord,
  CatchRecordStatus,
  LakeSlug,
  Peg,
  TripLogbook,
  TripLogbookEntry,
} from '~/data/pond'
import type { CatchStateResponse } from '~/services/catchApiService'
import type { CatchCorrectionSuccess, CatchLogbookLinkMode } from '~/services/catchCorrectionService'
import type {
  CatchModerationDecisionMode,
  CatchModerationSuccess,
} from '~/services/catchModerationService'
import type { StatusBadgeTone } from '~/utils/ui'
import {
  createDefaultFishRegistrySettings,
  getFishLargeCatchRule,
  getFishManagerAvailability,
} from '~/services/fishRegistrySettingsService'
import type { FishCatchCandidateResponse } from '~/services/fishRegistryCandidateService'
import { catchCorrectionInputSchema, getValidationMessages } from '~/schemas/pondSchemas'

export type CatchAdminView = 'analytika' | 'moderacia' | 'reporty'
type NoticeTone = 'error' | 'info' | 'success' | 'warning'

interface UseAdminCatchModerationOptions {
  activeCatchAdminView: Ref<CatchAdminView>
  pegs: Peg[]
  seedCatchPhotos: CatchPhoto[]
  seedCatches: CatchRecord[]
  seedTripLogbookEntries: TripLogbookEntry[]
  seedTripLogbooks: TripLogbook[]
  tripLogbookStatusLabels: Record<TripLogbook['status'], string>
}

export async function useAdminCatchModeration(options: UseAdminCatchModerationOptions) {
  const {
    activeCatchAdminView,
    pegs,
    seedCatchPhotos,
    seedCatches,
    seedTripLogbookEntries,
    seedTripLogbooks,
    tripLogbookStatusLabels,
  } = options

  const route = useRoute()
  const requestFetch = useRequestFetch()
  const {
    canManage: canManageCatches,
    isReadOnly: catchesReadOnly,
    label: catchAccessLabel,
    readOnlyMessage: catchReadOnlyMessage,
  } = useAdminModuleAccess('catches')

  const fallbackCatchState = (): CatchStateResponse => ({
    catches: seedCatches,
    catchPhotos: seedCatchPhotos,
    ok: true,
    tripLogbookEntries: seedTripLogbookEntries,
    tripLogbooks: seedTripLogbooks,
    updatedAt: 'seed',
  })
  const fallbackFishCandidateState = (): FishCatchCandidateResponse => ({
    candidates: [],
    ok: true,
    settings: createDefaultFishRegistrySettings(),
    thresholdKg: 18,
    updatedAt: 'seed',
  })

  const { data: catchState, refresh: refreshCatchState } = await useAsyncData<CatchStateResponse>(
    'admin-catch-state',
    () => requestFetch<CatchStateResponse>('/api/admin/catches'),
    {
      default: fallbackCatchState,
    },
  )
  const { data: fishCandidateState } = await useAsyncData<FishCatchCandidateResponse>(
    'admin-catch-fish-candidates',
    () => requestFetch<FishCatchCandidateResponse>('/api/admin/fish-registry/candidates'),
    {
      default: fallbackFishCandidateState,
    },
  )

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

  const correctionNoticeTitle = computed(() =>
    correctionSubmitStatus.value === 'success'
      ? 'Oprava je uložená'
      : 'Opravu sa nepodarilo uložiť',
  )
  const correctionNoticeTone = computed<NoticeTone>(() =>
    correctionSubmitStatus.value === 'success' ? 'success' : 'error',
  )
  const decisionNoticeTitle = computed(() =>
    decisionSubmitStatus.value === 'error'
      ? 'Rozhodnutie sa nepodarilo uložiť'
      : 'Rozhodnutie je uložené',
  )
  const decisionNoticeTone = computed<NoticeTone>(() =>
    decisionSubmitStatus.value === 'error' ? 'error' : 'success',
  )

  const liveCatches = computed(() => catchState.value?.catches ?? seedCatches)
  const liveCatchPhotos = computed(() => catchState.value?.catchPhotos ?? seedCatchPhotos)
  const liveTripLogbookEntries = computed(() => catchState.value?.tripLogbookEntries ?? seedTripLogbookEntries)
  const liveTripLogbooks = computed(() => catchState.value?.tripLogbooks ?? seedTripLogbooks)
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

  const statusMeta: Record<CatchRecordStatus, { icon: string, label: string, tone: StatusBadgeTone }> = {
    approved: {
      icon: 'i-heroicons-check-circle',
      label: 'schválené',
      tone: 'success',
    },
    pending: {
      icon: 'i-heroicons-clock',
      label: 'čaká',
      tone: 'warning',
    },
    rejected: {
      icon: 'i-heroicons-x-circle',
      label: 'zamietnuté',
      tone: 'error',
    },
  }

  function formatCatchTime(value: string) {
    return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
  }

  function formatMetric(value: number) {
    return value.toLocaleString('sk-SK', { maximumFractionDigits: 1 })
  }

  function formatTemperature(value: number) {
    return `${formatMetric(value)} °C`
  }

  function formatPressureTrend(value: string) {
    if (value === 'falling') return 'klesá'
    if (value === 'rising') return 'rastie'

    return 'stabilný'
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

    return `${(bytes / 1024 / 1024).toLocaleString('sk-SK', { maximumFractionDigits: 1 })} MB`
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
      if (!catchId) {
        openedQueryCatchId.value = ''
        return
      }
      if (openedQueryCatchId.value === catchId) {
        activeCatchAdminView.value = 'moderacia'
        return
      }

      const catchItem = catches.find((item) => item.id === catchId)
      if (!catchItem) return

      activeCatchAdminView.value = 'moderacia'
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

  return {
    canManageCatches,
    catchAccessLabel,
    catchDetailElement,
    catchesReadOnly,
    catchPhotoByCatchId,
    catchReadOnlyMessage,
    catchStats,
    correctionForm,
    correctionLogbookMessages,
    correctionNoticeTitle,
    correctionNoticeTone,
    correctionPegs,
    correctionReady,
    correctionSubmitMessage,
    correctionSubmitStatus,
    correctionValidation,
    correctionValidationMessages,
    compatibleCorrectionLogbooks,
    decisionMode,
    decisionNoticeTitle,
    decisionNoticeTone,
    decisionSubmitMessage,
    decisionSubmitStatus,
    filteredCatches,
    formatCatchTime,
    formatFileSize,
    formatLogbookSummary,
    formatMetric,
    formatPressureTrend,
    formatTemperature,
    liveCatches,
    liveCatchPhotos,
    liveTripLogbookEntries,
    liveTripLogbooks,
    logbookLinkOptions,
    refreshCatchState,
    reviewNote,
    saveCorrection,
    saveDecision,
    selectedCatch,
    selectedCatchFishCandidate,
    selectedCatchId,
    selectedCatchLargeFishRule,
    selectedCatchManagerAvailability,
    selectedCatchNeedsChipWorkflow,
    selectedCatchPhoto,
    selectedLogbook,
    selectedLogbookEntry,
    statusFilter,
    statusFilterModel,
    statusFilters,
    statusMeta,
  }
}
