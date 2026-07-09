<script setup lang="ts">
import type { LakeSlug } from '~/data/pond'
import {
  createDefaultFishRegistrySettings,
  FISH_MANAGER_CALL_THRESHOLD_KG,
  fishManagerWeekdayOptions,
  fishManagerContactModeLabels,
  formatFishManagerAvailability,
  getFishLargeCatchRule,
  getFishManagerAvailability,
  fishObservationSourceLabels,
  fishRegistryStatusLabels,
  fishTaggingContextLabels,
  getFishObservations,
  searchFishRegistry,
  type FishObservationMutationSuccess,
  type FishCatchCandidate,
  type FishCatchCandidateResponse,
  type FishLargeCatchRule,
  type FishManagerPresenceMutationSuccess,
  type FishRegistryImportSuccess,
  type FishRegistryMutationSuccess,
  type FishRegistrySettingsMutationSuccess,
  type FishRegistryStateResponse,
  type FishRegistryStatus,
  type FishRegistryUpdateSuccess,
} from '~/services/fishRegistryService'
import type {
  LargeFishAssistanceRequest,
  LargeFishAssistanceMutationSuccess,
  LargeFishAssistanceStateResponse,
} from '~/services/largeFishAssistanceService'
import { largeFishAssistanceStatusLabels } from '~/services/largeFishAssistanceService'

useHead({ title: 'Register čipovaných rýb' })

const { getLakeName, getPegLabel, lakes, pegs } = usePondData()
const { canManage, canOperate, isReadOnly, label: accessLabel, readOnlyMessage } = useAdminModuleAccess('fish')
const requestFetch = useRequestFetch()
const route = useRoute()
const defaultSettings = createDefaultFishRegistrySettings()
type NoticeTone = 'error' | 'info' | 'success' | 'warning'

const fallbackRegistryState = (): FishRegistryStateResponse => ({
  fish: [],
  observations: [],
  ok: true,
  settings: defaultSettings,
  updatedAt: '',
})
const fallbackCandidateState = (): FishCatchCandidateResponse => ({
  candidates: [],
  ok: true,
  settings: defaultSettings,
  thresholdKg: FISH_MANAGER_CALL_THRESHOLD_KG,
  updatedAt: '',
})
const fallbackAssistanceState = (): LargeFishAssistanceStateResponse => ({
  ok: true,
  requests: [],
  updatedAt: '',
})

const { data: registryState, refresh } = await useAsyncData<FishRegistryStateResponse>(
  'admin-fish-registry-state',
  () => requestFetch<FishRegistryStateResponse>('/api/admin/fish-registry'),
  {
    default: fallbackRegistryState,
  },
)
const { data: candidateState, refresh: refreshCandidates } = await useAsyncData<FishCatchCandidateResponse>(
  'admin-fish-registry-candidates',
  () => requestFetch<FishCatchCandidateResponse>('/api/admin/fish-registry/candidates'),
  {
    default: fallbackCandidateState,
  },
)
const { data: assistanceState, refresh: refreshAssistance } = await useAsyncData<LargeFishAssistanceStateResponse>(
  'admin-large-fish-assistance',
  () => requestFetch<LargeFishAssistanceStateResponse>('/api/admin/large-fish-assistance'),
  {
    default: fallbackAssistanceState,
  },
)

const searchQuery = ref('')
const lakeFilter = ref<'all' | LakeSlug>('all')
const statusFilter = ref<'all' | FishRegistryStatus>('all')
const selectedFishId = ref(registryState.value.fish[0]?.id ?? '')
const activePanel = ref<'assistance' | 'candidate' | 'edit' | 'measurement' | 'register' | 'import' | 'settings' | ''>('')
const chipScanInput = ref('')
const chipScanMessage = ref('')
const chipScanStatus = ref<'error' | 'found' | 'idle' | 'new'>('idle')
const lastScannedChipCode = ref('')
const activeCandidateId = ref('')
const openedQueryCandidateId = ref('')
const candidateFishId = ref('')
const candidateNeedsObservationPeg = ref(false)
const candidateNeedsRegistrationPeg = ref(false)
const activeAssistanceId = ref('')
const assistanceFishId = ref('')
const mutationStatus = ref<'error' | 'idle' | 'submitting' | 'success' | 'warning'>('idle')
const mutationMessage = ref('')
const importFileName = ref('')
const importCsv = ref('')
const settingsForm = reactive(createDefaultFishRegistrySettings())
const currentAvailabilityTime = ref(new Date())
const presenceDurationHours = reactive<Record<LakeSlug, number>>({
  'strkovisko-kocka': 4,
  'velky-cetin': 4,
})
const bulkPresenceDurationHours = ref(4)
const selectedPresenceLakes = ref<LakeSlug[]>(lakes.map((lake) => lake.slug))
const presenceSubmitKey = ref<string>('')
const assistanceSubmitId = ref('')
const assistanceEtaMinutes = reactive<Record<string, number>>({})
const assistancePanelElement = ref<HTMLElement | null>(null)
const editFormElement = ref<HTMLElement | null>(null)
const measurementFormElement = ref<HTMLElement | null>(null)
const registrationFormElement = ref<HTMLElement | null>(null)
let availabilityTimer: ReturnType<typeof setInterval> | undefined
let assistanceTimer: ReturnType<typeof setInterval> | undefined

const registrationForm = reactive({
  anglerName: '',
  bait: '',
  catchId: '',
  chipCode: '',
  lake: 'velky-cetin' as LakeSlug,
  name: '',
  notes: '',
  observationSource: 'manager' as 'manager' | 'public-catch' | 'tournament',
  species: 'Kapor',
  status: 'active' as FishRegistryStatus,
  taggedAt: new Date().toISOString().slice(0, 16),
  taggedLengthCm: undefined as number | undefined,
  taggedPegId: '',
  taggedWeightKg: undefined as number | undefined,
  taggerName: 'Správca revíru',
  taggingContext: 'capture' as 'capture' | 'routine' | 'tournament',
  tournamentCatchId: '',
})

const observationForm = reactive({
  anglerName: '',
  bait: '',
  catchId: '',
  chipReadBy: 'Správca revíru',
  lake: 'velky-cetin' as LakeSlug,
  lengthCm: undefined as number | undefined,
  notes: '',
  observedAt: new Date().toISOString().slice(0, 16),
  pegId: '',
  source: 'manager' as 'manager' | 'public-catch' | 'tournament',
  tournamentCatchId: '',
  weightKg: undefined as number | undefined,
})

const editForm = reactive({
  changeNote: '',
  name: '',
  notes: '',
  species: '',
  status: 'active' as FishRegistryStatus,
})
const editOriginalStatus = ref<FishRegistryStatus>('active')

const filteredFish = computed(() =>
  searchFishRegistry(registryState.value.fish, searchQuery.value)
    .filter((fish) => lakeFilter.value === 'all' || fish.lake === lakeFilter.value)
    .filter((fish) => statusFilter.value === 'all' || fish.status === statusFilter.value)
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
)
const activeCandidate = computed(() =>
  candidateState.value.candidates.find((candidate) => candidate.id === activeCandidateId.value),
)
const activeAssistance = computed(() =>
  assistanceState.value.requests.find((request) => request.id === activeAssistanceId.value),
)
const activeLargeCatchRules = computed(() =>
  candidateState.value.settings.largeCatchRules.filter((rule) => rule.enabled),
)
const openAssistanceRequests = computed(() =>
  assistanceState.value.requests
    .filter((request) => ['waiting', 'on-route'].includes(request.status))
    .sort((first, second) => {
      const focusedId = typeof route.query.privolanie === 'string' ? route.query.privolanie : ''
      if (first.id === focusedId) return -1
      if (second.id === focusedId) return 1
      return second.createdAt.localeCompare(first.createdAt)
    }),
)

const selectedFish = computed(() =>
  registryState.value.fish.find((fish) => fish.id === selectedFishId.value)
  ?? filteredFish.value[0],
)
const lastScannedFish = computed(() =>
  lastScannedChipCode.value
    ? registryState.value.fish.find((fish) => normalizeChipScanValue(fish.chipCode) === lastScannedChipCode.value)
    : undefined,
)
const editStatusChanged = computed(() => editForm.status !== editOriginalStatus.value)
const measurementDisabled = computed(() =>
  selectedFish.value?.status === 'dead' || selectedFish.value?.status === 'transferred',
)
const chipScanNoticeTitle = computed(() => {
  if (chipScanStatus.value === 'error') return 'Čip sa nepodarilo načítať'
  if (chipScanStatus.value === 'found') return 'Čip je v registri'
  if (chipScanStatus.value === 'new') return 'Nový čip'
  return 'Výsledok čítačky'
})
const chipScanNoticeTone = computed<NoticeTone>(() => {
  if (chipScanStatus.value === 'error') return 'error'
  if (chipScanStatus.value === 'found') return 'success'
  return 'warning'
})
const mutationNoticeTitle = computed(() => {
  if (mutationStatus.value === 'error') return 'Akciu sa nepodarilo dokončiť'
  if (mutationStatus.value === 'warning') return 'Akcia je dokončená s upozornením'
  if (mutationStatus.value === 'submitting') return 'Spracúvam požiadavku'
  return 'Akcia je uložená'
})
const mutationNoticeTone = computed<NoticeTone>(() => {
  if (mutationStatus.value === 'error') return 'error'
  if (mutationStatus.value === 'warning') return 'warning'
  if (mutationStatus.value === 'submitting') return 'info'
  return 'success'
})

const selectedObservations = computed(() =>
  selectedFish.value
    ? getFishObservations(selectedFish.value.id, registryState.value.observations)
    : [],
)

const latestObservation = computed(() => selectedObservations.value.at(-1))
const firstObservation = computed(() => selectedObservations.value[0])
const weightDelta = computed(() =>
  latestObservation.value && firstObservation.value
    ? latestObservation.value.weightKg - firstObservation.value.weightKg
    : 0,
)
const lengthDelta = computed(() =>
  latestObservation.value && firstObservation.value
    ? latestObservation.value.lengthCm - firstObservation.value.lengthCm
    : 0,
)
const fishWithRepeatedCaptureCount = computed(() =>
  registryState.value.fish.filter((fish) =>
    registryState.value.observations.filter((item) => item.fishId === fish.id).length > 1,
  ).length,
)
const latestObservationAt = computed(() =>
  [...registryState.value.observations]
    .sort((first, second) => second.observedAt.localeCompare(first.observedAt))[0]?.observedAt,
)

