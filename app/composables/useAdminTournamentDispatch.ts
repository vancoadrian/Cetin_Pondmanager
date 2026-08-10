import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
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
import { getTournamentOperationalCapabilities } from '~/utils/tournamentOperations'
import {
  createTournamentTeamAccessCsv,
  createTournamentTeamAccessUrl,
  getTournamentTeamAccessRows,
} from '~/utils/tournamentTeamAccess'
import { createTournamentMarshalAccessUrl } from '~/utils/tournamentMarshalAccess'
import type { StatusBadgeTone } from '~/utils/ui'

type NoticeTone = 'error' | 'info' | 'success' | 'warning'
export type TournamentAdminView = 'dispecing' | 'prehlad' | 'prihlasky' | 'pravidla' | 'sektory'

interface UseAdminTournamentDispatchParams {
  activeSponsors: Ref<Sponsor[]>
  canOperateTournaments: Ref<boolean> | ComputedRef<boolean>
  mapState: Ref<MapStateResponse>
  refreshTournamentState: () => Promise<void>
  route: RouteLocationNormalizedLoaded
  router: Router
  tournamentReadOnlyMessage: Ref<string> | ComputedRef<string>
  tournamentState: Ref<TournamentStateResponse | null | undefined>
}

/**
 * Business logic and state for the admin tournament dispatch page
 * (app/pages/admin/sutaze/index.vue).
 *
 * Data fetching (`useAsyncData`/`useSponsorState`/`useAdminModuleAccess`) stays in the
 * page itself, matching the rest of this codebase's pages, so the already-resolved
 * reactive refs are passed in here. Everything downstream lives in this composable:
 * tournament/tab selection, the live-view derived state (requests, catches, penalties,
 * rule checks, team registrations), sector/team-access/operations-mode configuration,
 * and the offline-queueing + clientMutationId retry logic shared by request actions,
 * catch verification, penalties and rule checks.
 *
 * This stays a single composable rather than being split into a "dispatch" file and a
 * "sectors/teams/rules configuration" file: the submit/verify/penalty/rule-check flows
 * all share one action status machine (`actionStatus`/`actionMessage`/`activeActionId`)
 * and one offline action queue, so splitting would mean threading that shared state
 * back and forth between two composables rather than removing coupling.
 */
export function useAdminTournamentDispatch(params: UseAdminTournamentDispatchParams) {
  const {
    activeSponsors,
    canOperateTournaments,
    mapState,
    refreshTournamentState,
    route,
    router,
    tournamentReadOnlyMessage,
    tournamentState,
  } = params

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
    tournaments: seedTournaments,
    tournamentCatches: seedTournamentCatches,
    tournamentMarshals: seedTournamentMarshals,
    tournamentPenalties: seedTournamentPenalties,
    tournamentPenaltyTypeLabels,
    tournamentRequests: seedTournamentRequests,
    tournamentRuleChecks: seedTournamentRuleChecks,
    tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  } = usePondData()

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

  return {
    actionMessage,
    actionNoticeTitle,
    actionNoticeTone,
    actionStatus,
    activeActionId,
    activePenalties,
    activeRequests,
    activeTournament,
    activeTournamentAdminView,
    activeTournamentAdminViewOption,
    activeTournamentSectorShapes,
    approvedTeamRegistrations,
    canUseTournamentDispatch,
    catchStatusIcon,
    catchStatusLabel,
    catchStatusTone,
    copyTeamAccessRows,
    discardOfflineAdminAction,
    downloadTeamAccessCsv,
    expandedTournamentSectorId,
    formatDateTime,
    formatWeight,
    getOfflineAdminActionLabel,
    getOfflineAdminActionTarget,
    handleTournamentAdminTabsKeydown,
    isOnline,
    leaderboardExportUrl,
    leaderboardFeedUrl,
    leaderboardKioskUrl,
    leaderboardStats,
    liveTournamentMarshals,
    liveTournaments,
    mapSourceSummary,
    mapSourceSummaryIcon,
    mapSourceSummaryTone,
    marshalName,
    marshalsForSector,
    marshalStatusIcon,
    marshalStatusTone,
    offlineAdminActionCount,
    offlineAdminActionQueue,
    offlineAdminNoticeDescription,
    offlineAdminNoticeIcon,
    offlineAdminNoticeTitle,
    offlineAdminNoticeTone,
    offlineAdminSyncMessage,
    offlineAdminSyncStatus,
    operationsModeIcon,
    operationsModeMessage,
    operationsModeNoticeTitle,
    operationsModeNoticeTone,
    operationsModeStatus,
    operationsModeTone,
    organizerExportUrl,
    penaltyForm,
    penaltyTypeOptions,
    penaltyValidation,
    penaltyValidationMessages,
    registrationDecisionDraft,
    registrationStatusIcon,
    registrationStatusTone,
    ruleCheckForm,
    ruleCheckResultOptions,
    ruleCheckValidation,
    ruleCheckValidationMessages,
    saveSectorSettings,
    saveTournamentOperationsMode,
    sectorDraft,
    sectorLabel,
    sectorMapCoverage,
    sectorMapRowIcon,
    sectorMapRows,
    sectorMapRowTone,
    sectorMapStatus,
    sectorOptionLabel,
    sectorSettingsMessage,
    sectorSettingsNoticeTitle,
    sectorSettingsNoticeTone,
    sectorSettingsStatus,
    sectorSettingsValidation,
    sectorSettingsValidationMessages,
    selectTournamentAdminView,
    setRegistrationDecisionNote,
    setRegistrationDecisionSector,
    sponsorLogo,
    submitPenalty,
    submitRequestAction,
    submitRuleCheck,
    submittedTeamRegistrations,
    submitTeamRegistrationDecision,
    syncOfflineAdminActionQueue,
    teamAccessRows,
    teamAccessShareMessage,
    teamAccessShareNoticeTitle,
    teamAccessShareNoticeTone,
    toggleTournamentSector,
    tournamentAdminTabsRef,
    tournamentAdminViewOptions,
    tournamentCapabilities,
    tournamentCatches,
    tournamentDispatchAttentionCount,
    tournamentLeaderboard,
    tournamentMapEditorUrl,
    tournamentMarshalAccessUrl,
    tournamentPenalties,
    tournamentRequests,
    tournamentRuleChecks,
    tournamentSectorMapEditorUrl,
    tournamentSponsorSlots,
    tournamentTeamAccessUrl,
    tournamentTeamRegistrations,
    updateActiveTournament,
    verifyCatch,
    waitingCatches,
    waitlistedTeamRegistrations,
    requestStatusIcon,
    requestStatusTone,
  }
}
