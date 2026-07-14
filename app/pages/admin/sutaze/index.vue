<script setup lang="ts">
import type {
  Sponsor,
  SponsorLogoVariant,
  Tournament,
  TournamentCatch,
  TournamentMarshal,
  TournamentOperationsMode,
  TournamentPenalty,
  TournamentRequest,
  TournamentRuleCheck,
  TournamentTeamRegistration,
} from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import type {
  TournamentActionSuccess,
  TournamentCatchVerificationSuccess,
  TournamentOperationsModeSuccess,
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
  createTournamentSectorMapEditorUrl,
  getTournamentMapCoverage,
  getTournamentMapSourceSummary,
  getTournamentSectorMapRows,
  getTournamentSectorShapes,
  type TournamentMapSourceSummary,
} from '~/utils/tournamentMap'
import {
  getTournamentLeaderboard,
  getTournamentLeaderboardStats,
} from '~/utils/tournamentLeaderboard'
import {
  getTournamentOperationalCapabilities,
  tournamentOperationsModeOptions,
} from '~/utils/tournamentOperations'
import {
  createTournamentTeamAccessCsv,
  createTournamentTeamAccessUrl,
  getTournamentTeamAccessRows,
} from '~/utils/tournamentTeamAccess'
import { createTournamentMarshalAccessUrl } from '~/utils/tournamentMarshalAccess'
import type { StatusBadgeTone } from '~/utils/ui'

type NoticeTone = 'error' | 'info' | 'success' | 'warning'
type TournamentAdminView = 'dispecing' | 'prehlad' | 'prihlasky' | 'pravidla' | 'sektory'

useHead({ title: 'Admin súťaže' })

const route = useRoute()
const router = useRouter()

const tournamentAdminViewOptions: Array<{
  description: string
  icon: string
  id: TournamentAdminView
  label: string
}> = [
  {
    description: 'Režim súťaže, živé poradie, exporty a partnerské umiestnenia.',
    icon: 'i-heroicons-chart-bar-square',
    id: 'prehlad',
    label: 'Prehľad',
  },
  {
    description: 'Nové prihlášky tímov, rozhodnutia organizátora a mobilné prístupy.',
    icon: 'i-heroicons-user-group',
    id: 'prihlasky',
    label: 'Prihlášky',
  },
  {
    description: 'Mapové polygony, tímy, označenia a bodové pozície sektorov.',
    icon: 'i-heroicons-map',
    id: 'sektory',
    label: 'Sektory',
  },
  {
    description: 'Živé hlásenia tímov, čakajúce váženia a dostupnosť kontrolórov.',
    icon: 'i-heroicons-radio',
    id: 'dispecing',
    label: 'Dispečing',
  },
  {
    description: 'Udelenie trestu, zápis kontroly a história disciplinárnych úkonov.',
    icon: 'i-heroicons-shield-check',
    id: 'pravidla',
    label: 'Pravidlá',
  },
]

const tournamentStatusLabels: Record<Tournament['status'], string> = {
  closed: 'ukončená',
  live: 'prebieha',
  planned: 'plánovaná',
}

const getRouteQueryValue = (value: unknown) => {
  const singleValue = Array.isArray(value) ? value[0] : value

  return typeof singleValue === 'string' && singleValue.trim() ? singleValue : undefined
}

function normalizeTournamentAdminView(value: unknown): TournamentAdminView {
  const requestedView = getRouteQueryValue(value)

  return tournamentAdminViewOptions.some((option) => option.id === requestedView)
    ? requestedView as TournamentAdminView
    : 'prehlad'
}

