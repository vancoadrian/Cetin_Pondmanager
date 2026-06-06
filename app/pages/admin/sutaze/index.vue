<script setup lang="ts">
import type {
  Sponsor,
  SponsorLogoVariant,
  Tournament,
  TournamentPenalty,
  TournamentRuleCheck,
  TournamentTeamRegistration,
} from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import type {
  TournamentActionSuccess,
  TournamentCatchVerificationSuccess,
  TournamentPenaltySubmissionSuccess,
  TournamentRuleCheckSubmissionSuccess,
  TournamentSectorSettingsSuccess,
  TournamentTeamRegistrationDecisionSuccess,
  TournamentStateResponse,
} from '~/services/tournamentApiService'
import {
  getValidationMessages,
  tournamentPenaltyInputSchema,
  tournamentRuleCheckInputSchema,
  tournamentSectorSettingsInputSchema,
  tournamentTeamRegistrationDecisionInputSchema,
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
import {
  getTournamentMapCoverage,
  getTournamentMapSourceSummary,
  getTournamentSectorMapRows,
  getTournamentSectorShapes,
} from '~/utils/tournamentMap'
import {
  getTournamentLeaderboard,
  getTournamentLeaderboardStats,
} from '~/utils/tournamentLeaderboard'

useHead({ title: 'Admin súťaže' })

const {
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
const { activeSponsors } = await useSponsorState({ key: 'admin-tournament-sponsor-preview-state' })

const fallbackTournamentState = (): TournamentStateResponse => ({
  ok: true,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  tournaments: seedTournaments,
  updatedAt: 'seed',
})
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'admin-tournament-state',
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
  'admin-tournament-map-state',
  async () => {
    try {
      return await $fetch<MapStateResponse>('/api/admin/map')
    } catch {
      return await $fetch<MapStateResponse>('/api/map')
    }
  },
  {
    default: fallbackMapState,
  },
)
const {
  canOperate: canOperateTournaments,
  isReadOnly: tournamentsReadOnly,
  label: tournamentAccessLabel,
  readOnlyMessage: tournamentReadOnlyMessage,
} = useAdminModuleAccess('tournaments')

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
const liveTournamentPenalties = computed(() => tournamentState.value?.tournamentPenalties ?? seedTournamentPenalties)
const liveTournamentRequests = computed(() => tournamentState.value?.tournamentRequests ?? seedTournamentRequests)
const liveTournamentRuleChecks = computed(() => tournamentState.value?.tournamentRuleChecks ?? seedTournamentRuleChecks)
const liveTournamentTeamRegistrations = computed(() =>
  tournamentState.value?.tournamentTeamRegistrations ?? seedTournamentTeamRegistrations,
)
const liveMapShapes = computed(() => mapState.value.mapShapes)
const activeTournament = computed(() => liveTournaments.value[0] ?? seedTournaments[0]!)
const actionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const actionMessage = ref('')
const activeActionId = ref('')
const isOnline = ref(true)
const offlineAdminActionQueue = ref<OfflineTournamentAdminActionQueueItem[]>([])
const offlineAdminSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineAdminSyncMessage = ref('')
let offlineAdminSyncInProgress = false
const registrationDecisionDrafts = reactive<Record<string, {
  assignedSectorId: string
  reviewNote: string
}>>({})
const penaltyForm = reactive({
  durationHours: 2,
  marshalId: 'marshal-2',
  reason: 'Tím porušil vyznačený limit sektora.',
  rodsLess: 1,
  sectorId: 'b4',
  type: 'rod-reduction' as TournamentPenalty['type'],
})
const ruleCheckForm = reactive({
  marshalId: 'marshal-1',
  note: 'Montáže, počet prútov a pripravená podložka sú v poriadku.',
  result: 'ok' as TournamentRuleCheck['result'],
  sectorId: 'a1',
})
const penaltyTypeOptions = Object.entries(tournamentPenaltyTypeLabels) as [
  TournamentPenalty['type'],
  string,
][]
const ruleCheckResultLabels = {
  ok: 'OK',
  penalty: 'trest',
  warning: 'napomenutie',
} as const
const ruleCheckResultOptions = Object.entries(ruleCheckResultLabels) as [
  TournamentRuleCheck['result'],
  string,
][]
const cloneTournamentSector = (sector: Tournament['sectors'][number]) => ({ ...sector })

const activeRequests = computed(() =>
  liveTournamentRequests.value.filter(
    (request) => request.tournamentId === activeTournament.value.id && request.status !== 'resolved',
  ),
)
const waitingCatches = computed(() =>
  liveTournamentCatches.value.filter((catchItem) => catchItem.status === 'waiting'),
)
const activePenalties = computed(() =>
  liveTournamentPenalties.value.filter((penalty) => penalty.status === 'active'),
)
const tournamentTeamRegistrations = computed(() =>
  liveTournamentTeamRegistrations.value.filter((registration) => registration.tournamentId === activeTournament.value.id),
)
const submittedTeamRegistrations = computed(() =>
  tournamentTeamRegistrations.value.filter((registration) => registration.status === 'submitted'),
)
const approvedTeamRegistrations = computed(() =>
  tournamentTeamRegistrations.value.filter((registration) => registration.status === 'approved'),
)
const waitlistedTeamRegistrations = computed(() =>
  tournamentTeamRegistrations.value.filter((registration) => registration.status === 'waitlisted'),
)
const tournamentLeaderboard = computed(() =>
  getTournamentLeaderboard(activeTournament.value, liveTournamentCatches.value),
)
const leaderboardStats = computed(() =>
  getTournamentLeaderboardStats(tournamentLeaderboard.value),
)
const leaderboardExportUrl = computed(() => `/api/admin/tournaments/${activeTournament.value.id}/leaderboard-export`)
const organizerExportUrl = computed(() => `/api/admin/tournaments/${activeTournament.value.id}/organizer-export`)
const leaderboardFeedUrl = computed(() => `/api/tournaments/${activeTournament.value.id}/leaderboard`)
const leaderboardKioskUrl = computed(() => `/sutaze/vysledkovka?turnaj=${encodeURIComponent(activeTournament.value.id)}`)
const activeTournamentSectorShapes = computed(() =>
  getTournamentSectorShapes(liveMapShapes.value, activeTournament.value),
)
const sectorMapRows = computed(() =>
  getTournamentSectorMapRows(activeTournament.value, liveMapShapes.value),
)
const sectorMapCoverage = computed(() => getTournamentMapCoverage(sectorMapRows.value))
const mapSourceSummary = computed(() => getTournamentMapSourceSummary(mapState.value))
const sectorDraft = ref<Tournament['sectors']>(activeTournament.value.sectors.map(cloneTournamentSector))
const sectorSettingsStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const sectorSettingsMessage = ref('')
const tournamentSponsorSlots = computed(() => [
  {
    description: 'Partneri uvedení pri detaile súťaže.',
    label: 'Súťaž',
    placementType: 'tournament' as const,
    sponsors: getSponsorsForPlacement(activeSponsors.value, {
      placementType: 'tournament',
      tournamentId: activeTournament.value.id,
    }),
  },
  {
    description: 'Banner pri verejnej výsledkovke a váženiach.',
    label: 'Výsledkovka',
    placementType: 'scoreboard' as const,
    sponsors: getSponsorsForPlacementWithFallback(
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
  },
  {
    description: 'Partneri naviazaní na konkrétne sektory.',
    label: 'Sektory',
    placementType: 'sector' as const,
    sponsors: getSponsorsForPlacement(activeSponsors.value, {
      placementType: 'sector',
      tournamentId: activeTournament.value.id,
    }),
  },
])

const sectorLabel = (sectorId: string) =>
  activeTournament.value.sectors.find((sector) => sector.id === sectorId)?.label ?? sectorId

const marshalName = (marshalId?: string) =>
  liveTournamentMarshals.value.find((marshal) => marshal.id === marshalId)?.name ?? 'nepriradený'

const sponsorLogo = (sponsor: Sponsor, placementType: SponsorLogoVariant['placementType']) =>
  getSponsorLogo(sponsor, placementType)

const formatWeight = (value: number) =>
  value.toLocaleString('sk-SK', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  })

const marshalsForSector = (sectorId: string) =>
  liveTournamentMarshals.value.filter((marshal) => marshal.assignedSectorIds.includes(sectorId))

const sectorOptionLabel = (sectorId?: string) => {
  const sector = activeTournament.value.sectors.find((item) => item.id === sectorId)

  return sector ? `${sector.label} · ${sector.team ?? 'voľný'}` : 'bez preferencie'
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

const registrationDecisionDraft = (registrationId: string) =>
  registrationDecisionDrafts[registrationId] ?? {
    assignedSectorId: '',
    reviewNote: '',
  }

const setRegistrationDecisionSector = (registrationId: string, assignedSectorId: string) => {
  registrationDecisionDrafts[registrationId] = {
    ...registrationDecisionDraft(registrationId),
    assignedSectorId,
  }
}

const setRegistrationDecisionNote = (registrationId: string, reviewNote: string) => {
  registrationDecisionDrafts[registrationId] = {
    ...registrationDecisionDraft(registrationId),
    reviewNote,
  }
}

const sectorMapStatus = (sectorId: string) => {
  const row = sectorMapRows.value.find((item) => item.sector.id === sectorId)

  return row?.mapped ? `polygon: ${row.shape?.label ?? row.sector.label}` : 'bez polygonu, používa sa bod'
}

const sectorSettingsDraft = computed(() => ({
  sectors: sectorDraft.value.map((sector) => ({
    id: sector.id,
    label: sector.label,
    team: sector.team ?? '',
    weightKg: sector.weightKg,
    x: sector.x,
    y: sector.y,
  })),
  tournamentId: activeTournament.value.id,
}))
const penaltyDraft = computed(() => ({
  durationHours: penaltyForm.type === 'fishing-pause' || penaltyForm.type === 'rod-reduction'
    ? penaltyForm.durationHours
    : undefined,
  marshalId: penaltyForm.marshalId,
  reason: penaltyForm.reason,
  rodsLess: penaltyForm.type === 'rod-reduction' ? penaltyForm.rodsLess : undefined,
  sectorId: penaltyForm.sectorId,
  tournamentId: activeTournament.value.id,
  type: penaltyForm.type,
}))
const ruleCheckDraft = computed(() => ({
  marshalId: ruleCheckForm.marshalId,
  note: ruleCheckForm.note,
  result: ruleCheckForm.result,
  sectorId: ruleCheckForm.sectorId,
  tournamentId: activeTournament.value.id,
}))
const penaltyValidation = computed(() => tournamentPenaltyInputSchema.safeParse(penaltyDraft.value))
const ruleCheckValidation = computed(() => tournamentRuleCheckInputSchema.safeParse(ruleCheckDraft.value))
const sectorSettingsValidation = computed(() => tournamentSectorSettingsInputSchema.safeParse(sectorSettingsDraft.value))
const penaltyValidationMessages = computed(() => getValidationMessages(penaltyValidation.value))
const ruleCheckValidationMessages = computed(() => getValidationMessages(ruleCheckValidation.value))
const sectorSettingsValidationMessages = computed(() => getValidationMessages(sectorSettingsValidation.value))
const offlineAdminActionCount = computed(() => offlineAdminActionQueue.value.length)

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

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })

