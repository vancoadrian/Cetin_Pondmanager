<script setup lang="ts">
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
} from '~/services/fishRegistryService'
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

usePublicSeo({
  title: 'Úlovky',
  description: 'Prehľad úlovkov z Veľkého Cetína a Štrkoviska Kocka, zápis úlovku a otvorenie zdieľaného rybárskeho zápisníka cez kód.',
})

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
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Úlovky"
      title="Úlovky z revíru"
      description="Schválené úlovky z oboch jazier. Prihlásení rybári si môžu viesť vlastné aj skupinové zápisníky výprav."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="mb-6 flex flex-col gap-3 border-y border-primary-200 bg-primary-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-start gap-3">
          <UIcon name="i-heroicons-user-circle" class="mt-0.5 h-6 w-6 shrink-0 text-primary-800" />
          <div>
            <p class="font-bold">
              {{ isAnglerLoggedIn ? `Prihlásený rybár: ${anglerAccount?.name}` : 'Verejný denník úlovkov' }}
            </p>
            <p class="mt-1 text-sm text-foreground-muted">
              {{ isAnglerLoggedIn
                ? 'Nové zápisníky a úlovky sa uložia do vašej histórie.'
                : 'Na vytvorenie zápisníka alebo pridanie úlovku sa prihláste. Existujúci zápisník otvoríte jeho kódom.' }}
            </p>
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <UButton
            :to="isAnglerLoggedIn ? '/konto' : '/login?redirect=/ulovky'"
            :icon="isAnglerLoggedIn ? 'i-heroicons-book-open' : 'i-heroicons-arrow-right-on-rectangle'"
            variant="soft"
          >
            {{ isAnglerLoggedIn ? 'Moje zápisníky' : 'Prihlásiť sa' }}
          </UButton>
          <UButton
            :to="isAnglerLoggedIn ? '#pridat-ulovok' : '#zapisnik-vypravy'"
            :icon="isAnglerLoggedIn ? 'i-heroicons-plus' : 'i-heroicons-key'"
            color="neutral"
            variant="outline"
          >
            {{ isAnglerLoggedIn ? 'Pridať úlovok' : 'Mám kód zápisníka' }}
          </UButton>
        </div>
      </div>

      <DataStatusNotice
        v-if="isCatchDataLoading || hasCatchDataError"
        class="mb-6"
        :title="hasCatchDataError ? 'Úlovky sa nepodarilo obnoviť' : 'Načítavam úlovky a pravidlá veľkých rýb'"
        :description="hasCatchDataError ? 'Zobrazujeme posledný dostupný stav denníka a pravidiel pre privolanie správcu.' : 'Kontrolujeme schválené úlovky, zápisníky a aktuálne limity pre privolanie správcu.'"
        :tone="hasCatchDataError ? 'warning' : 'info'"
        :loading="isCatchDataLoading && !hasCatchDataError"
        :action-label="hasCatchDataError ? 'Skúsiť znova' : ''"
        :action-loading="isCatchDataLoading"
        @action="retryCatchData"
      />

      <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div class="border-border bg-surface min-w-0 rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Verejné úlovky</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ publicCatches.length }}</p>
        </div>
        <div class="border-border bg-surface min-w-0 rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Spolu zdolané</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ totalWeight }} kg</p>
        </div>
        <div class="border-border bg-surface min-w-0 rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Najväčšia ryba</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ biggestCatch?.weightKg ?? 0 }} kg</p>
        </div>
        <div class="border-border bg-surface min-w-0 rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Druhy rýb</p>
          <p class="mt-2 text-2xl font-bold sm:text-3xl">{{ publicSpeciesCount }}</p>
        </div>
      </div>

      <div class="mt-8 grid items-start gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div class="order-2 space-y-4 lg:order-1">
          <section v-if="activeLogbook" class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p class="text-primary-800 text-sm font-bold">
                  {{ tripLogbookModeLabels[activeLogbook.mode] }} zápisník
                </p>
                <h2 class="mt-1 text-2xl font-bold">{{ activeLogbook.title }}</h2>
                <p class="text-foreground-muted mt-2 text-sm">
                  {{ getLakeName(activeLogbook.lake) }} ·
                  {{ activeLogbook.pegIds.map((pegId) => getPegLabel(pegId)).join(', ') }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <StatusBadge
                  :icon="logbookStatusIcon(activeLogbook.status)"
                  :label="tripLogbookStatusLabels[activeLogbook.status]"
                  :tone="logbookStatusTone(activeLogbook.status)"
                  size="xs"
                />
                <StatusBadge
                  icon="i-heroicons-key"
                  :label="activeLogbook.shareCode"
                  tone="neutral"
                  size="xs"
                  title="Kód zápisníka"
                />
              </div>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-3">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Členovia</p>
                <p class="mt-1 text-xl font-bold">{{ activeLogbook.members.length }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Úlovky v tabuľke</p>
                <p class="mt-1 text-xl font-bold">{{ activeEntries.length }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Spoločná váha</p>
                <p class="mt-1 text-xl font-bold">{{ activeTotalWeight }} kg</p>
              </div>
            </div>

            <div class="mt-5 grid gap-5 xl:grid-cols-[0.65fr_1.35fr]">
              <div>
                <h3 class="font-bold">Rybári</h3>
                <div class="mt-3 space-y-2">
                  <div
                    v-for="member in logbookMemberRows"
                    :key="member.id"
                    class="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2"
                  >
                    <div class="min-w-0">
                      <p class="truncate font-semibold">{{ member.name }}</p>
                      <p class="text-foreground-muted text-xs">
                        {{ member.role === 'owner' ? 'vedúci výpravy' : 'člen partie' }}
                      </p>
                    </div>
                    <div class="text-right text-sm">
                      <p class="font-bold">{{ member.catchesCount }}x</p>
                      <p class="text-foreground-muted text-xs">{{ member.weightLabel }} kg</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div class="flex items-center justify-between gap-3">
                  <h3 class="font-bold">Tabuľka úlovkov</h3>
                  <UButton
                    type="button"
                    size="sm"
                    icon="i-heroicons-plus"
                    variant="soft"
                    :disabled="!activeLogbookCanAddCatch"
                    @click="prepareCatchForActiveLogbook"
                  >
                    {{ activeLogbookCanAddCatch ? 'Pridať riadok' : 'Zápisník je uzavretý' }}
                  </UButton>
                </div>
                <div v-if="activeEntries.length" class="mt-3 overflow-x-auto">
                  <table class="min-w-full text-left text-sm">
                    <thead class="text-foreground-muted border-b border-border text-xs">
                      <tr>
                        <th class="py-2 pr-4 font-semibold">Rybár</th>
                        <th class="py-2 pr-4 font-semibold">Ryba</th>
                        <th class="py-2 pr-4 font-semibold">Miesto</th>
                        <th class="py-2 pr-4 font-semibold">Nástraha</th>
                        <th class="py-2 pr-4 font-semibold">Foto</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border">
                      <tr v-for="entry in activeEntries" :key="entry.id">
                        <td class="py-3 pr-4 font-semibold">{{ entry.angler }}</td>
                        <td class="py-3 pr-4">
                          {{ entry.species }} · {{ entry.weightKg }} kg · {{ entry.lengthCm }} cm
                        </td>
                        <td class="py-3 pr-4">{{ getPegLabel(entry.pegId) }}</td>
                        <td class="py-3 pr-4">{{ entry.bait }}</td>
                        <td class="py-3 pr-4">
                          <StatusBadge
                            :icon="photoStatusMeta[entry.photoStatus].icon"
                            :label="photoStatusMeta[entry.photoStatus].label"
                            :tone="photoStatusMeta[entry.photoStatus].tone"
                            size="xs"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <AppState
                  v-else
                  title="Tabuľka je prázdna"
                  description="Po prvom úlovku sa tu zobrazí riadok s rybárom, miestom, nástrahou a fotkou."
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="verejne-ulovky" class="space-y-4">
            <div class="flex items-end justify-between gap-4">
              <div>
                <p class="text-primary-800 text-sm font-bold">Verejný denník</p>
                <h2 id="verejne-ulovky" class="mt-1 text-2xl font-bold">Posledné úlovky</h2>
              </div>
              <StatusBadge
                icon="i-heroicons-check-badge"
                :label="`Schválené: ${publicCatches.length}`"
                tone="success"
                size="xs"
              />
            </div>

            <AppState
              v-if="publicCatches.length === 0"
              title="Žiadne schválené úlovky"
              description="Po kontrole správcom sa prvé záznamy zobrazia na tomto mieste."
            />

            <article
              v-for="catchItem in publicCatches"
              :key="catchItem.id"
              class="border-border bg-surface grid overflow-hidden rounded-card border md:grid-cols-[180px_1fr]"
            >
              <div class="bg-water-100 pond-grid flex min-h-40 items-center justify-center">
                <img
                  v-if="getCatchPhoto(catchItem.id)?.publicUrl"
                  :src="getCatchPhoto(catchItem.id)?.publicUrl"
                  :alt="`Fotka úlovku ${catchItem.species}`"
                  class="h-full min-h-40 w-full object-cover"
                >
                <div v-else class="bg-white/80 text-water-900 flex h-20 w-20 items-center justify-center rounded-full">
                  <UIcon name="i-heroicons-camera" class="h-9 w-9" />
                </div>
              </div>
              <div class="p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="text-foreground-muted text-sm">
                      {{ getLakeName(catchItem.lake) }} · {{ getPegLabel(catchItem.pegId) }}
                    </p>
                    <h3 class="mt-1 text-2xl font-bold">
                      {{ catchItem.species }} {{ catchItem.weightKg }} kg
                    </h3>
                  </div>
                  <StatusBadge
                    class="shrink-0"
                    :icon="catchItem.released ? 'i-heroicons-arrow-uturn-left' : 'i-heroicons-clipboard-document-check'"
                    :label="catchItem.released ? 'pustená späť' : 'ponechaná podľa pravidiel'"
                    :tone="catchItem.released ? 'success' : 'neutral'"
                    size="xs"
                  />
                </div>

                <dl class="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div class="bg-muted min-w-0 rounded-md p-3">
                    <dt class="text-foreground-muted text-xs">Miera</dt>
                    <dd class="font-semibold">{{ catchItem.lengthCm }} cm</dd>
                  </div>
                  <div class="bg-muted min-w-0 rounded-md p-3">
                    <dt class="text-foreground-muted text-xs">Nástraha</dt>
                    <dd class="break-words font-semibold">{{ catchItem.bait }}</dd>
                  </div>
                  <div class="bg-muted min-w-0 rounded-md p-3">
                    <dt class="text-foreground-muted text-xs">Čas</dt>
                    <dd class="font-semibold">{{ formatCatchTime(catchItem.caughtAt) }}</dd>
                  </div>
                  <div class="bg-muted min-w-0 rounded-md p-3">
                    <dt class="text-foreground-muted text-xs">Foto</dt>
                    <dd class="break-words font-semibold">{{ getCatchPhoto(catchItem.id)?.label ?? catchItem.photoLabel }}</dd>
                  </div>
                </dl>

                <p class="text-foreground-muted mt-4 text-sm">{{ catchItem.notes }}</p>
              </div>
            </article>
          </section>
        </div>

        <aside id="zapisnik-vypravy" class="order-1 scroll-mt-24 space-y-6 lg:order-2">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Otvoriť zápisník</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Zadajte kód od partie a tabuľka sa otvorí v tomto zariadení.
                </p>
              </div>
              <UIcon name="i-heroicons-key" class="text-primary-800 h-5 w-5" />
            </div>

            <label for="trip-logbook-code" class="mt-5 block text-sm font-semibold">
              Kód zápisníka
            </label>
            <form class="mt-2 flex flex-col gap-3 sm:flex-row" @submit.prevent="openLogbookByCode">
              <input
                id="trip-logbook-code"
                v-model="logbookCodeForm.code"
                class="h-11 flex-1 rounded-md border border-border bg-white px-3 text-sm font-semibold uppercase"
                placeholder="CETIN-..."
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                required
                :aria-describedby="logbookLookupMessage ? 'trip-logbook-code-help trip-logbook-code-status' : 'trip-logbook-code-help'"
                :aria-invalid="logbookLookupStatus === 'error'"
              >
              <UButton
                type="submit"
                icon="i-heroicons-arrow-right-on-rectangle"
                :loading="logbookLookupStatus === 'submitting'"
              >
                Otvoriť
              </UButton>
            </form>
            <DataStatusNotice
              v-if="logbookLookupMessage"
              id="trip-logbook-code-status"
              class="mt-3"
              :description="logbookLookupMessage"
              :loading="logbookLookupStatus === 'submitting'"
              :title="
                logbookLookupStatus === 'error'
                  ? 'Zápisník sa nepodarilo otvoriť'
                  : logbookLookupStatus === 'submitting'
                    ? 'Otváram zápisník'
                    : 'Zápisník je otvorený'
              "
              :tone="
                logbookLookupStatus === 'error'
                  ? 'error'
                  : logbookLookupStatus === 'submitting'
                    ? 'info'
                    : 'success'
              "
            />
            <p id="trip-logbook-code-help" class="sr-only">
              Kód má formát CETIN nasledovaný pomlčkou a znakmi zápisníka.
            </p>
          </div>

          <div v-if="isAnglerLoggedIn || activeLogbook" class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Nový zápisník</h2>
                <p v-if="latestLogbookEntry" class="text-foreground-muted mt-1 text-sm">
                  Posledný zápis: {{ latestLogbookEntry.angler }} · {{ latestLogbookEntry.weightKg }} kg
                </p>
              </div>
              <UIcon name="i-heroicons-table-cells" class="text-primary-800 h-5 w-5" />
            </div>

            <DataStatusNotice
              class="mt-4"
              :description="
                isAnglerLoggedIn
                  ? `Vlastníkom bude ${anglerAccount?.name}; prvé meno vo formulári nemusí byť zhodné.`
                  : 'Kód si odložte alebo sa pred vytvorením prihláste.'
              "
              :icon="isAnglerLoggedIn ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-key'"
              :title="isAnglerLoggedIn ? 'Uloží sa do účtu' : 'Uloží sa iba pod kódom'"
              :tone="isAnglerLoggedIn ? 'success' : 'info'"
            />

            <form class="mt-5 space-y-4" @submit.prevent="submitLogbook">
              <fieldset>
                <legend class="text-sm font-semibold">Typ</legend>
                <div class="mt-2 grid grid-cols-3 rounded-lg bg-muted p-1">
                  <button
                    v-for="option in logbookModeOptions"
                    :key="option.value"
                    type="button"
                    class="min-h-11 rounded-md px-2 py-2 text-xs font-bold transition-colors"
                    :class="
                      selectedLogbookMode === option.value
                        ? 'bg-white text-primary-900 shadow-sm'
                        : 'text-foreground-muted hover:text-foreground'
                    "
                    :aria-pressed="selectedLogbookMode === option.value"
                    @click="selectedLogbookMode = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </fieldset>

              <label class="block">
                <span class="text-sm font-semibold">Názov výpravy</span>
                <input
                  v-model="logbookForm.title"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Rybári v partii</span>
                <textarea
                  v-model="logbookForm.membersText"
                  rows="3"
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Jazero</span>
                  <select
                    v-model="logbookForm.lake"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Miesto</span>
                  <select
                    v-model="logbookForm.pegId"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option v-for="peg in logbookPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                  </select>
                </label>
              </div>

              <ValidationSummary
                :messages="logbookValidationMessages"
                valid-title="Zápisník je pripravený"
                valid-description="Partia má názov, miesto aj zoznam členov."
              />

              <DataStatusNotice
                v-if="logbookSubmitMessage"
                :description="logbookSubmitMessage"
                :loading="logbookSubmitStatus === 'submitting'"
                :title="
                  logbookSubmitStatus === 'error'
                    ? 'Zápisník sa nepodarilo vytvoriť'
                    : logbookSubmitStatus === 'submitting'
                      ? 'Vytváram zápisník'
                      : 'Zápisník je vytvorený'
                "
                :tone="
                  logbookSubmitStatus === 'error'
                    ? 'error'
                    : logbookSubmitStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

              <UButton
                type="submit"
                icon="i-heroicons-share"
                block
                :disabled="!logbookValidation.success || logbookSubmitStatus === 'submitting'"
                :loading="logbookSubmitStatus === 'submitting'"
              >
                Vytvoriť tabuľku
              </UButton>
            </form>
          </div>

          <div
            v-if="isAnglerLoggedIn || activeLogbook"
            id="pridat-ulovok"
            tabindex="-1"
            aria-labelledby="pridat-ulovok-title"
            class="border-border bg-surface rounded-card scroll-mt-24 border p-5"
          >
            <h2 id="pridat-ulovok-title" class="text-lg font-bold">Pridať úlovok</h2>
            <DataStatusNotice
              class="mt-4"
              :description="
                selectedCatchLogbook
                  ? `Riadok pribudne v tabuľke ${selectedCatchLogbook.shareCode}. Verejne sa úlovok zobrazí až po schválení správcom.`
                  : 'Úlovok sa odošle ako samostatný záznam. Verejne sa zobrazí až po schválení správcom.'
              "
              :icon="selectedCatchLogbook ? 'i-heroicons-table-cells' : 'i-heroicons-clipboard-document-check'"
              :title="selectedCatchLogbook ? `Zápis do: ${selectedCatchLogbook.title}` : 'Samostatný úlovok'"
              tone="info"
            />
            <div
              v-if="!isOnline || offlineCatchQueue.length > 0 || offlineSyncMessage"
              class="mt-4 space-y-3"
            >
              <DataStatusNotice
                :action-label="offlineCatchQueue.length > 0 && isOnline ? 'Odoslať' : ''"
                :action-loading="offlineSyncStatus === 'syncing'"
                :description="offlineSyncMessage || 'Pri výpadku signálu uložíme úlovok v zariadení a odošleme ho po návrate internetu.'"
                :icon="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                :loading="offlineSyncStatus === 'syncing'"
                :title="
                  !isOnline
                    ? 'Bez pripojenia pri vode'
                    : offlineSyncStatus === 'syncing'
                      ? 'Odosielam offline úlovky'
                      : 'Offline fronta úlovkov'
                "
                :tone="
                  offlineSyncStatus === 'error' || !isOnline
                    ? 'warning'
                    : offlineSyncStatus === 'success'
                      ? 'success'
                      : 'info'
                "
                @action="syncOfflineCatchQueue()"
              />

              <div
                v-if="offlineCatchQueue.length > 0"
                class="space-y-2 rounded-md border border-border bg-muted/50 p-3"
              >
                <div
                  v-for="item in offlineCatchQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ item.payload.species }} {{ item.payload.weightKg }} kg · {{ item.payload.angler }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ getPegLabel(item.payload.pegId) }} · {{ formatCatchTime(item.payload.caughtAt) }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="text-foreground-muted hover:text-error-700 shrink-0 rounded-md p-1"
                    aria-label="Odstrániť offline zápis"
                    @click="discardOfflineCatch(item.id)"
                  >
                    <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <form class="mt-5 space-y-4" @submit.prevent="submitCatch">
              <label class="block">
                <span class="text-sm font-semibold">Jazero</span>
                <select
                  v-model="catchForm.lake"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Lovné miesto</span>
                <select
                  v-model="catchForm.pegId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="peg in catchPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Zápisník partie</span>
                <select
                  v-model="selectedCatchLogbookId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option value="">Samostatný úlovok</option>
                  <option
                    v-for="logbook in compatibleLogbooks"
                    :key="logbook.id"
                    :value="logbook.id"
                  >
                    {{ logbook.title }} · {{ logbook.shareCode }}
                  </option>
                </select>
              </label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Rybár</span>
                  <input v-model="catchForm.angler" class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm" >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Druh</span>
                  <input v-model="catchForm.species" class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm" >
                </label>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Váha kg</span>
                  <input
                    v-model.number="catchForm.weightKg"
                    type="number"
                    min="0"
                    step="0.1"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Miera cm</span>
                  <input
                    v-model.number="catchForm.lengthCm"
                    type="number"
                    min="0"
                    step="1"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
              </div>
              <div
                v-if="largeFishManagerNoticeMeta && activeLargeCatchRule"
                class="rounded-md border border-border bg-muted/30 p-4 text-foreground"
              >
                <DataStatusNotice
                  :description="largeFishManagerNoticeMeta.description"
                  :icon="largeFishManagerNoticeMeta.icon"
                  :title="largeFishManagerNoticeMeta.title"
                  :tone="largeFishManagerNoticeMeta.tone"
                />

                <div class="mt-3 flex flex-wrap gap-2">
                  <StatusBadge
                    v-if="managerAvailability?.available"
                    :label="fishManagerContactModeLabels[activeLargeCatchRule.contactMode]"
                    icon="i-heroicons-bell-alert"
                    size="xs"
                    tone="success"
                  />
                  <StatusBadge
                    v-if="managerAvailability?.available && activeLargeCatchRule.phone"
                    :label="activeLargeCatchRule.phone"
                    icon="i-heroicons-phone"
                    size="xs"
                    tone="neutral"
                  />
                  <StatusBadge
                    v-if="managerAvailability?.available && activeLargeCatchRule.email"
                    :label="activeLargeCatchRule.email"
                    icon="i-heroicons-envelope"
                    size="xs"
                    tone="neutral"
                  />
                </div>
                <p class="mt-2 text-xs font-semibold text-foreground-muted">
                  Služba správcu: {{ formatFishManagerAvailability(activeLargeCatchRule) }}
                </p>

                <div class="mt-4 grid gap-2">
                  <div
                    v-for="step in largeFishFlowSteps"
                    :key="step.label"
                    class="flex items-start gap-3 rounded-md border border-border bg-white/80 px-3 py-3 text-foreground"
                  >
                    <StatusBadge
                      :icon="step.icon"
                      :label="step.label"
                      :tone="step.tone"
                      size="xs"
                      class="shrink-0"
                    />
                    <p class="text-sm text-foreground-muted">{{ step.description }}</p>
                  </div>
                </div>

                <div v-if="activeAssistance && activeAssistanceNoticeMeta" class="mt-4 space-y-3">
                  <DataStatusNotice
                    :description="activeAssistanceNoticeMeta.description"
                    :icon="activeAssistanceNoticeMeta.icon"
                    :title="activeAssistanceNoticeMeta.title"
                    :tone="activeAssistanceNoticeMeta.tone"
                  />

                  <div class="space-y-2 text-xs font-semibold text-foreground-muted">
                    <p v-if="activeAssistance.managerName" class="text-foreground">
                      {{ activeAssistance.managerName }}
                      <template v-if="activeAssistance.etaMinutes"> · do {{ activeAssistance.etaMinutes }} min</template>
                    </p>
                    <p v-if="activeAssistance.status === 'waiting'">
                      Čakáte {{ assistanceWaitMinutes }} min.
                    </p>
                    <p v-if="showAssistancePhoneFallback">
                      Upozornenie mohlo zostať bez odozvy. Rybu zbytočne nezadržiavajte.
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <a
                      v-if="showAssistancePhoneFallback"
                      :href="`tel:${activeAssistance.managerPhone}`"
                      class="inline-flex h-10 items-center gap-2 rounded-md bg-warning-600 px-3 text-sm font-bold text-white"
                    >
                      <UIcon name="i-heroicons-phone" class="h-4 w-4" />
                      Zavolať správcovi
                    </a>
                    <button
                      v-if="['waiting', 'on-route'].includes(activeAssistance.status)"
                      type="button"
                      class="inline-flex h-10 items-center rounded-md border border-border bg-white px-3 text-sm font-bold text-foreground"
                      :disabled="assistanceStatus === 'submitting'"
                      @click="cancelManagerAssistance"
                    >
                      Zrušiť privolanie
                    </button>
                    <button
                      v-if="['cancelled', 'completed', 'expired', 'release-without-manager'].includes(activeAssistance.status)"
                      type="button"
                      class="inline-flex h-10 items-center rounded-md border border-border bg-white px-3 text-sm font-bold text-foreground"
                      @click="clearAssistanceAccess"
                    >
                      Zavrieť stav
                    </button>
                  </div>
                </div>

                <div v-else-if="managerAvailability?.available" class="mt-4 space-y-3 border-t border-border pt-4">
                  <label class="block">
                    <span class="text-xs font-bold">Telefón pre správcu</span>
                    <input
                      v-model="assistancePhone"
                      type="tel"
                      inputmode="tel"
                      placeholder="+421 9..."
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-foreground"
                    >
                  </label>
                  <UButton
                    type="button"
                    icon="i-heroicons-bell-alert"
                    color="success"
                    :disabled="!canRequestManager"
                    :loading="assistanceStatus === 'submitting'"
                    @click="requestManagerAssistance"
                  >
                    Privolať správcu
                  </UButton>
                  <p class="text-xs text-foreground-muted">
                    Správca dostane upozornenie. Jeho odpoveď sa zobrazí tu automaticky.
                  </p>
                </div>

                <DataStatusNotice
                  v-if="assistanceStatus === 'error' && assistanceMessage"
                  class="mt-3"
                  :description="assistanceMessage"
                  icon="i-heroicons-exclamation-triangle"
                  title="Správcu sa nepodarilo privolať"
                  tone="error"
                />
              </div>
              <label class="block">
                <span class="text-sm font-semibold">Nástraha</span>
                <input
                  v-model="catchForm.bait"
                  placeholder="boilies, kukurica, pelety..."
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Čas úlovku</span>
                <input
                  v-model="catchForm.caughtAt"
                  type="datetime-local"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
              </label>
              <label class="flex items-center gap-2 rounded-md bg-muted p-3 text-sm font-semibold">
                <input v-model="catchForm.released" type="checkbox" class="h-4 w-4 accent-primary-700">
                Ryba bola pustená späť
              </label>
              <label class="block">
                <span class="text-sm font-semibold">Fotka</span>
                <input
                  type="file"
                  accept="image/*"
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  @change="handleCatchPhotoChange"
                >
              </label>
              <div
                v-if="catchPhotoDraft"
                class="grid gap-3 rounded-md border border-primary-200 bg-primary-50 p-3 sm:grid-cols-[88px_1fr]"
              >
                <img
                  :src="catchPhotoDraft.previewUrl"
                  alt="Náhľad fotky úlovku"
                  class="h-20 w-full rounded-md object-cover sm:w-20"
                >
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-primary-950">{{ catchPhotoDraft.fileName }}</p>
                  <p class="mt-1 text-xs text-primary-800">
                    {{ formatFileSize(catchPhotoDraft.sizeBytes) }} · pripravené na uloženie
                  </p>
                  <p class="mt-2 text-xs text-primary-700">
                    Fotka sa zverejní až po schválení úlovku správcom.
                  </p>
                  <button
                    type="button"
                    class="mt-2 text-xs font-bold text-primary-900 underline"
                    @click="clearCatchPhoto"
                  >
                    Odobrať fotku
                  </button>
                </div>
              </div>
              <ValidationSummary
                :messages="catchValidationMessages"
                valid-title="Úlovok je pripravený"
                valid-description="Záznam má miesto, rybára, rozmery, nástrahu a čas."
              />

              <DataStatusNotice
                v-if="catchSubmitMessage"
                :description="catchSubmitMessage"
                :loading="catchSubmitStatus === 'submitting'"
                :title="
                  catchSubmitStatus === 'error'
                    ? 'Úlovok sa nepodarilo uložiť'
                    : catchSubmitStatus === 'submitting'
                      ? 'Odosielam úlovok'
                      : 'Úlovok je uložený'
                "
                :tone="
                  catchSubmitStatus === 'error'
                    ? 'error'
                    : catchSubmitStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

              <UButton
                type="submit"
                icon="i-heroicons-plus"
                block
                :disabled="!catchValidation.success || !!catchPhotoError || catchSubmitStatus === 'submitting'"
                :loading="catchSubmitStatus === 'submitting'"
              >
                Uložiť úlovok
              </UButton>
            </form>
          </div>

          <div v-if="!isAnglerLoggedIn && !activeLogbook" class="border-border bg-primary-900 rounded-card border p-5 text-white">
            <UIcon name="i-heroicons-lock-closed" class="h-7 w-7 text-accent-300" />
            <h2 class="mt-4 text-xl font-bold">Vlastný rybársky denník</h2>
            <p class="mt-2 text-sm text-white/75">
              Po prihlásení môžete vytvárať výpravy, zapisovať úlovky a vrátiť sa k celej svojej histórii.
            </p>
            <UButton
              :to="{ path: '/login', query: { redirect: '/ulovky' } }"
              color="warning"
              icon="i-heroicons-arrow-right-on-rectangle"
              class="mt-5"
            >
              Prihlásiť sa
            </UButton>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