const registrationPegs = computed(() =>
  pegs.filter((peg) => peg.lake === registrationForm.lake),
)
const observationPegs = computed(() =>
  pegs.filter((peg) => peg.lake === observationForm.lake),
)

onMounted(() => {
  availabilityTimer = setInterval(() => {
    currentAvailabilityTime.value = new Date()
  }, 60_000)
  assistanceTimer = setInterval(() => {
    void refreshAssistance()
  }, 10_000)
})

onBeforeUnmount(() => {
  if (availabilityTimer) clearInterval(availabilityTimer)
  if (assistanceTimer) clearInterval(assistanceTimer)
})

watch(filteredFish, (items) => {
  if (!items.some((item) => item.id === selectedFishId.value)) {
    selectedFishId.value = items[0]?.id ?? ''
  }
})

watch(openAssistanceRequests, (requests) => {
  for (const request of requests) {
    assistanceEtaMinutes[request.id] ??= 15
  }
}, { immediate: true })

watch(() => registrationForm.lake, () => {
  if (candidateNeedsRegistrationPeg.value) {
    registrationForm.taggedPegId = ''
    return
  }
  if (!registrationPegs.value.some((peg) => peg.id === registrationForm.taggedPegId)) {
    registrationForm.taggedPegId = registrationPegs.value[0]?.id ?? ''
  }
}, { immediate: true })

watch(() => observationForm.lake, () => {
  if (candidateNeedsObservationPeg.value) {
    observationForm.pegId = ''
    return
  }
  if (!observationPegs.value.some((peg) => peg.id === observationForm.pegId)) {
    observationForm.pegId = observationPegs.value[0]?.id ?? ''
  }
}, { immediate: true })

watch(selectedFish, (fish) => {
  if (!fish) return
  observationForm.lake = fish.lake
  if (activePanel.value === 'edit') populateEditForm(fish)
}, { immediate: true })

watch(
  () => registryState.value.settings,
  (settings) => {
    settingsForm.largeCatchRules.splice(
      0,
      settingsForm.largeCatchRules.length,
      ...(settings ?? defaultSettings).largeCatchRules.map((rule) => ({
        ...rule,
        availabilityWindows: rule.availabilityWindows.map((window) => ({
          ...window,
          daysOfWeek: [...window.daysOfWeek],
        })),
      })),
    )
  },
  { immediate: true },
)

watch(
  [() => route.query.catchId, () => candidateState.value.candidates],
  ([catchId, candidates]) => {
    const normalizedCatchId = typeof catchId === 'string' ? catchId : ''
    if (!normalizedCatchId || openedQueryCandidateId.value === normalizedCatchId) return

    const candidate = candidates.find((item) => item.catchId === normalizedCatchId)
    if (!candidate) return

    openedQueryCandidateId.value = normalizedCatchId
    openCandidate(candidate)
  },
  { immediate: true },
)

function getApiErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as {
    data?: {
      data?: { messages?: string[] }
      message?: string
    }
    message?: string
  }
  const messages = maybeError.data?.data?.messages
  return Array.isArray(messages) && messages.length > 0
    ? messages.join(' ')
    : maybeError.data?.message ?? maybeError.message ?? fallback
}

function formatDateTime(value?: string) {
  if (!value) return 'bez záznamu'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value

  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed))
}