const getOfflineAdminActionLabel = (item: OfflineTournamentAdminActionQueueItem) => {
  if (item.payload.kind === 'catch-verification') {
    return item.payload.payload.status === 'verified'
      ? 'Overenie váženia'
      : 'Sporné váženie'
  }
  if (item.payload.kind === 'penalty') {
    return tournamentPenaltyTypeLabels[item.payload.payload.type]
  }

  return item.payload.payload.result === 'ok'
    ? 'Kontrola sektora OK'
    : item.payload.payload.result === 'warning'
      ? 'Napomenutie pri kontrole'
      : 'Kontrola s trestom'
}

const getOfflineAdminActionTarget = (item: OfflineTournamentAdminActionQueueItem) => {
  if (item.payload.kind === 'catch-verification') {
    return `úlovok ${item.payload.payload.catchId}`
  }

  return sectorLabel(item.payload.payload.sectorId)
}

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
  if (payload.kind === 'catch-verification') {
    return await $fetch<TournamentCatchVerificationSuccess>(
      `/api/admin/tournaments/catches/${payload.payload.catchId}/verify`,
      {
        body: {
          marshalId: payload.payload.marshalId,
          clientMutationId: payload.payload.clientMutationId,
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
    offlineAdminSyncMessage.value = `Vo fronte čaká ${offlineAdminActionQueue.value.length} kontrolórskych úkonov.`
  }
  catch (error) {
    actionStatus.value = 'error'
    actionMessage.value = error instanceof Error
      ? error.message
      : 'Kontrolórsky úkon sa nepodarilo uložiť do offline fronty.'
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
    offlineAdminSyncMessage.value = 'Kontrolórsky úkon bol odstránený z offline fronty.'
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
  if (offlineAdminActionQueue.value.length === 0) {
    if (!options.silent) {
      offlineAdminSyncStatus.value = 'success'
      offlineAdminSyncMessage.value = 'Offline fronta kontrolórskych úkonov je prázdna.'
    }
    return
  }

  offlineAdminSyncInProgress = true
  offlineAdminSyncStatus.value = 'syncing'
  offlineAdminSyncMessage.value = `Odosielam ${offlineAdminActionQueue.value.length} kontrolórskych úkonov.`
  let syncedCount = 0

  try {
    for (const item of [...offlineAdminActionQueue.value]) {
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
    offlineAdminSyncStatus.value = offlineAdminActionQueue.value.length > 0 ? 'error' : 'success'
    offlineAdminSyncMessage.value = offlineAdminActionQueue.value.length > 0
      ? `${syncedCount} úkonov odoslaných, ${offlineAdminActionQueue.value.length} čaká na ďalší pokus.`
      : `${syncedCount} kontrolórskych úkonov bolo odoslaných.`

    if (syncedCount > 0) {
      await refreshTournamentState()
    }
  }
  finally {
    offlineAdminSyncInProgress = false
  }
}

const saveSectorSettings = async () => {
  if (!canOperateTournaments.value) {
    sectorSettingsStatus.value = 'error'
    sectorSettingsMessage.value = tournamentReadOnlyMessage.value
    return
  }

  const validation = sectorSettingsValidation.value
  if (!validation.success) {
    sectorSettingsStatus.value = 'error'
    sectorSettingsMessage.value = sectorSettingsValidationMessages.value[0] ?? 'Skontrolujte sektory.'
    return
  }

  sectorSettingsStatus.value = 'saving'
  sectorSettingsMessage.value = ''

  try {
    const result = await $fetch<TournamentSectorSettingsSuccess>(
      `/api/admin/tournaments/${activeTournament.value.id}/sectors`,
      {
        body: validation.data,
        method: 'PUT',
      },
    )

    sectorSettingsStatus.value = 'success'
    sectorSettingsMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    sectorSettingsStatus.value = 'error'
    sectorSettingsMessage.value = getApiErrorMessage(error)
  }
}

const submitTeamRegistrationDecision = async (
  registration: TournamentTeamRegistration,
  action: 'approve' | 'reject' | 'waitlist',
) => {
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }

  const draft = registrationDecisionDraft(registration.id)
  const payload = {
    action,
    assignedSectorId: action === 'approve' ? draft.assignedSectorId : undefined,
    registrationId: registration.id,
    reviewNote: draft.reviewNote,
  }
  const validation = tournamentTeamRegistrationDecisionInputSchema.safeParse(payload)
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = getValidationMessages(validation)[0] ?? 'Skontrolujte rozhodnutie prihlášky.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${registration.id}:${action}`

  try {
    const result = await $fetch<TournamentTeamRegistrationDecisionSuccess>(
      `/api/admin/tournaments/team-registrations/${registration.id}/decision`,
      {
        body: validation.data,
        method: 'POST',
      },
    )

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

const submitRequestAction = async (requestId: string, action: 'assign' | 'resolve') => {
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${requestId}:${action}`

  try {
    const result = await $fetch<TournamentActionSuccess>(`/api/admin/tournaments/requests/${requestId}/action`, {
      body: { action },
      method: 'POST',
    })

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

const verifyCatch = async (catchId: string) => {
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }

  const payload: OfflineTournamentAdminActionPayload = {
    kind: 'catch-verification',
    payload: {
      catchId,
      status: 'verified',
    },
  }
  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${catchId}:verify`

  try {
    const result = await sendOrQueueTournamentAdminAction(
      payload,
      'Váženie je uložené v offline fronte a odošle sa po návrate pripojenia.',
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
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }

  const validation = penaltyValidation.value
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = penaltyValidationMessages.value[0] ?? 'Skontrolujte trest.'
    return
  }
  const payload: OfflineTournamentAdminActionPayload = {
    kind: 'penalty',
    payload: validation.data,
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = 'penalty:create'

  try {
    const result = await sendOrQueueTournamentAdminAction(
      payload,
      'Trest je uložený v offline fronte a odošle sa po návrate pripojenia.',
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
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }

  const validation = ruleCheckValidation.value
  if (!validation.success) {
    actionStatus.value = 'error'
    actionMessage.value = ruleCheckValidationMessages.value[0] ?? 'Skontrolujte kontrolu pravidiel.'
    return
  }
  const payload: OfflineTournamentAdminActionPayload = {
    kind: 'rule-check',
    payload: validation.data,
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = 'rule-check:create'

  try {
    const result = await sendOrQueueTournamentAdminAction(
      payload,
      'Kontrola pravidiel je uložená v offline fronte a odošle sa po návrate pripojenia.',
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

const syncMarshalForSector = (kind: 'penalty' | 'rule-check') => {
  const form = kind === 'penalty' ? penaltyForm : ruleCheckForm
  const options = marshalsForSector(form.sectorId)

  if (!options.some((marshal) => marshal.id === form.marshalId)) {
    form.marshalId = options[0]?.id ?? ''
  }
}

watch(() => penaltyForm.sectorId, () => syncMarshalForSector('penalty'), { immediate: true })
watch(() => ruleCheckForm.sectorId, () => syncMarshalForSector('rule-check'), { immediate: true })
watch(
  activeTournament,
  (tournament) => {
    sectorDraft.value = tournament.sectors.map(cloneTournamentSector)
  },
  { immediate: true },
)
watch(
  tournamentTeamRegistrations,
  (registrations) => {
    for (const registration of registrations) {
      registrationDecisionDrafts[registration.id] ??= {
        assignedSectorId: registration.assignedSectorId ?? registration.preferredSectorId ?? '',
        reviewNote: registration.reviewNote ?? '',
      }
    }
  },
  { immediate: true },
)

function handleOnline() {
  isOnline.value = true
  void syncOfflineAdminActionQueue({ silent: true })
}

function handleOffline() {
  isOnline.value = false
  offlineAdminSyncStatus.value = 'idle'
  offlineAdminSyncMessage.value = 'Signál vypadol. Kontrolórske úkony sa uložia v zariadení.'
}

onMounted(() => {
  if (!import.meta.client) return

  isOnline.value = navigator.onLine
  void refreshOfflineAdminActionQueue().then(() => {
    if (navigator.onLine && offlineAdminActionQueue.value.length > 0) {
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
      eyebrow="Admin"
      title="Súťažný dispečing"
      description="Interný prehľad pre organizátora: hlásenia tímov, kontrolóri, váženia, tresty a kontroly sektorov."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="tournamentsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ tournamentAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ tournamentReadOnlyMessage }}</p>
      </div>

      <div
        v-if="!isOnline || offlineAdminActionCount > 0 || offlineAdminSyncMessage"
        class="mb-5 rounded-card border p-5"
        :class="
          offlineAdminSyncStatus === 'error' || !isOnline
            ? 'border-warning-500/30 bg-warning-500/10 text-warning-900'
            : 'border-primary-200 bg-primary-50 text-primary-900'
        "
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex items-start gap-3">
            <div class="rounded-full bg-white p-2 text-primary-800">
              <UIcon name="i-heroicons-cloud-arrow-up" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-bold">
                {{ isOnline ? 'Offline fronta kontrolóra' : 'Bez signálu pri vode' }}
              </h2>
              <p class="mt-1 text-sm">
                {{ offlineAdminSyncMessage || 'Váženia, tresty a kontroly sektorov podržíme v zariadení a odošleme ich po návrate pripojenia.' }}
              </p>
            </div>
          </div>
          <UButton
            v-if="offlineAdminActionCount > 0"
            icon="i-heroicons-cloud-arrow-up"
            size="sm"
            :disabled="!isOnline || offlineAdminSyncStatus === 'syncing'"
            :loading="offlineAdminSyncStatus === 'syncing'"
            @click="syncOfflineAdminActionQueue()"
          >
            Odoslať {{ offlineAdminActionCount }}
          </UButton>
        </div>

        <div v-if="offlineAdminActionQueue.length > 0" class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="item in offlineAdminActionQueue"
            :key="item.id"
            class="rounded-md border border-white/70 bg-white/80 p-3 text-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-bold">{{ getOfflineAdminActionLabel(item) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ getOfflineAdminActionTarget(item) }} · {{ formatDateTime(item.createdAt) }}
                </p>
              </div>
              <button
                type="button"
                class="text-error-700 hover:text-error-900"
                aria-label="Odstrániť kontrolórsky offline úkon"
                @click="discardOfflineAdminAction(item.id)"
              >
                <UIcon name="i-heroicons-trash" class="h-4 w-4" />
              </button>
            </div>
            <p v-if="item.lastError" class="mt-2 rounded bg-error-500/10 px-2 py-1 text-xs font-semibold text-error-800">
              {{ item.lastError }}
            </p>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-5">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Aktívne hlásenia</p>
          <p class="mt-2 text-3xl font-bold">{{ activeRequests.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Nové prihlášky</p>
          <p class="mt-2 text-3xl font-bold">{{ submittedTeamRegistrations.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Čaká na váženie</p>
          <p class="mt-2 text-3xl font-bold">{{ waitingCatches.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Aktívne tresty</p>
          <p class="mt-2 text-3xl font-bold">{{ activePenalties.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Kontrolóri</p>
          <p class="mt-2 text-3xl font-bold">{{ liveTournamentMarshals.length }}</p>
        </div>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Live výsledkovka</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Operačné poradie tímov podľa uložených sektorových váh a overovacích stavov úlovkov.
            </p>
          </div>
          <div class="flex flex-col gap-3">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">skóre</p>
                <p class="font-black">{{ formatWeight(leaderboardStats.totalScoreWeightKg) }} kg</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">aktívne</p>
                <p class="font-black">{{ leaderboardStats.activeTeamCount }}</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">čaká</p>
                <p class="font-black">{{ leaderboardStats.pendingReviewCatchCount }}</p>
              </div>
            </div>
            <div class="flex flex-wrap justify-start gap-2 lg:justify-end">
              <a
                :href="leaderboardExportUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-50 px-3 text-sm font-bold text-primary-800 transition-colors hover:bg-primary-100"
              >
                <UIcon name="i-heroicons-arrow-down-tray" class="h-4 w-4" />
                Výsledkovka CSV
              </a>
              <a
                :href="organizerExportUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-900 px-3 text-sm font-bold text-white transition-colors hover:bg-primary-800"
              >
                <UIcon name="i-heroicons-document-arrow-down" class="h-4 w-4" />
                Export balík
              </a>
              <a
                :href="leaderboardFeedUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-sm font-bold text-foreground transition-colors hover:bg-border"
              >
                <UIcon name="i-heroicons-rss" class="h-4 w-4" />
                JSON feed
              </a>
              <NuxtLink
                :to="leaderboardKioskUrl"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-100 px-3 text-sm font-bold text-accent-700 transition-colors hover:bg-accent-200"
              >
                <UIcon name="i-heroicons-presentation-chart-bar" class="h-4 w-4" />
                Kiosk
              </NuxtLink>
            </div>
          </div>
        </div>

        <div class="mt-4 overflow-hidden rounded-md border border-border">
          <div
            v-for="row in tournamentLeaderboard"
            :key="row.sectorId"
            class="grid gap-3 border-b border-border bg-white p-3 last:border-b-0 sm:grid-cols-[auto_1fr_auto_auto]"
            :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-50' : ''"
          >
            <span
              class="flex h-9 min-w-9 items-center justify-center rounded-md text-sm font-black"
              :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-400 text-primary-950' : 'bg-muted text-foreground-muted'"
            >
              {{ row.rank }}.
            </span>
            <div class="min-w-0">
              <p class="truncate font-bold">{{ row.team }}</p>
              <p class="text-foreground-muted mt-0.5 truncate text-xs">
                {{ row.sectorLabel }} · najväčšia {{ formatWeight(row.largestCatchKg) }} kg
              </p>
            </div>
            <div class="flex gap-2 text-xs sm:block sm:text-right">
              <p class="font-semibold text-success-700">overené {{ row.verifiedCatchCount }}</p>
              <p class="font-semibold text-warning-700">čaká {{ row.pendingCatchCount + row.disputedCatchCount }}</p>
            </div>
            <div class="text-right">
              <p class="text-lg font-black">{{ formatWeight(row.scoreWeightKg) }} kg</p>
              <p class="text-foreground-muted text-xs">úlovky {{ formatWeight(row.catchDerivedWeightKg) }} kg</p>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Prihlášky tímov</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Kontakty tímov, preferované sektory a rozhodnutie organizátora na jednom mieste.
            </p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-xs font-semibold text-foreground-muted">nové</p>
              <p class="font-black">{{ submittedTeamRegistrations.length }}</p>
            </div>
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-xs font-semibold text-foreground-muted">schválené</p>
              <p class="font-black">{{ approvedTeamRegistrations.length }}</p>
            </div>
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-xs font-semibold text-foreground-muted">poradovník</p>
              <p class="font-black">{{ waitlistedTeamRegistrations.length }}</p>
            </div>
          </div>
        </div>

        <div class="mt-4 grid gap-3 xl:grid-cols-2">
          <div
            v-for="registration in tournamentTeamRegistrations"
            :key="registration.id"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base font-bold">{{ registration.teamName }}</h3>
                  <span
                    class="w-fit rounded-md px-2 py-1 text-xs font-bold"
                    :class="registrationStatusClass(registration.status)"
                  >
                    {{ tournamentTeamRegistrationStatusLabels[registration.status] }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ registration.contactName }} · {{ registration.contactPhone }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ registration.contactEmail || 'bez e-mailu' }} · {{ registration.city || 'bez mesta' }} ·
                  {{ registration.memberCount }} členovia
                </p>
              </div>
              <div class="text-left text-xs text-foreground-muted sm:text-right">
                <p class="font-semibold text-foreground">Preferencia</p>
                <p>{{ sectorOptionLabel(registration.preferredSectorId) }}</p>
                <p v-if="registration.assignedSectorId" class="mt-1 font-semibold text-success-700">
                  {{ sectorOptionLabel(registration.assignedSectorId) }}
                </p>
              </div>
            </div>

            <p v-if="registration.note" class="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground-muted">
              {{ registration.note }}
            </p>

            <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <label class="block">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Schváliť do sektora</span>
                <select
                  :value="registrationDecisionDraft(registration.id).assignedSectorId"
                  :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  @change="setRegistrationDecisionSector(registration.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Vybrať sektor</option>
                  <option
                    v-for="sector in activeTournament.sectors"
                    :key="sector.id"
                    :value="sector.id"
                  >
                    {{ sector.label }} · {{ sector.team || 'voľný' }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Poznámka pre rozhodnutie</span>
                <input
                  :value="registrationDecisionDraft(registration.id).reviewNote"
                  :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                  maxlength="500"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  placeholder="voliteľné"
                  @input="setRegistrationDecisionNote(registration.id, ($event.target as HTMLInputElement).value)"
                >
              </label>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                size="sm"
                icon="i-heroicons-check"
                variant="soft"
                :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                :loading="activeActionId === `${registration.id}:approve`"
                @click="submitTeamRegistrationDecision(registration, 'approve')"
              >
                Schváliť
              </UButton>
              <UButton
                size="sm"
                icon="i-heroicons-clock"
                color="neutral"
                variant="soft"
                :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                :loading="activeActionId === `${registration.id}:waitlist`"
                @click="submitTeamRegistrationDecision(registration, 'waitlist')"
              >
                Poradovník
              </UButton>
              <UButton
                size="sm"
                icon="i-heroicons-x-mark"
                color="error"
                variant="soft"
                :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                :loading="activeActionId === `${registration.id}:reject`"
                @click="submitTeamRegistrationDecision(registration, 'reject')"
              >
                Zamietnuť
              </UButton>
            </div>

            <p v-if="registration.reviewNote" class="text-foreground-muted mt-3 text-xs">
              Posledná poznámka: {{ registration.reviewNote }}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Mapové pokrytie sektorov</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Súťažné sektory čítajú SVG polygony z admin mapy, aby organizátor videl aj pripravené drafty.
            </p>
            <p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <span
                class="rounded-md px-2 py-1 font-bold"
                :class="mapSourceSummary.tone === 'draft'
                  ? 'bg-warning-500/10 text-warning-900'
                  : 'bg-success-500/10 text-success-700'"
              >
                {{ mapSourceSummary.label }}
              </span>
              <span>{{ mapSourceSummary.description }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-md bg-primary-50 px-3 py-1 text-sm font-bold text-primary-800">
              {{ sectorMapCoverage.mappedSectorCount }}/{{ sectorMapCoverage.totalSectorCount }}
            </span>
            <UButton to="/admin/mapa" icon="i-heroicons-map" variant="soft" size="sm">
              Editor mapy
            </UButton>
          </div>
        </div>
        <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="row in sectorMapRows"
            :key="row.sector.id"
            class="rounded-md border px-3 py-2"
            :class="row.mapped ? 'border-success-500/30 bg-success-500/10' : 'border-warning-300 bg-warning-500/10'"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-bold">{{ row.sector.label }}</p>
              <span
                class="rounded-md px-2 py-0.5 text-xs font-bold"
                :class="row.mapped ? 'bg-success-500/15 text-success-700' : 'bg-warning-100 text-warning-900'"
              >
                {{ row.mapped ? 'polygon' : 'iba bod' }}
              </span>
            </div>
            <p class="text-foreground-muted mt-1 truncate text-xs">
              {{ row.shape?.label ?? row.sector.team ?? 'bez mapového polygonu' }}
            </p>
          </div>
        </div>
        <p class="text-foreground-muted mt-3 text-xs">
          Aktívne sektorové polygony v mape: {{ activeTournamentSectorShapes.length }}.
        </p>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Sektory a tímy</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Operačné nastavenia pre výsledkovku, tímové hlásenia a bodové pozície sektorov.
            </p>
          </div>
          <UButton
            icon="i-heroicons-arrow-down-tray"
            :disabled="!canOperateTournaments || !sectorSettingsValidation.success || sectorSettingsStatus === 'saving'"
            :loading="sectorSettingsStatus === 'saving'"
            @click="saveSectorSettings"
          >
            Uložiť sektory
          </UButton>
        </div>

        <ValidationSummary
          class="mt-4"
          :messages="sectorSettingsValidationMessages"
          valid-title="Sektory sú pripravené"
          valid-description="ID sektorov ostávajú stabilné, hodnoty sa dajú bezpečne uložiť do súťažného stavu."
        />

        <p
          v-if="sectorSettingsMessage"
          class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
          :class="
            sectorSettingsStatus === 'success'
              ? 'bg-success-500/10 text-success-700'
              : 'bg-error-500/10 text-error-700'
          "
        >
          {{ sectorSettingsMessage }}
        </p>

        <div class="mt-4 grid gap-3 xl:grid-cols-2">
          <div
            v-for="sector in sectorDraft"
            :key="sector.id"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-bold">Sektor {{ sector.label || sector.id.toUpperCase() }}</p>
                <p class="text-foreground-muted mt-1 flex items-center gap-1.5 text-xs">
                  <UIcon
                    :name="sectorMapRows.find((row) => row.sector.id === sector.id)?.mapped ? 'i-heroicons-squares-2x2' : 'i-heroicons-map-pin'"
                    class="h-4 w-4"
                  />
                  {{ sectorMapStatus(sector.id) }}
                </p>
              </div>
              <span class="text-foreground-muted text-xs font-semibold uppercase tracking-wide">
                {{ sector.id }}
              </span>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label class="block lg:col-span-1">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Označenie</span>
                <input
                  v-model="sector.label"
                  :disabled="!canOperateTournaments"
                  maxlength="16"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-semibold"
                >
              </label>
              <label class="block sm:col-span-2 lg:col-span-2">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Tím</span>
                <input
                  v-model="sector.team"
                  :disabled="!canOperateTournaments"
                  maxlength="120"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  placeholder="Voľný sektor"
                >
              </label>
              <label class="block">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Váha kg</span>
                <input
                  v-model.number="sector.weightKg"
                  type="number"
                  min="0"
                  step="0.1"
                  :disabled="!canOperateTournaments"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                >
              </label>
              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="text-xs font-semibold uppercase text-foreground-muted">X</span>
                  <input
                    v-model.number="sector.x"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-xs font-semibold uppercase text-foreground-muted">Y</span>
                  <input
                    v-model.number="sector.y"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p
        v-if="actionMessage"
        class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
        :class="
          actionStatus === 'success'
            ? 'bg-success-500/10 text-success-700'
            : 'bg-error-500/10 text-error-700'
        "
      >
        {{ actionMessage }}
      </p>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <div
          v-for="slot in tournamentSponsorSlots"
          :key="slot.placementType"
          class="rounded-card border border-border bg-surface p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase text-primary-700">{{ slot.label }}</p>
              <p class="text-foreground-muted mt-1 text-sm">{{ slot.description }}</p>
            </div>
            <span class="rounded-md bg-primary-50 px-2 py-1 text-xs font-bold text-primary-800">
              {{ slot.sponsors.length }}
            </span>
          </div>
          <div v-if="slot.sponsors.length > 0" class="mt-4 space-y-2">
            <div
              v-for="sponsor in slot.sponsors"
              :key="`${slot.placementType}-${sponsor.id}`"
              class="flex items-center gap-3 rounded-md bg-muted p-2"
            >
              <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
                <img
                  v-if="sponsorLogo(sponsor, slot.placementType).url"
                  :src="sponsorLogo(sponsor, slot.placementType).url"
                  :alt="sponsorLogo(sponsor, slot.placementType).alt"
                  class="h-full w-full bg-white object-contain p-1"
                >
                <span v-else>{{ sponsorLogo(sponsor, slot.placementType).text }}</span>
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-bold">{{ sponsor.name }}</p>
                <p class="text-foreground-muted truncate text-xs">
                  {{ sponsor.sectorId ? `sektor ${sectorLabel(sponsor.sectorId)}` : sponsor.placement }}
                </p>
              </div>
            </div>
          </div>
          <p v-else class="text-foreground-muted mt-4 text-sm">
            Slot zatiaľ nemá aktívneho partnera.
          </p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Front hlásení</h2>
            <div class="mt-4 space-y-3">
              <div v-for="request in liveTournamentRequests" :key="request.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ request.team }} · {{ sectorLabel(request.sectorId) }}</p>
                    <p class="text-primary-800 text-sm font-semibold">{{ tournamentRequestTypeLabels[request.type] }}</p>
                  </div>
                  <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold">
                    {{ tournamentRequestStatusLabels[request.status] }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    icon="i-heroicons-user-plus"
                    variant="soft"
                    :disabled="!canOperateTournaments || request.status === 'resolved' || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:assign`"
                    @click="submitRequestAction(request.id, 'assign')"
                  >
                    Priradiť kontrolóra
                  </UButton>
                  <UButton
                    size="sm"
                    icon="i-heroicons-check"
                    color="neutral"
                    variant="soft"
                    :disabled="!canOperateTournaments || request.status === 'resolved' || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:resolve`"
                    @click="submitRequestAction(request.id, 'resolve')"
                  >
                    Uzavrieť
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Váženia úlovkov</h2>
            <div class="mt-4 overflow-hidden rounded-md border border-border">
              <div v-for="catchItem in liveTournamentCatches" :key="catchItem.id" class="border-b border-border bg-white p-4 last:border-b-0">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ catchItem.team }} · {{ sectorLabel(catchItem.sectorId) }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
                    </p>
                  </div>
                  <span class="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">
                    {{ catchItem.status }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-2 text-sm">
                  Kontrolór: {{ marshalName(catchItem.verifiedByMarshalId) }} · {{ catchItem.notes }}
                </p>
                <div v-if="catchItem.status === 'waiting'" class="mt-4">
                  <UButton
                    size="sm"
                    icon="i-heroicons-scale"
                    variant="soft"
                    :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                    :loading="activeActionId === `${catchItem.id}:verify`"
                    @click="verifyCatch(catchItem.id)"
                  >
                    Overiť váženie
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Kontrolóri</h2>
            <div class="mt-4 space-y-3">
              <div v-for="marshal in liveTournamentMarshals" :key="marshal.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map(sectorLabel).join(', ') }}
                    </p>
                  </div>
                  <span class="rounded-md bg-white px-2 py-1 text-xs font-bold text-primary-800">
                    {{ tournamentMarshalStatusLabels[marshal.status] }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Zapísať trest</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitPenalty">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="penaltyForm.sectorId"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="penaltyForm.marshalId"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="marshal in marshalsForSector(penaltyForm.sectorId)" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Typ trestu</span>
                <select
                  v-model="penaltyForm.type"
                  :disabled="!canOperateTournaments"
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
                    :disabled="!canOperateTournaments"
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
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <textarea
                  v-model="penaltyForm.reason"
                  rows="3"
                  :readonly="!canOperateTournaments"
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
                :disabled="!canOperateTournaments || !penaltyValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'penalty:create'"
              >
                Uložiť trest
              </UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Zapísať kontrolu</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitRuleCheck">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="ruleCheckForm.sectorId"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="ruleCheckForm.marshalId"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="marshal in marshalsForSector(ruleCheckForm.sectorId)" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Výsledok</span>
                <select
                  v-model="ruleCheckForm.result"
                  :disabled="!canOperateTournaments"
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
                  :readonly="!canOperateTournaments"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="ruleCheckValidationMessages"
                valid-title="Kontrola je pripravená"
                valid-description="Kontrolór, sektor, výsledok a poznámka sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-clipboard-document-check"
                block
                :disabled="!canOperateTournaments || !ruleCheckValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'rule-check:create'"
              >
                Uložiť kontrolu
              </UButton>
            </form>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Tresty</h2>
            <div class="mt-4 space-y-3">
              <div v-for="penalty in liveTournamentPenalties" :key="penalty.id" class="rounded-md border border-border bg-white p-4">
                <p class="font-bold">{{ penalty.team }} · {{ sectorLabel(penalty.sectorId) }}</p>
                <p class="text-error-700 text-sm font-semibold">{{ tournamentPenaltyTypeLabels[penalty.type] }}</p>
                <p class="text-foreground-muted mt-2 text-sm">{{ penalty.reason }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Kontroly sektorov</h2>
            <div class="mt-4 space-y-3">
              <div v-for="check in liveTournamentRuleChecks" :key="check.id" class="rounded-md bg-muted p-4">
                <p class="font-semibold">{{ sectorLabel(check.sectorId) }} · {{ marshalName(check.marshalId) }}</p>
                <p class="text-foreground-muted mt-1 text-sm">{{ check.note }}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
