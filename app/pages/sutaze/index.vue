<script setup lang="ts">
import type { Sponsor, SponsorLogoVariant, TournamentRequest, TournamentTeamRegistration } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import type {
  TournamentTeamRegistrationSubmissionSuccess,
  TournamentRequestSubmissionSuccess,
  TournamentStateResponse,
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
import {
  getMapLayerImageAttributes,
  getMapShapePoints,
  getMapShapeStyle,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
} from '~/utils/map'
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
import { createTournamentTeamAccessUrl } from '~/utils/tournamentTeamAccess'

useHead({ title: 'Súťaže' })

const route = useRoute()
const { user } = useMockAuth()
const canUseTeamPanel = computed(() => user.value?.role === 'team')
const canViewCompetitionOperations = false

const {
  getLakeName,
  lakes,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentMarshalStatusLabels,
  tournamentPenalties: seedTournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests: seedTournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  tournamentTeamRegistrationStatusLabels,
} = usePondData()
const { activeSponsors } = await useSponsorState({ key: 'public-tournament-sponsor-state' })

const fallbackTournamentState = (): TournamentStateResponse =>
  createPublicTournamentStateResponse({
    tournamentCatches: seedTournamentCatches,
    tournamentMarshals: seedTournamentMarshals,
    tournamentPenalties: seedTournamentPenalties,
    tournamentRequests: seedTournamentRequests,
    tournamentRuleChecks: seedTournamentRuleChecks,
    tournamentTeamRegistrations: seedTournamentTeamRegistrations,
    tournaments: seedTournaments,
  }, 'seed')
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'public-tournament-state',
  () => $fetch<TournamentStateResponse>('/api/tournaments'),
  {
    default: fallbackTournamentState,
  },
)
const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const { data: mapState } = await useAsyncData<MapStateResponse>(
  'public-tournament-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)

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
const requestForm = reactive<{
  sectorId: string
  type: TournamentRequest['type']
  description: string
}>({
  sectorId: activeTournament.value.sectors[1]?.id ?? activeTournament.value.sectors[0]?.id ?? '',
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
const tournamentTeamAccessUrl = (sectorId: string) =>
  createTournamentTeamAccessUrl(activeTournament.value.id, sectorId)
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

const requestStatusClass = (status: TournamentRequest['status']) => {
  switch (status) {
    case 'new':
      return 'bg-error-500/10 text-error-700'
    case 'assigned':
      return 'bg-warning-500/10 text-warning-700'
    case 'resolved':
      return 'bg-success-500/10 text-success-700'
    default:
      return 'bg-muted text-foreground-muted'
  }
}

const catchStatusLabel = (status: string) => {
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

const registrationStatusClass = (status: TournamentTeamRegistration['status']) => {
  switch (status) {
    case 'approved':
      return 'bg-success-500/10 text-success-700'
    case 'submitted':
      return 'bg-info-500/10 text-info-700'
    case 'waitlisted':
      return 'bg-warning-500/10 text-warning-700'
    case 'rejected':
      return 'bg-error-500/10 text-error-700'
    default:
      return 'bg-muted text-foreground-muted'
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
  requestSubmitMessage.value = ''

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
  teamRegistrationMessage.value = ''

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
watch(activeTournament, (tournament) => {
  if (!tournament.sectors.some((sector) => sector.id === requestForm.sectorId)) {
    requestForm.sectorId = tournament.sectors[1]?.id ?? tournament.sectors[0]?.id ?? ''
  }
  if (!tournament.sectors.some((sector) => sector.id === teamRegistrationForm.preferredSectorId)) {
    teamRegistrationForm.preferredSectorId = tournament.sectors.find((sector) => !sector.team)?.id
      ?? tournament.sectors[0]?.id
      ?? ''
  }
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Súťaže"
      title="Rybárske súťaže"
      description="Termíny, sektory, pravidlá, priebežné výsledky a prihlasovanie tímov na podujatia v revíri."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="border-border bg-surface overflow-hidden rounded-card border">
          <div class="border-border flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-primary-700 text-sm font-semibold">
                {{ getLakeName(activeTournament.lake) }} · {{ activeTournament.dateRange }}
              </p>
              <h2 class="text-2xl font-bold">{{ activeTournament.name }}</h2>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge
                :icon="tournamentStatusIcon(activeTournament.status)"
                :label="tournamentStatusLabel"
                :tone="tournamentStatusTone(activeTournament.status)"
              />
            </div>
          </div>

          <div class="bg-primary-950 relative aspect-[4/3] overflow-hidden">
            <svg
              class="absolute inset-0 h-full w-full"
              :viewBox="`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`"
              role="img"
              :aria-label="`Súťažná mapa ${activeTournament.name}`"
            >
              <image
                v-if="activeTournamentBackgroundImage"
                :href="activeTournamentBackgroundImage"
                :aria-label="`Mapa ${getLakeName(activeTournament.lake)}`"
                :x="tournamentMapImageAttributes.x"
                :y="tournamentMapImageAttributes.y"
                :width="tournamentMapImageAttributes.width"
                :height="tournamentMapImageAttributes.height"
                :preserveAspectRatio="tournamentMapImageAttributes.preserveAspectRatio"
                :opacity="tournamentMapImageAttributes.opacity"
              />
              <g v-else>
                <rect width="100" height="75" fill="#d7f1ff" />
                <ellipse cx="50" cy="37.5" rx="42" ry="23" fill="#48b9f5" opacity="0.75" />
                <ellipse cx="50" cy="37.5" rx="21" ry="10" fill="#116199" opacity="0.22" />
              </g>

              <polygon
                v-for="shape in activeTournamentSectorShapes"
                :key="shape.id"
                :points="getMapShapePoints(shape)"
                :fill="getMapShapeStyle(shape.tone).fill"
                :stroke="getMapShapeStyle(shape.tone).stroke"
                :stroke-dasharray="shape.sectorId ? undefined : '2 1.4'"
                stroke-width="0.7"
              />

              <rect width="100" height="75" fill="url(#tournament-map-fade)" />
              <defs>
                <linearGradient id="tournament-map-fade" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#062523" stop-opacity="0" />
                  <stop offset="100%" stop-color="#062523" stop-opacity="0.38" />
                </linearGradient>
              </defs>
            </svg>
            <button
              v-for="sector in activeTournament.sectors"
              :key="sector.id"
              type="button"
              class="map-dot-shadow absolute flex h-12 min-w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md px-2 text-sm font-black ring-2 ring-white transition-transform hover:scale-105"
              :class="
                hasActivePenalty(sector.id)
                  ? 'bg-error-500 text-white'
                  : hasMapShapeForSector(sector.id)
                    ? 'bg-accent-400 text-primary-950'
                    : 'bg-white/90 text-primary-950'
              "
              :style="{ left: `${sector.x}%`, top: `${sector.y}%` }"
              :aria-label="sector.label"
              @click="canUseTeamRequestWorkflow && (requestForm.sectorId = sector.id)"
            >
              {{ sector.label }}
              <span
                v-if="canViewCompetitionOperations && requestsForSector(sector.id).length"
                class="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs text-error-700"
              >
                {{ requestsForSector(sector.id).length }}
              </span>
            </button>
            <div class="absolute right-4 bottom-4 rounded-md bg-primary-950/80 px-3 py-2 text-xs font-bold text-white backdrop-blur">
              {{ sectorMapCoverage.mappedSectorCount }}/{{ sectorMapCoverage.totalSectorCount }} sektorov
            </div>
          </div>

          <div
            v-if="tournamentSponsors.length > 0"
            class="border-t border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-bold uppercase text-primary-700">Partneri súťaže</p>
                <p class="text-foreground-muted mt-0.5 text-sm">Ďakujeme partnerom za podporu podujatia.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="sponsor in tournamentSponsors"
                  :key="sponsor.id"
                  class="flex h-12 min-w-28 items-center gap-2 rounded-md border border-border bg-muted px-3"
                >
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
                    <img
                      v-if="sponsorLogo(sponsor, 'tournament').url"
                      :src="sponsorLogo(sponsor, 'tournament').url"
                      :alt="sponsorLogo(sponsor, 'tournament').alt"
                      class="h-full w-full bg-white object-contain p-1"
                    >
                    <span v-else>{{ sponsorLogo(sponsor, 'tournament').text }}</span>
                  </span>
                  <span class="truncate text-xs font-bold">{{ sponsor.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="sectorSponsorEntries.length > 0"
            class="border-t border-border bg-primary-50 p-4"
          >
            <p class="text-xs font-bold uppercase text-primary-700">Sektoroví partneri</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <div
                v-for="entry in sectorSponsorEntries"
                :key="entry.sector.id"
                class="flex items-center gap-2 rounded-md bg-white px-3 py-2"
              >
                <span class="rounded-md bg-primary-900 px-2 py-1 text-xs font-black text-accent-300">
                  {{ entry.sector.label }}
                </span>
                <span class="truncate text-sm font-semibold">
                  {{ entry.sponsors.map((sponsor) => sponsor.name).join(', ') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Zapojené tímy</p>
              <p class="mt-2 text-3xl font-bold">{{ activeTeamCount }}</p>
            </div>
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Overené úlovky</p>
              <p class="mt-2 text-3xl font-bold">{{ leaderboardStats.totalVerifiedCatchCount }}</p>
            </div>
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Priebežná váha</p>
              <p class="mt-2 text-3xl font-bold">{{ formatWeight(leaderboardStats.totalScoreWeightKg) }} kg</p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Priebežné výsledky</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Poradie podľa súťažného skóre zo sektorov.
                </p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <span class="rounded-md bg-success-500/10 px-2.5 py-1 text-xs font-bold text-success-700">
                  {{ activeTeamCount }} tímov
                </span>
                <NuxtLink
                  :to="leaderboardKioskUrl"
                  class="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent-100 px-2 text-xs font-bold text-accent-700 transition-colors hover:bg-accent-200"
                >
                  <UIcon name="i-heroicons-presentation-chart-bar" class="h-3.5 w-3.5" />
                  Celá výsledkovka
                </NuxtLink>
              </div>
            </div>

            <div class="mt-4 overflow-hidden rounded-md border border-border">
              <div
                v-for="row in tournamentLeaderboard"
                :key="row.sectorId"
                class="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border bg-white px-3 py-3 last:border-b-0"
                :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-50' : ''"
              >
                <span
                  class="flex h-8 min-w-8 items-center justify-center rounded-md text-sm font-black"
                  :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-400 text-primary-950' : 'bg-muted text-foreground-muted'"
                >
                  {{ row.rank }}.
                </span>
                <div class="min-w-0">
                  <p class="truncate font-bold">{{ row.team }}</p>
                  <p class="text-foreground-muted mt-0.5 truncate text-xs">
                    {{ row.sectorLabel }} · {{ row.verifiedCatchCount }} overených úlovkov
                  </p>
                  <NuxtLink
                  v-if="canUseTeamRequestWorkflow"
                    :to="tournamentTeamAccessUrl(row.sectorId)"
                    class="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary-50 px-2 text-xs font-bold text-primary-800 transition-colors hover:bg-primary-100"
                  >
                    <UIcon name="i-heroicons-device-phone-mobile" class="h-3.5 w-3.5" />
                    Tímový panel
                  </NuxtLink>
                </div>
                <div class="text-right">
                  <p class="font-black">{{ formatWeight(row.scoreWeightKg) }} kg</p>
                  <p class="text-foreground-muted text-xs">
                    max {{ formatWeight(row.largestCatchKg) }} kg
                  </p>
                </div>
              </div>
            </div>

            <p class="text-foreground-muted mt-3 text-xs">
              Do priebežného poradia sa započítavajú iba úlovky potvrdené kontrolórom.
            </p>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Prihlásiť tím</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Odošlite kontaktné údaje, počet členov a preferovaný sektor.
                </p>
              </div>
            </div>

            <form
              v-if="canSubmitTeamRegistration"
              class="mt-5 space-y-4"
              @submit.prevent="submitTeamRegistration"
            >
              <label class="block">
                <span class="text-sm font-semibold">Názov tímu</span>
                <input
                  v-model="teamRegistrationForm.teamName"
                  maxlength="120"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  placeholder="Napr. Cetín Carp Juniors"
                >
              </label>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Kontaktná osoba</span>
                  <input
                    v-model="teamRegistrationForm.contactName"
                    maxlength="100"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="Meno a priezvisko"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Telefón</span>
                  <input
                    v-model="teamRegistrationForm.contactPhone"
                    maxlength="32"
                    inputmode="tel"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="+421..."
                  >
                </label>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">E-mail</span>
                  <input
                    v-model="teamRegistrationForm.contactEmail"
                    maxlength="120"
                    inputmode="email"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="voliteľné"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Počet členov</span>
                  <input
                    v-model.number="teamRegistrationForm.memberCount"
                    type="number"
                    min="1"
                    max="8"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Mesto</span>
                  <input
                    v-model="teamRegistrationForm.city"
                    maxlength="80"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="voliteľné"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Preferovaný sektor</span>
                  <select
                    v-model="teamRegistrationForm.preferredSectorId"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                    <option value="">Bez preferencie</option>
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team || 'voľný' }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="teamRegistrationForm.note"
                  rows="3"
                  maxlength="500"
                  placeholder="Napr. preferovaný príchod, veková kategória, vybavenie..."
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">{{ selectedPreferredSector?.label ?? 'Bez preferencie sektora' }}</p>
                <p class="text-foreground-muted mt-1">
                  {{ selectedPreferredSector?.team ? `Aktuálne evidovaný tím: ${selectedPreferredSector.team}` : 'Organizátor sektor potvrdí po kontrole kapacity.' }}
                </p>
              </div>

              <ValidationSummary
                :messages="teamRegistrationValidationMessages"
                valid-title="Prihláška je pripravená"
                valid-description="Po odoslaní ju organizátor skontroluje a ozve sa kontaktnej osobe."
              />

              <p
                v-if="teamRegistrationMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  teamRegistrationStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ teamRegistrationMessage }}
              </p>

              <UButton
                type="submit"
                icon="i-heroicons-user-plus"
                block
                :disabled="!canSubmitTeamRegistration || !teamRegistrationValidation.success || teamRegistrationStatus === 'submitting'"
                :loading="teamRegistrationStatus === 'submitting'"
              >
                Odoslať prihlášku tímu
              </UButton>
            </form>

            <div v-else class="mt-5 rounded-md border border-info-500/25 bg-info-500/10 p-4 text-sm text-info-800">
              <p class="font-bold">Online prihlásenie tímu nie je momentálne dostupné.</p>
              <p class="mt-1">
                Informácie o prihlásení tímu vám poskytne organizátor súťaže.
              </p>
            </div>

            <div v-if="canViewCompetitionOperations && tournamentTeamRegistrations.length > 0" class="mt-5 space-y-2">
              <div
                v-for="registration in tournamentTeamRegistrations.slice(0, 3)"
                :key="registration.id"
                class="rounded-md border border-border bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-bold">{{ registration.teamName }}</p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ registration.contactName }} · {{ registration.memberCount }} členovia
                    </p>
                  </div>
                  <span
                    class="w-fit rounded-md px-2 py-1 text-xs font-bold"
                    :class="registrationStatusClass(registration.status)"
                  >
                    {{ tournamentTeamRegistrationStatusLabels[registration.status] }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="canUseTeamPanel" class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Privolať kontrolóra</h2>
            <div
              v-if="!isOnline || offlineRequestQueue.length > 0 || offlineSyncMessage"
              class="mt-4 rounded-md border p-3"
              :class="
                offlineSyncStatus === 'error' || !isOnline
                  ? 'border-warning-200 bg-warning-500/10 text-warning-900'
                  : 'border-primary-200 bg-primary-50 text-primary-950'
              "
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                      class="h-5 w-5"
                    />
                    <p class="text-sm font-bold">
                      {{ isOnline ? 'Offline fronta hlásení' : 'Bez pripojenia pri sektore' }}
                    </p>
                  </div>
                  <p class="mt-1 text-sm opacity-80">
                    {{ offlineSyncMessage || 'Pri výpadku signálu podržíme hlásenie v zariadení a odošleme ho hneď po návrate internetu.' }}
                  </p>
                </div>
                <UButton
                  v-if="offlineRequestQueue.length > 0"
                  size="sm"
                  icon="i-heroicons-arrow-path"
                  variant="soft"
                  :disabled="!isOnline || offlineSyncStatus === 'syncing'"
                  :loading="offlineSyncStatus === 'syncing'"
                  @click="syncOfflineRequestQueue()"
                >
                  Odoslať
                </UButton>
              </div>

              <div v-if="offlineRequestQueue.length > 0" class="mt-3 space-y-2">
                <div
                  v-for="item in offlineRequestQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ tournamentRequestTypeLabels[item.payload.type] }} ·
                      {{ sectorById(item.payload.sectorId)?.label ?? item.payload.sectorId }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ sectorById(item.payload.sectorId)?.team ?? 'tím čaká na synchronizáciu' }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="text-foreground-muted hover:text-error-700 shrink-0 rounded-md p-1"
                    aria-label="Odstrániť offline hlásenie"
                    @click="discardOfflineRequest(item.id)"
                  >
                    <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <form
              v-if="canSubmitTournamentRequest"
              class="mt-5 space-y-4"
              @submit.prevent="submitRequest"
            >
              <label class="block">
                <span class="text-sm font-semibold">Sektor tímu</span>
                <select
                  v-model="requestForm.sectorId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                    {{ sector.label }} · {{ sector.team }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <select
                  v-model="requestForm.type"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="[value, label] in requestTypeOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="requestForm.description"
                  rows="3"
                  placeholder="Napr. úlovok pripravený na váženie pri sektore..."
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">{{ selectedSector?.team }}</p>
                <p class="text-foreground-muted mt-1">
                  Sektor {{ selectedSector?.label }} · kontrolór
                  {{ selectedMarshal?.name ?? 'bude priradený dispečingom' }}
                </p>
              </div>

              <ValidationSummary
                :messages="requestValidationMessages"
                valid-title="Hlásenie je pripravené"
                valid-description="Dispečing dostane sektor, typ udalosti a prípadnú poznámku."
              />

              <p
                v-if="requestSubmitMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  requestSubmitStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ requestSubmitMessage }}
              </p>

              <UButton
                type="submit"
                icon="i-heroicons-paper-airplane"
                block
                :disabled="!canUseTeamRequestWorkflow || !requestValidation.success || requestSubmitStatus === 'submitting'"
                :loading="requestSubmitStatus === 'submitting'"
              >
                Odoslať hlásenie
              </UButton>
            </form>
            <div v-else class="mt-5 rounded-md border border-info-500/25 bg-info-500/10 p-4 text-sm text-info-800">
              <p class="font-bold">Tímové hlásenia cez aplikáciu nie sú zapnuté.</p>
              <p class="mt-1">
                Pokyny pre tímy poskytne organizátor pred začiatkom súťaže.
              </p>
            </div>
          </div>

          <div v-if="canViewCompetitionOperations" class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Kontrolóri a sektory</h2>
            <div class="mt-4 space-y-3">
              <div
                v-for="marshal in liveTournamentMarshals"
                :key="marshal.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map((id) => sectorById(id)?.label ?? id).join(', ') }}
                    </p>
                  </div>
                  <span class="rounded-md bg-primary-50 px-2 py-1 text-xs font-bold text-primary-800">
                    {{ tournamentMarshalStatusLabels[marshal.status] }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div v-if="canViewCompetitionOperations" class="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Požiadavky tímov</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="request in liveTournamentRequests"
              :key="request.id"
              class="rounded-md border border-border bg-white p-4"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">
                    {{ sectorById(request.sectorId)?.label }} · {{ request.team }}
                  </p>
                  <p class="text-primary-800 text-sm font-semibold">
                    {{ tournamentRequestTypeLabels[request.type] }}
                  </p>
                </div>
                <span
                  class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="requestStatusClass(request.status)"
                >
                  {{ tournamentRequestStatusLabels[request.status] }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{{ request.createdAt }}</span>
                <span v-if="request.assignedMarshalId">
                  kontrolór {{ marshalById(request.assignedMarshalId)?.name }}
                </span>
                <span v-if="request.priority === 'high'" class="font-bold text-error-700">
                  priorita
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Meranie a evidencia úlovkov</h2>
              <p class="text-foreground-muted mt-1 text-sm">Vo výsledkoch sa zobrazujú iba úlovky potvrdené kontrolórom.</p>
            </div>
            <div
              v-if="scoreboardSponsors.length > 0"
              class="flex flex-wrap gap-2 sm:justify-end"
            >
              <div
                v-for="sponsor in scoreboardSponsors"
                :key="sponsor.id"
                class="flex h-10 min-w-24 items-center gap-2 rounded-md border border-border bg-white px-2"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-primary-900 text-[10px] font-black text-accent-300">
                  <img
                    v-if="sponsorLogo(sponsor, 'scoreboard').url"
                    :src="sponsorLogo(sponsor, 'scoreboard').url"
                    :alt="sponsorLogo(sponsor, 'scoreboard').alt"
                    class="h-full w-full bg-white object-contain p-0.5"
                  >
                  <span v-else>{{ sponsorLogo(sponsor, 'scoreboard').text }}</span>
                </span>
                <span class="truncate text-[11px] font-bold">{{ sponsor.name }}</span>
              </div>
            </div>
          </div>
          <div class="mt-4 overflow-hidden rounded-md border border-border">
            <div
              v-for="catchItem in liveTournamentCatches"
              :key="catchItem.id"
              class="grid gap-3 border-b border-border bg-white p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p class="font-bold">
                  {{ catchItem.team }} · {{ sectorById(catchItem.sectorId)?.label }}
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  Chytené {{ catchItem.caughtAt }} · merané {{ catchItem.measuredAt }}
                </p>
                <p class="text-foreground-muted mt-2 text-xs">{{ catchItem.notes }}</p>
              </div>
              <div class="flex flex-row items-center gap-2 md:flex-col md:items-end">
                <span
                  class="rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="
                    catchItem.status === 'verified'
                      ? 'bg-success-500/10 text-success-700'
                      : 'bg-warning-500/10 text-warning-700'
                  "
                >
                  {{ catchStatusLabel(catchItem.status) }}
                </span>
                <span class="text-foreground-muted text-xs">
                  {{ marshalById(catchItem.verifiedByMarshalId)?.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="canViewCompetitionOperations" class="mt-8 grid gap-6 lg:grid-cols-2">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Tresty a napomenutia</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="penalty in liveTournamentPenalties"
              :key="penalty.id"
              class="rounded-md border border-border bg-white p-4"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">
                    {{ sectorById(penalty.sectorId)?.label }} · {{ penalty.team }}
                  </p>
                  <p class="text-error-700 text-sm font-semibold">
                    {{ tournamentPenaltyTypeLabels[penalty.type] }}
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold">
                  {{ penalty.status === 'active' ? 'aktívne' : 'uzavreté' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ penalty.reason }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{{ penalty.issuedAt }}</span>
                <span>kontrolór {{ marshalById(penalty.issuedByMarshalId)?.name }}</span>
                <span v-if="penalty.durationHours">{{ penalty.durationHours }} h</span>
                <span v-if="penalty.rodsLess">-{{ penalty.rodsLess }} prút</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Kontroly pravidiel</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="check in liveTournamentRuleChecks"
              :key="check.id"
              class="rounded-md border border-border bg-white p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-bold">
                    {{ sectorById(check.sectorId)?.label }} · {{ marshalById(check.marshalId)?.name }}
                  </p>
                  <p class="text-foreground-muted text-sm">{{ check.checkedAt }}</p>
                </div>
                <span
                  class="rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="
                    check.result === 'ok'
                      ? 'bg-success-500/10 text-success-700'
                      : check.result === 'warning'
                        ? 'bg-warning-500/10 text-warning-700'
                        : 'bg-error-500/10 text-error-700'
                  "
                >
                  {{ check.result === 'ok' ? 'OK' : check.result === 'warning' ? 'napomenutie' : 'trest' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ check.note }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
