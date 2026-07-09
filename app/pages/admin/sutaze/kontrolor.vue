<script setup lang="ts">
import type {
  TournamentCatch,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
} from '~/data/pond'
import type {
  TournamentActionSuccess,
  TournamentCatchVerificationSuccess,
  TournamentPenaltySubmissionSuccess,
  TournamentRuleCheckSubmissionSuccess,
  TournamentStateResponse,
} from '~/services/tournamentApiService'
import {
  getValidationMessages,
  tournamentPenaltyInputSchema,
  tournamentRuleCheckInputSchema,
} from '~/schemas/pondSchemas'
import {
  enqueueOfflineTournamentAdminAction,
  getOfflineTournamentAdminActionQueueErrorMessage,
  markOfflineTournamentAdminActionAttempt,
  readOfflineTournamentAdminActionQueue,
  removeOfflineTournamentAdminAction,
  shouldQueueTournamentAdminActionSubmission,
  withTournamentAdminActionClientMutationId,
  type OfflineTournamentAdminActionPayload,
  type OfflineTournamentAdminActionQueueItem,
} from '~/services/offlineTournamentAdminActionQueueService'
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'
import type { StatusBadgeTone } from '~/utils/ui'

type NoticeTone = 'error' | 'info' | 'success' | 'warning'

useHead({ title: 'Panel kontrolóra' })

const route = useRoute()
const { user } = useMockAuth()
const isRoleScopedMarshal = computed(() => user.value?.role === 'marshal')
const roleMarshalId = computed(() => isRoleScopedMarshal.value ? user.value?.marshalId : undefined)
const roleTournamentId = computed(() => isRoleScopedMarshal.value ? user.value?.tournamentId : undefined)

const {
  getLakeName,
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
  'admin-tournament-marshal-panel-state',
  () => requestFetch<TournamentStateResponse>('/api/account/tournament-state'),
  {
    default: fallbackTournamentState,
  },
)

const {
  canOperate: canOperateTournaments,
  readOnlyMessage: tournamentReadOnlyMessage,
} = useAdminModuleAccess('tournaments')

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
const liveTournamentPenalties = computed(() => tournamentState.value?.tournamentPenalties ?? seedTournamentPenalties)
const liveTournamentRequests = computed(() => tournamentState.value?.tournamentRequests ?? seedTournamentRequests)
const liveTournamentRuleChecks = computed(() => tournamentState.value?.tournamentRuleChecks ?? seedTournamentRuleChecks)

const requestedTournamentId = computed(() =>
  Array.isArray(route.query.turnaj) ? route.query.turnaj[0] : route.query.turnaj,
)
const requestedMarshalId = computed(() =>
  Array.isArray(route.query.kontrolor) ? route.query.kontrolor[0] : route.query.kontrolor,
)
const activeTournament = computed(() =>
  liveTournaments.value.find((tournament) => tournament.id === roleTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.id === requestedTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.status === 'live')
  ?? liveTournaments.value[0]
  ?? seedTournaments[0]!,
)
const selectedMarshalId = ref('')
const defaultMarshal = computed(() =>
  liveTournamentMarshals.value.find((marshal) => marshal.id === roleMarshalId.value)
  ?? liveTournamentMarshals.value.find((marshal) => marshal.id === requestedMarshalId.value)
  ?? liveTournamentMarshals.value.find((marshal) => marshal.status !== 'off-duty')
  ?? liveTournamentMarshals.value[0],
)
const visibleMarshals = computed(() =>
  isRoleScopedMarshal.value
    ? liveTournamentMarshals.value.filter((marshal) => marshal.id === roleMarshalId.value)
    : liveTournamentMarshals.value,
)
const activeMarshal = computed(() =>
  liveTournamentMarshals.value.find((marshal) => marshal.id === selectedMarshalId.value)
  ?? defaultMarshal.value,
)
const activeMarshalSectorIds = computed(() => new Set(activeMarshal.value?.assignedSectorIds ?? []))
const assignedSectors = computed(() =>
  activeTournament.value.sectors.filter((sector) => activeMarshalSectorIds.value.has(sector.id)),
)
const selectedSectorId = ref('')
const tournamentCapabilities = computed(() => getTournamentOperationalCapabilities(activeTournament.value))
const canUseTournamentDispatch = computed(() => tournamentCapabilities.value.allowsMarshalWorkflow)
const adminTournamentUrl = computed(() => `/admin/sutaze?turnaj=${encodeURIComponent(activeTournament.value.id)}`)
const publicTournamentUrl = computed(() => `/sutaze?turnaj=${encodeURIComponent(activeTournament.value.id)}`)

const actionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const actionMessage = ref('')
const activeActionId = ref('')
const isOnline = ref(true)
const offlineAdminActionQueue = ref<OfflineTournamentAdminActionQueueItem[]>([])
const offlineAdminSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineAdminSyncMessage = ref('')
let offlineAdminSyncInProgress = false

