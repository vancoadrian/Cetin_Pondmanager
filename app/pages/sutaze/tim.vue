<script setup lang="ts">
import type { TournamentRequest } from '~/data/pond'
import type {
  TournamentRequestSubmissionSuccess,
  TournamentStateResponse,
} from '~/services/tournamentApiService'
import {
  getValidationMessages,
  tournamentRequestInputSchema,
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
import { getTournamentLeaderboard } from '~/utils/tournamentLeaderboard'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'
import {
  createTournamentTeamAccessCode,
  createTournamentTeamAccessCodeUrl,
  getTournamentTeamAccessSummary,
  normalizeTournamentTeamAccessCode,
  resolveTournamentTeamAccessCode,
} from '~/utils/tournamentTeamAccess'
import {
  TOURNAMENT_TEAM_SESSION_STORAGE_KEY,
  createTournamentTeamSession,
  isTournamentTeamSessionForSector,
  parseTournamentTeamSession,
  serializeTournamentTeamSession,
  touchTournamentTeamSession,
  type TournamentTeamSession,
} from '~/utils/tournamentTeamSession'

useHead({ title: 'Tímový panel súťaže' })

const route = useRoute()
const { logout, user } = useMockAuth()
const isRoleScopedTeam = computed(() => user.value?.role === 'team')
const roleTournamentId = computed(() => isRoleScopedTeam.value ? user.value?.tournamentId : undefined)
const roleSectorId = computed(() => isRoleScopedTeam.value ? user.value?.sectorId : undefined)

const {
  getLakeName,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests: seedTournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
} = usePondData()

const seedTournamentState = {
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  tournaments: seedTournaments,
}
const fallbackTournamentState = (): TournamentStateResponse =>
  createTournamentAccountStateResponse(seedTournamentState, user.value, 'seed')
  ?? createPublicTournamentStateResponse(seedTournamentState, 'seed')

const requestFetch = useRequestFetch()
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'team-tournament-state',
  () => requestFetch<TournamentStateResponse>('/api/account/tournament-state'),
  {
    default: fallbackTournamentState,
  },
)

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
const liveTournamentPenalties = computed(() => tournamentState.value?.tournamentPenalties ?? seedTournamentPenalties)
const liveTournamentRequests = computed(() => tournamentState.value?.tournamentRequests ?? seedTournamentRequests)
const requestedTournamentId = computed(() =>
  Array.isArray(route.query.turnaj) ? route.query.turnaj[0] : route.query.turnaj,
)
const requestedSectorId = computed(() =>
  Array.isArray(route.query.sektor) ? route.query.sektor[0] : route.query.sektor,
)
const requestedAccessCode = computed(() =>
  Array.isArray(route.query.kod) ? route.query.kod[0] : route.query.kod,
)
const normalizedRequestedAccessCode = computed(() =>
  normalizeTournamentTeamAccessCode(requestedAccessCode.value ?? ''),
)
const accessCodeMatch = computed(() =>
  resolveTournamentTeamAccessCode(liveTournaments.value, requestedAccessCode.value),
)
const hasInvalidRequestedAccessCode = computed(() =>
  !isRoleScopedTeam.value && Boolean(normalizedRequestedAccessCode.value && !accessCodeMatch.value),
)
const activeTournament = computed(() =>
  liveTournaments.value.find((tournament) => tournament.id === roleTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.id === accessCodeMatch.value?.tournamentId)
  ?? liveTournaments.value.find((tournament) => tournament.id === requestedTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.status === 'live')
  ?? liveTournaments.value[0]
  ?? seedTournaments[0]!,
)
const defaultSectorId = computed(() => {
  const querySector = roleSectorId.value ?? accessCodeMatch.value?.sectorId ?? requestedSectorId.value

  return activeTournament.value.sectors.find((sector) => sector.id === querySector)?.id
    ?? activeTournament.value.sectors.find((sector) => sector.team)?.id
    ?? activeTournament.value.sectors[0]?.id
    ?? ''
})
const visibleTeamSectors = computed(() =>
  isRoleScopedTeam.value
    ? activeTournament.value.sectors.filter((sector) => sector.id === roleSectorId.value)
    : activeTournament.value.sectors,
)
const requestForm = reactive<{
  description: string
  sectorId: string
  type: TournamentRequest['type']
}>({
  description: '',
  sectorId: defaultSectorId.value,
  type: 'catch-measurement',
})
const browserOrigin = ref('')