function toDateTimeInput(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return new Date().toISOString().slice(0, 16)

  const date = new Date(parsed)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function formatDelta(value: number, unit: string) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)} ${unit}`
}

function measurementCountLabel(count: number) {
  if (count === 1) return '1 meranie'
  if (count >= 2 && count <= 4) return `${count} merania`
  return `${count} meraní`
}

function resultCountLabel(count: number) {
  if (count === 1) return '1 výsledok'
  if (count >= 2 && count <= 4) return `${count} výsledky`
  return `${count} výsledkov`
}

function assistanceWaitLabel(createdAt: string) {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return 'čas neznámy'

  const minutes = Math.max(0, Math.floor((currentAvailabilityTime.value.getTime() - created) / 60_000))
  if (minutes < 1) return 'práve teraz'
  return `čaká ${minutes} min`
}

function formatWeightKg(value: number) {
  return `${value.toLocaleString('sk-SK', { maximumFractionDigits: 1 })} kg`
}

function normalizeChipScanValue(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

function phoneHref(value: string) {
  return `tel:${value.replace(/\s+/g, '')}`
}

function assistanceStatusTone(request: LargeFishAssistanceRequest) {
  if (request.status === 'on-route') return 'success'
  return 'warning'
}

function assistanceNextStep(request: LargeFishAssistanceRequest) {
  if (request.status === 'on-route') {
    return request.etaMinutes
      ? `Príchod potvrdený do ${request.etaMinutes} min. Po príchode načítajte čip alebo založte novú rybu.`
      : 'Príchod je potvrdený. Po príchode načítajte čip alebo založte novú rybu.'
  }

  return 'Rybár ešte nemá odpoveď. Vyberte ETA a potvrďte príchod, alebo dajte pokyn pustiť rybu bez správcu.'
}

function statusTone(status: FishRegistryStatus) {
  if (status === 'active') return 'success'
  if (status === 'missing') return 'warning'
  if (status === 'dead') return 'error'
  return 'muted'
}

function resetMessage() {
  mutationStatus.value = 'idle'
  mutationMessage.value = ''
}

function resetChipScan() {
  chipScanInput.value = ''
  chipScanMessage.value = ''
  chipScanStatus.value = 'idle'
  lastScannedChipCode.value = ''
}

function populateEditForm(fish: NonNullable<typeof selectedFish.value>) {
  editForm.changeNote = ''
  editForm.name = fish.name
  editForm.notes = fish.notes
  editForm.species = fish.species
  editForm.status = fish.status
  editOriginalStatus.value = fish.status
}

function applyRegistryState(result: FishRegistryStateResponse) {
  registryState.value = {
    fish: result.fish,
    observations: result.observations,
    ok: true,
    settings: result.settings ?? registryState.value.settings ?? defaultSettings,
    updatedAt: result.updatedAt,
  }
}

function candidateSourceLabel(candidate: FishCatchCandidate) {
  return candidate.source === 'tournament' ? 'súťažný úlovok' : 'bežný úlovok'
}

function candidateLocationLabel(candidate: FishCatchCandidate) {
  return candidate.pegId ? getPegLabel(candidate.pegId) : candidate.locationLabel
}

function candidateAvailability(candidate: FishCatchCandidate) {
  const rule = getFishLargeCatchRule(candidate.lake, candidateState.value.settings)
  return rule ? getFishManagerAvailability(rule, candidate.caughtAt) : undefined
}

function liveManagerAvailability(rule: FishLargeCatchRule) {
  return getFishManagerAvailability(rule, currentAvailabilityTime.value)
}

function managerPresenceTitle(rule: FishLargeCatchRule) {
  const availability = liveManagerAvailability(rule)
  if (availability.source === 'presence') return 'Správca potvrdil, že je tu'
  if (availability.source === 'schedule') return 'Dostupný podľa rozpisu'
  return 'Teraz nie je v službe'
}

function managerPresenceDescription(rule: FishLargeCatchRule) {
  const availability = liveManagerAvailability(rule)
  if (availability.presenceOverride) {
    return `Do ${formatDateTime(availability.presenceOverride.endsAt)} · ${availability.presenceOverride.setBy}`
  }
  if (availability.matchingWindow) return availability.matchingWindow.label
  return 'Rybár pri veľkej rybe uvidí pokyn mimo služby správcu.'
}

function managerPresenceTone(rule: FishLargeCatchRule): NoticeTone {
  return liveManagerAvailability(rule).available ? 'success' : 'info'
}

async function toggleManagerPresence(rule: FishLargeCatchRule) {
  if (!canManage.value) return
  const availability = liveManagerAvailability(rule)
  const action = availability.source === 'presence' ? 'stop' : 'start'
  await setManagerPresence(
    action,
    [rule.lake],
    presenceDurationHours[rule.lake],
    rule.lake,
  )
}

async function setManagerPresence(
  action: 'start' | 'stop',
  selectedLakes: LakeSlug[],
  durationHours: number,
  submitKey = 'bulk',
) {
  if (!canManage.value || selectedLakes.length === 0) return
  presenceSubmitKey.value = submitKey
  resetMessage()

  try {
    const result = await $fetch<FishManagerPresenceMutationSuccess>('/api/admin/fish-registry/presence', {
      body: {
        action,
        durationHours,
        lakes: selectedLakes,
      },
      method: 'POST',
    })
    registryState.value = {
      ...registryState.value,
      settings: result.settings,
      updatedAt: result.updatedAt,
    }
    candidateState.value = {
      ...candidateState.value,
      settings: result.settings,
      updatedAt: result.updatedAt,
    }
    currentAvailabilityTime.value = new Date()
    mutationStatus.value = 'success'
    mutationMessage.value = result.message
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Dostupnosť správcu sa nepodarilo zmeniť.')
  }
  finally {
    presenceSubmitKey.value = ''
  }
}

async function respondToAssistance(
  requestId: string,
  action: 'completed' | 'on-route' | 'release-without-manager',
) {
  if (!canOperate.value) return

  assistanceSubmitId.value = requestId
  resetMessage()

  try {
    const result = await $fetch<LargeFishAssistanceMutationSuccess>(
      `/api/admin/large-fish-assistance/${encodeURIComponent(requestId)}/respond`,
      {
        body: {
          action,
          etaMinutes: action === 'on-route' ? (assistanceEtaMinutes[requestId] ?? 15) : undefined,
          responseMessage: '',
        },
        method: 'POST',
      },
    )
    assistanceState.value = {
      ok: true,
      requests: result.requests,
      updatedAt: new Date().toISOString(),
    }
    mutationStatus.value = 'success'
    mutationMessage.value = result.message
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Odpoveď rybárovi sa nepodarilo uložiť.')
  }
  finally {
    assistanceSubmitId.value = ''
  }
}

function addAvailabilityWindow(lake: LakeSlug) {
  const rule = settingsForm.largeCatchRules.find((item) => item.lake === lake)
  if (!rule) return

  rule.availabilityWindows.push({
    daysOfWeek: [6, 0],
    endsAt: '18:00',
    id: `service-${Date.now()}`,
    label: 'Ďalšia služba',
    startsAt: '07:00',
  })
}

function removeAvailabilityWindow(lake: LakeSlug, windowId: string) {
  const rule = settingsForm.largeCatchRules.find((item) => item.lake === lake)
  if (!rule || rule.availabilityWindows.length <= 1) return

  rule.availabilityWindows = rule.availabilityWindows.filter((window) => window.id !== windowId)
}

function resetCandidateContext() {
  activeCandidateId.value = ''
  candidateFishId.value = ''
  candidateNeedsObservationPeg.value = false
  candidateNeedsRegistrationPeg.value = false
  registrationForm.catchId = ''
  registrationForm.tournamentCatchId = ''
  registrationForm.observationSource = 'manager'
}

function resetAssistanceContext() {
  activeAssistanceId.value = ''
  assistanceFishId.value = ''
}

function closeActivePanel() {
  activePanel.value = ''
  resetCandidateContext()
  resetAssistanceContext()
}

function processChipScan() {
  const chipCode = normalizeChipScanValue(chipScanInput.value)
  chipScanInput.value = chipCode
  lastScannedChipCode.value = chipCode

  if (chipCode.length < 6) {
    chipScanStatus.value = 'error'
    chipScanMessage.value = 'Zadajte aspoň 6 znakov čísla čipu.'
    return
  }

  const fishRecord = registryState.value.fish.find((fish) => normalizeChipScanValue(fish.chipCode) === chipCode)
  if (fishRecord) {
    selectedFishId.value = fishRecord.id
    searchQuery.value = chipCode
    lakeFilter.value = 'all'
    statusFilter.value = 'all'
    chipScanStatus.value = 'found'
    chipScanMessage.value = `Čip patrí rybe ${fishRecord.name || fishRecord.species}.`
    return
  }

  chipScanStatus.value = 'new'
  chipScanMessage.value = `Čip ${chipCode} ešte nie je v registri.`
}

async function openScannedFishMeasurement() {
  const fishRecord = lastScannedFish.value
  if (!fishRecord || !canOperate.value || measurementDisabled.value) return

  selectedFishId.value = fishRecord.id
  if (activePanel.value === 'assistance' && activeAssistance.value) {
    assistanceFishId.value = fishRecord.id
    await prepareAssistanceObservation()
    return
  }
  if (activePanel.value === 'candidate' && activeCandidate.value) {
    candidateFishId.value = fishRecord.id
    await prepareCandidateObservation()
    return
  }

  resetMessage()
  resetCandidateContext()
  resetAssistanceContext()
  candidateNeedsObservationPeg.value = false
  observationForm.lake = fishRecord.lake
  observationForm.observedAt = toDateTimeInput(new Date().toISOString())
  activePanel.value = 'measurement'
  await nextTick()
  measurementFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function openScannedFishRegistration() {
  if (!lastScannedChipCode.value || !canOperate.value) return

  if (activePanel.value === 'assistance' && activeAssistance.value) {
    await prepareAssistanceRegistration()
    registrationForm.chipCode = lastScannedChipCode.value
    return
  }
  if (activePanel.value === 'candidate' && activeCandidate.value) {
    await prepareCandidateRegistration()
    registrationForm.chipCode = lastScannedChipCode.value
    return
  }

  resetMessage()
  resetCandidateContext()
  resetAssistanceContext()
  registrationForm.anglerName = ''
  registrationForm.bait = ''
  registrationForm.catchId = ''
  registrationForm.chipCode = lastScannedChipCode.value
  registrationForm.lake = lakeFilter.value === 'all'
    ? selectedFish.value?.lake ?? lakes[0]?.slug ?? 'velky-cetin'
    : lakeFilter.value
  registrationForm.name = ''
  registrationForm.notes = ''
  registrationForm.observationSource = 'manager'
  registrationForm.species = 'Kapor'
  registrationForm.status = 'active'
  registrationForm.taggedAt = toDateTimeInput(new Date().toISOString())
  registrationForm.taggedLengthCm = undefined
  registrationForm.taggedWeightKg = undefined
  registrationForm.taggerName = 'Správca revíru'
  registrationForm.taggingContext = 'capture'
  registrationForm.tournamentCatchId = ''
  activePanel.value = 'register'
  await nextTick()
  registrationForm.taggedPegId = registrationPegs.value[0]?.id ?? ''
  registrationFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function openFishEdit() {
  if (!canOperate.value || !selectedFish.value) return

  resetMessage()
  resetCandidateContext()
  resetAssistanceContext()
  populateEditForm(selectedFish.value)
  activePanel.value = 'edit'
  await nextTick()
  editFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function assistanceNotes(request: LargeFishAssistanceRequest) {
  return [
    request.note,
    `Spracované z privolania správcu ${request.id}.`,
  ].filter(Boolean).join('\n')
}

async function openAssistanceProcessing(request: LargeFishAssistanceRequest) {
  resetMessage()
  resetCandidateContext()
  activeAssistanceId.value = request.id
  assistanceFishId.value = ''
  activePanel.value = 'assistance'
  await nextTick()
  assistancePanelElement.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function openCandidate(candidate: FishCatchCandidate) {
  resetMessage()
  resetAssistanceContext()
  activeCandidateId.value = candidate.id
  candidateFishId.value = ''
  activePanel.value = 'candidate'
  await nextTick()
}

async function prepareCandidateObservation() {
  const candidate = activeCandidate.value
  if (!candidate || !candidateFishId.value) return

  selectedFishId.value = candidateFishId.value
  candidateNeedsObservationPeg.value = !candidate.pegId
  observationForm.anglerName = candidate.anglerName
  observationForm.bait = candidate.bait
  observationForm.catchId = candidate.catchId ?? ''
  observationForm.lake = candidate.lake
  observationForm.lengthCm = candidate.lengthCm
  observationForm.notes = candidate.sectorId
    ? `${candidate.notes}\nPôvodný súťažný sektor: ${candidate.locationLabel}.`.trim()
    : candidate.notes
  observationForm.observedAt = toDateTimeInput(candidate.caughtAt)
  observationForm.pegId = candidate.pegId ?? ''
  observationForm.source = candidate.source
  observationForm.tournamentCatchId = candidate.tournamentCatchId ?? ''
  observationForm.weightKg = candidate.weightKg
  await nextTick()
  if (!candidate.pegId) observationForm.pegId = ''
  activePanel.value = 'measurement'
}

async function prepareCandidateRegistration() {
  const candidate = activeCandidate.value
  if (!candidate) return

  candidateNeedsRegistrationPeg.value = !candidate.pegId
  registrationForm.catchId = candidate.catchId ?? ''
  registrationForm.anglerName = candidate.anglerName
  registrationForm.bait = candidate.bait
  registrationForm.lake = candidate.lake
  registrationForm.name = ''
  registrationForm.notes = candidate.sectorId
    ? `${candidate.notes}\nPôvodný súťažný sektor: ${candidate.locationLabel}.`.trim()
    : candidate.notes
  registrationForm.observationSource = candidate.source
  registrationForm.species = candidate.species
  registrationForm.status = 'active'
  registrationForm.taggedAt = toDateTimeInput(candidate.caughtAt)
  registrationForm.taggedLengthCm = candidate.lengthCm
  registrationForm.taggedPegId = candidate.pegId ?? ''
  registrationForm.taggedWeightKg = candidate.weightKg
  registrationForm.taggingContext = candidate.source === 'tournament' ? 'tournament' : 'capture'
  registrationForm.tournamentCatchId = candidate.tournamentCatchId ?? ''
  await nextTick()
  if (!candidate.pegId) registrationForm.taggedPegId = ''
  activePanel.value = 'register'
  await nextTick()
  registrationFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function prepareAssistanceObservation() {
  const request = activeAssistance.value
  if (!request || !assistanceFishId.value) return

  selectedFishId.value = assistanceFishId.value
  candidateNeedsObservationPeg.value = false
  await nextTick()
  observationForm.anglerName = request.anglerName
  observationForm.bait = ''
  observationForm.catchId = ''
  observationForm.lake = request.lake
  observationForm.lengthCm = request.lengthCm
  observationForm.notes = assistanceNotes(request)
  observationForm.observedAt = toDateTimeInput(request.caughtAt)
  observationForm.pegId = request.pegId
  observationForm.source = 'manager'
  observationForm.tournamentCatchId = ''
  observationForm.weightKg = request.weightKg
  activePanel.value = 'measurement'
  await nextTick()
  measurementFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function prepareAssistanceRegistration() {
  const request = activeAssistance.value
  if (!request) return

  candidateNeedsRegistrationPeg.value = false
  registrationForm.anglerName = request.anglerName
  registrationForm.bait = ''
  registrationForm.catchId = ''
  registrationForm.chipCode = ''
  registrationForm.lake = request.lake
  registrationForm.name = ''
  registrationForm.notes = assistanceNotes(request)
  registrationForm.observationSource = 'manager'
  registrationForm.species = request.species
  registrationForm.status = 'active'
  registrationForm.taggedAt = toDateTimeInput(request.caughtAt)
  registrationForm.taggedLengthCm = request.lengthCm
  registrationForm.taggedPegId = request.pegId
  registrationForm.taggedWeightKg = request.weightKg
  registrationForm.taggingContext = 'capture'
  registrationForm.tournamentCatchId = ''
  activePanel.value = 'register'
  await nextTick()
  registrationFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function completeLinkedAssistance(requestId: string, savedMessage: string) {
  if (!requestId) {
    mutationStatus.value = 'success'
    mutationMessage.value = savedMessage
    return
  }

  assistanceSubmitId.value = requestId
  try {
    const result = await $fetch<LargeFishAssistanceMutationSuccess>(
      `/api/admin/large-fish-assistance/${encodeURIComponent(requestId)}/respond`,
      {
        body: {
          action: 'completed',
          responseMessage: 'Kontrola ryby a zápis čipu boli dokončené.',
        },
        method: 'POST',
      },
    )
    assistanceState.value = {
      ok: true,
      requests: result.requests,
      updatedAt: new Date().toISOString(),
    }
    mutationStatus.value = 'success'
    mutationMessage.value = `${savedMessage} Privolanie bolo uzavreté.`
  }
  catch (error) {
    mutationStatus.value = 'warning'
    mutationMessage.value = `${savedMessage} Privolanie ostalo otvorené: ${getApiErrorMessage(error, 'nepodarilo sa ho uzavrieť')}`
  }
  finally {
    assistanceSubmitId.value = ''
    resetAssistanceContext()
  }
}

async function submitRegistration() {
  if (!canOperate.value) return
  mutationStatus.value = 'submitting'
  mutationMessage.value = ''
  const linkedAssistanceId = activeAssistanceId.value

  try {
    const result = await $fetch<FishRegistryMutationSuccess>('/api/admin/fish-registry', {
      body: registrationForm,
      method: 'POST',
    })
    applyRegistryState(result)
    selectedFishId.value = result.fishRecord.id
    await refreshCandidates()
    resetCandidateContext()
    await completeLinkedAssistance(linkedAssistanceId, result.message)
    activePanel.value = ''
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Rybu sa nepodarilo pridať.')
  }
}

async function submitObservation() {
  if (!canOperate.value || !selectedFish.value) return
  mutationStatus.value = 'submitting'
  mutationMessage.value = ''
  const linkedAssistanceId = activeAssistanceId.value

  try {
    const result = await $fetch<FishObservationMutationSuccess>(
      `/api/admin/fish-registry/${selectedFish.value.id}/observations`,
      {
        body: observationForm,
        method: 'POST',
      },
    )
    applyRegistryState(result)
    await refreshCandidates()
    resetCandidateContext()
    await completeLinkedAssistance(linkedAssistanceId, result.message)
    activePanel.value = ''
    observationForm.weightKg = undefined
    observationForm.lengthCm = undefined
    observationForm.bait = ''
    observationForm.anglerName = ''
    observationForm.notes = ''
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Meranie sa nepodarilo uložiť.')
  }
}

async function submitFishEdit() {
  if (!canOperate.value || !selectedFish.value) return
  mutationStatus.value = 'submitting'
  mutationMessage.value = ''
  const fishId = selectedFish.value.id

  try {
    const result = await $fetch<FishRegistryUpdateSuccess>(
      `/api/admin/fish-registry/${encodeURIComponent(fishId)}`,
      {
        body: editForm,
        method: 'PATCH',
      },
    )
    applyRegistryState(result)
    selectedFishId.value = result.fishRecord.id
    mutationStatus.value = 'success'
    mutationMessage.value = result.message
    activePanel.value = ''
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Údaje ryby sa nepodarilo uložiť.')
  }
}

async function readImportFile(event: Event) {
  resetMessage()
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    importCsv.value = ''
    importFileName.value = ''
    return
  }

  importFileName.value = file.name
  importCsv.value = await file.text()
}

async function submitImport() {
  if (!canManage.value || !importCsv.value) return
  mutationStatus.value = 'submitting'
  mutationMessage.value = ''

  try {
    const result = await $fetch<FishRegistryImportSuccess>('/api/admin/fish-registry/import', {
      body: { csv: importCsv.value },
      method: 'POST',
    })
    applyRegistryState(result)
    mutationStatus.value = 'success'
    mutationMessage.value = `${result.message} Preskočené duplicity: ${result.skippedObservationCount}.`
    activePanel.value = ''
    importCsv.value = ''
    importFileName.value = ''
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Import registra zlyhal.')
  }
}

async function submitSettings() {
  if (!canManage.value) return
  mutationStatus.value = 'submitting'
  mutationMessage.value = ''

  try {
    const result = await $fetch<FishRegistrySettingsMutationSuccess>('/api/admin/fish-registry/settings', {
      body: settingsForm,
      method: 'POST',
    })
    registryState.value = {
      ...registryState.value,
      settings: result.settings,
      updatedAt: result.updatedAt,
    }
    mutationStatus.value = 'success'
    mutationMessage.value = result.message
    activePanel.value = ''
    await refreshCandidates()
  }
  catch (error) {
    mutationStatus.value = 'error'
    mutationMessage.value = getApiErrorMessage(error, 'Pravidlá sa nepodarilo uložiť.')
  }
}

function openPanel(panel: typeof activePanel.value) {
  resetMessage()
  resetAssistanceContext()
  if (panel === 'register') resetCandidateContext()
  if (panel === 'measurement') {
    resetCandidateContext()
    candidateNeedsObservationPeg.value = false
  }
  activePanel.value = activePanel.value === panel ? '' : panel
}

async function refreshRegistryWorkspace() {
  await Promise.all([refresh(), refreshCandidates(), refreshAssistance()])
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Register čipovaných rýb"
      description="Identita ryby, história meraní, miesta opakovaných úlovkov a vývoj váhy či dĺžky v čase."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="isReadOnly"
        class="mb-6"
        :description="readOnlyMessage"
        icon="i-heroicons-lock-closed"
        :title="`Režim prístupu: ${accessLabel}`"
        tone="warning"
      />

      <section
        v-if="openAssistanceRequests.length"
        class="mb-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Privolania k veľkej rybe</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Rybár čaká pri rybe na jasnú odpoveď. Najprv potvrď príchod alebo pokyn na pustenie.
            </p>
          </div>
          <StatusBadge
            icon="i-heroicons-bell-alert"
            :label="`${openAssistanceRequests.length} otvorené`"
            tone="warning"
          />
        </div>

        <div class="mt-4 grid gap-3 lg:grid-cols-2">
          <article
            v-for="request in openAssistanceRequests"
            :key="request.id"
            class="rounded-md border bg-white p-4 shadow-sm"
            :class="route.query.privolanie === request.id
              ? 'border-warning-500 ring-2 ring-warning-500/20'
              : 'border-border'"
          >
            <div class="flex flex-col gap-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-2xl font-bold">
                    {{ formatWeightKg(request.weightKg) }} · {{ request.species }}
                  </p>
                  <p class="mt-1 text-sm text-foreground-muted">
                    {{ getLakeName(request.lake) }} · {{ request.pegLabel }} · {{ request.lengthCm }} cm
                  </p>
                </div>
                <div class="flex flex-wrap gap-2 sm:justify-end">
                  <StatusBadge
                    :label="largeFishAssistanceStatusLabels[request.status]"
                    :tone="assistanceStatusTone(request)"
                    size="xs"
                  />
                  <StatusBadge
                    icon="i-heroicons-clock"
                    :label="assistanceWaitLabel(request.createdAt)"
                    tone="warning"
                    size="xs"
                  />
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <DataStatusNotice
                  :description="assistanceNextStep(request)"
                  icon="i-heroicons-arrow-right-circle"
                  title="Ďalší krok"
                  tone="warning"
                />
                <UButton
                  :to="phoneHref(request.phone)"
                  icon="i-heroicons-phone"
                  color="warning"
                  variant="soft"
                >
                  {{ request.phone }}
                </UButton>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-md border border-border bg-muted px-3 py-3">
                  <p class="text-xs text-foreground-muted">Rybár</p>
                  <p class="mt-1 font-semibold">{{ request.anglerName }}</p>
                </div>
                <div class="rounded-md border border-border bg-muted px-3 py-3">
                  <p class="text-xs text-foreground-muted">Čas úlovku</p>
                  <p class="mt-1 font-semibold">{{ formatDateTime(request.caughtAt) }}</p>
                </div>
              </div>

              <DataStatusNotice
                v-if="request.responseMessage"
                :description="request.responseMessage"
                icon="i-heroicons-check-circle"
                title="Odpoveď odoslaná rybárovi"
                tone="success"
              />

              <div v-if="canOperate" class="flex flex-col gap-2 border-t border-border pt-4">
                <div v-if="request.status === 'waiting'" class="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-center">
                  <select
                    v-model.number="assistanceEtaMinutes[request.id]"
                    :aria-label="`Odhad príchodu k ${request.pegLabel}`"
                    class="h-11 rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option :value="5">do 5 min</option>
                    <option :value="10">do 10 min</option>
                    <option :value="15">do 15 min</option>
                    <option :value="20">do 20 min</option>
                    <option :value="30">do 30 min</option>
                  </select>
                  <UButton
                    icon="i-heroicons-truck"
                    color="success"
                    block
                    :loading="assistanceSubmitId === request.id"
                    @click="respondToAssistance(request.id, 'on-route')"
                  >
                    Som na ceste
                  </UButton>
                  <UButton
                    icon="i-heroicons-arrow-uturn-left"
                    color="warning"
                    variant="soft"
                    block
                    :loading="assistanceSubmitId === request.id"
                    @click="respondToAssistance(request.id, 'release-without-manager')"
                  >
                    Pustite bezomňa
                  </UButton>
                </div>

                <div v-else-if="request.status === 'on-route'" class="grid gap-2 sm:grid-cols-2">
                  <UButton
                    icon="i-heroicons-identification"
                    color="success"
                    block
                    @click="openAssistanceProcessing(request)"
                  >
                    Čip a meranie
                  </UButton>
                  <UButton
                    icon="i-heroicons-check-circle"
                    variant="soft"
                    block
                    :loading="assistanceSubmitId === request.id"
                    @click="respondToAssistance(request.id, 'completed')"
                  >
                    Uzavrieť bez merania
                  </UButton>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section
        v-if="activePanel === 'assistance' && activeAssistance"
        ref="assistancePanelElement"
        class="mb-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <StatusBadge
              icon="i-heroicons-check-circle"
              label="Správca je pri rybe"
              tone="success"
            />
            <h2 class="mt-3 text-2xl font-bold">
              {{ formatWeightKg(activeAssistance.weightKg) }} · {{ activeAssistance.species }}
            </h2>
            <p class="mt-1 text-sm text-foreground-muted">
              {{ activeAssistance.lengthCm }} cm · {{ activeAssistance.pegLabel }} ·
              {{ activeAssistance.anglerName }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="phoneHref(activeAssistance.phone)"
              icon="i-heroicons-phone"
              color="success"
              variant="soft"
            >
              Zavolať rybárovi
            </UButton>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              aria-label="Zavrieť spracovanie privolania"
              @click="closeActivePanel"
            />
          </div>
        </div>

        <div class="mt-5 grid gap-4 lg:grid-cols-2">
          <div class="rounded-md border border-border bg-white p-4">
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-identification" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
              <div class="min-w-0 flex-1">
                <h3 class="font-bold">Čip nájdený</h3>
                <p class="mt-1 text-sm text-foreground-muted">
                  Vyberte existujúcu rybu a uložte nové meranie do jej histórie.
                </p>
              </div>
            </div>

            <label class="mt-4 block space-y-1 text-sm font-semibold">
              <span>Ryba podľa čipu alebo mena</span>
              <select v-model="assistanceFishId" class="w-full rounded-md border border-border bg-white px-3 py-2">
                <option value="">Vyberte rybu</option>
                <option v-for="fish in registryState.fish" :key="fish.id" :value="fish.id">
                  {{ fish.chipCode }} · {{ fish.name || 'bez mena' }} · {{ fish.species }}
                </option>
              </select>
            </label>

            <UButton
              icon="i-heroicons-plus-circle"
              color="success"
              block
              class="mt-4"
              :disabled="!assistanceFishId"
              @click="prepareAssistanceObservation"
            >
              Zapísať meranie čipu
            </UButton>
          </div>

          <div class="rounded-md border border-border bg-white p-4">
            <div class="flex items-start gap-3">
              <UIcon name="i-heroicons-tag" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
              <div class="min-w-0 flex-1">
                <h3 class="font-bold">Čip nenájdený</h3>
                <p class="mt-1 text-sm text-foreground-muted">
                  Založte novú označenú rybu. Údaje z privolania sa predvyplnia automaticky.
                </p>
              </div>
            </div>

            <DataStatusNotice
              class="mt-4"
              description="Rybár môže navrhnúť meno ryby pri čipovaní."
              icon="i-heroicons-pencil-square"
              title="Meno ryby"
              tone="info"
            />

            <UButton icon="i-heroicons-tag" color="warning" block class="mt-4" @click="prepareAssistanceRegistration">
              Začipovať novú rybu
            </UButton>
          </div>
        </div>

        <div class="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-foreground-muted">
            Po uložení merania alebo nového čipu sa privolanie automaticky uzavrie.
          </p>
          <UButton
            icon="i-heroicons-check-circle"
            variant="soft"
            :loading="assistanceSubmitId === activeAssistance.id"
            @click="respondToAssistance(activeAssistance.id, 'completed')"
          >
            Uzavrieť bez merania
          </UButton>
        </div>
      </section>

      <section
        v-if="canManage && activeLargeCatchRules.length > 1"
        class="mb-6 border-y border-border bg-surface px-4 py-5 sm:px-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="font-bold">Rýchla dostupnosť pre viac jazier</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Pre susediace jazerá potvrď prítomnosť jednou akciou.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <label
                v-for="rule in activeLargeCatchRules"
                :key="rule.lake"
                class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold"
                :class="selectedPresenceLakes.includes(rule.lake)
                  ? 'border-primary-600 bg-primary-50 text-primary-900'
                  : 'border-border bg-white text-foreground-muted'"
              >
                <input
                  v-model="selectedPresenceLakes"
                  type="checkbox"
                  :value="rule.lake"
                  class="h-4 w-4 accent-primary-700"
                >
                {{ getLakeName(rule.lake) }}
              </label>
            </div>
          </div>

          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              v-model.number="bulkPresenceDurationHours"
              aria-label="Spoločné trvanie dostupnosti"
              class="h-10 rounded-md border border-border bg-white px-3 text-sm"
            >
              <option :value="2">na 2 hodiny</option>
              <option :value="4">na 4 hodiny</option>
              <option :value="8">na 8 hodín</option>
              <option :value="12">na 12 hodín</option>
            </select>
            <UButton
              data-testid="manager-presence-bulk-start"
              icon="i-heroicons-map-pin"
              color="success"
              :disabled="selectedPresenceLakes.length === 0"
              :loading="presenceSubmitKey === 'bulk-start'"
              @click="setManagerPresence('start', selectedPresenceLakes, bulkPresenceDurationHours, 'bulk-start')"
            >
              Som tu pre vybrané
            </UButton>
            <UButton
              data-testid="manager-presence-bulk-stop"
              icon="i-heroicons-stop-circle"
              variant="soft"
              :disabled="selectedPresenceLakes.length === 0"
              :loading="presenceSubmitKey === 'bulk-stop'"
              @click="setManagerPresence('stop', selectedPresenceLakes, bulkPresenceDurationHours, 'bulk-stop')"
            >
              Ukončiť pre vybrané
            </UButton>
          </div>
        </div>
      </section>

      <div class="mb-6 grid gap-3 lg:grid-cols-2">
        <div
          v-for="rule in activeLargeCatchRules"
          :key="rule.lake"
          :data-testid="`manager-presence-${rule.lake}`"
          class="rounded-card border border-border bg-surface p-5 text-foreground"
        >
          <div class="flex items-start gap-3">
            <UIcon
              :name="liveManagerAvailability(rule).available
                ? 'i-heroicons-check-circle'
                : 'i-heroicons-clock'"
              class="mt-0.5 h-5 w-5 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="font-bold">{{ getLakeName(rule.lake) }} · od {{ rule.thresholdKg }} kg</p>
              <p class="mt-1 text-sm text-foreground-muted">{{ rule.instruction }}</p>
              <p class="mt-2 text-xs font-bold">
                {{ fishManagerContactModeLabels[rule.contactMode] }}
                <template v-if="rule.phone"> · {{ rule.phone }}</template>
                <template v-if="rule.email"> · {{ rule.email }}</template>
              </p>
              <p class="mt-1 text-xs font-semibold">
                Služba: {{ formatFishManagerAvailability(rule) }}
              </p>
              <DataStatusNotice
                class="mt-4"
                :description="managerPresenceDescription(rule)"
                :icon="liveManagerAvailability(rule).available
                  ? 'i-heroicons-check-circle'
                  : 'i-heroicons-clock'"
                :title="managerPresenceTitle(rule)"
                :tone="managerPresenceTone(rule)"
              />

              <div v-if="canManage" class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  v-if="liveManagerAvailability(rule).source !== 'presence'"
                  v-model.number="presenceDurationHours[rule.lake]"
                  :aria-label="`Trvanie dostupnosti ${getLakeName(rule.lake)}`"
                  class="h-9 rounded-md border border-border bg-white px-3 text-sm text-foreground"
                >
                  <option :value="2">na 2 hodiny</option>
                  <option :value="4">na 4 hodiny</option>
                  <option :value="8">na 8 hodín</option>
                  <option :value="12">na 12 hodín</option>
                </select>
                <UButton
                  :data-testid="`manager-presence-toggle-${rule.lake}`"
                  size="sm"
                  :icon="liveManagerAvailability(rule).source === 'presence'
                    ? 'i-heroicons-stop-circle'
                    : 'i-heroicons-map-pin'"
                  :color="liveManagerAvailability(rule).source === 'presence' ? 'neutral' : 'success'"
                  :variant="liveManagerAvailability(rule).source === 'presence' ? 'soft' : 'solid'"
                  :loading="presenceSubmitKey === rule.lake"
                  @click="toggleManagerPresence(rule)"
                >
                  {{ liveManagerAvailability(rule).source === 'presence'
                    ? 'Ukončiť prítomnosť'
                    : 'Som tu a dostupný' }}
                </UButton>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-if="activeLargeCatchRules.length === 0"
          title="Kontrola veľkých rýb je vypnutá"
          description="Žiadne jazero momentálne nevytvára čipové kandidáty podľa váhy."
          icon="i-heroicons-pause-circle"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Označené ryby</p>
          <p class="mt-2 text-3xl font-bold">{{ registryState.fish.length }}</p>
          <p class="mt-1 text-sm text-foreground-muted">unikátne čísla čipov</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Opakované úlovky</p>
          <p class="mt-2 text-3xl font-bold">{{ fishWithRepeatedCaptureCount }}</p>
          <p class="mt-1 text-sm text-foreground-muted">ryby s viac než jedným meraním</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Merania spolu</p>
          <p class="mt-2 text-3xl font-bold">{{ registryState.observations.length }}</p>
          <p class="mt-1 text-sm text-foreground-muted">časová história rastu</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Posledný záznam</p>
          <p class="mt-2 text-lg font-bold">{{ formatDateTime(latestObservationAt) }}</p>
          <p class="mt-1 text-sm text-foreground-muted">posledné načítanie čipu</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-sm text-foreground-muted">Čaká na čip</p>
          <p class="mt-2 text-3xl font-bold" :class="candidateState.candidates.length ? 'text-warning-700' : ''">
            {{ candidateState.candidates.length }}
          </p>
          <p class="mt-1 text-sm text-foreground-muted">podľa pravidiel jednotlivých jazier</p>
        </div>
      </div>

      <section class="mt-6 border-y border-primary-200 bg-primary-50 px-4 py-5 sm:px-5">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(18rem,1.1fr)] lg:items-end">
          <div>
            <p class="text-sm font-bold text-primary-800">Čítačka čipu</p>
            <h2 class="mt-1 text-lg font-bold">Načítať alebo zadať čip</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              RFID čítačka alebo ručné zadanie pri vode.
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label class="sr-only" for="chip-scan-input">Číslo čipu</label>
            <input
              id="chip-scan-input"
              v-model="chipScanInput"
              type="text"
              inputmode="text"
              autocomplete="off"
              class="h-11 rounded-md border border-primary-200 bg-white px-3 font-mono text-sm"
              placeholder="985141000..."
              @keyup.enter="processChipScan"
            >
            <UButton icon="i-heroicons-magnifying-glass" :disabled="!chipScanInput" @click="processChipScan">
              Vyhľadať
            </UButton>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              :disabled="!chipScanInput && !lastScannedChipCode"
              @click="resetChipScan"
            >
              Vyčistiť
            </UButton>
          </div>
        </div>

        <DataStatusNotice
          v-if="chipScanMessage"
          class="mt-4"
          :description="chipScanMessage"
          :icon="chipScanStatus === 'found'
            ? 'i-heroicons-check-circle'
            : chipScanStatus === 'error'
              ? 'i-heroicons-exclamation-triangle'
              : 'i-heroicons-tag'"
          :title="chipScanNoticeTitle"
          :tone="chipScanNoticeTone"
        />

        <div v-if="lastScannedChipCode && chipScanStatus !== 'error'" class="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div v-if="lastScannedFish" class="rounded-md border border-border bg-white px-4 py-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase text-foreground-muted">Nájdená ryba</p>
                <p class="mt-1 font-bold">{{ lastScannedFish.name || 'Ryba bez mena' }}</p>
                <p class="mt-1 text-sm text-foreground-muted">
                  {{ lastScannedFish.species }} · {{ getLakeName(lastScannedFish.lake) }}
                </p>
              </div>
              <StatusBadge :label="fishRegistryStatusLabels[lastScannedFish.status]" :tone="statusTone(lastScannedFish.status)" size="xs" />
            </div>
          </div>
          <div v-else class="rounded-md border border-border bg-white px-4 py-3">
            <p class="text-xs font-semibold uppercase text-foreground-muted">Nový čip</p>
            <p class="mt-1 break-all font-mono font-bold">{{ lastScannedChipCode }}</p>
            <p class="mt-1 text-sm text-foreground-muted">Číslo je pripravené na založenie ryby.</p>
          </div>

          <div v-if="canOperate" class="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <UButton
              v-if="lastScannedFish"
              icon="i-heroicons-plus-circle"
              color="warning"
              :disabled="lastScannedFish.status === 'dead' || lastScannedFish.status === 'transferred'"
              @click="openScannedFishMeasurement"
            >
              Zapísať meranie
            </UButton>
            <UButton
              v-else
              icon="i-heroicons-tag"
              color="warning"
              @click="openScannedFishRegistration"
            >
              Založiť rybu
            </UButton>
          </div>
        </div>
      </section>

      <section
        v-if="candidateState.candidates.length"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Úlovky čakajúce na kontrolu čipu</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Úlovky nad limitom konkrétneho jazera bez väzby na označenú rybu.
            </p>
          </div>
          <StatusBadge
            icon="i-heroicons-bell-alert"
            :label="`${candidateState.candidates.length} čaká`"
            tone="warning"
          />
        </div>

        <div class="mt-4 grid gap-3 lg:grid-cols-2">
          <article
            v-for="candidate in candidateState.candidates"
            :key="candidate.id"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="font-bold">{{ candidate.species }} · {{ candidate.weightKg }} kg</p>
                <p class="mt-1 text-sm text-foreground-muted">
                  {{ candidate.anglerName }} · {{ getLakeName(candidate.lake) }} · {{ candidateLocationLabel(candidate) }}
                </p>
              </div>
              <StatusBadge :label="candidateSourceLabel(candidate)" tone="neutral" size="xs" />
            </div>
            <div class="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-foreground-muted">
              <span>{{ candidate.lengthCm }} cm</span>
              <span>limit {{ candidate.thresholdKg }} kg</span>
              <span>{{ formatDateTime(candidate.caughtAt) }}</span>
              <span>{{ candidate.statusLabel }}</span>
            </div>
            <StatusBadge
              class="mt-3"
              :icon="candidateAvailability(candidate)?.available
                ? 'i-heroicons-check-circle'
                : 'i-heroicons-clock'"
              :label="candidateAvailability(candidate)?.available
                ? `Počas služby: ${candidateAvailability(candidate)?.matchingWindow?.label}`
                : 'Mimo služby správcu'"
              :tone="candidateAvailability(candidate)?.available ? 'success' : 'warning'"
              size="xs"
            />
            <UButton
              v-if="canOperate"
              class="mt-4"
              icon="i-heroicons-identification"
              color="warning"
              size="sm"
              @click="openCandidate(candidate)"
            >
              Spracovať čip
            </UButton>
          </article>
        </div>
      </section>

      <div class="mt-6 flex flex-col gap-3 rounded-card border border-border bg-surface p-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="grid flex-1 gap-3 md:grid-cols-[minmax(16rem,1fr)_14rem_12rem]">
          <label class="space-y-1 text-sm font-semibold">
            <span>Čip, meno alebo druh</span>
            <div class="relative">
              <UIcon name="i-heroicons-magnifying-glass" class="absolute left-3 top-2.5 h-5 w-5 text-foreground-muted" />
              <input
                v-model="searchQuery"
                class="w-full rounded-md border border-border bg-white py-2 pl-10 pr-3 text-sm"
                placeholder="napr. 985141... alebo Aurora"
              >
            </div>
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Jazero</span>
            <select v-model="lakeFilter" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm">
              <option value="all">Všetky jazerá</option>
              <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
            </select>
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Stav</span>
            <select v-model="statusFilter" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm">
              <option value="all">Všetky stavy</option>
              <option v-for="(label, value) in fishRegistryStatusLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </label>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            to="/api/admin/fish-registry/export"
            external
            icon="i-heroicons-arrow-down-tray"
            variant="soft"
          >
            Stiahnuť register
          </UButton>
          <UButton
            v-if="canManage"
            icon="i-heroicons-arrow-up-tray"
            variant="soft"
            @click="openPanel('import')"
          >
            Hromadný import
          </UButton>
          <UButton
            v-if="canManage"
            icon="i-heroicons-adjustments-horizontal"
            variant="soft"
            @click="openPanel('settings')"
          >
            Pravidlá
          </UButton>
          <UButton
            v-if="canOperate"
            icon="i-heroicons-plus"
            color="warning"
            @click="openPanel('register')"
          >
            Pridať rybu
          </UButton>
        </div>
      </div>

      <DataStatusNotice
        v-if="mutationMessage"
        class="mt-4"
        :description="mutationMessage"
        :loading="mutationStatus === 'submitting'"
        :title="mutationNoticeTitle"
        :tone="mutationNoticeTone"
      />

      <section
        v-if="activePanel === 'candidate' && activeCandidate"
        class="mt-6 rounded-card border border-primary-200 bg-primary-50 p-5"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold">Spracovať {{ candidateSourceLabel(activeCandidate) }}</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              {{ activeCandidate.species }} {{ activeCandidate.weightKg }} kg ·
              {{ candidateLocationLabel(activeCandidate) }}
            </p>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            variant="ghost"
            aria-label="Zavrieť spracovanie čipu"
            @click="closeActivePanel"
          />
        </div>

        <div class="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label class="space-y-1 text-sm font-semibold">
            <span>Čip už existuje</span>
            <select v-model="candidateFishId" class="w-full rounded-md border border-border bg-white px-3 py-2">
              <option value="">Vyberte rybu podľa čipu alebo mena</option>
              <option v-for="fish in registryState.fish" :key="fish.id" :value="fish.id">
                {{ fish.chipCode }} · {{ fish.name || 'bez mena' }} · {{ fish.species }}
              </option>
            </select>
          </label>
          <UButton
            icon="i-heroicons-plus-circle"
            :disabled="!candidateFishId"
            @click="prepareCandidateObservation"
          >
            Pridať meranie
          </UButton>
        </div>

        <div class="mt-4 flex flex-col gap-3 border-t border-primary-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-foreground-muted">Ak čítačka čip nenájde, založ novú identitu ryby.</p>
          <UButton icon="i-heroicons-tag" color="warning" @click="prepareCandidateRegistration">
            Ryba nemá čip
          </UButton>
        </div>
      </section>

      <form
        v-if="activePanel === 'settings'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
        @submit.prevent="submitSettings"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold">Pravidlá veľkých rýb</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Každé jazero môže mať vlastný limit, kontaktný postup aj týždenný rozpis služby.
            </p>
          </div>
          <UButton icon="i-heroicons-x-mark" variant="ghost" aria-label="Zavrieť pravidlá" @click="activePanel = ''" />
        </div>

        <fieldset class="mt-5 space-y-4" :disabled="mutationStatus === 'submitting'">
          <section
            v-for="rule in settingsForm.largeCatchRules"
            :key="rule.lake"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 class="font-bold">{{ getLakeName(rule.lake) }}</h3>
                <p class="mt-1 text-sm text-foreground-muted">Fronta sa prepočíta hneď po uložení.</p>
              </div>
              <label class="flex items-center gap-2 text-sm font-semibold">
                <input v-model="rule.enabled" type="checkbox" class="h-4 w-4 accent-primary-700">
                Pravidlo aktívne
              </label>
            </div>

            <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label class="space-y-1 text-sm font-semibold">
                <span>Limit (kg)</span>
                <input v-model.number="rule.thresholdKg" required type="number" min="0.1" max="80" step="0.1" class="w-full rounded-md border border-border px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Spôsob kontaktu</span>
                <select v-model="rule.contactMode" class="w-full rounded-md border border-border bg-white px-3 py-2">
                  <option v-for="(label, value) in fishManagerContactModeLabels" :key="value" :value="value">{{ label }}</option>
                </select>
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Telefón</span>
                <input v-model="rule.phone" type="tel" class="w-full rounded-md border border-border px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>E-mail</span>
                <input v-model="rule.email" type="email" class="w-full rounded-md border border-border px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold md:col-span-2 xl:col-span-4">
                <span>Pokyn počas služby</span>
                <textarea v-model="rule.instruction" required rows="3" class="w-full rounded-md border border-border px-3 py-2" />
              </label>
              <label class="space-y-1 text-sm font-semibold md:col-span-2 xl:col-span-4">
                <span>Pokyn mimo služby</span>
                <textarea v-model="rule.outsideAvailabilityInstruction" required rows="3" class="w-full rounded-md border border-border px-3 py-2" />
              </label>
            </div>

            <div class="mt-5 border-t border-border pt-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 class="text-sm font-bold">Kedy možno správcu privolať</h4>
                  <p class="mt-1 text-xs text-foreground-muted">
                    Čas sa vyhodnocuje podľa lokálneho času revíru Europe/Bratislava.
                  </p>
                </div>
                <UButton
                  type="button"
                  icon="i-heroicons-plus"
                  size="sm"
                  variant="soft"
                  @click="addAvailabilityWindow(rule.lake)"
                >
                  Pridať čas
                </UButton>
              </div>

              <div class="mt-4 space-y-3">
                <div
                  v-for="window in rule.availabilityWindows"
                  :key="window.id"
                  class="rounded-md border border-border bg-muted/40 p-4"
                >
                  <div class="grid gap-4 lg:grid-cols-[minmax(10rem,1fr)_9rem_9rem_auto] lg:items-end">
                    <label class="space-y-1 text-sm font-semibold">
                      <span>Názov služby</span>
                      <input v-model="window.label" required class="w-full rounded-md border border-border bg-white px-3 py-2">
                    </label>
                    <label class="space-y-1 text-sm font-semibold">
                      <span>Od</span>
                      <input v-model="window.startsAt" required type="time" class="w-full rounded-md border border-border bg-white px-3 py-2">
                    </label>
                    <label class="space-y-1 text-sm font-semibold">
                      <span>Do</span>
                      <input v-model="window.endsAt" required type="time" class="w-full rounded-md border border-border bg-white px-3 py-2">
                    </label>
                    <UButton
                      type="button"
                      icon="i-heroicons-trash"
                      color="error"
                      variant="ghost"
                      aria-label="Odstrániť čas služby"
                      :disabled="rule.availabilityWindows.length <= 1"
                      @click="removeAvailabilityWindow(rule.lake, window.id)"
                    />
                  </div>

                  <fieldset class="mt-4">
                    <legend class="text-sm font-semibold">Dni služby</legend>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <label
                        v-for="day in fishManagerWeekdayOptions"
                        :key="day.value"
                        class="flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-bold transition-colors"
                        :class="window.daysOfWeek.includes(day.value)
                          ? 'border-primary-600 bg-primary-50 text-primary-900'
                          : 'border-border bg-white text-foreground-muted'"
                      >
                        <input
                          v-model="window.daysOfWeek"
                          type="checkbox"
                          :value="day.value"
                          class="sr-only"
                        >
                        {{ day.label }}
                      </label>
                    </div>
                  </fieldset>
                </div>
              </div>
            </div>
          </section>
        </fieldset>

        <div class="mt-4 flex justify-end">
          <UButton type="submit" icon="i-heroicons-check" color="warning" :loading="mutationStatus === 'submitting'">
            Uložiť pravidlá
          </UButton>
        </div>
      </form>

      <form
        v-if="activePanel === 'register'"
        ref="registrationFormElement"
        class="mt-6 rounded-card border border-border bg-surface p-5"
        @submit.prevent="submitRegistration"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold">Pridať novú označenú rybu</h2>
            <p class="mt-1 text-sm text-foreground-muted">Číslo čipu musí byť v rámci revíru unikátne.</p>
          </div>
          <UButton icon="i-heroicons-x-mark" variant="ghost" aria-label="Zavrieť formulár" @click="closeActivePanel" />
        </div>

        <fieldset class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" :disabled="mutationStatus === 'submitting'">
          <label class="space-y-1 text-sm font-semibold">
            <span>Číslo čipu</span>
            <input v-model="registrationForm.chipCode" required class="w-full rounded-md border border-border px-3 py-2" placeholder="985141000..." inputmode="numeric">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Meno ryby</span>
            <input v-model="registrationForm.name" class="w-full rounded-md border border-border px-3 py-2" placeholder="môže navrhnúť rybár">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Druh</span>
            <input v-model="registrationForm.species" required class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Stav</span>
            <select v-model="registrationForm.status" class="w-full rounded-md border border-border bg-white px-3 py-2">
              <option v-for="(label, value) in fishRegistryStatusLabels" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Jazero</span>
            <select v-model="registrationForm.lake" class="w-full rounded-md border border-border bg-white px-3 py-2">
              <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
            </select>
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Miesto označenia</span>
            <select v-model="registrationForm.taggedPegId" required class="w-full rounded-md border border-border bg-white px-3 py-2">
              <option value="" disabled>Vyberte konkrétne miesto</option>
              <option v-for="peg in registrationPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
            </select>
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Dátum označenia</span>
            <input v-model="registrationForm.taggedAt" required type="datetime-local" class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Dôvod označenia</span>
            <select v-model="registrationForm.taggingContext" class="w-full rounded-md border border-border bg-white px-3 py-2">
              <option v-for="(label, value) in fishTaggingContextLabels" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Váha pri označení (kg)</span>
            <input v-model.number="registrationForm.taggedWeightKg" type="number" step="0.01" min="0.1" max="80" class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Dĺžka pri označení (cm)</span>
            <input v-model.number="registrationForm.taggedLengthCm" type="number" step="1" min="1" max="250" class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold xl:col-span-2">
            <span>Označil / načítal</span>
            <input v-model="registrationForm.taggerName" required class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Rybár alebo tím</span>
            <input v-model="registrationForm.anglerName" class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold">
            <span>Nástraha</span>
            <input v-model="registrationForm.bait" class="w-full rounded-md border border-border px-3 py-2">
          </label>
          <label class="space-y-1 text-sm font-semibold md:col-span-2 xl:col-span-4">
            <span>Poznámka</span>
            <textarea v-model="registrationForm.notes" class="min-h-20 w-full rounded-md border border-border px-3 py-2" />
          </label>
        </fieldset>

        <DataStatusNotice
          v-if="activeCandidate && candidateNeedsRegistrationPeg"
          class="mt-4"
          :description="`Súťažný úlovok pozná sektor ${activeCandidate.locationLabel}, nie konkrétne lovné miesto. Pred uložením vyber miesto, pri ktorom bola ryba označená.`"
          icon="i-heroicons-map-pin"
          title="Doplň konkrétne miesto označenia"
          tone="warning"
        />

        <div class="mt-4 flex justify-end">
          <UButton type="submit" icon="i-heroicons-check" color="warning" :loading="mutationStatus === 'submitting'">
            Uložiť rybu
          </UButton>
        </div>
      </form>

      <form
        v-if="activePanel === 'import'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
        @submit.prevent="submitImport"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold">Hromadný import registra</h2>
            <p class="mt-1 text-sm text-foreground-muted">
              Najistejšia šablóna je aktuálne stiahnutý register. Rovnaký čip sa aktualizuje, rovnaké meranie sa preskočí.
            </p>
          </div>
          <UButton icon="i-heroicons-x-mark" variant="ghost" aria-label="Zavrieť import" @click="activePanel = ''" />
        </div>
        <label class="mt-5 block rounded-md border border-dashed border-border bg-muted p-6 text-center">
          <UIcon name="i-heroicons-document-arrow-up" class="mx-auto h-8 w-8 text-primary-700" />
          <span class="mt-2 block font-bold">{{ importFileName || 'Vybrať tabuľku s údajmi' }}</span>
          <span class="mt-1 block text-sm text-foreground-muted">Súbor do 5 MB</span>
          <input type="file" accept=".csv,text/csv" class="sr-only" @change="readImportFile">
        </label>
        <div class="mt-4 flex justify-end">
          <UButton type="submit" icon="i-heroicons-arrow-up-tray" color="warning" :disabled="!importCsv" :loading="mutationStatus === 'submitting'">
            Spustiť import
          </UButton>
        </div>
      </form>

      <div class="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
        <section class="min-w-0 rounded-card border border-border bg-surface p-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Ryby v registri</h2>
              <p class="text-sm text-foreground-muted">{{ resultCountLabel(filteredFish.length) }}</p>
            </div>
            <UButton icon="i-heroicons-arrow-path" variant="ghost" aria-label="Obnoviť register" @click="refreshRegistryWorkspace" />
          </div>

          <div v-if="filteredFish.length" class="mt-4 space-y-3">
            <button
              v-for="fish in filteredFish"
              :key="fish.id"
              type="button"
              class="min-w-0 w-full rounded-md border p-4 text-left transition-colors hover:border-primary-200 hover:bg-muted"
              :class="selectedFish?.id === fish.id ? 'border-primary-700 bg-primary-50 shadow-sm' : 'border-border bg-white'"
              @click="selectedFishId = fish.id"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate font-bold">{{ fish.name || 'Ryba bez mena' }}</p>
                  <p class="mt-1 font-mono text-sm text-primary-800">{{ fish.chipCode }}</p>
                </div>
                <StatusBadge :label="fishRegistryStatusLabels[fish.status]" :tone="statusTone(fish.status)" size="xs" />
              </div>
              <p class="mt-3 text-sm text-foreground-muted">
                {{ fish.species }} · {{ getLakeName(fish.lake) }}
              </p>
              <p class="mt-1 text-xs font-semibold text-foreground-muted">
                {{ measurementCountLabel(registryState.observations.filter((item) => item.fishId === fish.id).length) }}
              </p>
            </button>
          </div>

          <AppState
            v-else
            title="Ryba sa nenašla"
            description="Skontroluj číslo čipu, meno alebo zvolené filtre."
            icon="i-heroicons-magnifying-glass"
          />
        </section>

        <section v-if="selectedFish" class="min-w-0 space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-2xl font-bold">{{ selectedFish.name || 'Ryba bez mena' }}</h2>
                  <StatusBadge :label="fishRegistryStatusLabels[selectedFish.status]" :tone="statusTone(selectedFish.status)" />
                </div>
                <p class="mt-2 font-mono text-lg font-bold text-primary-800">{{ selectedFish.chipCode }}</p>
                <p class="mt-2 text-sm text-foreground-muted">
                  {{ selectedFish.species }} · {{ getLakeName(selectedFish.lake) }}
                </p>
              </div>
              <div v-if="canOperate" class="flex flex-wrap gap-2">
                <UButton
                  icon="i-heroicons-pencil-square"
                  variant="soft"
                  @click="openFishEdit"
                >
                  Upraviť rybu
                </UButton>
                <UButton
                  icon="i-heroicons-plus"
                  color="warning"
                  :disabled="measurementDisabled"
                  @click="openPanel('measurement')"
                >
                  Nové meranie
                </UButton>
              </div>
            </div>

            <dl class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Označená</dt>
                <dd class="mt-1 font-semibold">{{ formatDateTime(selectedFish.taggedAt) }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Prvé miesto</dt>
                <dd class="mt-1 font-semibold">{{ getPegLabel(selectedFish.taggedPegId) }}</dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Zmena váhy</dt>
                <dd class="mt-1 font-semibold" :class="weightDelta < 0 ? 'text-error-700' : 'text-success-700'">
                  {{ formatDelta(weightDelta, 'kg') }}
                </dd>
              </div>
              <div class="rounded-md bg-muted p-3">
                <dt class="text-xs text-foreground-muted">Zmena dĺžky</dt>
                <dd class="mt-1 font-semibold">{{ formatDelta(lengthDelta, 'cm') }}</dd>
              </div>
            </dl>

            <p v-if="selectedFish.notes" class="mt-4 text-sm text-foreground-muted">{{ selectedFish.notes }}</p>
            <p
              v-if="measurementDisabled"
              class="mt-4 rounded-md bg-muted px-3 py-2 text-sm font-semibold text-foreground-muted"
            >
              Nové meranie je dostupné po návrate ryby do aktívneho stavu.
            </p>
          </div>

          <form
            v-if="activePanel === 'edit'"
            ref="editFormElement"
            data-testid="fish-edit-form"
            class="rounded-card border border-primary-200 bg-primary-50 p-5"
            @submit.prevent="submitFishEdit"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold">Upraviť rybu</h3>
                <p class="mt-1 text-sm text-foreground-muted">
                  Čip a pôvodné označenie ostávajú pevnou súčasťou histórie.
                </p>
              </div>
              <UButton icon="i-heroicons-x-mark" variant="ghost" aria-label="Zavrieť úpravu ryby" @click="closeActivePanel" />
            </div>

            <div class="mt-4 rounded-md border border-primary-200 bg-white px-4 py-3">
              <p class="text-xs font-semibold text-foreground-muted">Číslo čipu (nemeniteľné)</p>
              <p class="mt-1 break-all font-mono font-bold text-primary-800">{{ selectedFish.chipCode }}</p>
            </div>

            <fieldset class="mt-4 grid gap-4 sm:grid-cols-2" :disabled="mutationStatus === 'submitting'">
              <label class="space-y-1 text-sm font-semibold">
                <span>Meno ryby</span>
                <input v-model="editForm.name" maxlength="80" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Druh</span>
                <input v-model="editForm.species" required maxlength="100" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Stav</span>
                <select
                  v-model="editForm.status"
                  data-testid="fish-edit-status"
                  class="w-full rounded-md border border-border bg-white px-3 py-2"
                >
                  <option value="active">aktívna</option>
                  <option value="missing">dlho nepotvrdená</option>
                  <option value="transferred">premiestnená</option>
                  <option value="dead">uhynutá</option>
                </select>
              </label>
              <label v-if="editStatusChanged" class="space-y-1 text-sm font-semibold">
                <span>Dôvod zmeny stavu</span>
                <input
                  v-model="editForm.changeNote"
                  required
                  minlength="3"
                  maxlength="500"
                  class="w-full rounded-md border border-border bg-white px-3 py-2"
                  placeholder="Napr. potvrdené správcom pri kontrole"
                >
              </label>
              <label class="space-y-1 text-sm font-semibold sm:col-span-2">
                <span>Interná poznámka</span>
                <textarea v-model="editForm.notes" maxlength="1000" class="min-h-24 w-full rounded-md border border-border bg-white px-3 py-2" />
              </label>
            </fieldset>

            <DataStatusNotice
              v-if="editStatusChanged"
              class="mt-4"
              :description="`Pôvodný stav: ${fishRegistryStatusLabels[editOriginalStatus]}. Nový stav: ${fishRegistryStatusLabels[editForm.status]}. Identita ryby aj všetky doterajšie merania ostanú zachované v registri a zmena sa zapíše do auditu.`"
              icon="i-heroicons-exclamation-triangle"
              title="Meníš stav ryby"
              tone="warning"
            />

            <div class="mt-4 flex justify-end">
              <UButton type="submit" icon="i-heroicons-check" color="warning" :loading="mutationStatus === 'submitting'">
                Uložiť zmeny
              </UButton>
            </div>
          </form>

          <form
            v-if="activePanel === 'measurement'"
            ref="measurementFormElement"
            class="rounded-card border border-primary-200 bg-primary-50 p-5"
            @submit.prevent="submitObservation"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold">Nové meranie čipu {{ selectedFish.chipCode }}</h3>
                <p class="mt-1 text-sm text-foreground-muted">Záznam môže byť prepojený s bežným alebo súťažným úlovkom.</p>
              </div>
              <UButton icon="i-heroicons-x-mark" variant="ghost" aria-label="Zavrieť meranie" @click="closeActivePanel" />
            </div>

            <fieldset class="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" :disabled="mutationStatus === 'submitting'">
              <label class="space-y-1 text-sm font-semibold">
                <span>Dátum a čas</span>
                <input v-model="observationForm.observedAt" required type="datetime-local" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Jazero</span>
                <select v-model="observationForm.lake" class="w-full rounded-md border border-border bg-white px-3 py-2">
                  <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                </select>
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Stanovisko</span>
                <select v-model="observationForm.pegId" required class="w-full rounded-md border border-border bg-white px-3 py-2">
                  <option value="" disabled>Vyberte konkrétne miesto</option>
                  <option v-for="peg in observationPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                </select>
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Zdroj</span>
                <select v-model="observationForm.source" class="w-full rounded-md border border-border bg-white px-3 py-2">
                  <option value="manager">správca</option>
                  <option value="public-catch">bežný úlovok</option>
                  <option value="tournament">súťaž</option>
                </select>
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Váha (kg)</span>
                <input v-model.number="observationForm.weightKg" required type="number" step="0.01" min="0.1" max="80" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Dĺžka (cm)</span>
                <input v-model.number="observationForm.lengthCm" required type="number" step="1" min="1" max="250" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Čip načítal</span>
                <input v-model="observationForm.chipReadBy" required class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Rybár alebo tím</span>
                <input v-model="observationForm.anglerName" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>Nástraha</span>
                <input v-model="observationForm.bait" class="w-full rounded-md border border-border bg-white px-3 py-2">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>ID bežného úlovku</span>
                <input v-model="observationForm.catchId" class="w-full rounded-md border border-border bg-white px-3 py-2" placeholder="voliteľné">
              </label>
              <label class="space-y-1 text-sm font-semibold">
                <span>ID súťažného úlovku</span>
                <input v-model="observationForm.tournamentCatchId" class="w-full rounded-md border border-border bg-white px-3 py-2" placeholder="voliteľné">
              </label>
              <label class="space-y-1 text-sm font-semibold sm:col-span-2 xl:col-span-4">
                <span>Poznámka ku kondícii ryby</span>
                <textarea v-model="observationForm.notes" class="min-h-20 w-full rounded-md border border-border bg-white px-3 py-2" />
              </label>
            </fieldset>

            <DataStatusNotice
              v-if="activeCandidate && candidateNeedsObservationPeg"
              class="mt-4"
              :description="`Úlovok prišiel zo sektora ${activeCandidate.locationLabel}. Vyber konkrétne lovné miesto pred uložením merania.`"
              icon="i-heroicons-map-pin"
              title="Doplň konkrétne miesto merania"
              tone="warning"
            />

            <div class="mt-4 flex justify-end">
              <UButton type="submit" icon="i-heroicons-check" color="warning" :loading="mutationStatus === 'submitting'">
                Uložiť meranie
              </UButton>
            </div>
          </form>

          <div class="grid gap-4 xl:grid-cols-2">
            <FishProgressChart :observations="selectedObservations" metric="weightKg" />
            <FishProgressChart :observations="selectedObservations" metric="lengthCm" />
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <div>
              <h3 class="text-lg font-bold">História ryby</h3>
              <p class="text-sm text-foreground-muted">Od prvého označenia po posledné načítanie čipu.</p>
            </div>

            <div v-if="selectedObservations.length" class="mt-5 space-y-3">
              <article
                v-for="observation in [...selectedObservations].reverse()"
                :key="observation.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ formatDateTime(observation.observedAt) }}</p>
                    <p class="mt-1 text-sm text-foreground-muted">
                      {{ getLakeName(observation.lake) }} · {{ getPegLabel(observation.pegId) }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <StatusBadge icon="i-heroicons-scale" :label="`${observation.weightKg} kg`" tone="success" size="xs" />
                    <StatusBadge icon="i-heroicons-arrows-up-down" :label="`${observation.lengthCm} cm`" tone="warning" size="xs" />
                    <StatusBadge :label="fishObservationSourceLabels[observation.source]" tone="neutral" size="xs" />
                  </div>
                </div>
                <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt class="text-xs text-foreground-muted">Čip načítal</dt>
                    <dd class="font-semibold">{{ observation.chipReadBy }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-foreground-muted">Rybár / tím</dt>
                    <dd class="font-semibold">{{ observation.anglerName || 'neuvedené' }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-foreground-muted">Nástraha</dt>
                    <dd class="font-semibold">{{ observation.bait || 'neuvedené' }}</dd>
                  </div>
                </dl>
                <p v-if="observation.notes" class="mt-3 text-sm text-foreground-muted">{{ observation.notes }}</p>
              </article>
            </div>

            <AppState
              v-else
              compact
              title="Bez histórie"
              description="Táto ryba zatiaľ nemá uložené žiadne meranie."
              icon="i-heroicons-clock"
            />
          </div>
        </section>

        <AppState
          v-else
          compact
          title="Vyberte rybu"
          description="Detail, história a graf sa zobrazia po výbere ryby zo zoznamu."
          icon="i-heroicons-tag"
        />
      </div>
    </section>
  </div>
</template>