const actionNoticeTitle = computed(() =>
  actionStatus.value === 'success'
    ? 'Úkon je uložený'
    : 'Úkon sa nepodarilo uložiť',
)
const actionNoticeTone = computed<NoticeTone>(() =>
  actionStatus.value === 'success' ? 'success' : 'error',
)
const offlineAdminNoticeTitle = computed(() => {
  if (!isOnline.value) return 'Bez pripojenia pri vode'
  if (offlineAdminSyncStatus.value === 'syncing') return 'Odosielam kontrolórske úkony'
  if (offlineAdminSyncStatus.value === 'error') return 'Niektoré úkony čakajú na ďalší pokus'
  if (offlineAdminSyncStatus.value === 'success' && visibleOfflineAdminActionQueue.value.length === 0) {
    return 'Kontrolórske úkony sú odoslané'
  }

  return 'Čakajúce úkony kontrolóra'
})
const offlineAdminNoticeDescription = computed(() =>
  offlineAdminSyncMessage.value ||
  'Pri výpadku signálu ostane váženie, trest alebo kontrola uložená v zariadení.',
)
const offlineAdminNoticeTone = computed<NoticeTone>(() => {
  if (!isOnline.value) return 'warning'
  if (offlineAdminSyncStatus.value === 'error') return 'error'
  if (offlineAdminSyncStatus.value === 'success') return 'success'

  return 'info'
})
const offlineAdminNoticeIcon = computed(() =>
  !isOnline.value ? 'i-heroicons-signal-slash' : 'i-heroicons-cloud-arrow-up',
)

const penaltyForm = reactive({
  durationHours: 2,
  reason: 'Kontrolou bolo zistené porušenie pravidiel v sektore.',
  rodsLess: 1,
  sectorId: '',
  type: 'warning' as TournamentPenalty['type'],
})
const ruleCheckForm = reactive({
  note: 'Montáže, počet prútov a pripravená podložka sú v poriadku.',
  result: 'ok' as TournamentRuleCheck['result'],
  sectorId: '',
})
const penaltyTypeOptions = Object.entries(tournamentPenaltyTypeLabels) as [
  TournamentPenalty['type'],
  string,
][]
const ruleCheckResultLabels = {
  ok: 'OK',
  penalty: 'kontrola s trestom',
  warning: 'napomenutie',
} as const
const ruleCheckResultOptions = Object.entries(ruleCheckResultLabels) as [
  TournamentRuleCheck['result'],
  string,
][]

const sectorLabel = (sectorId: string) =>
  activeTournament.value.sectors.find((sector) => sector.id === sectorId)?.label ?? sectorId

const sectorTeam = (sectorId: string) =>
  activeTournament.value.sectors.find((sector) => sector.id === sectorId)?.team ?? 'voľný sektor'

const marshalName = (marshalId?: string) =>
  liveTournamentMarshals.value.find((marshal) => marshal.id === marshalId)?.name ?? 'nepriradený'

const formatWeight = (value: number) =>
  value.toLocaleString('sk-SK', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  })

const formatDateTime = (value: string) => {
  const parsed = Date.parse(value)

  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
    : value
}

const openMarshalRequests = computed(() =>
  liveTournamentRequests.value
    .filter(
      (request) =>
        request.tournamentId === activeTournament.value.id
        && activeMarshalSectorIds.value.has(request.sectorId)
        && request.status !== 'resolved',
    )
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1
      if (a.status !== b.status) return a.status === 'new' ? -1 : 1

      return a.createdAt.localeCompare(b.createdAt)
    }),
)
const newMarshalRequests = computed(() => openMarshalRequests.value.filter((request) => request.status === 'new'))
const assignedMarshalRequests = computed(() =>
  openMarshalRequests.value.filter((request) => request.assignedMarshalId === activeMarshal.value?.id),
)
const waitingMarshalCatches = computed(() =>
  liveTournamentCatches.value.filter(
    (catchItem) =>
      catchItem.tournamentId === activeTournament.value.id
      && activeMarshalSectorIds.value.has(catchItem.sectorId)
      && catchItem.status === 'waiting',
  ),
)
const visibleMarshalCatches = computed(() =>
  liveTournamentCatches.value.filter(
    (catchItem) =>
      catchItem.tournamentId === activeTournament.value.id
      && activeMarshalSectorIds.value.has(catchItem.sectorId),
  ),
)
const activeMarshalPenalties = computed(() =>
  liveTournamentPenalties.value.filter(
    (penalty) =>
      penalty.tournamentId === activeTournament.value.id
      && activeMarshalSectorIds.value.has(penalty.sectorId)
      && penalty.status === 'active',
  ),
)
const recentMarshalRuleChecks = computed(() =>
  liveTournamentRuleChecks.value
    .filter(
      (check) =>
        check.tournamentId === activeTournament.value.id
        && activeMarshalSectorIds.value.has(check.sectorId),
    )
    .slice(0, 6),
)