const tournamentCapabilities = computed(() => getTournamentOperationalCapabilities(activeTournament.value))
const canSubmitTournamentRequest = computed(() => tournamentCapabilities.value.allowsTeamRequests)
const canSubmitActiveTeamRequest = computed(() =>
  canSubmitTournamentRequest.value && !hasInvalidRequestedAccessCode.value,
)
const activeSector = computed(() =>
  activeTournament.value.sectors.find((sector) => sector.id === requestForm.sectorId),
)
const teamAccessSummary = computed(() =>
  getTournamentTeamAccessSummary(activeTournament.value, requestForm.sectorId || defaultSectorId.value),
)
const currentTeamAccessCode = computed(() =>
  createTournamentTeamAccessCode(activeTournament.value.id, requestForm.sectorId || defaultSectorId.value),
)
const currentTeamAccessCodeUrl = computed(() =>
  createTournamentTeamAccessCodeUrl(currentTeamAccessCode.value),
)
const absoluteTeamAccessUrl = computed(() => {
  if (!browserOrigin.value) return currentTeamAccessCodeUrl.value

  return new URL(currentTeamAccessCodeUrl.value, browserOrigin.value).toString()
})
const publicTournamentUrl = computed(() => `/sutaze?turnaj=${encodeURIComponent(activeTournament.value.id)}`)
const selectedMarshal = computed(() =>
  liveTournamentMarshals.value.find((marshal) => marshal.assignedSectorIds.includes(requestForm.sectorId)),
)
const activeSectorRequests = computed(() =>
  liveTournamentRequests.value.filter(
    (request) =>
      request.tournamentId === activeTournament.value.id
      && request.sectorId === requestForm.sectorId
      && request.status !== 'resolved',
  ),
)
const selectedSectorCatches = computed(() =>
  liveTournamentCatches.value.filter(
    (catchItem) =>
      catchItem.tournamentId === activeTournament.value.id
      && catchItem.sectorId === requestForm.sectorId,
  ),
)
const waitingSectorCatches = computed(() =>
  selectedSectorCatches.value.filter((catchItem) => catchItem.status === 'waiting'),
)
const activeSectorPenalty = computed(() =>
  liveTournamentPenalties.value.find(
    (penalty) =>
      penalty.tournamentId === activeTournament.value.id
      && penalty.sectorId === requestForm.sectorId
      && penalty.status === 'active',
  ),
)
const leaderboardRow = computed(() =>
  getTournamentLeaderboard(activeTournament.value, liveTournamentCatches.value)
    .find((row) => row.sectorId === requestForm.sectorId),
)

const requestSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const requestSubmitMessage = ref('')
const copyStatus = ref<'idle' | 'success' | 'error'>('idle')
const copyMessage = ref('')
const teamSession = ref<TournamentTeamSession>()
const teamSessionStatus = ref<'idle' | 'success' | 'error'>('idle')
const teamSessionMessage = ref('')
const teamCodeForm = reactive({
  code: normalizedRequestedAccessCode.value || currentTeamAccessCode.value,
})
const teamCodeStatus = ref<'idle' | 'success' | 'error'>('idle')
const teamCodeMessage = ref('')
const offlineRequestQueue = ref<OfflineTournamentRequestQueueItem[]>([])
const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineSyncMessage = ref('')
const isOnline = ref(true)
let offlineSyncInProgress = false

