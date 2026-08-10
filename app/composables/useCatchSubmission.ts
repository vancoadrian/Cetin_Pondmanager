import type { LakeSlug, TripLogbook, TripLogbookEntry } from '~/data/pond'
import type { StatusBadgeTone } from '~/utils/ui'
import type {
  CatchStateResponse,
  CatchSubmissionSuccess,
  TripLogbookLookupSuccess,
  TripLogbookSubmissionSuccess,
} from '~/services/catchApiService'
import { filterPublicCatchWorkflowState } from '~/services/catchApiService'
import {
  createDefaultFishRegistrySettings,
  fishManagerContactModeLabels,
  formatFishManagerAvailability,
  getFishManagerAvailability,
  type FishLargeCatchRulesResponse,
} from '~/services/fishRegistrySettingsService'
import type {
  LargeFishAssistanceMutationSuccess,
  LargeFishAssistancePublicResponse,
  LargeFishAssistanceRequest,
} from '~/services/largeFishAssistanceService'
import {
  LARGE_FISH_ASSISTANCE_PHONE_FALLBACK_MINUTES,
  largeFishAssistanceStatusLabels,
} from '~/services/largeFishAssistanceService'
import {
  catchRecordInputSchema,
  getValidationMessages,
  MAX_CATCH_PHOTO_BYTES,
  tripLogbookInputSchema,
} from '~/schemas/pondSchemas'
import {
  enqueueOfflineCatch,
  getOfflineCatchQueueErrorMessage,
  markOfflineCatchAttempt,
  readOfflineCatchQueue,
  removeOfflineCatch,
  shouldQueueCatchSubmission,
  type OfflineCatchPayload,
  type OfflineCatchQueueItem,
} from '~/services/offlineCatchQueueService'

type NoticeTone = 'error' | 'info' | 'success' | 'warning'

interface LargeFishFlowStep {
  description: string
  icon: string
  label: string
  tone: StatusBadgeTone
}

interface LargeFishNoticeMeta {
  description: string
  icon: string
  title: string
  tone: NoticeTone
}