const penaltyDraft = computed(() => ({
  durationHours: penaltyForm.type === 'fishing-pause' || penaltyForm.type === 'rod-reduction'
    ? penaltyForm.durationHours
    : undefined,
  marshalId: activeMarshal.value?.id ?? '',
  reason: penaltyForm.reason,
  rodsLess: penaltyForm.type === 'rod-reduction' ? penaltyForm.rodsLess : undefined,
  sectorId: penaltyForm.sectorId,
  tournamentId: activeTournament.value.id,
  type: penaltyForm.type,
}))
const ruleCheckDraft = computed(() => ({
  marshalId: activeMarshal.value?.id ?? '',
  note: ruleCheckForm.note,
  result: ruleCheckForm.result,
  sectorId: ruleCheckForm.sectorId,
  tournamentId: activeTournament.value.id,
}))
const penaltyValidation = computed(() => tournamentPenaltyInputSchema.safeParse(penaltyDraft.value))
const ruleCheckValidation = computed(() => tournamentRuleCheckInputSchema.safeParse(ruleCheckDraft.value))
const penaltyValidationMessages = computed(() => getValidationMessages(penaltyValidation.value))
const ruleCheckValidationMessages = computed(() => getValidationMessages(ruleCheckValidation.value))

const requestStatusTone = (status: TournamentRequest['status']): StatusBadgeTone => {
  switch (status) {
    case 'assigned':
      return 'warning'
    case 'new':
      return 'error'
    case 'resolved':
      return 'success'
    default:
      return 'neutral'
  }
}