const requestTypeOptions: Array<{
  description: string
  icon: string
  label: string
  value: TournamentRequest['type']
}> = [
  {
    description: 'Ryba je pripravená na váženie.',
    icon: 'i-heroicons-scale',
    label: tournamentRequestTypeLabels['catch-measurement'],
    value: 'catch-measurement',
  },
  {
    description: 'Nahlásenie podozrenia alebo sporu.',
    icon: 'i-heroicons-shield-exclamation',
    label: tournamentRequestTypeLabels['rule-report'],
    value: 'rule-report',
  },
  {
    description: 'Výbava, sektor alebo prevádzková pomoc.',
    icon: 'i-heroicons-wrench-screwdriver',
    label: tournamentRequestTypeLabels['technical-help'],
    value: 'technical-help',
  },
  {
    description: 'Iná situácia pre dispečing.',
    icon: 'i-heroicons-chat-bubble-left-right',
    label: tournamentRequestTypeLabels.other,
    value: 'other',
  },
]
const requestValidation = computed(() =>
  tournamentRequestInputSchema.safeParse({
    description: requestForm.description,
    sectorId: requestForm.sectorId,
    tournamentId: activeTournament.value.id,
    type: requestForm.type,
  }),
)
const requestValidationMessages = computed(() => getValidationMessages(requestValidation.value))
const visibleOfflineRequestQueue = computed(() =>
  offlineRequestQueue.value.filter(
    (item) =>
      item.payload.tournamentId === activeTournament.value.id
      && item.payload.sectorId === requestForm.sectorId,
  ),
)
const activeTeamSession = computed(() =>
  isTournamentTeamSessionForSector(teamSession.value, activeTournament.value.id, requestForm.sectorId),
)
const canRestoreTeamSession = computed(() =>
  Boolean(
    teamSession.value
    && teamSession.value.tournamentId === activeTournament.value.id
    && teamSession.value.sectorId !== requestForm.sectorId
    && activeTournament.value.sectors.some((sector) => sector.id === teamSession.value?.sectorId),
  ),
)

const formatWeight = (value: number) =>
  value.toLocaleString('sk-SK', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  })

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })

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

  try {
    offlineRequestQueue.value = await readOfflineTournamentRequestQueue()
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function queueOfflineRequest(payload: OfflineTournamentRequestPayload) {
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
      offlineSyncMessage.value = 'Offline fronta hlásení je prázdna.'
    }
    return
  }

  offlineSyncInProgress = true
  offlineSyncStatus.value = 'syncing'
  offlineSyncMessage.value = `Odosielam ${offlineRequestQueue.value.length} offline hlásení.`

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
      : `${syncedCount} offline hlásení bolo odoslaných do dispečingu.`
  }
  finally {
    offlineSyncInProgress = false
  }
}

