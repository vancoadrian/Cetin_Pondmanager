import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type {
  Sponsor,
  SponsorLogoVariant,
  TournamentCatch,
  TournamentMarshal,
  TournamentRequest,
  TournamentTeamRegistration,
} from '~/data/pond'
import type { PublicMockUser } from '~/composables/useMockAuth'
import type { MapStateResponse } from '~/services/mapApiService'
import type { TournamentRequestSubmissionSuccess } from '~/services/tournamentRequestService'
import type {
  TournamentStateResponse,
  TournamentTeamRegistrationSubmissionSuccess,
} from '~/services/tournamentApiService'
import type { StatusBadgeTone } from '~/utils/ui'
import {
  getValidationMessages,
  tournamentRequestInputSchema,
  tournamentTeamRegistrationInputSchema,
} from '~/schemas/pondSchemas'
import {
  enqueueOfflineTournamentRequest,
  getOfflineTournamentRequestQueueErrorMessage,
  markOfflineTournamentRequestAttempt,
  readOfflineTournamentRequestQueue,
  removeOfflineTournamentRequest,
  shouldQueueTournamentRequestSubmission,
  type OfflineTournamentRequestPayload,
  type OfflineTournamentRequestQueueItem,
} from '~/services/offlineTournamentRequestQueueService'
import { getMapLayerImageAttributes } from '~/utils/map'
import { getResponsiveMapBackgroundSources } from '~/utils/responsiveImage'
import {
  getTournamentMapCoverage,
  getTournamentSectorMapRows,
  getTournamentSectorShapes,
} from '~/utils/tournamentMap'
import {
  getTournamentLeaderboard,
  getTournamentLeaderboardStats,
} from '~/utils/tournamentLeaderboard'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'

interface UseTournamentPublicParams {
  activeSponsors: Ref<Sponsor[]>
  mapState: Ref<MapStateResponse>
  refreshTournamentState: () => Promise<void>
  route: RouteLocationNormalizedLoaded
  tournamentState: Ref<TournamentStateResponse | null | undefined>
  user: Ref<PublicMockUser | null> | ComputedRef<PublicMockUser | null>
}

/**
 * Business logic and state for the public tournament page (app/pages/sutaze/index.vue).
 *
 * Data fetching (`useAsyncData`/`useSponsorState`) stays in the page itself, matching
 * the rest of this codebase's pages, so the already-resolved reactive refs are passed
 * in here. Everything downstream — derived tournament/sector/leaderboard state, the
 * public request/team-registration forms and their offline queueing/retry logic — lives
 * in this composable.
 */
