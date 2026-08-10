import type { LakeSlug } from '~/data/pond'
import {
  getFishObservations,
  searchFishRegistry,
  type FishObservationMutationSuccess,
  type FishRegistryMutationSuccess,
  type FishRegistryStateResponse,
  type FishRegistryStatus,
  type FishRegistryUpdateSuccess,
} from '~/services/fishRegistryService'
import {
  createDefaultFishRegistrySettings,
  FISH_MANAGER_CALL_THRESHOLD_KG,
  getFishLargeCatchRule,
  getFishManagerAvailability,
  type FishLargeCatchRule,
  type FishManagerPresenceMutationSuccess,
  type FishRegistrySettingsMutationSuccess,
} from '~/services/fishRegistrySettingsService'
import type { FishCatchCandidate, FishCatchCandidateResponse } from '~/services/fishRegistryCandidateService'
import type { FishRegistryImportSuccess } from '~/services/fishRegistryCsvService'
import type {
  LargeFishAssistanceRequest,
  LargeFishAssistanceMutationSuccess,
  LargeFishAssistanceStateResponse,
} from '~/services/largeFishAssistanceService'

export type FishAdminView = 'dostupnost' | 'kontrola' | 'privolania' | 'register'
type NoticeTone = 'error' | 'info' | 'success' | 'warning'