function currentDateTimeInput() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export async function useCatchSubmission() {
  const route = useRoute()
  const { account: anglerAccount, isLoggedIn: isAnglerLoggedIn } = useMockAnglerAuth()
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

  type LogbookMode = keyof typeof tripLogbookModeLabels

  const fallbackCatchState = (): CatchStateResponse => ({
    ...filterPublicCatchWorkflowState({
      catches: seedCatches,
      catchPhotos: seedCatchPhotos,
      tripLogbookEntries: seedTripLogbookEntries,
      tripLogbooks: seedTripLogbooks,
    }),
    ok: true,
    updatedAt: 'seed',
  })
  const fallbackLargeCatchRules = (): FishLargeCatchRulesResponse => ({
    ok: true,
    rules: createDefaultFishRegistrySettings().largeCatchRules,
    updatedAt: 'seed',
  })
  const {
    data: catchState,
    error: catchStateError,
    refresh: refreshCatchState,
    status: catchStateStatus,
  } = await useAsyncData<CatchStateResponse>(
    'public-catch-state',
    () => $fetch<CatchStateResponse>('/api/catches'),
    {
      default: fallbackCatchState,
    },
  )
  const {
    data: largeCatchRulesState,
    error: largeCatchRulesError,
    refresh: refreshLargeCatchRulesState,
    status: largeCatchRulesStatus,
  } = await useAsyncData<FishLargeCatchRulesResponse>(
    'public-large-catch-rules',
    () => $fetch<FishLargeCatchRulesResponse>('/api/fish-registry/rules'),
    {
      default: fallbackLargeCatchRules,
    },
  )

  const selectedLogbookMode = ref<LogbookMode>('group')
  const selectedLogbookId = ref('')
  const selectedCatchLogbookId = ref('')
  const openedTripLogbooks = ref<TripLogbook[]>([])
  const openedTripLogbookEntries = ref<TripLogbookEntry[]>([])
  const logbookForm = reactive({
    lake: 'velky-cetin' as LakeSlug,
    membersText: anglerAccount.value
      ? `${anglerAccount.value.name}\nTomáš K.\nLenka R.`
      : 'Marek H.\nTomáš K.\nLenka R.',
    pegId: 'vc-03',
    title: 'Chata 3 - víkend',
  })
  const logbookCodeForm = reactive({
    code: '',
  })
  const catchForm = reactive({
    angler: '',
    bait: '',
    caughtAt: currentDateTimeInput(),
    lake: 'velky-cetin' as LakeSlug,
    lengthCm: 0,
    pegId: 'vc-03',
    released: true,
    species: 'Kapor',
    weightKg: 0,
  })
  const logbookSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const logbookSubmitMessage = ref('')
  const logbookLookupStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const logbookLookupMessage = ref('')
  const catchSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const catchSubmitMessage = ref('')
  const assistancePhone = ref('')
  const assistanceStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const assistanceMessage = ref('')
  const activeAssistance = ref<LargeFishAssistanceRequest | null>(null)
  const assistanceClock = ref(Date.now())
  const catchPhotoDraft = ref<{
    dataUrl: string
    fileName: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
    previewUrl: string
    sizeBytes: number
  } | null>(null)
  const catchPhotoError = ref('')
  const offlineCatchQueue = ref<OfflineCatchQueueItem[]>([])
  const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const offlineSyncMessage = ref('')
  const isOnline = ref(true)
  let offlineSyncInProgress = false
  let assistancePollTimer: ReturnType<typeof setInterval> | undefined
  const assistanceStorageKey = 'rybolov-cetin-large-fish-assistance'
  const logbookModeOptions = Object.entries(tripLogbookModeLabels).map(([value, label]) => ({
    label,
    value: value as LogbookMode,
  }))
  const liveCatches = computed(() => catchState.value?.catches ?? seedCatches)
  const liveCatchPhotos = computed(() => catchState.value?.catchPhotos ?? seedCatchPhotos)
  const isCatchDataLoading = computed(() =>
    catchStateStatus.value === 'pending' || largeCatchRulesStatus.value === 'pending',
  )
  const hasCatchDataError = computed(() => Boolean(catchStateError.value || largeCatchRulesError.value))
  const catchPhotoByCatchId = computed(() =>
    new Map(liveCatchPhotos.value.map((photo) => [photo.catchId, photo])),
  )
  const publicCatches = computed(() => liveCatches.value.filter((catchItem) => catchItem.status === 'approved'))
  const liveTripLogbooks = computed(() => {
    const rows = [
      ...openedTripLogbooks.value,
      ...(catchState.value?.tripLogbooks ?? []),
    ]
    const seen = new Set<string>()

    return rows.filter((logbook) => {
      if (seen.has(logbook.id)) return false

      seen.add(logbook.id)
      return true
    })
  })
  const liveTripLogbookEntries = computed(() => {
    const rows = [
      ...openedTripLogbookEntries.value,
      ...(catchState.value?.tripLogbookEntries ?? []),
    ]
    const seen = new Set<string>()

    return rows.filter((entry) => {
      if (seen.has(entry.id)) return false

      seen.add(entry.id)
      return true
    })
  })
  const logbookPegs = computed(() => pegs.filter((peg) => peg.lake === logbookForm.lake))
  const catchPegs = computed(() => pegs.filter((peg) => peg.lake === catchForm.lake))
  const activeLargeCatchRule = computed(() =>
    largeCatchRulesState.value.rules.find((rule) => rule.lake === catchForm.lake),
  )
  const catchRequiresManager = computed(() =>
    Boolean(
      activeLargeCatchRule.value
      && catchForm.weightKg >= activeLargeCatchRule.value.thresholdKg,
    ),
  )
  const managerAvailability = computed(() =>
    activeLargeCatchRule.value
      ? getFishManagerAvailability(activeLargeCatchRule.value, catchForm.caughtAt)
      : undefined,
  )
  const canRequestManager = computed(() =>
    catchRequiresManager.value
    && managerAvailability.value?.available
    && assistancePhone.value.trim().length >= 7
    && catchForm.angler.trim().length >= 2
    && Boolean(catchForm.pegId),
  )
  const assistanceWaitMinutes = computed(() => {
    if (!activeAssistance.value) return 0
    const createdAt = Date.parse(activeAssistance.value.createdAt)
    if (!Number.isFinite(createdAt)) return 0
    return Math.max(0, Math.floor((assistanceClock.value - createdAt) / 60_000))
  })
  const showAssistancePhoneFallback = computed(() =>
    activeAssistance.value?.status === 'waiting'
    && assistanceWaitMinutes.value >= LARGE_FISH_ASSISTANCE_PHONE_FALLBACK_MINUTES
    && Boolean(activeAssistance.value.managerPhone),
  )
  const largeFishFlowSteps = computed<LargeFishFlowStep[]>(() => {
    if (!catchRequiresManager.value || !activeLargeCatchRule.value) return []

    const status = activeAssistance.value?.status
    const hasClosedInstruction = status && ['completed', 'release-without-manager'].includes(status)

    return [
      {
        description: status
          ? 'Požiadavka je odoslaná správcovi a stav sa tu obnovuje automaticky.'
          : managerAvailability.value?.available
            ? 'Doplňte telefón a odošlite privolanie pred zbytočným držaním ryby.'
            : activeLargeCatchRule.value.outsideAvailabilityInstruction,
        icon: status ? 'i-heroicons-check-circle' : 'i-heroicons-bell-alert',
        label: 'Privolať správcu',
        tone: status ? 'success' : managerAvailability.value?.available ? 'warning' : 'neutral',
      },
      {
        description: status === 'on-route'
          ? `Správca je na ceste${activeAssistance.value?.etaMinutes ? `, odhad do ${activeAssistance.value.etaMinutes} min` : ''}.`
          : status === 'release-without-manager'
            ? 'Správca dal pokyn rybu zdokumentovať a šetrne pustiť bez jeho príchodu.'
            : status === 'completed'
              ? 'Kontrola správcom je vybavená, údaje možno uložiť do denníka.'
              : status === 'waiting'
                ? `Čakáte ${assistanceWaitMinutes.value} min. Nechajte túto obrazovku otvorenú.`
                : 'Správca odpovie v aplikácii: ide, príde neskôr alebo dá pokyn pustiť bez neho.',
        icon: assistanceStatusIcon(status ?? 'waiting'),
        label: 'Počkať na odpoveď',
        tone: status === 'on-route' || status === 'completed'
          ? 'success'
          : status === 'release-without-manager'
            ? 'warning'
            : 'info',
      },
      {
        description: hasClosedInstruction
          ? 'Uložte úlovok do zápisníka; verejne sa ukáže až po schválení.'
          : 'Úlovok uložte po kontrole alebo po jasnom pokyne správcu.',
        icon: 'i-heroicons-document-plus',
        label: 'Zapísať úlovok',
        tone: hasClosedInstruction ? 'success' : 'neutral',
      },
    ]
  })
  const largeFishManagerNoticeMeta = computed<LargeFishNoticeMeta | null>(() => {
    const rule = activeLargeCatchRule.value
    if (!catchRequiresManager.value || !rule) return null

    if (managerAvailability.value?.available) {
      return {
        description: rule.instruction,
        icon: 'i-heroicons-phone-arrow-up-right',
        title: `Pri rybe od ${rule.thresholdKg} kg privolajte správcu`,
        tone: 'success',
      }
    }

    return {
      description: rule.outsideAvailabilityInstruction,
      icon: 'i-heroicons-clock',
      title: `Ryba je nad limitom ${rule.thresholdKg} kg, správca nie je v službe`,
      tone: 'warning',
    }
  })
  const activeAssistanceNoticeMeta = computed<LargeFishNoticeMeta | null>(() => {
    const request = activeAssistance.value
    if (!request) return null

    const tone: NoticeTone =
      request.status === 'on-route' || request.status === 'completed'
        ? 'success'
        : ['release-without-manager', 'cancelled', 'expired'].includes(request.status)
          ? 'warning'
          : 'info'

    return {
      description: request.responseMessage
        || assistanceMessage.value
        || 'Požiadavka je odoslaná. Čakáme na odpoveď správcu.',
      icon: assistanceStatusIcon(request.status),
      title: largeFishAssistanceStatusLabels[request.status],
      tone,
    }
  })
  const compatibleLogbooks = computed(() =>
    liveTripLogbooks.value.filter((logbook) =>
      logbook.status !== 'closed' &&
      logbook.lake === catchForm.lake &&
      logbook.pegIds.includes(catchForm.pegId),
    ),
  )

  async function retryCatchData() {
    await Promise.all([
      refreshCatchState(),
      refreshLargeCatchRulesState(),
    ])
  }
  const logbookMemberNames = computed(() =>
    logbookForm.membersText.split('\n').map((name) => name.trim()).filter(Boolean),
  )
  const logbookValidation = computed(() =>
    tripLogbookInputSchema.safeParse({
      lake: logbookForm.lake,
      memberNames: logbookMemberNames.value,
      mode: selectedLogbookMode.value,
      pegIds: [logbookForm.pegId],
      title: logbookForm.title,
    }),
  )
  const catchPhotoPayload = computed(() =>
    catchPhotoDraft.value
      ? {
          dataUrl: catchPhotoDraft.value.dataUrl,
          fileName: catchPhotoDraft.value.fileName,
          mimeType: catchPhotoDraft.value.mimeType,
          sizeBytes: catchPhotoDraft.value.sizeBytes,
        }
      : undefined,
  )
  const catchValidation = computed(() =>
    catchRecordInputSchema.safeParse({
      ...catchForm,
      photo: catchPhotoPayload.value,
    }),
  )
  const logbookValidationMessages = computed(() => getValidationMessages(logbookValidation.value))
  const catchValidationMessages = computed(() => [
    ...getValidationMessages(catchValidation.value),
    ...(catchPhotoError.value ? [catchPhotoError.value] : []),
  ])
  const totalWeight = computed(() =>
    publicCatches.value.reduce((sum, catchItem) => sum + catchItem.weightKg, 0).toFixed(1),
  )
  const publicSpeciesCount = computed(() =>
    new Set(publicCatches.value.map((catchItem) => catchItem.species)).size,
  )
  const biggestCatch = computed(() =>
    publicCatches.value.reduce(
      (biggest, item) => (!biggest || item.weightKg > biggest.weightKg ? item : biggest),
      publicCatches.value[0],
    ),
  )
  const activeLogbook = computed(() =>
    liveTripLogbooks.value.find((logbook) => logbook.id === selectedLogbookId.value) ??
    liveTripLogbooks.value.find((logbook) => logbook.status === 'active') ??
    liveTripLogbooks.value[0],
  )
  const activeLogbookCanAddCatch = computed(() =>
    Boolean(activeLogbook.value && activeLogbook.value.status !== 'closed'),
  )
  const selectedCatchLogbook = computed(() =>
    liveTripLogbooks.value.find((logbook) => logbook.id === selectedCatchLogbookId.value),
  )
  const activeEntries = computed(() =>
    activeLogbook.value
      ? liveTripLogbookEntries.value.filter((entry) => entry.logbookId === activeLogbook.value?.id)
      : [],
  )
  const activeTotalWeight = computed(() =>
    activeEntries.value.reduce((sum, entry) => sum + entry.weightKg, 0).toFixed(1),
  )
  const latestLogbookEntry = computed(() =>
    [...activeEntries.value].sort((a, b) => b.caughtAt.localeCompare(a.caughtAt))[0],
  )
  const logbookMemberRows = computed(() =>
    activeLogbook.value?.members.map((member) => {
      const memberEntries = activeEntries.value.filter((entry) => entry.angler === member.name)
      const weightKg = memberEntries.reduce((sum, entry) => sum + entry.weightKg, 0)

      return {
        ...member,
        catchesCount: memberEntries.length,
        weightLabel: weightKg.toFixed(1),
      }
    }) ?? [],
  )

  const photoStatusMeta = {
    missing: {
      label: 'bez fotky',
      icon: 'i-heroicons-photo',
      tone: 'warning',
    },
    uploaded: {
      label: 'foto nahraté',
      icon: 'i-heroicons-arrow-up-tray',
      tone: 'primary',
    },
    'ai-ready': {
      label: 'fotka uložená',
      icon: 'i-heroicons-sparkles',
      tone: 'success',
    },
  } as const satisfies Record<TripLogbookEntry['photoStatus'], {
    icon: string
    label: string
    tone: StatusBadgeTone
  }>

  function logbookStatusTone(status: TripLogbook['status']): StatusBadgeTone {
    if (status === 'active') return 'success'
    if (status === 'closed') return 'neutral'
    return 'warning'
  }

  function logbookStatusIcon(status: TripLogbook['status']) {
    if (status === 'active') return 'i-heroicons-signal'
    if (status === 'closed') return 'i-heroicons-lock-closed'
    return 'i-heroicons-pencil-square'
  }

  function formatCatchTime(value: string) {
    return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
  }

  function getCatchPhoto(catchId: string) {
    return catchPhotoByCatchId.value.get(catchId)
  }

  function rememberOpenedLogbook(logbook: TripLogbook, entries: TripLogbookEntry[] = []) {
    openedTripLogbooks.value = [
      logbook,
      ...openedTripLogbooks.value.filter((item) => item.id !== logbook.id),
    ]
    if (entries.length > 0) {
      const nextEntries = [
        ...entries,
        ...openedTripLogbookEntries.value.filter((entry) =>
          !entries.some((nextEntry) => nextEntry.id === entry.id),
        ),
      ]

      openedTripLogbookEntries.value = nextEntries
    }
  }

  function rememberOpenedLogbookEntry(entry: TripLogbookEntry) {
    openedTripLogbookEntries.value = [
      entry,
      ...openedTripLogbookEntries.value.filter((item) => item.id !== entry.id),
    ]
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`

    return `${(bytes / 1024 / 1024).toLocaleString('sk-SK', { maximumFractionDigits: 1 })} MB`
  }

  function clearCatchPhoto() {
    catchPhotoDraft.value = null
    catchPhotoError.value = ''
  }

  function handleCatchPhotoChange(event: Event) {
    catchPhotoError.value = ''
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]

    if (!file) {
      clearCatchPhoto()
      return
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      catchPhotoDraft.value = null
      catchPhotoError.value = 'Podporované sú iba JPG, PNG alebo WebP fotky.'
      input.value = ''
      return
    }

    if (file.size > MAX_CATCH_PHOTO_BYTES) {
      catchPhotoDraft.value = null
      catchPhotoError.value = 'Fotka môže mať najviac 6 MB.'
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        catchPhotoError.value = 'Fotku sa nepodarilo načítať.'
        return
      }

      catchPhotoDraft.value = {
        dataUrl: reader.result,
        fileName: file.name,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        previewUrl: reader.result,
        sizeBytes: file.size,
      }
    })
    reader.addEventListener('error', () => {
      catchPhotoError.value = 'Fotku sa nepodarilo načítať.'
    })
    reader.readAsDataURL(file)
  }

  const getApiErrorMessage = (error: unknown) => {
    const fetchError = error as {
      data?: {
        data?: {
          messages?: string[]
        }
        message?: string
        statusMessage?: string
      }
    }
    const messages = fetchError.data?.data?.messages

    return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Zápis sa nepodarilo uložiť.'
  }

  const getQueueFallbackErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Offline zápis sa nepodarilo uložiť v zariadení.'

  function assistanceStatusIcon(status: LargeFishAssistanceRequest['status']) {
    if (status === 'on-route') return 'i-heroicons-truck'
    if (status === 'completed') return 'i-heroicons-check-circle'
    if (status === 'release-without-manager') return 'i-heroicons-arrow-uturn-left'
    if (status === 'cancelled') return 'i-heroicons-x-circle'
    return 'i-heroicons-clock'
  }

  function persistAssistanceAccess(request: LargeFishAssistanceRequest) {
    if (!import.meta.client) return
    localStorage.setItem(assistanceStorageKey, JSON.stringify({
      id: request.id,
      token: request.publicToken,
    }))
  }

  function clearAssistanceAccess() {
    activeAssistance.value = null
    assistanceStatus.value = 'idle'
    assistanceMessage.value = ''
    if (import.meta.client) localStorage.removeItem(assistanceStorageKey)
  }

  async function refreshLargeFishAssistance(options: { silent?: boolean } = {}) {
    if (!import.meta.client) return

    const stored = localStorage.getItem(assistanceStorageKey)
    if (!stored) return

    try {
      const access = JSON.parse(stored) as { id?: string, token?: string }
      if (!access.id || !access.token) {
        clearAssistanceAccess()
        return
      }

      const response = await $fetch<LargeFishAssistancePublicResponse>(
        `/api/large-fish-assistance/${encodeURIComponent(access.id)}`,
        { query: { token: access.token } },
      )
      activeAssistance.value = response.request
      catchForm.angler = response.request.anglerName
      catchForm.caughtAt = response.request.caughtAt.slice(0, 16)
      catchForm.lake = response.request.lake
      await nextTick()
      catchForm.pegId = response.request.pegId
      catchForm.lengthCm = response.request.lengthCm
      catchForm.species = response.request.species
      catchForm.weightKg = response.request.weightKg
      assistancePhone.value = response.request.phone
      assistanceStatus.value = 'success'
      assistanceMessage.value = response.request.responseMessage
        ?? 'Požiadavka bola odoslaná. Čakáme na odpoveď správcu.'
    }
    catch (error) {
      if (!options.silent) {
        assistanceStatus.value = 'error'
        assistanceMessage.value = getApiErrorMessage(error)
      }
    }
  }

  async function requestManagerAssistance() {
    if (!canRequestManager.value || activeAssistance.value) return

    assistanceStatus.value = 'submitting'
    assistanceMessage.value = ''

    try {
      const result = await $fetch<LargeFishAssistanceMutationSuccess>('/api/large-fish-assistance', {
        body: {
          anglerName: catchForm.angler,
          caughtAt: catchForm.caughtAt,
          lake: catchForm.lake,
          lengthCm: catchForm.lengthCm,
          note: '',
          pegId: catchForm.pegId,
          phone: assistancePhone.value,
          species: catchForm.species,
          weightKg: catchForm.weightKg,
        },
        method: 'POST',
      })
      activeAssistance.value = result.request
      assistanceStatus.value = 'success'
      assistanceMessage.value = result.message
      persistAssistanceAccess(result.request)
    }
    catch (error) {
      assistanceStatus.value = 'error'
      assistanceMessage.value = getApiErrorMessage(error)
    }
  }

  async function cancelManagerAssistance() {
    if (!activeAssistance.value || !['waiting', 'on-route'].includes(activeAssistance.value.status)) return

    assistanceStatus.value = 'submitting'
    assistanceMessage.value = ''

    try {
      const result = await $fetch<LargeFishAssistanceMutationSuccess>(
        `/api/large-fish-assistance/${encodeURIComponent(activeAssistance.value.id)}/cancel`,
        {
          body: { token: activeAssistance.value.publicToken },
          method: 'POST',
        },
      )
      activeAssistance.value = result.request
      assistanceStatus.value = 'success'
      assistanceMessage.value = result.message
      persistAssistanceAccess(result.request)
    }
    catch (error) {
      assistanceStatus.value = 'error'
      assistanceMessage.value = getApiErrorMessage(error)
    }
  }

  async function refreshOfflineCatchQueue() {
    if (!import.meta.client) return

    try {
      offlineCatchQueue.value = await readOfflineCatchQueue()
    }
    catch (error) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
    }
  }

  async function queueOfflineCatch(payload: OfflineCatchPayload) {
    try {
      const item = await enqueueOfflineCatch(payload)

      await refreshOfflineCatchQueue()
      catchSubmitStatus.value = 'success'
      catchSubmitMessage.value = `Slabý signál: úlovok je uložený v tomto zariadení a odošle sa automaticky. Fronta: ${item.id}.`
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = `Vo fronte čaká ${offlineCatchQueue.value.length} offline zápis.`
      clearCatchPhoto()
    }
    catch (error) {
      catchSubmitStatus.value = 'error'
      catchSubmitMessage.value = getQueueFallbackErrorMessage(error)
    }
  }

  async function discardOfflineCatch(id: string) {
    try {
      await removeOfflineCatch(id)
      await refreshOfflineCatchQueue()
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = 'Offline zápis bol odstránený zo zariadenia.'
    }
    catch (error) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
    }
  }

  async function syncOfflineCatchQueue(options: { silent?: boolean } = {}) {
    if (!import.meta.client || offlineSyncInProgress) return

    isOnline.value = navigator.onLine
    if (!isOnline.value) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = 'Bez pripojenia nechávam zápisy bezpečne v zariadení.'
      return
    }

    await refreshOfflineCatchQueue()
    if (offlineCatchQueue.value.length === 0) {
      if (!options.silent) {
        offlineSyncStatus.value = 'success'
        offlineSyncMessage.value = 'Offline fronta je prázdna.'
      }
      return
    }

    offlineSyncInProgress = true
    offlineSyncStatus.value = 'syncing'
    offlineSyncMessage.value = `Odosielam ${offlineCatchQueue.value.length} offline zápisov.`

    let syncedCount = 0

    try {
      for (const queuedCatch of [...offlineCatchQueue.value]) {
        try {
          const result = await $fetch<CatchSubmissionSuccess>('/api/catches', {
            body: queuedCatch.payload,
            method: 'POST',
          })

          if (result.logbookEntry) {
            rememberOpenedLogbookEntry(result.logbookEntry)
            selectedLogbookId.value = result.logbookEntry.logbookId
          }
          await removeOfflineCatch(queuedCatch.id)
          syncedCount += 1
        }
        catch (error) {
          await markOfflineCatchAttempt(queuedCatch.id, getOfflineCatchQueueErrorMessage(error))
        }
      }

      await refreshOfflineCatchQueue()
      if (syncedCount > 0) {
        await refreshCatchState()
      }

      offlineSyncStatus.value = offlineCatchQueue.value.length > 0 ? 'error' : 'success'
      offlineSyncMessage.value = offlineCatchQueue.value.length > 0
        ? `${syncedCount} zápisov odoslaných, ${offlineCatchQueue.value.length} čaká na ďalší pokus.`
        : `${syncedCount} offline zápisov bolo odoslaných na schválenie.`
    }
    finally {
      offlineSyncInProgress = false
    }
  }

  const submitLogbook = async () => {
    const validation = logbookValidation.value
    if (!validation.success) {
      logbookSubmitStatus.value = 'error'
      logbookSubmitMessage.value = logbookValidationMessages.value[0] ?? 'Skontrolujte údaje zápisníka.'
      return
    }

    logbookSubmitStatus.value = 'submitting'
    logbookSubmitMessage.value = 'Vytváram zápisník výpravy.'

    try {
      const result = await $fetch<TripLogbookSubmissionSuccess>('/api/logbooks', {
        body: validation.data,
        method: 'POST',
      })

      rememberOpenedLogbook(result.logbook)
      selectedLogbookId.value = result.logbook.id
      selectedCatchLogbookId.value = result.logbook.id
      catchForm.lake = result.logbook.lake
      catchForm.pegId = result.logbook.pegIds[0] ?? catchForm.pegId
      catchForm.angler = result.logbook.owner
      logbookSubmitStatus.value = 'success'
      logbookSubmitMessage.value = result.message
      await refreshCatchState()
    }
    catch (error) {
      logbookSubmitStatus.value = 'error'
      logbookSubmitMessage.value = getApiErrorMessage(error)
    }
  }

  const openLogbookByCode = async () => {
    const code = logbookCodeForm.code.trim()
    if (!code) {
      logbookLookupStatus.value = 'error'
      logbookLookupMessage.value = 'Zadajte kód zápisníka.'
      return
    }

    logbookLookupStatus.value = 'submitting'
    logbookLookupMessage.value = 'Otváram zápisník podľa kódu.'

    try {
      const result = await $fetch<TripLogbookLookupSuccess>(`/api/logbooks/${encodeURIComponent(code)}`)

      rememberOpenedLogbook(result.logbook, result.tripLogbookEntries)
      selectedLogbookId.value = result.logbook.id
      selectedCatchLogbookId.value = result.logbook.id
      catchForm.lake = result.logbook.lake
      catchForm.pegId = result.logbook.pegIds[0] ?? catchForm.pegId
      catchForm.angler = result.logbook.owner
      logbookCodeForm.code = result.logbook.shareCode
      logbookLookupStatus.value = 'success'
      logbookLookupMessage.value = result.message
    }
    catch (error) {
      logbookLookupStatus.value = 'error'
      logbookLookupMessage.value = getApiErrorMessage(error)
    }
  }

  async function openLogbookFromQuery() {
    const code = typeof route.query.zapisnik === 'string' ? route.query.zapisnik.trim() : ''
    if (!code) return

    if (logbookCodeForm.code !== code || !activeLogbook.value) {
      logbookCodeForm.code = code
      await openLogbookByCode()
    }

    if (route.hash === '#pridat-ulovok') {
      prepareCatchForActiveLogbook()
    }
  }

  function prepareCatchForActiveLogbook() {
    const logbook = activeLogbook.value
    if (!logbook || logbook.status === 'closed') return

    selectedCatchLogbookId.value = logbook.id
    catchForm.lake = logbook.lake
    catchForm.pegId = logbook.pegIds[0] ?? catchForm.pegId
    if (!catchForm.angler.trim()) catchForm.angler = logbook.owner

    if (!import.meta.client) return

    void nextTick(() => {
      const target = document.getElementById('pridat-ulovok')
      if (!target) return

      target.focus({ preventScroll: true })
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  const submitCatch = async () => {
    const validation = catchValidation.value
    if (!validation.success) {
      catchSubmitStatus.value = 'error'
      catchSubmitMessage.value = catchValidationMessages.value[0] ?? 'Skontrolujte údaje úlovku.'
      return
    }

    catchSubmitStatus.value = 'submitting'
    catchSubmitMessage.value = 'Odosielam úlovok na schválenie.'

    try {
      const payload: OfflineCatchPayload = {
        ...validation.data,
        logbookId: selectedCatchLogbookId.value || undefined,
      }
      const result = await $fetch<CatchSubmissionSuccess>('/api/catches', {
        body: payload,
        method: 'POST',
      })

      if (result.logbookEntry) {
        rememberOpenedLogbookEntry(result.logbookEntry)
        selectedLogbookId.value = result.logbookEntry.logbookId
      }
      catchSubmitStatus.value = 'success'
      catchSubmitMessage.value = result.message
      clearCatchPhoto()
      await refreshCatchState()
    }
    catch (error) {
      const payload: OfflineCatchPayload = {
        ...validation.data,
        logbookId: selectedCatchLogbookId.value || undefined,
      }

      if (import.meta.client && shouldQueueCatchSubmission(error, navigator.onLine)) {
        await queueOfflineCatch(payload)
        return
      }

      catchSubmitStatus.value = 'error'
      catchSubmitMessage.value = getApiErrorMessage(error)
    }
  }

  function handleOnline() {
    isOnline.value = true
    void syncOfflineCatchQueue({ silent: true })
  }

  function handleOffline() {
    isOnline.value = false
    offlineSyncStatus.value = 'idle'
    offlineSyncMessage.value = 'Signál vypadol. Nové úlovky sa uložia v zariadení.'
  }

  onMounted(() => {
    if (!import.meta.client) return

    isOnline.value = navigator.onLine
    void openLogbookFromQuery()
    void refreshOfflineCatchQueue().then(() => {
      if (navigator.onLine && offlineCatchQueue.value.length > 0) {
        void syncOfflineCatchQueue({ silent: true })
      }
    })
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    void refreshLargeFishAssistance({ silent: true })
    assistancePollTimer = setInterval(() => {
      assistanceClock.value = Date.now()
      if (activeAssistance.value && ['waiting', 'on-route'].includes(activeAssistance.value.status)) {
        void refreshLargeFishAssistance({ silent: true })
      }
    }, 5_000)
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) return

    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    if (assistancePollTimer) clearInterval(assistancePollTimer)
  })

  watch(() => logbookForm.lake, () => {
    logbookForm.pegId = logbookPegs.value[0]?.id ?? ''
  })

  watch(() => catchForm.lake, () => {
    catchForm.pegId = catchPegs.value[0]?.id ?? ''
  })

  watch(() => [route.query.zapisnik, route.hash], () => {
    if (import.meta.client) void openLogbookFromQuery()
  })

  watch(anglerAccount, (account, previousAccount) => {
    if (!account || previousAccount || logbookForm.membersText.trim() === '') return
    logbookForm.membersText = `${account.name}\n${logbookForm.membersText}`
  })

  watch(compatibleLogbooks, (items) => {
    if (selectedCatchLogbookId.value && items.some((logbook) => logbook.id === selectedCatchLogbookId.value)) return

    selectedCatchLogbookId.value = items[0]?.id ?? ''
  })

  watch(logbookValidation, () => {
    if (logbookSubmitStatus.value !== 'submitting') {
      logbookSubmitStatus.value = 'idle'
      logbookSubmitMessage.value = ''
    }
  })

  watch(catchValidation, () => {
    if (catchSubmitStatus.value !== 'submitting') {
      catchSubmitStatus.value = 'idle'
      catchSubmitMessage.value = ''
    }
  })

  return {
    activeAssistance,
    activeAssistanceNoticeMeta,
    activeEntries,
    activeLargeCatchRule,
    activeLogbook,
    activeLogbookCanAddCatch,
    activeTotalWeight,
    anglerAccount,
    assistanceMessage,
    assistancePhone,
    assistanceStatus,
    assistanceWaitMinutes,
    biggestCatch,
    canRequestManager,
    cancelManagerAssistance,
    catchForm,
    catchPegs,
    catchPhotoDraft,
    catchPhotoError,
    catchSubmitMessage,
    catchSubmitStatus,
    catchValidation,
    catchValidationMessages,
    clearAssistanceAccess,
    clearCatchPhoto,
    compatibleLogbooks,
    discardOfflineCatch,
    fishManagerContactModeLabels,
    formatCatchTime,
    formatFileSize,
    formatFishManagerAvailability,
    getCatchPhoto,
    getLakeName,
    getPegLabel,
    handleCatchPhotoChange,
    hasCatchDataError,
    isAnglerLoggedIn,
    isCatchDataLoading,
    isOnline,
    lakes,
    largeFishFlowSteps,
    largeFishManagerNoticeMeta,
    latestLogbookEntry,
    logbookCodeForm,
    logbookForm,
    logbookLookupMessage,
    logbookLookupStatus,
    logbookMemberRows,
    logbookModeOptions,
    logbookPegs,
    logbookStatusIcon,
    logbookStatusTone,
    logbookSubmitMessage,
    logbookSubmitStatus,
    logbookValidation,
    logbookValidationMessages,
    managerAvailability,
    offlineCatchQueue,
    offlineSyncMessage,
    offlineSyncStatus,
    openLogbookByCode,
    photoStatusMeta,
    prepareCatchForActiveLogbook,
    publicCatches,
    publicSpeciesCount,
    requestManagerAssistance,
    retryCatchData,
    selectedCatchLogbook,
    selectedCatchLogbookId,
    selectedLogbookMode,
    showAssistancePhoneFallback,
    submitCatch,
    submitLogbook,
    syncOfflineCatchQueue,
    totalWeight,
    tripLogbookModeLabels,
    tripLogbookStatusLabels,
  }
}