const {
  getLakeName,
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
const requestFetch = useRequestFetch()
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'admin-tournament-state',
  () => requestFetch<TournamentStateResponse>('/api/admin/tournaments'),
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
      return await requestFetch<MapStateResponse>('/api/admin/map')
    }
    catch {
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
const requestedTournamentId = computed(() => getRouteQueryValue(route.query.turnaj))
const activeTournamentId = ref(
  liveTournaments.value.some((tournament) => tournament.id === requestedTournamentId.value)
    ? requestedTournamentId.value!
    : (liveTournaments.value[0]?.id ?? seedTournaments[0]!.id),
)
const activeTournament = computed(() =>
  liveTournaments.value.find((tournament) => tournament.id === activeTournamentId.value)
  ?? liveTournaments.value[0]
  ?? seedTournaments[0]!,
)
const activeTournamentAdminView = ref<TournamentAdminView>(normalizeTournamentAdminView(route.query.sekcia))
const tournamentAdminTabsRef = ref<HTMLElement | null>(null)
const activeTournamentAdminViewOption = computed(() =>
  tournamentAdminViewOptions.find((option) => option.id === activeTournamentAdminView.value)
  ?? tournamentAdminViewOptions[0]!,
)
const tournamentCapabilities = computed(() => getTournamentOperationalCapabilities(activeTournament.value))
const canUseTournamentDispatch = computed(() => tournamentCapabilities.value.allowsMarshalWorkflow)
const actionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const actionMessage = ref('')
const activeActionId = ref('')
const operationsModeStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const operationsModeMessage = ref('')
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

const tournamentRequests = computed(() =>
  liveTournamentRequests.value.filter((request) => request.tournamentId === activeTournament.value.id),
)
const activeRequests = computed(() =>
  tournamentRequests.value.filter((request) => request.status !== 'resolved'),
)
const tournamentCatches = computed(() =>
  liveTournamentCatches.value.filter((catchItem) => catchItem.tournamentId === activeTournament.value.id),
)
const waitingCatches = computed(() =>
  tournamentCatches.value.filter((catchItem) => catchItem.status === 'waiting'),
)
const tournamentPenalties = computed(() =>
  liveTournamentPenalties.value.filter((penalty) => penalty.tournamentId === activeTournament.value.id),
)
const activePenalties = computed(() =>
  tournamentPenalties.value.filter((penalty) => penalty.status === 'active'),
)
const tournamentRuleChecks = computed(() =>
  liveTournamentRuleChecks.value.filter((ruleCheck) => ruleCheck.tournamentId === activeTournament.value.id),
)
const tournamentDispatchAttentionCount = computed(() =>
  activeRequests.value.length + waitingCatches.value.length,
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
const tournamentTeamAccessUrl = (sectorId: string) =>
  createTournamentTeamAccessUrl(activeTournament.value.id, sectorId)
const tournamentMarshalAccessUrl = (marshalId: string) =>
  createTournamentMarshalAccessUrl(activeTournament.value.id, marshalId)
const tournamentMapEditorUrl = computed(() =>
  createTournamentSectorMapEditorUrl(activeTournament.value.id),
)
const tournamentSectorMapEditorUrl = (sectorId: string) =>
  createTournamentSectorMapEditorUrl(activeTournament.value.id, sectorId)
const teamAccessRows = computed(() => getTournamentTeamAccessRows(activeTournament.value))
const activeTournamentSectorShapes = computed(() =>
  getTournamentSectorShapes(liveMapShapes.value, activeTournament.value),
)
const sectorMapRows = computed(() =>
  getTournamentSectorMapRows(activeTournament.value, liveMapShapes.value),
)
const sectorMapCoverage = computed(() => getTournamentMapCoverage(sectorMapRows.value))
const mapSourceSummary = computed(() => getTournamentMapSourceSummary(mapState.value))
const sectorDraft = ref<Tournament['sectors']>(activeTournament.value.sectors.map(cloneTournamentSector))
const expandedTournamentSectorId = ref(activeTournament.value.sectors[0]?.id ?? '')
const sectorSettingsStatus = ref<'idle' | 'saving' | 'success' | 'error'>('idle')
const sectorSettingsMessage = ref('')
const teamAccessShareStatus = ref<'idle' | 'success' | 'error'>('idle')
const teamAccessShareMessage = ref('')
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

const operationsModeTone = (mode: TournamentOperationsMode): StatusBadgeTone => {
  switch (mode) {
    case 'full-dispatch':
      return 'success'
    case 'registration-only':
      return 'info'
    case 'public-only':
      return 'neutral'
    default:
      return 'muted'
  }
}

const operationsModeIcon = (mode: TournamentOperationsMode) => {
  switch (mode) {
    case 'full-dispatch':
      return 'i-heroicons-radio'
    case 'registration-only':
      return 'i-heroicons-inbox-arrow-down'
    case 'public-only':
      return 'i-heroicons-eye'
    default:
      return 'i-heroicons-cog-6-tooth'
  }
}

const mapSourceSummaryTone = (tone: TournamentMapSourceSummary['tone']): StatusBadgeTone =>
  tone === 'published' ? 'success' : 'warning'

const mapSourceSummaryIcon = (tone: TournamentMapSourceSummary['tone']) =>
  tone === 'published' ? 'i-heroicons-check-circle' : 'i-heroicons-pencil-square'

const sectorMapRowTone = (mapped: boolean): StatusBadgeTone => mapped ? 'success' : 'warning'

const sectorMapRowIcon = (mapped: boolean) => mapped ? 'i-heroicons-squares-2x2' : 'i-heroicons-map-pin'

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

const getTeamAccessBaseUrl = () => {
  if (!import.meta.client) return ''

  return window.location.origin
}

const getAbsoluteTeamAccessUrl = (path: string) => `${getTeamAccessBaseUrl()}${path}`

const teamAccessShareText = computed(() =>
  teamAccessRows.value
    .map((row) => `${row.sectorLabel} | ${row.teamName} | ${row.code} | ${getAbsoluteTeamAccessUrl(row.codeUrl)}`)
    .join('\n'),
)

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
const actionNoticeTitle = computed(() =>
  actionStatus.value === 'success'
    ? 'Úkon je uložený'
    : 'Úkon sa nepodarilo uložiť',
)
const actionNoticeTone = computed<NoticeTone>(() =>
  actionStatus.value === 'success' ? 'success' : 'error',
)
const operationsModeNoticeTitle = computed(() =>
  operationsModeStatus.value === 'success'
    ? 'Režim súťaže je uložený'
    : 'Režim súťaže sa nepodarilo uložiť',
)
const operationsModeNoticeTone = computed<NoticeTone>(() =>
  operationsModeStatus.value === 'success' ? 'success' : 'error',
)
const offlineAdminNoticeTitle = computed(() => {
  if (!isOnline.value) return 'Bez signálu pri vode'
  if (offlineAdminSyncStatus.value === 'syncing') return 'Odosielam kontrolórske úkony'
  if (offlineAdminSyncStatus.value === 'error') return 'Niektoré úkony čakajú na ďalší pokus'
  if (offlineAdminSyncStatus.value === 'success' && offlineAdminActionCount.value === 0) {
    return 'Kontrolórske úkony sú odoslané'
  }

  return 'Čakajúce úkony kontrolóra'
})
const offlineAdminNoticeDescription = computed(() =>
  offlineAdminSyncMessage.value ||
  'Váženia, tresty a kontroly sektorov podržíme v zariadení a odošleme ich po návrate pripojenia.',
)
const offlineAdminNoticeTone = computed<NoticeTone>(() => {
  if (!isOnline.value) return 'warning'
  if (offlineAdminSyncStatus.value === 'error') return 'error'
  if (offlineAdminSyncStatus.value === 'success') return 'success'

  return 'info'
})
const offlineAdminNoticeIcon = computed(() =>
  isOnline.value ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash',
)
const sectorSettingsNoticeTitle = computed(() =>
  sectorSettingsStatus.value === 'success'
    ? 'Sektory sú uložené'
    : 'Sektory sa nepodarilo uložiť',
)
const sectorSettingsNoticeTone = computed<NoticeTone>(() =>
  sectorSettingsStatus.value === 'success' ? 'success' : 'error',
)
const teamAccessShareNoticeTitle = computed(() =>
  teamAccessShareStatus.value === 'success'
    ? 'Tímové odkazy sú pripravené'
    : 'Tímové odkazy sa nepodarilo pripraviť',
)
const teamAccessShareNoticeTone = computed<NoticeTone>(() =>
  teamAccessShareStatus.value === 'success' ? 'success' : 'error',
)

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

async function copyTeamAccessRows() {
  if (!import.meta.client || !navigator.clipboard) {
    teamAccessShareStatus.value = 'error'
    teamAccessShareMessage.value = 'Prehliadač nepovolil kopírovanie tímových odkazov.'
    return
  }

  try {
    await navigator.clipboard.writeText(teamAccessShareText.value)
    teamAccessShareStatus.value = 'success'
    teamAccessShareMessage.value = 'Tímové kódy a odkazy sú skopírované.'
  }
  catch {
    teamAccessShareStatus.value = 'error'
    teamAccessShareMessage.value = 'Tímové odkazy sa nepodarilo skopírovať.'
  }
}

function downloadTeamAccessCsv() {
  if (!import.meta.client) return

  const csv = createTournamentTeamAccessCsv(activeTournament.value, getTeamAccessBaseUrl())
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')

  link.href = URL.createObjectURL(blob)
  link.download = `timove-odkazy-${activeTournament.value.id}.csv`
  link.click()
  URL.revokeObjectURL(link.href)

  teamAccessShareStatus.value = 'success'
  teamAccessShareMessage.value = 'Súbor s tímovými kódmi je pripravený na stiahnutie.'
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

  return item.payload.payload.result === 'ok'
    ? 'Kontrola sektora OK'
    : item.payload.payload.result === 'warning'
      ? 'Napomenutie pri kontrole'
      : 'Kontrola s trestom'
}

const getOfflineAdminActionTarget = (item: OfflineTournamentAdminActionQueueItem) => {
  if (item.payload.kind === 'request-action') {
    const requestId = item.payload.payload.requestId
    const request = liveTournamentRequests.value.find((entry) => entry.id === requestId)

    return request ? `${sectorLabel(request.sectorId)} · ${request.team}` : `hlásenie ${requestId}`
  }
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
    offlineAdminSyncMessage.value = `V zariadení čaká ${offlineAdminActionQueue.value.length} kontrolórskych úkonov.`
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
  if (offlineAdminActionQueue.value.length === 0) {
    if (!options.silent) {
      offlineAdminSyncStatus.value = 'success'
      offlineAdminSyncMessage.value = 'Žiadne kontrolórske úkony nečakajú na odoslanie.'
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

const saveTournamentOperationsMode = async (operationsMode: TournamentOperationsMode) => {
  if (!canOperateTournaments.value) {
    operationsModeStatus.value = 'error'
    operationsModeMessage.value = tournamentReadOnlyMessage.value
    return
  }

  if (operationsMode === tournamentCapabilities.value.mode) return

  operationsModeStatus.value = 'saving'
  operationsModeMessage.value = ''

  try {
    const result = await $fetch<TournamentOperationsModeSuccess>(
      `/api/admin/tournaments/${activeTournament.value.id}/operations-mode`,
      {
        body: { operationsMode },
        method: 'PUT',
      },
    )

    operationsModeStatus.value = 'success'
    operationsModeMessage.value = result.message
    await refreshTournamentState()
  }
  catch (error) {
    operationsModeStatus.value = 'error'
    operationsModeMessage.value = getApiErrorMessage(error)
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
  if (!canUseTournamentDispatch.value) {
    actionStatus.value = 'error'
    actionMessage.value = 'Kontrolórsky dispečing nie je v aktuálnom režime súťaže zapnutý.'
    return
  }

  actionStatus.value = 'submitting'
  actionMessage.value = ''
  activeActionId.value = `${requestId}:${action}`

  try {
    const result = await sendOrQueueTournamentAdminAction(
      {
        kind: 'request-action',
        payload: {
          action,
          requestId,
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

const verifyCatch = async (catchId: string) => {
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }
  if (!canUseTournamentDispatch.value) {
    actionStatus.value = 'error'
    actionMessage.value = 'Kontrolórsky dispečing nie je v aktuálnom režime súťaže zapnutý.'
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
      'Váženie čaká v zariadení a odošle sa po návrate pripojenia.',
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
  if (!canUseTournamentDispatch.value) {
    actionStatus.value = 'error'
    actionMessage.value = 'Kontrolórsky dispečing nie je v aktuálnom režime súťaže zapnutý.'
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
  if (!canOperateTournaments.value) {
    actionStatus.value = 'error'
    actionMessage.value = tournamentReadOnlyMessage.value
    return
  }
  if (!canUseTournamentDispatch.value) {
    actionStatus.value = 'error'
    actionMessage.value = 'Kontrolórsky dispečing nie je v aktuálnom režime súťaže zapnutý.'
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

const syncMarshalForSector = (kind: 'penalty' | 'rule-check') => {
  const form = kind === 'penalty' ? penaltyForm : ruleCheckForm
  const options = marshalsForSector(form.sectorId)

  if (!options.some((marshal) => marshal.id === form.marshalId)) {
    form.marshalId = options[0]?.id ?? ''
  }
}

async function centerActiveTournamentAdminTab(smooth = true) {
  await nextTick()

  const container = tournamentAdminTabsRef.value
  const activeTab = container?.querySelector<HTMLElement>(
    `[data-tournament-admin-view="${activeTournamentAdminView.value}"]`,
  )
  if (!container || !activeTab) return

  container.scrollTo({
    behavior: smooth ? 'smooth' : 'auto',
    left: activeTab.offsetLeft - container.clientWidth / 2 + activeTab.clientWidth / 2,
  })
}

async function selectTournamentAdminView(
  view: TournamentAdminView,
  options: { focus?: boolean } = {},
) {
  activeTournamentAdminView.value = view

  const query = { ...route.query }
  if (view === 'prehlad') {
    delete query.sekcia
  }
  else {
    query.sekcia = view
  }

  await router.replace({ query })
  await centerActiveTournamentAdminTab()

  if (options.focus) {
    tournamentAdminTabsRef.value
      ?.querySelector<HTMLElement>(`[data-tournament-admin-view="${view}"]`)
      ?.focus()
  }
}

function handleTournamentAdminTabsKeydown(event: KeyboardEvent) {
  const currentIndex = tournamentAdminViewOptions.findIndex(
    (option) => option.id === activeTournamentAdminView.value,
  )
  let nextIndex = currentIndex

  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tournamentAdminViewOptions.length
  else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + tournamentAdminViewOptions.length) % tournamentAdminViewOptions.length
  }
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = tournamentAdminViewOptions.length - 1
  else return

  event.preventDefault()
  const nextView = tournamentAdminViewOptions[nextIndex]?.id
  if (nextView) void selectTournamentAdminView(nextView, { focus: true })
}

async function selectTournament(tournamentId: string) {
  if (!liveTournaments.value.some((tournament) => tournament.id === tournamentId)) return

  activeTournamentId.value = tournamentId
  await router.replace({
    query: {
      ...route.query,
      turnaj: tournamentId,
    },
  })
}

function updateActiveTournament(event: Event) {
  void selectTournament((event.target as HTMLSelectElement).value)
}

function toggleTournamentSector(sectorId: string) {
  expandedTournamentSectorId.value = expandedTournamentSectorId.value === sectorId ? '' : sectorId
}

watch(() => penaltyForm.sectorId, () => syncMarshalForSector('penalty'), { immediate: true })
watch(() => ruleCheckForm.sectorId, () => syncMarshalForSector('rule-check'), { immediate: true })
watch(
  [liveTournaments, requestedTournamentId],
  ([tournaments, tournamentId]) => {
    const nextTournament = tournaments.find((tournament) => tournament.id === tournamentId)
      ?? tournaments[0]
      ?? seedTournaments[0]

    if (nextTournament) activeTournamentId.value = nextTournament.id
  },
  { immediate: true },
)
watch(
  () => route.query.sekcia,
  (view) => {
    activeTournamentAdminView.value = normalizeTournamentAdminView(view)
    void centerActiveTournamentAdminTab(false)
  },
)
watch(
  activeTournament,
  (tournament) => {
    sectorDraft.value = tournament.sectors.map(cloneTournamentSector)
    const firstSectorId = tournament.sectors[0]?.id ?? ''

    if (!tournament.sectors.some((sector) => sector.id === expandedTournamentSectorId.value)) {
      expandedTournamentSectorId.value = firstSectorId
    }

    if (!tournament.sectors.some((sector) => sector.id === penaltyForm.sectorId)) {
      penaltyForm.sectorId = firstSectorId
    }
    if (!tournament.sectors.some((sector) => sector.id === ruleCheckForm.sectorId)) {
      ruleCheckForm.sectorId = firstSectorId
    }

    actionMessage.value = ''
    operationsModeMessage.value = ''
    sectorSettingsMessage.value = ''
    teamAccessShareMessage.value = ''
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
  void centerActiveTournamentAdminTab(false)
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
      title="Správa súťaží"
      description="Tímy, sektory, výsledky a živá prevádzka pretekov na jednom mieste."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="tournamentsReadOnly"
        class="mb-5"
        :description="tournamentReadOnlyMessage"
        icon="i-heroicons-lock-closed"
        :title="`Režim prístupu: ${tournamentAccessLabel}`"
        tone="info"
      />

      <div
        v-if="!isOnline || offlineAdminActionCount > 0 || offlineAdminSyncMessage"
        class="mb-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <DataStatusNotice
            class="min-w-0 flex-1"
            :description="offlineAdminNoticeDescription"
            :icon="offlineAdminNoticeIcon"
            :loading="offlineAdminSyncStatus === 'syncing'"
            :title="offlineAdminNoticeTitle"
            :tone="offlineAdminNoticeTone"
          />
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
            <DataStatusNotice
              v-if="item.lastError"
              class="mt-3"
              description="Skontroluj súťažný stav, sektor, kontrolóra alebo konkrétny úlovok."
              icon="i-heroicons-exclamation-triangle"
              :title="item.lastError"
              tone="error"
            />
          </div>
        </div>
      </div>

      <div class="mb-6 border-b border-border pb-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="min-w-0 flex-1">
            <label for="active-tournament" class="text-xs font-bold uppercase text-foreground-muted">
              Aktívna súťaž
            </label>
            <select
              id="active-tournament"
              :value="activeTournament.id"
              class="mt-1 h-11 w-full max-w-xl rounded-md border border-border bg-white px-3 text-sm font-bold"
              @change="updateActiveTournament"
            >
              <option v-for="tournament in liveTournaments" :key="tournament.id" :value="tournament.id">
                {{ tournament.name }}
              </option>
            </select>
            <div class="text-foreground-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-heroicons-map-pin" class="h-4 w-4" />
                {{ getLakeName(activeTournament.lake) }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-heroicons-calendar-days" class="h-4 w-4" />
                {{ activeTournament.dateRange }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-heroicons-signal" class="h-4 w-4" />
                {{ tournamentStatusLabels[activeTournament.status] }}
              </span>
            </div>
          </div>
          <UButton
            v-if="activeTournamentAdminView !== 'dispecing' && tournamentDispatchAttentionCount > 0"
            icon="i-heroicons-radio"
            size="sm"
            variant="soft"
            @click="selectTournamentAdminView('dispecing')"
          >
            Otvoriť dispečing ({{ tournamentDispatchAttentionCount }})
          </UButton>
          <UButton
            v-else-if="activeTournamentAdminView !== 'prihlasky' && submittedTeamRegistrations.length > 0"
            icon="i-heroicons-inbox-arrow-down"
            size="sm"
            variant="soft"
            @click="selectTournamentAdminView('prihlasky')"
          >
            Nové prihlášky ({{ submittedTeamRegistrations.length }})
          </UButton>
        </div>

        <div
          ref="tournamentAdminTabsRef"
          class="mt-5 flex snap-x gap-1 overflow-x-auto rounded-md bg-muted p-1"
          role="tablist"
          aria-label="Sekcie správy súťaže"
          @keydown="handleTournamentAdminTabsKeydown"
        >
          <button
            v-for="option in tournamentAdminViewOptions"
            :key="option.id"
            type="button"
            role="tab"
            class="flex h-10 shrink-0 snap-center items-center justify-center gap-2 rounded px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="activeTournamentAdminView === option.id
              ? 'bg-white text-primary-900 shadow-sm'
              : 'text-foreground-muted hover:bg-white/70 hover:text-foreground'"
            :aria-selected="activeTournamentAdminView === option.id"
            :tabindex="activeTournamentAdminView === option.id ? 0 : -1"
            :data-tournament-admin-view="option.id"
            @click="selectTournamentAdminView(option.id)"
          >
            <UIcon :name="option.icon" class="h-4 w-4" />
            {{ option.label }}
          </button>
        </div>
        <p class="text-foreground-muted mt-2 text-sm" aria-live="polite">
          {{ activeTournamentAdminViewOption.description }}
        </p>
      </div>

      <div
        v-if="activeTournamentAdminView === 'prehlad'"
        class="mb-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Režim používania súťaže</h2>
            <p class="text-foreground-muted mt-1 text-sm">{{ tournamentCapabilities.description }}</p>
          </div>
          <StatusBadge
            class="w-fit"
            :icon="operationsModeIcon(tournamentCapabilities.mode)"
            :label="tournamentCapabilities.label"
            :tone="operationsModeTone(tournamentCapabilities.mode)"
          />
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <button
            v-for="option in tournamentOperationsModeOptions"
            :key="option.value"
            type="button"
            class="rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            :class="option.value === tournamentCapabilities.mode
              ? 'border-primary-500 bg-primary-50 text-primary-950'
              : 'border-border bg-white hover:border-primary-300'"
            :disabled="!canOperateTournaments || operationsModeStatus === 'saving'"
            @click="saveTournamentOperationsMode(option.value)"
          >
            <span class="block text-sm font-black">{{ option.label }}</span>
            <span class="text-foreground-muted mt-1 block text-xs">{{ option.description }}</span>
          </button>
        </div>

        <DataStatusNotice
          v-if="operationsModeMessage"
          class="mt-4"
          :description="operationsModeMessage"
          :title="operationsModeNoticeTitle"
          :tone="operationsModeNoticeTone"
        />
      </div>

      <div v-if="activeTournamentAdminView === 'prehlad'" class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Aktívne hlásenia</p>
          <p class="mt-2 text-2xl font-bold">{{ activeRequests.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Nové prihlášky</p>
          <p class="mt-2 text-2xl font-bold">{{ submittedTeamRegistrations.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Čaká na váženie</p>
          <p class="mt-2 text-2xl font-bold">{{ waitingCatches.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Aktívne tresty</p>
          <p class="mt-2 text-2xl font-bold">{{ activePenalties.length }}</p>
        </div>
        <div class="col-span-2 rounded-card border border-border bg-surface p-3 sm:p-4 lg:col-span-1">
          <p class="text-foreground-muted text-sm">Kontrolóri</p>
          <p class="mt-2 text-2xl font-bold">{{ liveTournamentMarshals.length }}</p>
        </div>
      </div>

      <div v-if="activeTournamentAdminView === 'prehlad'" class="mt-6 rounded-card border border-border bg-surface p-5">
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
                Stiahnuť výsledkovku
              </a>
              <a
                :href="organizerExportUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-900 px-3 text-sm font-bold text-white transition-colors hover:bg-primary-800"
              >
                <UIcon name="i-heroicons-document-arrow-down" class="h-4 w-4" />
                Podklady pre organizátora
              </a>
              <a
                :href="leaderboardFeedUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-sm font-bold text-foreground transition-colors hover:bg-border"
              >
                <UIcon name="i-heroicons-rss" class="h-4 w-4" />
                Zdroj výsledkov
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

        <p
          v-if="tournamentLeaderboard.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Poradie sa zobrazí po pridaní sektorov a prvých súťažných výsledkov.
        </p>
        <div v-else class="mt-4 overflow-hidden rounded-md border border-border">
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
            <div class="flex flex-wrap gap-1.5 sm:justify-end">
              <StatusBadge
                icon="i-heroicons-check-circle"
                :label="`overené ${row.verifiedCatchCount}`"
                size="xs"
                tone="success"
              />
              <StatusBadge
                icon="i-heroicons-clock"
                :label="`čaká ${row.pendingCatchCount + row.disputedCatchCount}`"
                size="xs"
                tone="warning"
              />
            </div>
            <div class="text-right">
              <p class="text-lg font-black">{{ formatWeight(row.scoreWeightKg) }} kg</p>
              <p class="text-foreground-muted text-xs">úlovky {{ formatWeight(row.catchDerivedWeightKg) }} kg</p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'prihlasky'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
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

        <DataStatusNotice
          v-if="tournamentTeamRegistrations.length === 0"
          class="mt-4"
          description="Keď tím odošle prihlášku, objaví sa tu na posúdenie organizátorom."
          icon="i-heroicons-inbox"
          title="Zatiaľ bez prihlášok"
          tone="info"
        />

        <div v-else class="mt-4 grid gap-3 xl:grid-cols-2">
          <div
            v-for="registration in tournamentTeamRegistrations"
            :key="registration.id"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base font-bold">{{ registration.teamName }}</h3>
                  <StatusBadge
                    class="w-fit"
                    :icon="registrationStatusIcon(registration.status)"
                    :label="tournamentTeamRegistrationStatusLabels[registration.status]"
                    :tone="registrationStatusTone(registration.status)"
                  />
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

      <div
        v-if="activeTournamentAdminView === 'sektory'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Mapové pokrytie sektorov</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Sektorové plochy sú prepojené s mapou revíru. Nepublikované úpravy vidí iba organizátor.
            </p>
            <p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <StatusBadge
                :icon="mapSourceSummaryIcon(mapSourceSummary.tone)"
                :label="mapSourceSummary.label"
                :tone="mapSourceSummaryTone(mapSourceSummary.tone)"
              />
              <span>{{ mapSourceSummary.description }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <StatusBadge
              icon="i-heroicons-squares-2x2"
              :label="`${sectorMapCoverage.mappedSectorCount}/${sectorMapCoverage.totalSectorCount}`"
              tone="primary"
            />
            <UButton :to="tournamentMapEditorUrl" icon="i-heroicons-map" variant="soft" size="sm">
              Editor mapy
            </UButton>
          </div>
        </div>
        <p
          v-if="sectorMapRows.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Súťaž zatiaľ nemá vytvorené sektory. Pridajte ich pred kreslením polygonov v mape.
        </p>
        <div v-else class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="row in sectorMapRows"
            :key="row.sector.id"
            class="rounded-md border border-border bg-white px-3 py-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-bold">{{ row.sector.label }}</p>
              <StatusBadge
                class="shrink-0"
                :icon="sectorMapRowIcon(row.mapped)"
                :label="row.mapped ? 'polygon' : 'iba bod'"
                size="xs"
                :tone="sectorMapRowTone(row.mapped)"
              />
            </div>
            <p class="text-foreground-muted mt-1 truncate text-xs">
              {{ row.shape?.label ?? row.sector.team ?? 'bez mapového polygonu' }}
            </p>
            <NuxtLink
              :to="tournamentSectorMapEditorUrl(row.sector.id)"
              class="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 text-xs font-bold text-primary-800 transition-colors hover:bg-white"
            >
              <UIcon :name="row.mapped ? 'i-heroicons-pencil-square' : 'i-heroicons-plus-circle'" class="h-4 w-4" />
              {{ row.mapped ? 'Upraviť polygon' : 'Vytvoriť polygon' }}
            </NuxtLink>
          </div>
        </div>
        <p class="text-foreground-muted mt-3 text-xs">
          Aktívne sektorové polygony v mape: {{ activeTournamentSectorShapes.length }}.
        </p>
      </div>

      <div
        v-if="activeTournamentAdminView === 'prihlasky'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Tímové odkazy a kódy</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Pošli tímu odkaz alebo krátky kód na otvorenie mobilného panelu.
            </p>
          </div>
          <div class="flex flex-wrap gap-2 lg:justify-end">
            <UButton
              icon="i-heroicons-clipboard-document-list"
              variant="soft"
              @click="copyTeamAccessRows"
            >
              Kopírovať všetko
            </UButton>
            <UButton
              icon="i-heroicons-arrow-down-tray"
              variant="soft"
              @click="downloadTeamAccessCsv"
            >
              Stiahnuť zoznam
            </UButton>
          </div>
        </div>

        <DataStatusNotice
          v-if="teamAccessShareMessage"
          class="mt-4"
          :description="teamAccessShareMessage"
          :title="teamAccessShareNoticeTitle"
          :tone="teamAccessShareNoticeTone"
        />

        <p
          v-if="teamAccessRows.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Tímové odkazy vzniknú automaticky po vytvorení súťažných sektorov.
        </p>
        <div v-else class="mt-4 grid gap-3 lg:grid-cols-2">
          <div
            v-for="row in teamAccessRows"
            :key="row.sectorId"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-md bg-primary-900 px-2 py-1 text-xs font-black text-accent-300">
                    {{ row.sectorLabel }}
                  </span>
                  <p class="truncate text-sm font-bold">{{ row.teamName }}</p>
                </div>
                <p class="mt-2 break-all rounded-md bg-primary-50 px-3 py-2 text-sm font-black text-primary-950">
                  {{ row.code }}
                </p>
              </div>
              <NuxtLink
                :to="row.codeUrl"
                class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary-50 px-2.5 text-xs font-bold text-primary-800 transition-colors hover:bg-primary-100"
              >
                <UIcon name="i-heroicons-device-phone-mobile" class="h-4 w-4" />
                Otvoriť
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'sektory'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
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

        <DataStatusNotice
          v-if="sectorSettingsMessage"
          class="mt-4"
          :description="sectorSettingsMessage"
          :title="sectorSettingsNoticeTitle"
          :tone="sectorSettingsNoticeTone"
        />

        <p
          v-if="sectorDraft.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Táto súťaž zatiaľ nemá žiadne sektory.
        </p>
        <div v-else class="mt-4 grid gap-3 xl:grid-cols-2">
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
              <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <span class="text-foreground-muted text-xs font-semibold uppercase tracking-wide">
                  {{ sector.id }}
                </span>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-border lg:hidden"
                  :aria-controls="`tournament-sector-fields-${sector.id}`"
                  :aria-expanded="expandedTournamentSectorId === sector.id"
                  @click="toggleTournamentSector(sector.id)"
                >
                  <UIcon
                    :name="expandedTournamentSectorId === sector.id ? 'i-heroicons-chevron-up' : 'i-heroicons-pencil-square'"
                    class="h-4 w-4"
                  />
                  {{ expandedTournamentSectorId === sector.id ? 'Zavrieť' : 'Upraviť' }}
                </button>
                <NuxtLink
                  :to="tournamentTeamAccessUrl(sector.id)"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-50 px-2.5 text-xs font-bold text-primary-800 transition-colors hover:bg-primary-100"
                >
                  <UIcon name="i-heroicons-device-phone-mobile" class="h-4 w-4" />
                  Tímový odkaz
                </NuxtLink>
                <NuxtLink
                  :to="tournamentSectorMapEditorUrl(sector.id)"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-50 px-2.5 text-xs font-bold text-primary-800 transition-colors hover:bg-primary-100"
                >
                  <UIcon name="i-heroicons-map" class="h-4 w-4" />
                  Mapa
                </NuxtLink>
              </div>
            </div>

            <div
              :id="`tournament-sector-fields-${sector.id}`"
              class="mt-4 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-5"
              :class="expandedTournamentSectorId === sector.id ? 'grid' : 'hidden'"
            >
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

      <DataStatusNotice
        v-if="actionMessage"
        class="mt-4"
        :description="actionMessage"
        :title="actionNoticeTitle"
        :tone="actionNoticeTone"
      />

      <div v-if="activeTournamentAdminView === 'prehlad'" class="mt-6 grid gap-4 lg:grid-cols-3">
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
            <StatusBadge
              icon="i-heroicons-building-storefront"
              :label="`${slot.sponsors.length}`"
              size="xs"
              tone="primary"
            />
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
            Toto umiestnenie zatiaľ nemá aktívneho partnera.
          </p>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'dispecing' || activeTournamentAdminView === 'pravidla'"
        class="mt-6"
        :class="activeTournamentAdminView === 'dispecing' ? 'grid gap-6 lg:grid-cols-[1fr_0.9fr]' : ''"
      >
        <div v-if="activeTournamentAdminView === 'dispecing'" class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Front hlásení</h2>
            <p
              v-if="tournamentRequests.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              Tímy zatiaľ neposlali žiadne hlásenie ani požiadavku na kontrolóra.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="request in tournamentRequests" :key="request.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ request.team }} · {{ sectorLabel(request.sectorId) }}</p>
                    <p class="text-primary-800 text-sm font-semibold">{{ tournamentRequestTypeLabels[request.type] }}</p>
                  </div>
                  <StatusBadge
                    class="w-fit"
                    :icon="requestStatusIcon(request.status)"
                    :label="tournamentRequestStatusLabels[request.status]"
                    :tone="requestStatusTone(request.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    icon="i-heroicons-user-plus"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || request.status === 'resolved' || actionStatus === 'submitting'"
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
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || request.status === 'resolved' || actionStatus === 'submitting'"
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
            <p
              v-if="tournamentCatches.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              K tejto súťaži zatiaľ nie je evidované žiadne váženie.
            </p>
            <div v-else class="mt-4 overflow-hidden rounded-md border border-border">
              <div v-for="catchItem in tournamentCatches" :key="catchItem.id" class="border-b border-border bg-white p-4 last:border-b-0">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ catchItem.team }} · {{ sectorLabel(catchItem.sectorId) }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
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
                  Kontrolór: {{ marshalName(catchItem.verifiedByMarshalId) }} · {{ catchItem.notes }}
                </p>
                <div v-if="catchItem.status === 'waiting'" class="mt-4">
                  <UButton
                    size="sm"
                    icon="i-heroicons-scale"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || actionStatus === 'submitting'"
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

        <div :class="activeTournamentAdminView === 'pravidla' ? 'grid gap-6 lg:grid-cols-2' : 'space-y-6'">
          <div
            v-if="activeTournamentAdminView === 'dispecing'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Kontrolóri</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Priame panely pre dozor, hlásenia tímov, váženia, tresty a kontroly.
                </p>
              </div>
            </div>
            <p
              v-if="liveTournamentMarshals.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              Pred spustením dispečingu priraďte súťaži kontrolórov.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="marshal in liveTournamentMarshals" :key="marshal.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map(sectorLabel).join(', ') }}
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit shrink-0"
                    :icon="marshalStatusIcon(marshal.status)"
                    :label="tournamentMarshalStatusLabels[marshal.status]"
                    :tone="marshalStatusTone(marshal.status)"
                  />
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UButton
                    :to="tournamentMarshalAccessUrl(marshal.id)"
                    size="sm"
                    icon="i-heroicons-device-phone-mobile"
                    variant="soft"
                  >
                    Panel kontrolóra
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Zapísať trest</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitPenalty">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="penaltyForm.sectorId"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
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
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
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

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Zapísať kontrolu</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitRuleCheck">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="ruleCheckForm.sectorId"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
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
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
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
                valid-description="Kontrolór, sektor, výsledok a poznámka sú pripravené na uloženie."
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

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Tresty</h2>
            <p
              v-if="tournamentPenalties.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              V tejto súťaži zatiaľ nebol uložený žiadny trest.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="penalty in tournamentPenalties" :key="penalty.id" class="rounded-md border border-border bg-white p-4">
                <p class="font-bold">{{ penalty.team }} · {{ sectorLabel(penalty.sectorId) }}</p>
                <StatusBadge
                  class="mt-1"
                  icon="i-heroicons-no-symbol"
                  :label="tournamentPenaltyTypeLabels[penalty.type]"
                  size="xs"
                  tone="error"
                />
                <p class="text-foreground-muted mt-2 text-sm">{{ penalty.reason }}</p>
              </div>
            </div>
          </div>

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Kontroly sektorov</h2>
            <p
              v-if="tournamentRuleChecks.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              Prvá vykonaná kontrola sektora sa zobrazí v tejto histórii.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="check in tournamentRuleChecks" :key="check.id" class="rounded-md bg-muted p-4">
                <p class="font-semibold">{{ sectorLabel(check.sectorId) }} · {{ marshalName(check.marshalId) }}</p>
                <p class="text-foreground-muted mt-1 text-sm">{{ check.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