const requestStatusIcon = (status: TournamentRequest['status']) => {
  switch (status) {
    case 'assigned':
      return 'i-heroicons-user-circle'
    case 'new':
      return 'i-heroicons-bell-alert'
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
  if (status === 'waiting') return 'čaká'
  if (status === 'verified') return 'overené'
  if (status === 'disputed') return 'sporné'

  return status
}

const ruleCheckTone = (result: TournamentRuleCheck['result']): StatusBadgeTone => {
  switch (result) {
    case 'ok':
      return 'success'
    case 'warning':
      return 'warning'
    case 'penalty':
      return 'error'
    default:
      return 'neutral'
  }
}

const ruleCheckIcon = (result: TournamentRuleCheck['result']) => {
  switch (result) {
    case 'ok':
      return 'i-heroicons-check-circle'
    case 'warning':
      return 'i-heroicons-exclamation-triangle'
    case 'penalty':
      return 'i-heroicons-no-symbol'
    default:
      return 'i-heroicons-clipboard-document-check'
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

  return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Akciu sa nepodarilo uložiť.'
}

const canSubmitMarshalAction = () => {
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return false
  }
  if (!canUseTournamentDispatch.value) {
    actionStatus.value = 'error'
    actionMessage.value = 'Kontrolórsky dispečing nie je v aktuálnom režime súťaže zapnutý.'
    return false
  }
  if (!activeMarshal.value) {
    actionStatus.value = 'error'
    actionMessage.value = 'Vyberte kontrolóra.'
    return false
  }

  return true
}

const getOfflineAdminActionLabel = (item: OfflineTournamentAdminActionQueueItem) => {
  if (item.payload.kind === 'request-action') {
    return item.payload.payload.action === 'assign'
      ? 'Prevzatie hlásenia'
      : 'Uzavretie hlásenia'
  }
  if (item.payload.kind === 'catch-verification') {
    return item.payload.payload.status === 'verified'
      ? 'Overenie váženia'
      : 'Sporné váženie'
  }
  if (item.payload.kind === 'penalty') {
    return tournamentPenaltyTypeLabels[item.payload.payload.type]
  }

  return ruleCheckResultLabels[item.payload.payload.result]
}

const offlineAdminActionSectorId = (item: OfflineTournamentAdminActionQueueItem) => {
  if (item.payload.kind === 'request-action') {
    const requestId = item.payload.payload.requestId

    return liveTournamentRequests.value.find((request) => request.id === requestId)?.sectorId
  }
  if (item.payload.kind === 'catch-verification') {
    const catchId = item.payload.payload.catchId

    return liveTournamentCatches.value.find((catchItem) => catchItem.id === catchId)?.sectorId
  }

  return item.payload.payload.sectorId
}

const getOfflineAdminActionTarget = (item: OfflineTournamentAdminActionQueueItem) => {
  const sectorId = offlineAdminActionSectorId(item)

  if (sectorId) return `${sectorLabel(sectorId)} · ${sectorTeam(sectorId)}`

  if (item.payload.kind === 'catch-verification') {
    return `úlovok ${item.payload.payload.catchId}`
  }
  if (item.payload.kind === 'request-action') {
    return `hlásenie ${item.payload.payload.requestId}`
  }

  return 'neznámy sektor'
}

const visibleOfflineAdminActionQueue = computed(() =>
  offlineAdminActionQueue.value.filter((item) => {
    const sectorId = offlineAdminActionSectorId(item)
    if (sectorId) return activeMarshalSectorIds.value.has(sectorId)

    return (item.payload.kind === 'catch-verification' || item.payload.kind === 'request-action')
      && item.payload.payload.marshalId === activeMarshal.value?.id
  }),
)

async function refreshOfflineAdminActionQueue() {
  if (!import.meta.client) return

  try {
    offlineAdminActionQueue.value = await readOfflineTournamentAdminActionQueue()
  }
  catch (error) {
    offlineAdminSyncStatus.value = 'error'
    offlineAdminSyncMessage.value = error instanceof Error
      ? error.message
      : 'Offline frontu kontrolórskych úkonov sa nepodarilo načítať.'
  }
}

async function sendTournamentAdminAction(payload: OfflineTournamentAdminActionPayload) {
  if (payload.kind === 'request-action') {
    return await $fetch<TournamentActionSuccess>(`/api/admin/tournaments/requests/${payload.payload.requestId}/action`, {
      body: {
        action: payload.payload.action,
        clientMutationId: payload.payload.clientMutationId,
        marshalId: payload.payload.marshalId,
      },
      method: 'POST',
    })
  }
  if (payload.kind === 'catch-verification') {
    return await $fetch<TournamentCatchVerificationSuccess>(
      `/api/admin/tournaments/catches/${payload.payload.catchId}/verify`,
      {
        body: {
          clientMutationId: payload.payload.clientMutationId,
          marshalId: payload.payload.marshalId,
          status: payload.payload.status,
        },
        method: 'POST',
      },
    )
  }
  if (payload.kind === 'penalty') {
    return await $fetch<TournamentPenaltySubmissionSuccess>('/api/admin/tournaments/penalties', {
      body: payload.payload,
      method: 'POST',
    })
  }

  return await $fetch<TournamentRuleCheckSubmissionSuccess>('/api/admin/tournaments/rule-checks', {
    body: payload.payload,
    method: 'POST',
  })
}

async function queueTournamentAdminAction(payload: OfflineTournamentAdminActionPayload, message: string) {
  try {
    await enqueueOfflineTournamentAdminAction(payload)
    await refreshOfflineAdminActionQueue()
    actionStatus.value = 'success'
    actionMessage.value = message
    offlineAdminSyncStatus.value = 'success'
    offlineAdminSyncMessage.value = `V zariadení čaká ${visibleOfflineAdminActionQueue.value.length} tvojich kontrolórskych úkonov.`
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = error instanceof Error
      ? error.message
      : 'Kontrolórsky úkon sa nepodarilo uložiť v tomto zariadení.'
  }
}

async function sendOrQueueTournamentAdminAction(
  payload: OfflineTournamentAdminActionPayload,
  queuedMessage: string,
) {
  const payloadWithClientMutationId = withTournamentAdminActionClientMutationId(payload)
  const online = import.meta.client ? navigator.onLine : true
  isOnline.value = online

  if (!online) {
    await queueTournamentAdminAction(payloadWithClientMutationId, queuedMessage)
    return undefined
  }

  try {
    return await sendTournamentAdminAction(payloadWithClientMutationId)
  }
  catch (error) {
    if (shouldQueueTournamentAdminActionSubmission(error, online)) {
      await queueTournamentAdminAction(payloadWithClientMutationId, queuedMessage)
      return undefined
    }

    throw error
  }
}

async function discardOfflineAdminAction(id: string) {
  try {
    await removeOfflineTournamentAdminAction(id)
    await refreshOfflineAdminActionQueue()
    offlineAdminSyncStatus.value = 'success'
    offlineAdminSyncMessage.value = 'Kontrolórsky úkon bol odstránený z čakajúcich odoslaní.'
  }
  catch (error) {
    offlineAdminSyncStatus.value = 'error'
    offlineAdminSyncMessage.value = error instanceof Error
      ? error.message
      : 'Kontrolórsky úkon sa nepodarilo odstrániť.'
  }
}

async function syncOfflineAdminActionQueue(options: { silent?: boolean } = {}) {
  if (!import.meta.client || offlineAdminSyncInProgress) return

  isOnline.value = navigator.onLine
  if (!isOnline.value) {
    offlineAdminSyncStatus.value = 'error'
    offlineAdminSyncMessage.value = 'Bez pripojenia nechávam kontrolórske úkony v zariadení.'
    return
  }

  await refreshOfflineAdminActionQueue()
  if (visibleOfflineAdminActionQueue.value.length === 0) {
    if (!options.silent) {
      offlineAdminSyncStatus.value = 'success'
      offlineAdminSyncMessage.value = 'Nemáš žiadne čakajúce kontrolórske úkony.'
    }
    return
  }

  offlineAdminSyncInProgress = true
  offlineAdminSyncStatus.value = 'syncing'
  offlineAdminSyncMessage.value = `Odosielam ${visibleOfflineAdminActionQueue.value.length} kontrolórskych úkonov.`
  let syncedCount = 0

  try {
    for (const item of [...visibleOfflineAdminActionQueue.value]) {
      try {
        await sendTournamentAdminAction(
          withTournamentAdminActionClientMutationId(item.payload, { id: item.id }),
        )
        await removeOfflineTournamentAdminAction(item.id)
        syncedCount += 1
      }
      catch (error) {
        await markOfflineTournamentAdminActionAttempt(
          item.id,
          getOfflineTournamentAdminActionQueueErrorMessage(error),
        )
      }
    }

    await refreshOfflineAdminActionQueue()
    offlineAdminSyncStatus.value = visibleOfflineAdminActionQueue.value.length > 0 ? 'error' : 'success'
    offlineAdminSyncMessage.value = visibleOfflineAdminActionQueue.value.length > 0
      ? `${syncedCount} úkonov odoslaných, ${visibleOfflineAdminActionQueue.value.length} čaká na ďalší pokus.`
      : `${syncedCount} kontrolórskych úkonov bolo odoslaných.`

    if (syncedCount > 0) {
      await refreshTournamentState()
    }
  }
  finally {
    offlineAdminSyncInProgress = false
  }
}

const submitRequestAction = async (request: TournamentRequest, action: 'assign' | 'resolve') => {
  if (!canSubmitMarshalAction()) return
  if (!activeMarshalSectorIds.value.has(request.sectorId)) {
    actionStatus.value = 'error'
    actionMessage.value = 'Tento sektor nie je priradený vybranému kontrolórovi.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${request.id}:${action}`

  try {
    const result = await sendOrQueueTournamentAdminAction(
      {
        kind: 'request-action',
        payload: {
          action,
          marshalId: activeMarshal.value?.id,
          requestId: request.id,
        },
      },
      action === 'assign'
        ? 'Prevzatie hlásenia čaká v zariadení a odošle sa po návrate pripojenia.'
        : 'Uzavretie hlásenia čaká v zariadení a odošle sa po návrate pripojenia.',
    )
    if (!result) return

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const submitCatchVerification = async (catchItem: TournamentCatch, status: 'verified' | 'disputed') => {
  if (!canSubmitMarshalAction()) return
  if (!activeMarshalSectorIds.value.has(catchItem.sectorId)) {
    actionStatus.value = 'error'
    actionMessage.value = 'Toto váženie nie je v sektore vybraného kontrolóra.'
    return
  }

  const payload: OfflineTournamentAdminActionPayload = {
    kind: 'catch-verification',
    payload: {
      catchId: catchItem.id,
      marshalId: activeMarshal.value?.id,
      status,
    },
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${catchItem.id}:${status}`

  try {
    const result = await sendOrQueueTournamentAdminAction(
      payload,
      status === 'verified'
        ? 'Váženie čaká v zariadení a odošle sa po návrate pripojenia.'
        : 'Sporné váženie čaká v zariadení a odošle sa po návrate pripojenia.',
    )
    if (!result) return

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const submitPenalty = async () => {
  if (!canSubmitMarshalAction()) return

  const validation = penaltyValidation.value
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = penaltyValidationMessages.value[0] ?? 'Skontrolujte trest.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = 'penalty:create'

  try {
    const result = await sendOrQueueTournamentAdminAction(
      {
        kind: 'penalty',
        payload: validation.data,
      },
      'Trest čaká v zariadení a odošle sa po návrate pripojenia.',
    )
    if (!result) return

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

const submitRuleCheck = async () => {
  if (!canSubmitMarshalAction()) return

  const validation = ruleCheckValidation.value
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = ruleCheckValidationMessages.value[0] ?? 'Skontrolujte kontrolu pravidiel.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = 'rule-check:create'

  try {
    const result = await sendOrQueueTournamentAdminAction(
      {
        kind: 'rule-check',
        payload: validation.data,
      },
      'Kontrola pravidiel čaká v zariadení a odošle sa po návrate pripojenia.',
    )
    if (!result) return

    actionStatus.value = 'success'
    actionMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = getApiErrorMessage(error)
  }
  finally {
    activeActionId.value = ''
  }
}

function handleOnline() {
  isOnline.value = true
  void syncOfflineAdminActionQueue({ silent: true })
}

function handleOffline() {
  isOnline.value = false
  offlineAdminSyncStatus.value = 'idle'
  offlineAdminSyncMessage.value = 'Signál vypadol. Nové kontrolórske úkony sa uložia v zariadení.'
}

watch([defaultMarshal, requestedMarshalId], () => {
  if (isRoleScopedMarshal.value && roleMarshalId.value) {
    selectedMarshalId.value = roleMarshalId.value
    return
  }

  const requestedMarshal = liveTournamentMarshals.value.find((marshal) => marshal.id === requestedMarshalId.value)
  if (requestedMarshal) {
    selectedMarshalId.value = requestedMarshal.id
    return
  }

  if (!liveTournamentMarshals.value.some((marshal) => marshal.id === selectedMarshalId.value)) {
    selectedMarshalId.value = defaultMarshal.value?.id ?? ''
  }
}, { immediate: true })

watch([assignedSectors, activeMarshal], () => {
  if (!assignedSectors.value.some((sector) => sector.id === selectedSectorId.value)) {
    selectedSectorId.value = assignedSectors.value[0]?.id ?? ''
  }
}, { immediate: true })

watch(selectedSectorId, (sectorId) => {
  if (!sectorId) return

  if (!activeMarshalSectorIds.value.has(penaltyForm.sectorId)) {
    penaltyForm.sectorId = sectorId
  }
  if (!activeMarshalSectorIds.value.has(ruleCheckForm.sectorId)) {
    ruleCheckForm.sectorId = sectorId
  }
}, { immediate: true })

onMounted(() => {
  if (!import.meta.client) return

  isOnline.value = navigator.onLine
  void refreshOfflineAdminActionQueue().then(() => {
    if (navigator.onLine && visibleOfflineAdminActionQueue.value.length > 0) {
      void syncOfflineAdminActionQueue({ silent: true })
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
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interná súťaž"
      :title="activeMarshal ? `Panel kontrolóra ${activeMarshal.name}` : 'Panel kontrolóra'"
      :description="`${activeTournament.name} · ${getLakeName(activeTournament.lake)} · ${activeTournament.dateRange}`"
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="rounded-card border border-border bg-surface p-5">
        <div class="grid gap-4 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p class="text-sm font-semibold text-primary-700">{{ tournamentCapabilities.label }}</p>
            <h2 class="mt-1 text-2xl font-bold">Moje sektory a úkony</h2>
            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="sector in assignedSectors"
                :key="sector.id"
                class="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800"
              >
                {{ sector.label }} · {{ sector.team || 'voľný sektor' }}
              </span>
              <StatusBadge
                v-if="assignedSectors.length === 0"
                icon="i-heroicons-exclamation-triangle"
                label="bez priradených sektorov"
                tone="warning"
              />
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-1">
            <label class="block">
              <span class="text-sm font-semibold">Kontrolór</span>
              <select
                v-model="selectedMarshalId"
                :disabled="isRoleScopedMarshal"
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
                <option v-for="marshal in visibleMarshals" :key="marshal.id" :value="marshal.id">
                  {{ marshal.name }} · {{ tournamentMarshalStatusLabels[marshal.status] }}
                </option>
              </select>
            </label>
            <div class="flex flex-wrap gap-2 lg:justify-end">
              <UButton v-if="!isRoleScopedMarshal" :to="adminTournamentUrl" icon="i-heroicons-arrow-left" variant="soft">
                Dispečing
              </UButton>
              <UButton :to="publicTournamentUrl" icon="i-heroicons-map" variant="soft">
                Verejná súťaž
              </UButton>
              <UButton to="/offline" icon="i-heroicons-inbox-stack" variant="soft">
                Offline
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <DataStatusNotice
        v-if="!canUseTournamentDispatch"
        class="mt-6"
        :description="tournamentCapabilities.description"
        icon="i-heroicons-information-circle"
        title="Kontrolórsky dispečing nie je v tomto režime zapnutý"
        tone="info"
      />

      <DataStatusNotice
        v-if="actionMessage"
        class="mt-6"
        :description="actionMessage"
        :title="actionNoticeTitle"
        :tone="actionNoticeTone"
      />

      <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">nové hlásenia</p>
          <p class="mt-1 text-3xl font-black">{{ newMarshalRequests.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">prevzaté mnou</p>
          <p class="mt-1 text-3xl font-black">{{ assignedMarshalRequests.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">čaká na váženie</p>
          <p class="mt-1 text-3xl font-black">{{ waitingMarshalCatches.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">aktívne tresty</p>
          <p class="mt-1 text-3xl font-black">{{ activeMarshalPenalties.length }}</p>
        </div>
      </div>

      <div
        v-if="!isOnline || visibleOfflineAdminActionQueue.length > 0 || offlineAdminSyncMessage"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <DataStatusNotice
            class="min-w-0 flex-1"
            :description="offlineAdminNoticeDescription"
            :icon="offlineAdminNoticeIcon"
            :loading="offlineAdminSyncStatus === 'syncing'"
            :title="offlineAdminNoticeTitle"
            :tone="offlineAdminNoticeTone"
          />
          <UButton
            v-if="visibleOfflineAdminActionQueue.length > 0"
            size="sm"
            icon="i-heroicons-arrow-path"
            variant="soft"
            :disabled="!isOnline || offlineAdminSyncStatus === 'syncing'"
            :loading="offlineAdminSyncStatus === 'syncing'"
            @click="syncOfflineAdminActionQueue()"
          >
            Odoslať {{ visibleOfflineAdminActionQueue.length }}
          </UButton>
        </div>

        <div v-if="visibleOfflineAdminActionQueue.length > 0" class="mt-3 grid gap-2 md:grid-cols-2">
          <div
            v-for="item in visibleOfflineAdminActionQueue"
            :key="item.id"
            class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
          >
            <div class="min-w-0">
              <p class="truncate font-bold">
                {{ getOfflineAdminActionLabel(item) }} · {{ getOfflineAdminActionTarget(item) }}
              </p>
              <p class="text-foreground-muted mt-1 text-xs">
                {{ formatDateTime(item.createdAt) }} · pokusy {{ item.attempts }}
              </p>
              <DataStatusNotice
                v-if="item.lastError"
                class="mt-2"
                description="Skontroluj súťažný stav, sektor, kontrolóra alebo konkrétny úlovok v pracovnom súťažnom paneli."
                icon="i-heroicons-exclamation-triangle"
                :title="item.lastError"
                tone="error"
              />
            </div>
            <button
              type="button"
              class="text-foreground-muted shrink-0 rounded-md p-1 hover:text-error-700"
              aria-label="Odstrániť offline úkon"
              @click="discardOfflineAdminAction(item.id)"
            >
              <UIcon name="i-heroicons-trash" class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Front mojich sektorov</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ assignedSectors.length }} sektorov · {{ openMarshalRequests.length }} otvorených hlásení
                </p>
              </div>
              <StatusBadge
                class="w-fit"
                :icon="isOnline ? 'i-heroicons-signal' : 'i-heroicons-signal-slash'"
                :label="isOnline ? 'online' : 'offline'"
                :tone="isOnline ? 'success' : 'warning'"
              />
            </div>

            <div v-if="openMarshalRequests.length > 0" class="mt-4 space-y-3">
              <article
                v-for="request in openMarshalRequests"
                :key="request.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ request.team }} · {{ sectorLabel(request.sectorId) }}</p>
                    <p class="text-primary-800 text-sm font-semibold">{{ tournamentRequestTypeLabels[request.type] }}</p>
                  </div>
                  <div class="flex flex-wrap gap-2 sm:justify-end">
                    <StatusBadge
                      v-if="request.priority === 'high'"
                      icon="i-heroicons-bell-alert"
                      label="urgentné"
                      tone="error"
                    />
                    <StatusBadge
                      :icon="requestStatusIcon(request.status)"
                      :label="tournamentRequestStatusLabels[request.status]"
                      :tone="requestStatusTone(request.status)"
                    />
                  </div>
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
                <p class="text-foreground-muted mt-2 text-xs font-semibold">
                  {{ request.createdAt }} · priradené: {{ marshalName(request.assignedMarshalId) }}
                </p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    v-if="request.status === 'new'"
                    size="sm"
                    icon="i-heroicons-user-plus"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:assign`"
                    @click="submitRequestAction(request, 'assign')"
                  >
                    Prevziať
                  </UButton>
                  <UButton
                    size="sm"
                    icon="i-heroicons-check"
                    color="neutral"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:resolve`"
                    @click="submitRequestAction(request, 'resolve')"
                  >
                    Uzavrieť
                  </UButton>
                </div>
              </article>
            </div>
            <div v-else class="mt-4 rounded-md border border-dashed border-border bg-white p-5 text-sm text-foreground-muted">
              Pre tvoje sektory teraz nie je otvorené hlásenie.
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Váženia a úlovky</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Čakajúce váženia sú hore, overené a sporné ostávajú v histórii sektora.
                </p>
              </div>
              <StatusBadge
                class="w-fit"
                icon="i-heroicons-clock"
                :label="`${waitingMarshalCatches.length} čaká`"
                tone="warning"
              />
            </div>

            <div v-if="visibleMarshalCatches.length > 0" class="mt-4 overflow-hidden rounded-md border border-border">
              <article
                v-for="catchItem in visibleMarshalCatches"
                :key="catchItem.id"
                class="border-b border-border bg-white p-4 last:border-b-0"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ catchItem.team }} · {{ sectorLabel(catchItem.sectorId) }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ catchItem.species }} · {{ formatWeight(catchItem.weightKg) }} kg · {{ catchItem.lengthCm }} cm
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit"
                    :icon="catchStatusIcon(catchItem.status)"
                    :label="catchStatusLabel(catchItem.status)"
                    :tone="catchStatusTone(catchItem.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-2 text-sm">
                  Chytené {{ catchItem.caughtAt }} · meranie {{ catchItem.measuredAt }} · {{ catchItem.photoLabel }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs font-semibold">{{ catchItem.notes }}</p>
                <div v-if="catchItem.status === 'waiting'" class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    icon="i-heroicons-scale"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || actionStatus === 'submitting'"
                    :loading="activeActionId === `${catchItem.id}:verified`"
                    @click="submitCatchVerification(catchItem, 'verified')"
                  >
                    Overiť
                  </UButton>
                  <UButton
                    size="sm"
                    icon="i-heroicons-shield-exclamation"
                    color="neutral"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || actionStatus === 'submitting'"
                    :loading="activeActionId === `${catchItem.id}:disputed`"
                    @click="submitCatchVerification(catchItem, 'disputed')"
                  >
                    Sporné
                  </UButton>
                </div>
              </article>
            </div>
            <div v-else class="mt-4 rounded-md border border-dashed border-border bg-white p-5 text-sm text-foreground-muted">
              Pre tvoje sektory zatiaľ nie je súťažný úlovok.
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Sektorový prehľad</h2>
            <div class="mt-4 space-y-2">
              <button
                v-for="sector in assignedSectors"
                :key="sector.id"
                type="button"
                class="w-full rounded-md border px-3 py-3 text-left transition-colors"
                :class="selectedSectorId === sector.id
                  ? 'border-primary-700 bg-primary-50 text-primary-950'
                  : 'border-border bg-white hover:bg-muted'"
                @click="selectedSectorId = sector.id"
              >
                <span class="flex items-start justify-between gap-3">
                  <span>
                    <span class="block font-bold">{{ sector.label }} · {{ sector.team || 'voľný sektor' }}</span>
                    <span class="text-foreground-muted mt-1 block text-xs">
                      {{ openMarshalRequests.filter((request) => request.sectorId === sector.id).length }} hlásení ·
                      {{ visibleMarshalCatches.filter((catchItem) => catchItem.sectorId === sector.id && catchItem.status === 'waiting').length }} vážení
                    </span>
                  </span>
                  <StatusBadge
                    icon="i-heroicons-scale"
                    :label="`${sector.weightKg} kg`"
                    size="xs"
                    tone="primary"
                  />
                </span>
              </button>
            </div>
          </div>

          <div v-if="activeMarshalPenalties.length > 0" class="rounded-card border border-border bg-surface p-5">
            <DataStatusNotice
              :description="`${activeMarshalPenalties.length} aktívnych obmedzení v tvojich sektoroch.`"
              icon="i-heroicons-no-symbol"
              title="Aktívne tresty"
              tone="error"
            />
            <div class="mt-4 space-y-3">
              <article v-for="penalty in activeMarshalPenalties" :key="penalty.id" class="rounded-md border border-border bg-white p-3 text-sm text-foreground">
                <p class="font-bold">{{ sectorLabel(penalty.sectorId) }} · {{ tournamentPenaltyTypeLabels[penalty.type] }}</p>
                <p class="mt-1 text-foreground-muted">{{ penalty.reason }}</p>
                <p class="mt-2 text-xs font-semibold text-error-700">
                  {{ penalty.startsAt || penalty.issuedAt }}<span v-if="penalty.endsAt"> - {{ penalty.endsAt }}</span>
                </p>
              </article>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Zapísať kontrolu</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitRuleCheck">
              <label class="block">
                <span class="text-sm font-semibold">Sektor</span>
                <select
                  v-model="ruleCheckForm.sectorId"
                  :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="sector in assignedSectors" :key="sector.id" :value="sector.id">
                    {{ sector.label }} · {{ sector.team || 'voľný sektor' }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Výsledok</span>
                <select
                  v-model="ruleCheckForm.result"
                  :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="[value, label] in ruleCheckResultOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="ruleCheckForm.note"
                  rows="3"
                  :readonly="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="ruleCheckValidationMessages"
                valid-title="Kontrola je pripravená"
                valid-description="Sektor, kontrolór, výsledok a poznámka sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-clipboard-document-check"
                block
                :disabled="!canOperateTournaments || !canUseTournamentDispatch || !ruleCheckValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'rule-check:create'"
              >
                Uložiť kontrolu
              </UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Zapísať trest</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitPenalty">
              <label class="block">
                <span class="text-sm font-semibold">Sektor</span>
                <select
                  v-model="penaltyForm.sectorId"
                  :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="sector in assignedSectors" :key="sector.id" :value="sector.id">
                    {{ sector.label }} · {{ sector.team || 'voľný sektor' }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Typ trestu</span>
                <select
                  v-model="penaltyForm.type"
                  :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
                  <option v-for="[value, label] in penaltyTypeOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <div
                v-if="penaltyForm.type === 'fishing-pause' || penaltyForm.type === 'rod-reduction'"
                class="grid gap-3 sm:grid-cols-2"
              >
                <label class="block">
                  <span class="text-sm font-semibold">Trvanie h</span>
                  <input
                    v-model.number="penaltyForm.durationHours"
                    type="number"
                    min="1"
                    max="24"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label v-if="penaltyForm.type === 'rod-reduction'" class="block">
                  <span class="text-sm font-semibold">O koľko prútov</span>
                  <input
                    v-model.number="penaltyForm.rodsLess"
                    type="number"
                    min="1"
                    max="4"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <textarea
                  v-model="penaltyForm.reason"
                  rows="3"
                  :readonly="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="penaltyValidationMessages"
                valid-title="Trest je pripravený"
                valid-description="Sektor, kontrolór, typ a dôvod sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-no-symbol"
                block
                :disabled="!canOperateTournaments || !canUseTournamentDispatch || !penaltyValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'penalty:create'"
              >
                Uložiť trest
              </UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Posledné kontroly</h2>
            <div v-if="recentMarshalRuleChecks.length > 0" class="mt-4 space-y-2">
              <div
                v-for="check in recentMarshalRuleChecks"
                :key="check.id"
                class="rounded-md bg-white p-3 text-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <p class="font-bold">{{ sectorLabel(check.sectorId) }}</p>
                  <StatusBadge
                    class="shrink-0"
                    :icon="ruleCheckIcon(check.result)"
                    :label="ruleCheckResultLabels[check.result]"
                    :tone="ruleCheckTone(check.result)"
                  />
                </div>
                <p class="text-foreground-muted mt-1">{{ check.note }}</p>
                <p class="text-foreground-muted mt-2 text-xs font-semibold">
                  {{ check.checkedAt }} · {{ marshalName(check.marshalId) }}
                </p>
              </div>
            </div>
            <p v-else class="mt-4 rounded-md border border-dashed border-border bg-white p-4 text-sm text-foreground-muted">
              Kontroly pre tvoje sektory zatiaľ nie sú zapísané.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