export async function useAdminFishRegistry() {
  const { getLakeName, getPegLabel, lakes, pegs } = usePondData()
  const { canManage, canOperate, isReadOnly, label: accessLabel, readOnlyMessage } = useAdminModuleAccess('fish')
  const requestFetch = useRequestFetch()
  const route = useRoute()
  const router = useRouter()
  const activeFishAdminView = ref<FishAdminView>(
    route.query.privolanie
      ? 'privolania'
      : route.query.catchId
        ? 'kontrola'
        : parseFishAdminView(route.query.sekcia),
  )
  const defaultSettings = createDefaultFishRegistrySettings()

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
  const openedQueryAssistanceId = ref('')
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
  const assistanceRequestsElement = ref<HTMLElement | null>(null)
  const assistancePanelElement = ref<HTMLElement | null>(null)
  const candidatePanelElement = ref<HTMLElement | null>(null)
  const fishAdminTabScrollerElement = ref<HTMLElement | null>(null)
  const editFormElement = ref<HTMLElement | null>(null)
  const measurementFormElement = ref<HTMLElement | null>(null)
  const registrationFormElement = ref<HTMLElement | null>(null)
  const hasResolvedInitialFishAdminView = ref(false)
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

  const fishAdminViewTabs = computed(() => [
    {
      count: openAssistanceRequests.value.length,
      icon: 'i-heroicons-bell-alert',
      label: 'Privolania',
      value: 'privolania' as const,
    },
    {
      count: candidateState.value.candidates.length,
      icon: 'i-heroicons-identification',
      label: 'Kontrola čipu',
      value: 'kontrola' as const,
    },
    {
      count: registryState.value.fish.length,
      icon: 'i-heroicons-tag',
      label: 'Register',
      value: 'register' as const,
    },
    {
      count: activeLargeCatchRules.value.length,
      icon: 'i-heroicons-map-pin',
      label: 'Dostupnosť',
      value: 'dostupnost' as const,
    },
  ])

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
    void revealActiveFishAdminTab()
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

    if (hasResolvedInitialFishAdminView.value) return
    hasResolvedInitialFishAdminView.value = true
    if (!route.query.catchId && !route.query.privolanie && !route.query.sekcia && requests.length) {
      activeFishAdminView.value = 'privolania'
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
      if (!normalizedCatchId) {
        openedQueryCandidateId.value = ''
        return
      }
      if (!normalizedCatchId || openedQueryCandidateId.value === normalizedCatchId) return

      const candidate = candidates.find((item) => item.catchId === normalizedCatchId)
      if (!candidate) return

      openedQueryCandidateId.value = normalizedCatchId
      openCandidate(candidate)
    },
    { immediate: true },
  )

  watch(
    [() => route.query.privolanie, () => assistanceState.value.requests],
    ([assistanceId, requests]) => {
      const normalizedAssistanceId = typeof assistanceId === 'string' ? assistanceId : ''
      if (!normalizedAssistanceId) {
        openedQueryAssistanceId.value = ''
        return
      }

      activeFishAdminView.value = 'privolania'
      if (openedQueryAssistanceId.value === normalizedAssistanceId) return

      const request = requests.find((item) => item.id === normalizedAssistanceId)
      if (!request) return

      openedQueryAssistanceId.value = normalizedAssistanceId
      if (request.status === 'on-route') void openAssistanceProcessing(request)
      else void revealAssistanceRequest(request.id)
    },
    { immediate: true },
  )

  watch(
    () => route.query.sekcia,
    (view) => {
      if (route.query.catchId || route.query.privolanie) return
      activeFishAdminView.value = parseFishAdminView(view)
    },
  )

  function parseFishAdminView(value: unknown): FishAdminView {
    const normalizedValue = Array.isArray(value) ? value[0] : value

    if (normalizedValue === 'dostupnost' || normalizedValue === 'privolania' || normalizedValue === 'register') {
      return normalizedValue
    }

    return 'kontrola'
  }

  function fishAdminTabClass(isActive: boolean) {
    return isActive
      ? 'border-primary-700 text-primary-900'
      : 'border-transparent text-foreground-muted hover:border-border hover:text-foreground'
  }

  function selectFishAdminView(view: FishAdminView) {
    activeFishAdminView.value = view
    const query = { ...route.query }

    if (view === 'kontrola') delete query.sekcia
    else query.sekcia = view

    if (view !== 'kontrola') delete query.catchId
    if (view !== 'privolania') delete query.privolanie

    void router.replace({ query })
  }

  function handleFishAdminTabKeydown(event: KeyboardEvent, index: number) {
    let targetIndex: number | undefined

    if (event.key === 'ArrowLeft') {
      targetIndex = (index - 1 + fishAdminViewTabs.value.length) % fishAdminViewTabs.value.length
    }
    else if (event.key === 'ArrowRight') {
      targetIndex = (index + 1) % fishAdminViewTabs.value.length
    }
    else if (event.key === 'Home') {
      targetIndex = 0
    }
    else if (event.key === 'End') {
      targetIndex = fishAdminViewTabs.value.length - 1
    }

    if (targetIndex === undefined) return

    event.preventDefault()
    const tabList = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
    const targetView = fishAdminViewTabs.value[targetIndex]?.value
    if (!targetView) return

    selectFishAdminView(targetView)
    void nextTick(() => {
      const tabs = tabList?.querySelectorAll<HTMLElement>('[role="tab"]')
      tabs?.[targetIndex]?.focus()
    })
  }

  async function revealActiveFishAdminTab(behavior: ScrollBehavior = 'auto') {
    if (!import.meta.client) return

    await nextTick()
    const scroller = fishAdminTabScrollerElement.value
    const activeTab = scroller?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (!scroller || !activeTab) return

    const centeredLeft = activeTab.offsetLeft - (scroller.clientWidth - activeTab.offsetWidth) / 2
    scroller.scrollTo({ behavior, left: Math.max(0, centeredLeft) })
  }

  async function revealAssistanceRequest(requestId: string) {
    if (!import.meta.client) return

    await nextTick()
    const requestCard = [...(assistanceRequestsElement.value?.querySelectorAll<HTMLElement>('[data-assistance-id]') ?? [])]
      .find((item) => item.dataset.assistanceId === requestId)
    requestCard?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  watch(
    activeFishAdminView,
    () => void revealActiveFishAdminTab('smooth'),
    { flush: 'post' },
  )

  watch(
    [candidatePanelElement, () => route.query.catchId],
    async ([panel, catchId]) => {
      if (!import.meta.client || !panel || typeof catchId !== 'string') return
      await nextTick()
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    { flush: 'post' },
  )

  watch(
    [assistanceRequestsElement, assistancePanelElement, () => route.query.privolanie],
    async ([requestsElement, panelElement, assistanceId]) => {
      if (!import.meta.client || typeof assistanceId !== 'string') return
      await nextTick()

      if (panelElement) {
        panelElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      if (requestsElement) await revealAssistanceRequest(assistanceId)
    },
    { flush: 'post' },
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
    selectFishAdminView('register')
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
    selectFishAdminView('register')
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
    selectFishAdminView('register')
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
    activeFishAdminView.value = 'privolania'
    activeAssistanceId.value = request.id
    assistanceFishId.value = ''
    activePanel.value = 'assistance'
    await nextTick()
    assistancePanelElement.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function openCandidate(candidate: FishCatchCandidate) {
    resetMessage()
    resetAssistanceContext()
    activeFishAdminView.value = 'kontrola'
    activeCandidateId.value = candidate.id
    candidateFishId.value = ''
    activePanel.value = 'candidate'
    await nextTick()
    candidatePanelElement.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
    selectFishAdminView('register')
    await nextTick()
    measurementFormElement.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    selectFishAdminView('register')
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
    selectFishAdminView('register')
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
    selectFishAdminView('register')
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
    if (panel === 'settings') selectFishAdminView('dostupnost')
    else if (panel) selectFishAdminView('register')
  }

  async function refreshRegistryWorkspace() {
    await Promise.all([refresh(), refreshCandidates(), refreshAssistance()])
  }

  return {
    accessLabel,
    activeAssistance,
    activeCandidate,
    activeFishAdminView,
    activeLargeCatchRules,
    activePanel,
    addAvailabilityWindow,
    assistanceEtaMinutes,
    assistanceFishId,
    assistanceNextStep,
    assistancePanelElement,
    assistanceRequestsElement,
    assistanceStatusTone,
    assistanceSubmitId,
    assistanceWaitLabel,
    bulkPresenceDurationHours,
    candidateAvailability,
    candidateFishId,
    candidateLocationLabel,
    candidateNeedsObservationPeg,
    candidateNeedsRegistrationPeg,
    candidatePanelElement,
    candidateSourceLabel,
    candidateState,
    canManage,
    canOperate,
    chipScanInput,
    chipScanMessage,
    chipScanNoticeTitle,
    chipScanNoticeTone,
    chipScanStatus,
    closeActivePanel,
    editForm,
    editFormElement,
    editOriginalStatus,
    editStatusChanged,
    filteredFish,
    fishAdminTabClass,
    fishAdminTabScrollerElement,
    fishAdminViewTabs,
    fishWithRepeatedCaptureCount,
    formatDateTime,
    formatDelta,
    formatWeightKg,
    getLakeName,
    getPegLabel,
    handleFishAdminTabKeydown,
    importCsv,
    importFileName,
    isReadOnly,
    lakeFilter,
    lakes,
    lastScannedChipCode,
    lastScannedFish,
    latestObservationAt,
    lengthDelta,
    liveManagerAvailability,
    managerPresenceDescription,
    managerPresenceTitle,
    managerPresenceTone,
    measurementCountLabel,
    measurementDisabled,
    measurementFormElement,
    mutationMessage,
    mutationNoticeTitle,
    mutationNoticeTone,
    mutationStatus,
    observationForm,
    observationPegs,
    openAssistanceProcessing,
    openAssistanceRequests,
    openCandidate,
    openFishEdit,
    openPanel,
    openScannedFishMeasurement,
    openScannedFishRegistration,
    pegs,
    phoneHref,
    prepareAssistanceObservation,
    prepareAssistanceRegistration,
    prepareCandidateObservation,
    prepareCandidateRegistration,
    presenceDurationHours,
    presenceSubmitKey,
    processChipScan,
    readImportFile,
    readOnlyMessage,
    refreshRegistryWorkspace,
    registrationForm,
    registrationFormElement,
    registrationPegs,
    registryState,
    removeAvailabilityWindow,
    resetChipScan,
    respondToAssistance,
    resultCountLabel,
    searchQuery,
    selectedFish,
    selectedFishId,
    selectedObservations,
    selectedPresenceLakes,
    selectFishAdminView,
    setManagerPresence,
    settingsForm,
    statusFilter,
    statusTone,
    submitFishEdit,
    submitImport,
    submitObservation,
    submitRegistration,
    submitSettings,
    toggleManagerPresence,
    weightDelta,
  }
}