async function submitRequest() {
  if (!canSubmitTournamentRequest.value) {
    requestSubmitStatus.value = 'error'
    requestSubmitMessage.value = 'Organizátor tejto súťaže nemá zapnuté tímové hlásenia cez aplikáciu.'
    return
  }

  if (hasInvalidRequestedAccessCode.value) {
    requestSubmitStatus.value = 'error'
    requestSubmitMessage.value = 'Najprv opravte tímový kód z kartičky.'
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

async function copyTeamAccessValue(value: string, successMessage: string) {
  if (!import.meta.client || !navigator.clipboard) {
    copyMessage.value = 'Prehliadač nepovolil kopírovanie odkazu.'
    copyStatus.value = 'error'
    return
  }

  try {
    await navigator.clipboard.writeText(value)
    copyStatus.value = 'success'
    copyMessage.value = successMessage
  }
  catch {
    copyStatus.value = 'error'
    copyMessage.value = 'Kopírovanie sa nepodarilo.'
  }
}

async function copyTeamAccessCode() {
  await copyTeamAccessValue(currentTeamAccessCode.value, 'Kód tímového panelu je skopírovaný.')
}

async function copyTeamAccessLink() {
  await copyTeamAccessValue(absoluteTeamAccessUrl.value, 'Odkaz tímového panelu je skopírovaný.')
}

function saveTeamSession(session: TournamentTeamSession) {
  localStorage.setItem(TOURNAMENT_TEAM_SESSION_STORAGE_KEY, serializeTournamentTeamSession(session))
  teamSession.value = session
}

function saveTeamSessionForSummary(
  summary = teamAccessSummary.value,
  tournamentId = activeTournament.value.id,
) {
  const session = createTournamentTeamSession(summary, tournamentId)

  saveTeamSession(session)

  return session
}

function loadTeamSessionFromStorage() {
  try {
    const parsedSession = parseTournamentTeamSession(localStorage.getItem(TOURNAMENT_TEAM_SESSION_STORAGE_KEY))
    if (!parsedSession) return

    const touchedSession = touchTournamentTeamSession(parsedSession)

    saveTeamSession(touchedSession)
  }
  catch {
    teamSessionStatus.value = 'error'
    teamSessionMessage.value = 'Uložený tímový prístup sa nepodarilo načítať.'
  }
}

function activateTeamSession() {
  if (!import.meta.client) return

  try {
    saveTeamSessionForSummary()
    teamSessionStatus.value = 'success'
    teamSessionMessage.value = 'Tímový prístup je uložený v tomto zariadení.'
  }
  catch {
    teamSessionStatus.value = 'error'
    teamSessionMessage.value = 'Tímový prístup sa nepodarilo uložiť.'
  }
}

async function submitTeamCode() {
  if (!import.meta.client) return

  const normalizedCode = normalizeTournamentTeamAccessCode(teamCodeForm.code)
  if (!normalizedCode) {
    teamCodeStatus.value = 'error'
    teamCodeMessage.value = 'Zadajte tímový kód z kartičky.'
    return
  }

  const match = resolveTournamentTeamAccessCode(liveTournaments.value, normalizedCode)
  if (!match) {
    teamCodeStatus.value = 'error'
    teamCodeMessage.value = 'Tento tímový kód sa nenašiel v aktívnych súťažiach.'
    return
  }

  const tournament = liveTournaments.value.find((item) => item.id === match.tournamentId)
  const sector = tournament?.sectors.find((item) => item.id === match.sectorId)

  if (!tournament || !sector) {
    teamCodeStatus.value = 'error'
    teamCodeMessage.value = 'Kód smeruje na sektor, ktorý už nie je dostupný.'
    return
  }

  const summary = getTournamentTeamAccessSummary(tournament, sector.id)

  requestForm.sectorId = sector.id
  teamCodeForm.code = summary.code
  saveTeamSessionForSummary(summary, tournament.id)
  teamCodeStatus.value = 'success'
  teamCodeMessage.value = `Aktivované: ${summary.title}.`
  teamSessionStatus.value = 'success'
  teamSessionMessage.value = 'Tímový prístup je uložený v tomto zariadení.'

  await navigateTo(summary.codeUrl, { replace: true })
}

function restoreTeamSessionSector() {
  if (!teamSession.value || teamSession.value.tournamentId !== activeTournament.value.id) return

  requestForm.sectorId = teamSession.value.sectorId
  teamSessionStatus.value = 'success'
  teamSessionMessage.value = 'Panel je prepnutý na uložený sektor.'
}

function clearTeamSession() {
  if (!import.meta.client) return

  localStorage.removeItem(TOURNAMENT_TEAM_SESSION_STORAGE_KEY)
  teamSession.value = undefined
  teamSessionStatus.value = 'success'
  teamSessionMessage.value = 'Tímový prístup bol z tohto zariadenia odhlásený.'
}

async function signOutTeamAccount() {
  logout()
  await navigateTo('/')
}

function handleOnline() {
  isOnline.value = true
  void syncOfflineRequestQueue({ silent: true })
}

function handleOffline() {
  isOnline.value = false
  offlineSyncStatus.value = 'idle'
  offlineSyncMessage.value = 'Signál vypadol. Nové súťažné hlásenia sa uložia v zariadení.'
}

onMounted(() => {
  if (!import.meta.client) return

  browserOrigin.value = window.location.origin
  loadTeamSessionFromStorage()
  if (
    !isRoleScopedTeam.value
    && !requestedAccessCode.value
    && !requestedSectorId.value
    && teamSession.value?.tournamentId === activeTournament.value.id
    && activeTournament.value.sectors.some((sector) => sector.id === teamSession.value?.sectorId)
  ) {
    requestForm.sectorId = teamSession.value.sectorId
  }

  isOnline.value = navigator.onLine
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

watch(currentTeamAccessCode, (code) => {
  if (hasInvalidRequestedAccessCode.value && teamCodeStatus.value === 'idle') return

  if (normalizeTournamentTeamAccessCode(teamCodeForm.code) !== code) {
    teamCodeForm.code = code
  }
}, { immediate: true })

watch(() => teamCodeForm.code, () => {
  if (teamCodeStatus.value !== 'idle') {
    teamCodeStatus.value = 'idle'
    teamCodeMessage.value = ''
  }
}, { flush: 'sync' })

watch([activeTournament, requestedSectorId, requestedAccessCode], () => {
  if (isRoleScopedTeam.value && roleSectorId.value) {
    requestForm.sectorId = roleSectorId.value
    return
  }

  if (!activeTournament.value.sectors.some((sector) => sector.id === requestForm.sectorId)) {
    requestForm.sectorId = defaultSectorId.value
  }
  else if (accessCodeMatch.value?.sectorId && accessCodeMatch.value.sectorId !== requestForm.sectorId) {
    requestForm.sectorId = accessCodeMatch.value.sectorId
  }
  else if (requestedSectorId.value && requestedSectorId.value !== requestForm.sectorId) {
    const querySector = activeTournament.value.sectors.find((sector) => sector.id === requestedSectorId.value)

    if (querySector) {
      requestForm.sectorId = querySector.id
    }
  }
}, { immediate: true })
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Tímový panel"
      :title="teamAccessSummary.title"
      :description="`${activeTournament.name} · ${getLakeName(activeTournament.lake)} · ${activeTournament.dateRange}`"
    />

    <section class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div
        v-if="hasInvalidRequestedAccessCode"
        class="mb-6 rounded-card border border-error-500/25 bg-error-500/10 p-4 text-error-700"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 class="font-bold">Tímový kód sa nenašiel</h2>
            <p class="mt-1 text-sm">
              Kód {{ normalizedRequestedAccessCode }} nepatrí k žiadnemu aktuálnemu sektoru.
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-primary-700">{{ tournamentCapabilities.label }}</p>
                <h2 class="mt-1 text-2xl font-bold">
                  {{ hasInvalidRequestedAccessCode ? 'Skontrolujte tímový kód' : `Rýchle hlásenie pre sektor ${teamAccessSummary.sectorLabel}` }}
                </h2>
                <p class="text-foreground-muted mt-2 text-sm">
                  {{ teamAccessSummary.teamName }}
                </p>
              </div>
              <span
                class="w-fit rounded-md px-3 py-1 text-sm font-bold"
                :class="isOnline ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-900'"
              >
                {{ isOnline ? 'online' : 'offline režim' }}
              </span>
            </div>

            <div
              v-if="!canSubmitTournamentRequest"
              class="mt-5 rounded-md border border-info-500/25 bg-info-500/10 p-4 text-sm text-info-800"
            >
              <p class="font-bold">Tímové hlásenia nie sú v tomto režime zapnuté.</p>
              <p class="mt-1">{{ tournamentCapabilities.description }}</p>
            </div>

            <div
              v-else-if="hasInvalidRequestedAccessCode"
              class="mt-5 rounded-md border border-error-500/25 bg-error-500/10 p-4 text-sm text-error-700"
            >
              <p class="font-bold">Hlásenie je pozastavené.</p>
              <p class="mt-1">Najprv opravte tímový kód v karte Tímový prístup.</p>
            </div>

            <form class="mt-5 space-y-5" @submit.prevent="submitRequest">
              <label class="block">
                <span class="text-sm font-semibold">Sektor</span>
                <select
                  v-model="requestForm.sectorId"
                  :disabled="isRoleScopedTeam"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="sector in visibleTeamSectors" :key="sector.id" :value="sector.id">
                    {{ sector.label }} · {{ sector.team || 'voľný sektor' }}
                  </option>
                </select>
              </label>

              <div>
                <p class="text-sm font-semibold">Typ hlásenia</p>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    v-for="option in requestTypeOptions"
                    :key="option.value"
                    type="button"
                    class="rounded-md border p-3 text-left transition-colors"
                    :class="requestForm.type === option.value
                      ? 'border-primary-700 bg-primary-50 text-primary-950'
                      : 'border-border bg-white text-foreground hover:bg-muted'"
                    @click="requestForm.type = option.value"
                  >
                    <span class="flex items-center gap-2 text-sm font-bold">
                      <UIcon :name="option.icon" class="h-5 w-5" />
                      {{ option.label }}
                    </span>
                    <span class="text-foreground-muted mt-1 block text-xs">{{ option.description }}</span>
                  </button>
                </div>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="requestForm.description"
                  rows="4"
                  maxlength="240"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  placeholder="Pri meraní môže zostať prázdne. Pri porušení alebo pomoci doplňte stručný popis."
                />
              </label>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">{{ activeSector?.team || 'Nepriradený tím' }}</p>
                <p class="text-foreground-muted mt-1">
                  Sektor {{ activeSector?.label ?? requestForm.sectorId }} · kontrolór
                  {{ selectedMarshal?.name ?? 'bude priradený dispečingom' }}
                </p>
              </div>

              <ValidationSummary
                :messages="requestValidationMessages"
                :valid-title="hasInvalidRequestedAccessCode ? 'Tímový kód čaká na opravu' : 'Hlásenie je pripravené'"
                :valid-description="hasInvalidRequestedAccessCode ? 'Po oprave kódu sa hlásenie odošle do správneho sektora.' : 'Dispečing dostane sektor, typ udalosti a prípadnú poznámku.'"
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
                icon="i-heroicons-bell-alert"
                size="lg"
                block
                :disabled="!canSubmitActiveTeamRequest || !requestValidation.success || requestSubmitStatus === 'submitting'"
                :loading="requestSubmitStatus === 'submitting'"
              >
                Odoslať hlásenie dispečingu
              </UButton>
            </form>
          </div>

          <div
            v-if="!isOnline || visibleOfflineRequestQueue.length > 0 || offlineSyncMessage"
            class="rounded-card border p-5"
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
                  <h2 class="font-bold">
                    {{ isOnline ? 'Offline fronta hlásení' : 'Bez pripojenia pri sektore' }}
                  </h2>
                </div>
                <p class="mt-1 text-sm opacity-80">
                  {{ offlineSyncMessage || 'Pri výpadku signálu podržíme hlásenie v zariadení a odošleme ho po návrate internetu.' }}
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
                Odoslať frontu
              </UButton>
            </div>

            <div v-if="visibleOfflineRequestQueue.length > 0" class="mt-3 space-y-2">
              <div
                v-for="item in visibleOfflineRequestQueue"
                :key="item.id"
                class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
              >
                <div class="min-w-0">
                  <p class="truncate font-bold">
                    {{ tournamentRequestTypeLabels[item.payload.type] }} · {{ formatDateTime(item.createdAt) }}
                  </p>
                  <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                    {{ item.lastError }}
                  </p>
                </div>
                <button
                  type="button"
                  class="text-foreground-muted shrink-0 rounded-md p-1 hover:text-error-700"
                  aria-label="Odstrániť offline hlásenie"
                  @click="discardOfflineRequest(item.id)"
                >
                  <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Prístup tímu</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ isRoleScopedTeam ? 'Priradený k používateľskému účtu' : activeTeamSession ? 'Aktívny v tomto zariadení' : 'Lokálny prístup pre aktuálny sektor' }}
                </p>
              </div>
              <span
                class="rounded-md px-2.5 py-1 text-xs font-bold"
                :class="isRoleScopedTeam || activeTeamSession ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
              >
                {{ isRoleScopedTeam || activeTeamSession ? 'aktívny' : 'neuložený' }}
              </span>
            </div>

            <div class="mt-4 rounded-md border border-border bg-white p-3 text-sm">
              <p class="font-bold">{{ teamAccessSummary.teamName }}</p>
              <p class="text-foreground-muted mt-1">
                Sektor {{ teamAccessSummary.sectorLabel }} · kód {{ currentTeamAccessCode }}
              </p>
            </div>

            <form v-if="!isRoleScopedTeam" class="mt-4 space-y-2" @submit.prevent="submitTeamCode">
              <label for="team-access-code" class="block text-sm font-semibold">Zadať tímový kód</label>
              <div class="flex flex-col gap-2 sm:flex-row">
                <input
                  id="team-access-code"
                  v-model="teamCodeForm.code"
                  autocomplete="off"
                  class="h-11 min-w-0 flex-1 rounded-md border border-border bg-white px-3 text-sm font-bold uppercase"
                  data-testid="team-access-code-input"
                  placeholder="ECCJ-2026-A1"
                >
                <UButton
                  type="submit"
                  icon="i-heroicons-key"
                  class="justify-center"
                  data-testid="team-access-code-submit"
                >
                  Použiť kód
                </UButton>
              </div>
              <p
                v-if="teamCodeMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="teamCodeStatus === 'success' ? 'bg-success-500/10 text-success-700' : 'bg-error-500/10 text-error-700'"
              >
                {{ teamCodeMessage }}
              </p>
            </form>

            <div
              v-if="teamSession && !activeTeamSession"
              class="mt-3 rounded-md border border-warning-200 bg-warning-500/10 p-3 text-sm text-warning-900"
            >
              <p class="font-bold">{{ teamSession.teamName }}</p>
              <p class="mt-1">
                Uložený sektor {{ teamSession.sectorLabel }} · {{ teamSession.code }}
              </p>
            </div>

            <p
              v-if="teamSessionMessage"
              class="mt-3 rounded-md px-3 py-2 text-sm font-semibold"
              :class="teamSessionStatus === 'success' ? 'bg-success-500/10 text-success-700' : 'bg-error-500/10 text-error-700'"
            >
              {{ teamSessionMessage }}
            </p>

            <div v-if="!isRoleScopedTeam" class="mt-4 flex flex-wrap gap-2">
              <UButton
                icon="i-heroicons-device-phone-mobile"
                size="sm"
                variant="soft"
                @click="activateTeamSession"
              >
                {{ activeTeamSession ? 'Aktualizovať' : teamSession ? 'Prepísať prístup' : 'Aktivovať' }}
              </UButton>
              <UButton
                v-if="canRestoreTeamSession"
                icon="i-heroicons-arrow-uturn-left"
                size="sm"
                variant="soft"
                @click="restoreTeamSessionSector"
              >
                Uložený sektor
              </UButton>
              <UButton
                v-if="teamSession"
                icon="i-heroicons-arrow-right-on-rectangle"
                size="sm"
                variant="ghost"
                @click="clearTeamSession"
              >
                Odhlásiť
              </UButton>
            </div>
            <UButton
              v-else
              icon="i-heroicons-arrow-left-on-rectangle"
              size="sm"
              variant="ghost"
              class="mt-4"
              @click="signOutTeamAccount"
            >
              Odhlásiť účet
            </UButton>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Stav sektora</h2>
                <p class="text-foreground-muted mt-1 text-sm">{{ teamAccessSummary.title }}</p>
              </div>
              <span
                class="rounded-md px-2.5 py-1 text-xs font-bold"
                :class="teamAccessSummary.hasAssignedTeam ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-900'"
              >
                {{ teamAccessSummary.hasAssignedTeam ? 'priradený' : 'bez tímu' }}
              </span>
            </div>

            <div class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">skóre</p>
                <p class="font-black">{{ formatWeight(leaderboardRow?.scoreWeightKg ?? 0) }} kg</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">hlásenia</p>
                <p class="font-black">{{ activeSectorRequests.length }}</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">váženia</p>
                <p class="font-black">{{ waitingSectorCatches.length }}</p>
              </div>
            </div>

            <div class="mt-4 rounded-md border border-border bg-white p-3 text-sm">
              <p class="font-bold">{{ selectedMarshal?.name ?? 'Kontrolór nie je priradený' }}</p>
              <p class="text-foreground-muted mt-1">
                {{ selectedMarshal?.phone ?? 'Dispečing priradí kontrolóra po odoslaní hlásenia.' }}
              </p>
            </div>

            <div
              v-if="activeSectorPenalty"
              class="mt-4 rounded-md border border-error-500/25 bg-error-500/10 p-3 text-sm text-error-700"
            >
              <p class="font-bold">{{ tournamentPenaltyTypeLabels[activeSectorPenalty.type] }}</p>
              <p class="mt-1">{{ activeSectorPenalty.reason }}</p>
            </div>
          </div>

          <div v-if="!isRoleScopedTeam" class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Odkaz pre tím</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Kód aj link otvoria súťaž s predvoleným sektorom.
                </p>
              </div>
              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  icon="i-heroicons-key"
                  size="sm"
                  variant="soft"
                  @click="copyTeamAccessCode"
                >
                  Kód
                </UButton>
                <UButton
                  icon="i-heroicons-clipboard-document"
                  size="sm"
                  variant="soft"
                  @click="copyTeamAccessLink"
                >
                  Link
                </UButton>
              </div>
            </div>
            <div class="mt-4 rounded-md border border-primary-200 bg-primary-50 px-3 py-3">
              <p class="text-xs font-bold uppercase text-primary-700">Tímový kód</p>
              <p class="mt-1 break-all text-lg font-black text-primary-950">{{ currentTeamAccessCode }}</p>
            </div>
            <p class="mt-4 break-all rounded-md bg-muted px-3 py-2 text-xs font-semibold text-foreground-muted">
              {{ absoluteTeamAccessUrl }}
            </p>
            <p
              v-if="copyMessage"
              class="mt-3 rounded-md px-3 py-2 text-sm font-semibold"
              :class="copyStatus === 'success' ? 'bg-success-500/10 text-success-700' : 'bg-error-500/10 text-error-700'"
            >
              {{ copyMessage }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <UButton :to="publicTournamentUrl" icon="i-heroicons-map" variant="soft" size="sm">
                Verejná súťaž
              </UButton>
              <UButton to="/offline" icon="i-heroicons-inbox-stack" variant="soft" size="sm">
                Offline centrum
              </UButton>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Aktívne udalosti</h2>
            <div v-if="activeSectorRequests.length > 0" class="mt-4 space-y-3">
              <div
                v-for="request in activeSectorRequests"
                :key="request.id"
                class="rounded-md border border-border bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">{{ tournamentRequestTypeLabels[request.type] }}</p>
                    <p class="text-foreground-muted mt-1 text-xs">{{ formatDateTime(request.createdAt) }}</p>
                  </div>
                  <span class="rounded-md px-2 py-1 text-xs font-bold" :class="requestStatusClass(request.status)">
                    {{ tournamentRequestStatusLabels[request.status] }}
                  </span>
                </div>
                <p v-if="request.description" class="text-foreground-muted mt-2 text-sm">{{ request.description }}</p>
              </div>
            </div>
            <p v-else class="text-foreground-muted mt-4 rounded-md bg-muted px-3 py-2 text-sm">
              Pre tento sektor nie je otvorené žiadne hlásenie.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