export function useTournamentPublic(params: UseTournamentPublicParams) {
  const { activeSponsors, mapState, refreshTournamentState, route, tournamentState, user } = params

  const {
    lakes,
    tournaments: seedTournaments,
    tournamentCatches: seedTournamentCatches,
    tournamentMarshals: seedTournamentMarshals,
    tournamentPenalties: seedTournamentPenalties,
    tournamentRequests: seedTournamentRequests,
    tournamentRequestTypeLabels,
    tournamentRuleChecks: seedTournamentRuleChecks,
    tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  } = usePondData()

  const canUseTeamPanel = computed(() => user.value?.role === 'team')

  const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
  const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
  const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
  const liveTournamentPenalties = computed(() => tournamentState.value?.tournamentPenalties ?? seedTournamentPenalties)
  const liveTournamentRequests = computed(() => tournamentState.value?.tournamentRequests ?? seedTournamentRequests)
  const liveTournamentRuleChecks = computed(() => tournamentState.value?.tournamentRuleChecks ?? seedTournamentRuleChecks)
  const liveTournamentTeamRegistrations = computed(() =>
    tournamentState.value?.tournamentTeamRegistrations ?? seedTournamentTeamRegistrations,
  )
  const liveMapLayers = computed(() => mapState.value.mapLayers)
  const liveMapShapes = computed(() => mapState.value.mapShapes)
  const requestedTournamentId = computed(() =>
    Array.isArray(route.query.turnaj) ? route.query.turnaj[0] : route.query.turnaj,
  )
  const activeTournament = computed(() =>
    liveTournaments.value.find((tournament) => tournament.id === requestedTournamentId.value)
    ?? liveTournaments.value[0]
    ?? seedTournaments[0]!,
  )
  const tournamentCapabilities = computed(() => getTournamentOperationalCapabilities(activeTournament.value))
  const canSubmitTeamRegistration = computed(() => tournamentCapabilities.value.allowsTeamRegistration)
  const canSubmitTournamentRequest = computed(() => tournamentCapabilities.value.allowsTeamRequests)
  const canUseTeamRequestWorkflow = computed(() => canUseTeamPanel.value && canSubmitTournamentRequest.value)
  const teamScopedSector = computed(() =>
    user.value?.role === 'team' && user.value.tournamentId === activeTournament.value.id
      ? activeTournament.value.sectors.find((sector) => sector.id === user.value?.sectorId)
      : undefined,
  )
  const teamRequestSectors = computed(() =>
    teamScopedSector.value ? [teamScopedSector.value] : activeTournament.value.sectors,
  )
  const teamPanelTarget = computed(() => ({
    path: '/sutaze/tim',
    query: { turnaj: activeTournament.value.id },
  }))
  const activeTeamCount = computed(() =>
    activeTournament.value.sectors.filter((sector) => Boolean(sector.team)).length,
  )
  const tournamentStatusLabel = computed(() => ({
    closed: 'Ukončená',
    live: 'Prebieha',
    planned: 'Pripravuje sa',
  })[activeTournament.value.status])
  function tournamentStatusTone(status: 'closed' | 'live' | 'planned'): StatusBadgeTone {
    if (status === 'live') {
      return 'success'
    }

    if (status === 'planned') {
      return 'warning'
    }

    return 'neutral'
  }
  function tournamentStatusIcon(status: 'closed' | 'live' | 'planned') {
    if (status === 'live') {
      return 'i-heroicons-signal'
    }

    if (status === 'planned') {
      return 'i-heroicons-calendar-days'
    }

    return 'i-heroicons-check-circle'
  }
  const activeTournamentLake = computed(() => lakes.find((lake) => lake.slug === activeTournament.value.lake))
  const activeTournamentBackgroundLayer = computed(() =>
    liveMapLayers.value.find((layer) => layer.lake === activeTournament.value.lake && layer.kind === 'background' && layer.enabled),
  )
  const activeTournamentBackgroundImage = computed(() =>
    activeTournamentBackgroundLayer.value?.source ?? activeTournamentLake.value?.mapImage ?? '/images/velky-cetin-sutazna-mapa.jpg',
  )
  const activeTournamentSectorShapes = computed(() =>
    getTournamentSectorShapes(liveMapShapes.value, activeTournament.value),
  )
  const sectorMapRows = computed(() =>
    getTournamentSectorMapRows(activeTournament.value, liveMapShapes.value),
  )
  const sectorMapCoverage = computed(() => getTournamentMapCoverage(sectorMapRows.value))
  const sectorShapeById = computed(() =>
    new Map(
      sectorMapRows.value
        .filter((row) => row.shape)
        .map((row) => [row.sector.id, row.shape!]),
    ),
  )
  const tournamentMapImageAttributes = computed(() =>
    getMapLayerImageAttributes(activeTournamentBackgroundLayer.value?.imageSettings),
  )
  const responsiveTournamentMapSources = computed(() =>
    getResponsiveMapBackgroundSources(activeTournamentBackgroundImage.value),
  )
  const tournamentMapObjectFit = computed(() => {
    if (tournamentMapImageAttributes.value.preserveAspectRatio === 'none') return 'fill'

    return tournamentMapImageAttributes.value.preserveAspectRatio.endsWith(' meet') ? 'contain' : 'cover'
  })
  const requestForm = reactive<{
    sectorId: string
    type: TournamentRequest['type']
    description: string
  }>({
    sectorId: teamScopedSector.value?.id ?? activeTournament.value.sectors[1]?.id ?? activeTournament.value.sectors[0]?.id ?? '',
    type: 'catch-measurement',
    description: '',
  })
  const teamRegistrationForm = reactive<{
    city: string
    contactEmail: string
    contactName: string
    contactPhone: string
    memberCount: number
    note: string
    preferredSectorId: string
    teamName: string
  }>({
    city: '',
    contactEmail: '',
    contactName: '',
    contactPhone: '',
    memberCount: 2,
    note: '',
    preferredSectorId: activeTournament.value.sectors.find((sector) => !sector.team)?.id
      ?? activeTournament.value.sectors[0]?.id
      ?? '',
    teamName: '',
  })
  const requestSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const requestSubmitMessage = ref('')
  const teamRegistrationStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const teamRegistrationMessage = ref('')
  const offlineRequestQueue = ref<OfflineTournamentRequestQueueItem[]>([])
  const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
  const offlineSyncMessage = ref('')
  const isOnline = ref(true)
  let offlineSyncInProgress = false

  const requestTypeOptions = Object.entries(tournamentRequestTypeLabels) as [
    TournamentRequest['type'],
    string,
  ][]
  const requestValidation = computed(() =>
    tournamentRequestInputSchema.safeParse({
      description: requestForm.description,
      sectorId: requestForm.sectorId,
      tournamentId: activeTournament.value.id,
      type: requestForm.type,
    }),
  )
  const requestValidationMessages = computed(() => getValidationMessages(requestValidation.value))
  const teamRegistrationValidation = computed(() =>
    tournamentTeamRegistrationInputSchema.safeParse({
      city: teamRegistrationForm.city,
      contactEmail: teamRegistrationForm.contactEmail,
      contactName: teamRegistrationForm.contactName,
      contactPhone: teamRegistrationForm.contactPhone,
      memberCount: teamRegistrationForm.memberCount,
      note: teamRegistrationForm.note,
      preferredSectorId: teamRegistrationForm.preferredSectorId,
      teamName: teamRegistrationForm.teamName,
      tournamentId: activeTournament.value.id,
    }),
  )
  const teamRegistrationValidationMessages = computed(() => getValidationMessages(teamRegistrationValidation.value))

  const activeRequests = computed(() =>
    liveTournamentRequests.value.filter(
      (request) => request.tournamentId === activeTournament.value.id && request.status !== 'resolved',
    ),
  )
  const tournamentTeamRegistrations = computed(() =>
    liveTournamentTeamRegistrations.value.filter((registration) => registration.tournamentId === activeTournament.value.id),
  )
  const activePenalties = computed(() =>
    liveTournamentPenalties.value.filter(
      (penalty) => penalty.tournamentId === activeTournament.value.id && penalty.status === 'active',
    ),
  )
  const tournamentLeaderboard = computed(() =>
    getTournamentLeaderboard(activeTournament.value, liveTournamentCatches.value),
  )
  const leaderboardStats = computed(() =>
    getTournamentLeaderboardStats(tournamentLeaderboard.value),
  )
  const leaderboardKioskUrl = computed(() => `/sutaze/vysledkovka?turnaj=${encodeURIComponent(activeTournament.value.id)}`)
  const selectedSector = computed(() =>
    activeTournament.value.sectors.find((sector) => sector.id === requestForm.sectorId),
  )
  const selectedPreferredSector = computed(() =>
    activeTournament.value.sectors.find((sector) => sector.id === teamRegistrationForm.preferredSectorId),
  )
  const selectedMarshal = computed(() =>
    liveTournamentMarshals.value.find((marshal) => marshal.assignedSectorIds.includes(requestForm.sectorId)),
  )
  const tournamentSponsors = computed(() =>
    getSponsorsForPlacement(activeSponsors.value, {
      placementType: 'tournament',
      tournamentId: activeTournament.value.id,
    }),
  )
  const scoreboardSponsors = computed(() =>
    getSponsorsForPlacementWithFallback(
      activeSponsors.value,
      {
        placementType: 'scoreboard',
        tournamentId: activeTournament.value.id,
      },
      [{
        placementType: 'tournament',
        tournamentId: activeTournament.value.id,
      }],
    ),
  )
  const sectorSponsorEntries = computed(() =>
    activeTournament.value.sectors
      .map((sector) => ({
        sector,
        sponsors: getSponsorsForPlacement(activeSponsors.value, {
          placementType: 'sector',
          sectorId: sector.id,
          tournamentId: activeTournament.value.id,
        }),
      }))
      .filter((entry) => entry.sponsors.length > 0),
  )

  const sectorById = (id: string) =>
    activeTournament.value.sectors.find((sector) => sector.id === id)

  const marshalById = (id?: string) =>
    liveTournamentMarshals.value.find((marshal) => marshal.id === id)

  const sponsorLogo = (sponsor: Sponsor, placementType: SponsorLogoVariant['placementType']) =>
    getSponsorLogo(sponsor, placementType)

  const formatWeight = (value: number) =>
    value.toLocaleString('sk-SK', {
      maximumFractionDigits: 1,
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    })

  const requestsForSector = (sectorId: string) =>
    activeRequests.value.filter((request) => request.sectorId === sectorId)

  const hasActivePenalty = (sectorId: string) =>
    activePenalties.value.some((penalty) => penalty.sectorId === sectorId)

  const hasMapShapeForSector = (sectorId: string) =>
    sectorShapeById.value.has(sectorId)

  const requestStatusTone = (status: TournamentRequest['status']): StatusBadgeTone => {
    switch (status) {
      case 'new':
        return 'error'
      case 'assigned':
        return 'warning'
      case 'resolved':
        return 'success'
      default:
        return 'neutral'
    }
  }

  const requestStatusIcon = (status: TournamentRequest['status']) => {
    switch (status) {
      case 'new':
        return 'i-heroicons-bell-alert'
      case 'assigned':
        return 'i-heroicons-user-circle'
      case 'resolved':
        return 'i-heroicons-check-circle'
      default:
        return 'i-heroicons-clock'
    }
  }

  const catchStatusTone = (status: TournamentCatch['status']): StatusBadgeTone => {
    switch (status) {
      case 'verified':
        return 'success'
      case 'waiting':
        return 'warning'
      case 'disputed':
        return 'error'
      default:
        return 'neutral'
    }
  }

  const catchStatusIcon = (status: TournamentCatch['status']) => {
    switch (status) {
      case 'verified':
        return 'i-heroicons-scale'
      case 'waiting':
        return 'i-heroicons-clock'
      case 'disputed':
        return 'i-heroicons-shield-exclamation'
      default:
        return 'i-heroicons-question-mark-circle'
    }
  }

  const catchStatusLabel = (status: TournamentCatch['status']) => {
    switch (status) {
      case 'waiting':
        return 'čaká na kontrolóra'
      case 'verified':
        return 'overené'
      case 'disputed':
        return 'sporné'
      default:
        return status
    }
  }

  const registrationStatusTone = (status: TournamentTeamRegistration['status']): StatusBadgeTone => {
    switch (status) {
      case 'approved':
        return 'success'
      case 'submitted':
        return 'info'
      case 'waitlisted':
        return 'warning'
      case 'rejected':
        return 'error'
      default:
        return 'neutral'
    }
  }

  const registrationStatusIcon = (status: TournamentTeamRegistration['status']) => {
    switch (status) {
      case 'approved':
        return 'i-heroicons-check-circle'
      case 'submitted':
        return 'i-heroicons-inbox-arrow-down'
      case 'waitlisted':
        return 'i-heroicons-clock'
      case 'rejected':
        return 'i-heroicons-x-circle'
      default:
        return 'i-heroicons-question-mark-circle'
    }
  }

  const marshalStatusTone = (status: TournamentMarshal['status']): StatusBadgeTone => {
    switch (status) {
      case 'available':
        return 'success'
      case 'on-route':
        return 'info'
      case 'measuring':
        return 'warning'
      case 'off-duty':
        return 'neutral'
      default:
        return 'muted'
    }
  }

  const marshalStatusIcon = (status: TournamentMarshal['status']) => {
    switch (status) {
      case 'available':
        return 'i-heroicons-signal'
      case 'on-route':
        return 'i-heroicons-truck'
      case 'measuring':
        return 'i-heroicons-scale'
      case 'off-duty':
        return 'i-heroicons-moon'
      default:
        return 'i-heroicons-user-circle'
    }
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

    return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Hlásenie sa nepodarilo uložiť.'
  }

  const getQueueFallbackErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Offline hlásenie sa nepodarilo uložiť v zariadení.'

  async function refreshOfflineRequestQueue() {
    if (!import.meta.client) return
    if (!canUseTeamPanel.value) {
      offlineRequestQueue.value = []
      return
    }

    try {
      offlineRequestQueue.value = await readOfflineTournamentRequestQueue()
    }
    catch (error) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
    }
  }

  async function queueOfflineRequest(payload: OfflineTournamentRequestPayload) {
    if (!canUseTeamPanel.value) {
      requestSubmitStatus.value = 'error'
      requestSubmitMessage.value = 'Tímové hlásenie je dostupné iba po prihlásení tímového účtu.'
      return
    }

    try {
      const item = await enqueueOfflineTournamentRequest(payload)

      await refreshOfflineRequestQueue()
      requestSubmitStatus.value = 'success'
      requestSubmitMessage.value = `Slabý signál: hlásenie je uložené v tomto zariadení a odošle sa automaticky. Fronta: ${item.id}.`
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = `Vo fronte čaká ${offlineRequestQueue.value.length} súťažné hlásenie.`
      requestForm.description = ''
    }
    catch (error) {
      requestSubmitStatus.value = 'error'
      requestSubmitMessage.value = getQueueFallbackErrorMessage(error)
    }
  }

  async function discardOfflineRequest(id: string) {
    try {
      await removeOfflineTournamentRequest(id)
      await refreshOfflineRequestQueue()
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = 'Offline hlásenie bolo odstránené zo zariadenia.'
    }
    catch (error) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
    }
  }

  async function syncOfflineRequestQueue(options: { silent?: boolean } = {}) {
    if (!import.meta.client || offlineSyncInProgress) return
    if (!canUseTeamPanel.value) {
      offlineRequestQueue.value = []
      return
    }

    isOnline.value = navigator.onLine
    if (!isOnline.value) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = 'Bez pripojenia nechávam hlásenia bezpečne v zariadení.'
      return
    }

    await refreshOfflineRequestQueue()
    if (offlineRequestQueue.value.length === 0) {
      if (!options.silent) {
        offlineSyncStatus.value = 'success'
        offlineSyncMessage.value = 'Žiadne hlásenia nečakajú na odoslanie.'
      }
      return
    }

    offlineSyncInProgress = true
    offlineSyncStatus.value = 'syncing'
    offlineSyncMessage.value = `Odosielam ${offlineRequestQueue.value.length} čakajúcich hlásení.`

    let syncedCount = 0

    try {
      for (const queuedRequest of [...offlineRequestQueue.value]) {
        try {
          await $fetch<TournamentRequestSubmissionSuccess>('/api/tournament-requests', {
            body: queuedRequest.payload,
            method: 'POST',
          })
          await removeOfflineTournamentRequest(queuedRequest.id)
          syncedCount += 1
        }
        catch (error) {
          await markOfflineTournamentRequestAttempt(
            queuedRequest.id,
            getOfflineTournamentRequestQueueErrorMessage(error),
          )
        }
      }

      await refreshOfflineRequestQueue()
      if (syncedCount > 0) {
        await refreshTournamentState()
      }

      offlineSyncStatus.value = offlineRequestQueue.value.length > 0 ? 'error' : 'success'
      offlineSyncMessage.value = offlineRequestQueue.value.length > 0
        ? `${syncedCount} hlásení odoslaných, ${offlineRequestQueue.value.length} čaká na ďalší pokus.`
        : `${syncedCount} čakajúcich hlásení bolo odoslaných do dispečingu.`
    }
    finally {
      offlineSyncInProgress = false
    }
  }

  const submitRequest = async () => {
    if (!canUseTeamPanel.value) {
      requestSubmitStatus.value = 'error'
      requestSubmitMessage.value = 'Tímové hlásenie je dostupné iba po prihlásení tímového účtu.'
      return
    }

    if (!canSubmitTournamentRequest.value) {
      requestSubmitStatus.value = 'error'
      requestSubmitMessage.value = 'Organizátor tejto súťaže nemá zapnuté tímové hlásenia cez aplikáciu.'
      return
    }

    const validation = requestValidation.value
    if (!validation.success) {
      requestSubmitStatus.value = 'error'
      requestSubmitMessage.value = requestValidationMessages.value[0] ?? 'Skontrolujte hlásenie.'
      return
    }

    requestSubmitStatus.value = 'submitting'
    requestSubmitMessage.value = 'Odosielam hlásenie dispečingu.'

    try {
      const result = await $fetch<TournamentRequestSubmissionSuccess>('/api/tournament-requests', {
        body: validation.data,
        method: 'POST',
      })

      requestSubmitStatus.value = 'success'
      requestSubmitMessage.value = `${result.message} ID: ${result.request.id}.`
      requestForm.description = ''
      await refreshTournamentState()
    }
    catch (error) {
      const payload: OfflineTournamentRequestPayload = validation.data

      if (import.meta.client && shouldQueueTournamentRequestSubmission(error, navigator.onLine)) {
        await queueOfflineRequest(payload)
        return
      }

      requestSubmitStatus.value = 'error'
      requestSubmitMessage.value = getApiErrorMessage(error)
    }
  }

  const submitTeamRegistration = async () => {
    if (!canSubmitTeamRegistration.value) {
      teamRegistrationStatus.value = 'error'
      teamRegistrationMessage.value = 'Organizátor tejto súťaže nemá zapnuté online prihlasovanie tímov.'
      return
    }

    const validation = teamRegistrationValidation.value
    if (!validation.success) {
      teamRegistrationStatus.value = 'error'
      teamRegistrationMessage.value = teamRegistrationValidationMessages.value[0] ?? 'Skontrolujte prihlášku tímu.'
      return
    }

    teamRegistrationStatus.value = 'submitting'
    teamRegistrationMessage.value = 'Odosielam prihlášku organizátorovi.'

    try {
      const result = await $fetch<TournamentTeamRegistrationSubmissionSuccess>('/api/tournament-team-registrations', {
        body: validation.data,
        method: 'POST',
      })

      teamRegistrationStatus.value = 'success'
      teamRegistrationMessage.value = `${result.message} ID: ${result.registration.id}.`
      teamRegistrationForm.teamName = ''
      teamRegistrationForm.contactName = ''
      teamRegistrationForm.contactPhone = ''
      teamRegistrationForm.contactEmail = ''
      teamRegistrationForm.city = ''
      teamRegistrationForm.note = ''
      await refreshTournamentState()
    }
    catch (error) {
      teamRegistrationStatus.value = 'error'
      teamRegistrationMessage.value = getApiErrorMessage(error)
    }
  }

  function handleOnline() {
    isOnline.value = true
    if (canUseTeamPanel.value) {
      void syncOfflineRequestQueue({ silent: true })
    }
  }

  function handleOffline() {
    isOnline.value = false
    offlineSyncStatus.value = 'idle'
    offlineSyncMessage.value = 'Signál vypadol. Nové súťažné hlásenia sa uložia v zariadení.'
  }

  onMounted(() => {
    if (!import.meta.client) return

    isOnline.value = navigator.onLine
    if (!canUseTeamPanel.value) return

    void refreshOfflineRequestQueue().then(() => {
      if (navigator.onLine && offlineRequestQueue.value.length > 0) {
        void syncOfflineRequestQueue({ silent: true })
      }
    })
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  })

  onBeforeUnmount(() => {
    if (!import.meta.client) return

    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  watch(requestValidation, () => {
    if (requestSubmitStatus.value !== 'submitting') {
      requestSubmitStatus.value = 'idle'
      requestSubmitMessage.value = ''
    }
  })
  watch(canUseTeamPanel, (isTeam) => {
    if (isTeam) {
      void refreshOfflineRequestQueue()
      return
    }

    offlineRequestQueue.value = []
    offlineSyncStatus.value = 'idle'
    offlineSyncMessage.value = ''
  })
  watch(teamRegistrationValidation, () => {
    if (teamRegistrationStatus.value !== 'submitting') {
      teamRegistrationStatus.value = 'idle'
      teamRegistrationMessage.value = ''
    }
  })
  watch([activeTournament, teamScopedSector], ([tournament, scopedSector]) => {
    const allowedSectors = scopedSector ? [scopedSector] : tournament.sectors

    if (!allowedSectors.some((sector) => sector.id === requestForm.sectorId)) {
      requestForm.sectorId = scopedSector?.id ?? tournament.sectors[1]?.id ?? tournament.sectors[0]?.id ?? ''
    }
    if (!tournament.sectors.some((sector) => sector.id === teamRegistrationForm.preferredSectorId)) {
      teamRegistrationForm.preferredSectorId = tournament.sectors.find((sector) => !sector.team)?.id
        ?? tournament.sectors[0]?.id
        ?? ''
    }
  }, { immediate: true })

  return {
    activePenalties,
    activeRequests,
    activeTeamCount,
    activeTournament,
    activeTournamentBackgroundImage,
    activeTournamentSectorShapes,
    canSubmitTeamRegistration,
    canSubmitTournamentRequest,
    canUseTeamPanel,
    canUseTeamRequestWorkflow,
    catchStatusIcon,
    catchStatusLabel,
    catchStatusTone,
    discardOfflineRequest,
    formatWeight,
    hasActivePenalty,
    hasMapShapeForSector,
    leaderboardKioskUrl,
    leaderboardStats,
    liveMapLayers,
    liveMapShapes,
    liveTournamentCatches,
    liveTournamentMarshals,
    liveTournamentPenalties,
    liveTournamentRequests,
    liveTournamentRuleChecks,
    liveTournaments,
    marshalById,
    marshalStatusIcon,
    marshalStatusTone,
    isOnline,
    offlineRequestQueue,
    offlineSyncMessage,
    offlineSyncStatus,
    registrationStatusIcon,
    registrationStatusTone,
    requestForm,
    requestStatusIcon,
    requestStatusTone,
    requestSubmitMessage,
    requestSubmitStatus,
    requestTypeOptions,
    requestValidation,
    requestValidationMessages,
    requestsForSector,
    scoreboardSponsors,
    sectorById,
    sectorMapCoverage,
    sectorSponsorEntries,
    selectedMarshal,
    selectedPreferredSector,
    selectedSector,
    sponsorLogo,
    submitRequest,
    submitTeamRegistration,
    syncOfflineRequestQueue,
    teamPanelTarget,
    teamScopedSector,
    teamRegistrationForm,
    teamRegistrationMessage,
    teamRegistrationStatus,
    teamRegistrationValidation,
    teamRegistrationValidationMessages,
    teamRequestSectors,
    tournamentLeaderboard,
    tournamentMapImageAttributes,
    tournamentMapObjectFit,
    tournamentSponsors,
    tournamentStatusIcon,
    tournamentStatusLabel,
    tournamentStatusTone,
    tournamentTeamRegistrations,
    responsiveTournamentMapSources,
  }
}
