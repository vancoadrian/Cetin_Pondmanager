import type {
  NotificationAlertEndSuccess,
  NotificationBroadcastSuccess,
  NotificationTestBroadcastSuccess,
  NotificationTestCleanupSuccess,
} from '~/services/notificationBroadcastService'
import {
  formatNotificationAudience,
  getActiveNotificationAlerts,
  isInternalNotificationBroadcast,
  notificationAudienceRoleLabels,
  notificationLakeLabels,
} from '~/services/notificationBroadcastService'
import type { NotificationStateResponse } from '~/services/notificationDeliveryService'
import type { PushSubscriptionMutationSuccess } from '~/services/notificationService'
import { pushSubscriptionTopicLabels } from '~/services/notificationService'
import type {
  AlertSeverity,
  LakeSlug,
  NotificationBroadcastStatus,
  NotificationAudienceRole,
  NotificationDeliveryProvider,
  NotificationDeliveryStatus,
  PushSubscriptionTopic,
} from '~/data/pond'
import type { StatusBadgeTone } from '~/utils/ui'

type NotificationTimelineFilter = 'all' | 'public' | 'test'
type NotificationLifecycle = 'active' | 'ended' | 'expired'
export type NotificationAdminView = 'dorucovanie' | 'oznamy' | 'zariadenia'
type NotificationSubscriptionScopeFilter = 'all' | 'internal' | 'public'
type NotificationSubscriptionStatusFilter = 'active' | 'all' | 'disabled'
type NotificationSubscriptionTopicFilter = PushSubscriptionTopic | 'all'
type NoticeTone = 'error' | 'info' | 'success' | 'warning'

function parseNotificationAdminView(value: unknown): NotificationAdminView {
  const normalizedValue = Array.isArray(value) ? value[0] : value

  if (normalizedValue === 'dorucovanie' || normalizedValue === 'zariadenia') return normalizedValue

  return 'oznamy'
}

/**
 * Data + business logic for the admin notifications page (`/admin/notifikacie`).
 *
 * Covers all three page tabs (Oznamy / Doručovanie / Zariadenia): composing and
 * broadcasting public alerts, delivery-log/diagnostics reporting, and device
 * subscription management. Kept as a single composable rather than split by tab
 * because the underlying data (broadcasts, delivery logs, alerts, subscriptions)
 * comes from one fetched resource and is cross-referenced across all three tabs
 * (e.g. the "veľká ryba" readiness panel and delivery summaries combine
 * broadcasts + delivery logs + subscriptions at once).
 */
export async function useAdminNotifications() {
  const { lakes, tournaments, tournamentMarshals } = usePondData()
  const route = useRoute()
  const router = useRouter()
  const activeNotificationView = ref<NotificationAdminView>(parseNotificationAdminView(route.query.sekcia))
  const fallbackDeliveryDiagnostics: NotificationStateResponse['deliveryDiagnostics'] = {
    hasVapidConfig: false,
    missingConfigKeys: [
      'NUXT_PUBLIC_VAPID_PUBLIC_KEY',
      'RYBOLOV_VAPID_PRIVATE_KEY',
      'RYBOLOV_PUSH_SUBJECT',
    ],
    provider: 'mock',
    timeoutMs: 10_000,
    ttlSeconds: 60 * 60,
    urgency: 'normal',
    webPushReady: false,
  }
  const fallbackNotificationState = (): NotificationStateResponse => ({
    alerts: [],
    broadcasts: [],
    deliveryDiagnostics: fallbackDeliveryDiagnostics,
    deliveryLogs: [],
    ok: true,
    subscriptionCount: 0,
    subscriptions: [],
    updatedAt: 'seed',
  })
  const requestFetch = useRequestFetch()
  const { data: notificationState, refresh: refreshNotifications } = await useAsyncData<NotificationStateResponse>(
    'admin-notifications',
    () => requestFetch<NotificationStateResponse>('/api/admin/notifications'),
    {
      default: fallbackNotificationState,
    },
  )
  const {
    canOperate: canOperateNotifications,
    isReadOnly: notificationsReadOnly,
    label: notificationAccessLabel,
    readOnlyMessage: notificationReadOnlyMessage,
  } = useAdminModuleAccess('notifications')
  const broadcastForm = reactive({
    body: 'O 18:30 sa očakáva prechod búrkového pásma. Skontrolujte bivaky a počas bleskov nemanipulujte s prútmi.',
    expiresAt: defaultNotificationExpiryInput(),
    severity: 'storm' as AlertSeverity,
    targetLakeIds: [] as LakeSlug[],
    targetTopics: ['weather', 'service'] as PushSubscriptionTopic[],
    title: 'Výstraha pred búrkou',
  })
  const broadcastSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const broadcastSubmitMessage = ref('')
  const broadcastLakeScope = ref<LakeSlug | 'all'>('all')
  const broadcastFilter = ref<NotificationTimelineFilter>('all')
  const testBroadcastForm = reactive({
    body: 'Kontrolné interné rozoslanie pre overenie doručenia notifikácií Rybolov Cetín.',
    targetTopics: ['weather', 'service', 'reservations', 'tournaments'] as PushSubscriptionTopic[],
    title: 'Kontrola doručenia notifikácie',
  })
  const testBroadcastSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const testBroadcastSubmitMessage = ref('')
  const deliveryFilter = ref<NotificationTimelineFilter>('all')
  const testCleanupForm = reactive({
    keepRecentTestBroadcasts: 10,
    olderThanDays: 7,
  })
  const testCleanupSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const testCleanupSubmitMessage = ref('')
  const defaultTournament = tournaments[0]
  const defaultMarshal = tournamentMarshals[0]
  const mockSubscriptionForm = reactive({
    audienceRole: 'marshal' as NotificationAudienceRole,
    deviceLabel: defaultMarshal ? `Kontrolór ${defaultMarshal.name} - mobil` : 'Kontrolór - mobil',
    marshalId: defaultMarshal?.id ?? '',
    sectorIds: [...(defaultMarshal?.assignedSectorIds ?? [])],
    topics: ['tournaments'] as PushSubscriptionTopic[],
    tournamentId: defaultTournament?.id ?? '',
  })
  const mockSubscriptionSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const mockSubscriptionSubmitMessage = ref('')
  const managerServiceSubscriptionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const managerServiceSubscriptionMessage = ref('')
  const subscriptionActionId = ref('')
  const subscriptionActionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const subscriptionActionMessage = ref('')
  const subscriptionScopeFilter = ref<NotificationSubscriptionScopeFilter>('all')
  const subscriptionStatusFilter = ref<NotificationSubscriptionStatusFilter>('active')
  const subscriptionTopicFilter = ref<NotificationSubscriptionTopicFilter>('all')
  const alertActionId = ref('')
  const alertActionStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const alertActionMessage = ref('')

  const alerts = computed(() => notificationState.value?.alerts ?? [])
  const activeAlerts = computed(() => getActiveNotificationAlerts(alerts.value))
  const inactiveAlertCount = computed(() => alerts.value.length - activeAlerts.value.length)
  const broadcasts = computed(() => notificationState.value?.broadcasts ?? [])
  const deliveryDiagnostics = computed(() => notificationState.value?.deliveryDiagnostics ?? fallbackDeliveryDiagnostics)
  const deliveryLogs = computed(() => notificationState.value?.deliveryLogs ?? [])
  const subscriptions = computed(() => notificationState.value?.subscriptions ?? [])
  const enabledSubscriptions = computed(() => subscriptions.value.filter((subscription) => subscription.enabled))
  const disabledSubscriptions = computed(() => subscriptions.value.filter((subscription) => !subscription.enabled))
  const notificationViewTabs = computed(() => [
    {
      count: activeAlerts.value.length,
      icon: 'i-heroicons-megaphone',
      label: 'Oznamy',
      value: 'oznamy' as const,
    },
    {
      count: deliveryLogs.value.length,
      icon: 'i-heroicons-signal',
      label: 'Doručovanie',
      value: 'dorucovanie' as const,
    },
    {
      count: enabledSubscriptions.value.length,
      icon: 'i-heroicons-device-phone-mobile',
      label: 'Zariadenia',
      value: 'zariadenia' as const,
    },
  ])
  const availableTopics: PushSubscriptionTopic[] = ['weather', 'service', 'reservations', 'tournaments']
  const internalAudienceRoles: NotificationAudienceRole[] = [
    'owner',
    'manager',
    'tournament_organizer',
    'marshal',
    'tournament_team',
    'worker',
    'accountant',
  ]
  const deliveryProviderLabels: Record<NotificationDeliveryProvider, string> = {
    disabled: 'vypnuté',
    mock: 'kontrolné',
    'web-push': 'push cez prehliadač',
  }
  const notificationBroadcastStatusLabels: Record<NotificationBroadcastStatus, string> = {
    failed: 'zlyhalo',
    prepared: 'pripravené',
    sent: 'odoslané',
    skipped: 'preskočené',
  }
  const notificationDeliveryStatusLabels: Record<NotificationDeliveryStatus, string> = {
    failed: 'zlyhalo',
    prepared: 'pripravené',
    sent: 'odoslané',
    skipped: 'preskočené',
  }
  const activeMockTournament = computed(() =>
    tournaments.find((tournament) => tournament.id === mockSubscriptionForm.tournamentId) ?? tournaments[0],
  )
  const mockTournamentSectors = computed(() => activeMockTournament.value?.sectors ?? [])
  const selectedMarshal = computed(() =>
    tournamentMarshals.find((marshal) => marshal.id === mockSubscriptionForm.marshalId),
  )
  const isMockSectorScopedRole = computed(() =>
    mockSubscriptionForm.audienceRole === 'marshal' || mockSubscriptionForm.audienceRole === 'tournament_team',
  )
  const mockSubscriptionTargetPreview = computed(() => {
    const roleLabel = notificationAudienceRoleLabels[mockSubscriptionForm.audienceRole]
    const tournamentLabel = activeMockTournament.value?.name ?? 'všetky turnaje'
    const sectorLabel = isMockSectorScopedRole.value
      ? mockSubscriptionForm.sectorIds.length > 0
        ? `sektory ${mockSubscriptionForm.sectorIds.map((sectorId) =>
          mockTournamentSectors.value.find((sector) => sector.id === sectorId)?.label ?? sectorId,
        ).join(', ')}`
        : 'všetky sektory'
      : 'bez sektorového obmedzenia'
    const topicsLabel = mockSubscriptionForm.topics.length > 0
      ? formatTopics(mockSubscriptionForm.topics)
      : 'bez okruhu'

    return `${roleLabel} · ${tournamentLabel} · ${sectorLabel} · ${topicsLabel}`
  })
  const missingDeliveryConfig = computed(() => deliveryDiagnostics.value.missingConfigKeys)
  const timelineFilters: { label: string, value: NotificationTimelineFilter }[] = [
    { label: 'Všetko', value: 'all' },
    { label: 'Verejné', value: 'public' },
    { label: 'Kontrolné', value: 'test' },
  ]
  const subscriptionStatusFilters: { label: string, value: NotificationSubscriptionStatusFilter }[] = [
    { label: 'Aktívne', value: 'active' },
    { label: 'Všetky', value: 'all' },
    { label: 'Vypnuté', value: 'disabled' },
  ]
  const subscriptionScopeFilters: { label: string, value: NotificationSubscriptionScopeFilter }[] = [
    { label: 'Všetky', value: 'all' },
    { label: 'Verejné', value: 'public' },
    { label: 'Interné', value: 'internal' },
  ]
  const subscriptionTopicFilters: { label: string, value: NotificationSubscriptionTopicFilter }[] = [
    { label: 'Všetky', value: 'all' },
    ...availableTopics.map((topic) => ({
      label: pushSubscriptionTopicLabels[topic],
      value: topic,
    })),
  ]
  const broadcastById = computed(() => new Map(broadcasts.value.map((broadcast) => [broadcast.id, broadcast])))
  const alertById = computed(() => new Map(alerts.value.map((alert) => [alert.id, alert])))
  const publicBroadcasts = computed(() => broadcasts.value.filter((broadcast) => !isTestBroadcast(broadcast)))
  const testBroadcasts = computed(() => broadcasts.value.filter((broadcast) => isTestBroadcast(broadcast)))
  const internalSubscriptions = computed(() => subscriptions.value.filter((subscription) => isInternalSubscription(subscription)))
  const publicSubscriptions = computed(() => subscriptions.value.filter((subscription) => !isInternalSubscription(subscription)))
  const serviceSubscriptions = computed(() =>
    enabledSubscriptions.value.filter((subscription) => subscription.topics.includes('service')),
  )
  const largeFishServiceSubscriptions = computed(() =>
    serviceSubscriptions.value.filter((subscription) =>
      subscription.audienceRole === 'manager' || subscription.audienceRole === 'owner',
    ),
  )
  const serviceBroadcasts = computed(() =>
    broadcasts.value
      .filter((broadcast) => broadcast.targetTopics.includes('service') && !isTestBroadcast(broadcast))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
  )
  const largeFishBroadcasts = computed(() =>
    serviceBroadcasts.value.filter((broadcast) =>
      Boolean(broadcast.targetAudience?.requestId)
      || broadcast.title.toLocaleLowerCase('sk-SK').includes('veľká ryba')
      || (broadcast.targetAudience?.reason ?? '').toLocaleLowerCase('sk-SK').includes('veľkej rybe'),
    ),
  )
  const publicDeliveryLogs = computed(() =>
    deliveryLogs.value.filter((delivery) => {
      const broadcast = broadcastById.value.get(delivery.broadcastId)

      return broadcast ? !isTestBroadcast(broadcast) : false
    }),
  )
  const testDeliveryLogs = computed(() =>
    deliveryLogs.value.filter((delivery) => {
      const broadcast = broadcastById.value.get(delivery.broadcastId)

      return broadcast ? isTestBroadcast(broadcast) : false
    }),
  )
  const filteredBroadcasts = computed(() =>
    broadcasts.value.filter((broadcast) => matchesTimelineFilter(getBroadcastTimelineKind(broadcast), broadcastFilter.value)),
  )
  const filteredDeliveryLogs = computed(() =>
    deliveryLogs.value.filter((delivery) => {
      if (deliveryFilter.value === 'all') return true

      const broadcast = broadcastById.value.get(delivery.broadcastId)
      if (!broadcast) return false

      return matchesTimelineFilter(getBroadcastTimelineKind(broadcast), deliveryFilter.value)
    }),
  )
  const filteredSubscriptions = computed(() =>
    subscriptions.value.filter((subscription) =>
      matchesSubscriptionStatusFilter(subscription, subscriptionStatusFilter.value) &&
      matchesSubscriptionScopeFilter(subscription, subscriptionScopeFilter.value) &&
      matchesSubscriptionTopicFilter(subscription, subscriptionTopicFilter.value),
    ),
  )
  const latestLargeFishBroadcast = computed(() => largeFishBroadcasts.value[0])
  const latestLargeFishDeliveryLogs = computed(() =>
    latestLargeFishBroadcast.value
      ? getBroadcastDeliveryLogs(latestLargeFishBroadcast.value.id)
      : [],
  )
  const broadcastNoticeTitle = computed(() =>
    broadcastSubmitStatus.value === 'error'
      ? 'Odoslanie sa nepodarilo pripraviť'
      : broadcastSubmitStatus.value === 'submitting'
        ? 'Pripravujem odoslanie'
        : 'Odoslanie je pripravené',
  )
  const broadcastNoticeTone = computed<NoticeTone>(() =>
    broadcastSubmitStatus.value === 'error'
      ? 'error'
      : broadcastSubmitStatus.value === 'submitting' ? 'info' : 'success',
  )
  const testBroadcastNoticeTitle = computed(() =>
    testBroadcastSubmitStatus.value === 'error'
      ? 'Kontrolu doručenia sa nepodarilo spustiť'
      : testBroadcastSubmitStatus.value === 'submitting'
        ? 'Spúšťam kontrolu doručenia'
        : 'Kontrola doručenia je pripravená',
  )
  const testBroadcastNoticeTone = computed<NoticeTone>(() =>
    testBroadcastSubmitStatus.value === 'error'
      ? 'error'
      : testBroadcastSubmitStatus.value === 'submitting' ? 'info' : 'success',
  )
  const testCleanupNoticeTitle = computed(() =>
    testCleanupSubmitStatus.value === 'error'
      ? 'Údržba kontrolných rozoslaní zlyhala'
      : testCleanupSubmitStatus.value === 'submitting'
        ? 'Čistím kontrolné rozoslania'
        : 'Kontrolné rozoslania sú vyčistené',
  )
  const testCleanupNoticeTone = computed<NoticeTone>(() =>
    testCleanupSubmitStatus.value === 'error'
      ? 'error'
      : testCleanupSubmitStatus.value === 'submitting' ? 'info' : 'success',
  )
  const internalDeviceNoticeTitle = computed(() =>
    mockSubscriptionSubmitStatus.value === 'error'
      ? 'Interné zariadenie sa nepodarilo uložiť'
      : mockSubscriptionSubmitStatus.value === 'submitting'
        ? 'Ukladám interné zariadenie'
        : 'Interné zariadenie je uložené',
  )
  const internalDeviceNoticeTone = computed<NoticeTone>(() =>
    mockSubscriptionSubmitStatus.value === 'error'
      ? 'error'
      : mockSubscriptionSubmitStatus.value === 'submitting' ? 'info' : 'success',
  )
  const managerDeviceNoticeTitle = computed(() =>
    managerServiceSubscriptionStatus.value === 'error'
      ? 'Zariadenie správcu sa nepodarilo pridať'
      : managerServiceSubscriptionStatus.value === 'submitting'
        ? 'Pridávam zariadenie správcu'
        : 'Zariadenie správcu je pripravené',
  )
  const managerDeviceNoticeTone = computed<NoticeTone>(() =>
    managerServiceSubscriptionStatus.value === 'error'
      ? 'error'
      : managerServiceSubscriptionStatus.value === 'submitting' ? 'info' : 'success',
  )
  const subscriptionActionNoticeTitle = computed(() =>
    subscriptionActionStatus.value === 'error'
      ? 'Odber sa nepodarilo vypnúť'
      : subscriptionActionStatus.value === 'submitting'
        ? 'Vypínam odber'
        : 'Odber je vypnutý',
  )
  const subscriptionActionNoticeTone = computed<NoticeTone>(() =>
    subscriptionActionStatus.value === 'error'
      ? 'error'
      : subscriptionActionStatus.value === 'submitting' ? 'info' : 'success',
  )
  const alertActionNoticeTitle = computed(() =>
    alertActionStatus.value === 'error'
      ? 'Oznam sa nepodarilo ukončiť'
      : alertActionStatus.value === 'submitting'
        ? 'Ukončujem verejný oznam'
        : 'Verejný oznam je ukončený',
  )
  const alertActionNoticeTone = computed<NoticeTone>(() =>
    alertActionStatus.value === 'error'
      ? 'error'
      : alertActionStatus.value === 'submitting' ? 'info' : 'success',
  )
  const largeFishReadinessTone = computed(() => {
    if (deliveryDiagnostics.value.provider === 'disabled') return 'neutral'
    if (largeFishServiceSubscriptions.value.length === 0) return 'warning'
    if (deliveryDiagnostics.value.webPushReady || deliveryDiagnostics.value.provider === 'mock') return 'success'

    return 'warning'
  })
  const largeFishReadinessLabel = computed(() => {
    if (deliveryDiagnostics.value.provider === 'disabled') return 'doručovanie vypnuté'
    if (largeFishServiceSubscriptions.value.length === 0) return 'chýba správca alebo majiteľ'
    if (deliveryDiagnostics.value.webPushReady) return 'pripravené na doručenie'
    if (deliveryDiagnostics.value.provider === 'mock') return 'kontrolné doručovanie pripravené'

    return 'potrebné doplniť kľúče'
  })

  function notificationViewTabClass(isActive: boolean) {
    return isActive
      ? 'border-primary-700 text-primary-900'
      : 'border-transparent text-foreground-muted hover:border-border hover:text-foreground'
  }

  function selectNotificationView(view: NotificationAdminView) {
    activeNotificationView.value = view
    const query = { ...route.query }

    if (view === 'oznamy') delete query.sekcia
    else query.sekcia = view

    void router.replace({ query })
  }

  function severityTone(severity: AlertSeverity): StatusBadgeTone {
    if (severity === 'storm') return 'error'
    if (severity === 'water') return 'info'
    if (severity === 'service') return 'warning'

    return 'primary'
  }

  function severityIcon(severity: AlertSeverity) {
    if (severity === 'storm') return 'i-heroicons-bolt'
    if (severity === 'water') return 'i-heroicons-beaker'
    if (severity === 'service') return 'i-heroicons-wrench-screwdriver'

    return 'i-heroicons-megaphone'
  }

  function deliveryStatusTone(status: NotificationDeliveryStatus): StatusBadgeTone {
    if (status === 'sent') return 'success'
    if (status === 'failed') return 'error'
    if (status === 'skipped') return 'muted'

    return 'warning'
  }

  function deliveryStatusIcon(status: NotificationDeliveryStatus) {
    if (status === 'sent') return 'i-heroicons-paper-airplane'
    if (status === 'failed') return 'i-heroicons-x-circle'
    if (status === 'skipped') return 'i-heroicons-minus-circle'

    return 'i-heroicons-clock'
  }

  function deliveryDiagnosticsTone(): StatusBadgeTone {
    if (deliveryDiagnostics.value.webPushReady) return 'success'
    if (deliveryDiagnostics.value.provider === 'disabled') return 'muted'
    if (deliveryDiagnostics.value.provider === 'web-push') return 'warning'

    return 'info'
  }

  function deliveryDiagnosticsIcon() {
    if (deliveryDiagnostics.value.webPushReady) return 'i-heroicons-check-circle'
    if (deliveryDiagnostics.value.provider === 'disabled') return 'i-heroicons-pause-circle'
    if (deliveryDiagnostics.value.provider === 'web-push') return 'i-heroicons-key'

    return 'i-heroicons-signal'
  }

  function deliveryDiagnosticsLabel() {
    if (deliveryDiagnostics.value.webPushReady) return 'doručovanie pripravené'
    if (deliveryDiagnostics.value.provider === 'disabled') return 'doručovanie vypnuté'
    if (deliveryDiagnostics.value.provider === 'web-push') return 'chýbajú kľúče doručovania'

    return 'kontrolný režim doručovania'
  }

  function broadcastStatusTone(status: NotificationStateResponse['broadcasts'][number]['status']): StatusBadgeTone {
    if (status === 'sent' || status === 'prepared') return 'success'
    if (status === 'failed') return 'error'
    return 'neutral'
  }

  function broadcastStatusIcon(status: NotificationStateResponse['broadcasts'][number]['status']) {
    if (status === 'sent') return 'i-heroicons-paper-airplane'
    if (status === 'prepared') return 'i-heroicons-clock'
    if (status === 'failed') return 'i-heroicons-x-circle'

    return 'i-heroicons-minus-circle'
  }

  function subscriptionStatusTone(enabled: boolean): StatusBadgeTone {
    return enabled ? 'success' : 'muted'
  }

  function subscriptionStatusIcon(enabled: boolean) {
    return enabled ? 'i-heroicons-bell-alert' : 'i-heroicons-bell-slash'
  }

  function formatNotificationBroadcastStatus(status: NotificationBroadcastStatus) {
    return notificationBroadcastStatusLabels[status]
  }

  function formatNotificationDeliveryStatus(status: NotificationDeliveryStatus) {
    return notificationDeliveryStatusLabels[status]
  }

  function formatDeliveryUrgency(urgency: string) {
    const labels: Record<string, string> = {
      high: 'vysoká',
      low: 'nízka',
      normal: 'bežná',
      'very-low': 'veľmi nízka',
    }

    return labels[urgency] ?? urgency
  }

  function toDateTimeInput(value: Date) {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }

  function defaultNotificationExpiryInput() {
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000)
    expiresAt.setSeconds(0, 0)
    expiresAt.setMinutes(Math.ceil(expiresAt.getMinutes() / 15) * 15)

    return toDateTimeInput(expiresAt)
  }

  function minimumNotificationExpiryInput() {
    return toDateTimeInput(new Date(Date.now() + 5 * 60 * 1000))
  }

  function formatDateTime(value: string) {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return value

    return date.toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
  }

  function formatNotificationValidity(value: string) {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return value

    return date.toLocaleString('sk-SK', { dateStyle: 'medium', timeStyle: 'short' })
  }

  function formatDurationSeconds(value: number) {
    if (value >= 3600 && value % 3600 === 0) return `${value / 3600} h`
    if (value >= 60 && value % 60 === 0) return `${value / 60} min`

    return `${value} s`
  }

  function formatTopics(topics: PushSubscriptionTopic[]) {
    return topics.map((topic) => pushSubscriptionTopicLabels[topic]).join(', ')
  }

  function formatLakes(lakeIds?: LakeSlug[]) {
    if (!lakeIds?.length) return 'všetky jazerá'

    return lakeIds.map((lakeId) => notificationLakeLabels[lakeId]).join(', ')
  }

  function formatStoredNotificationMessage(message: string) {
    return message
      .replace(/^Mock dispatcher pripravil notifikáciu pre (\d+) odberov\.$/u, 'Kontrolné doručovanie pripravilo notifikáciu pre $1 odberov.')
      .replace(/^Mock dispatcher označil notifikáciu ako doručenú\.$/u, 'Kontrolné doručovanie označilo notifikáciu ako doručenú.')
      .replace(/^Mock dispatcher zaevidoval (\d+) doručení\.$/u, 'Kontrolné doručovanie zaevidovalo $1 doručení.')
      .replace(/^Mock endpoint čaká na reálny Web Push endpoint zariadenia\.$/u, 'Kontrolný odber čaká na reálne zariadenie.')
      .replace(/^Mock doručenie\.$/u, 'Kontrolné doručenie.')
  }

  function formatPushEndpoint(endpoint: string) {
    if (endpoint.startsWith('mock://')) return 'kontrolný interný odber'

    try {
      const url = new URL(endpoint)
      if (url.protocol === 'https:') return `prehliadač: ${url.host}`
    }
    catch {
      // Fall through to a neutral label for malformed or non-URL endpoint strings.
    }

    return 'interný identifikátor zariadenia'
  }

  function getBroadcastDeliveryLogs(broadcastId: string) {
    return deliveryLogs.value
      .filter((delivery) => delivery.broadcastId === broadcastId)
      .sort((first, second) => second.attemptedAt.localeCompare(first.attemptedAt))
  }

  function formatDeliverySummary(broadcastId: string) {
    const rows = getBroadcastDeliveryLogs(broadcastId)
    if (rows.length === 0) return 'bez záznamu doručenia'

    const sent = rows.filter((row) => row.status === 'sent').length
    const prepared = rows.filter((row) => row.status === 'prepared').length
    const failed = rows.filter((row) => row.status === 'failed').length
    const skipped = rows.filter((row) => row.status === 'skipped').length
    const parts = [
      sent ? `${sent} odoslané` : '',
      prepared ? `${prepared} pripravené` : '',
      failed ? `${failed} zlyhalo` : '',
      skipped ? `${skipped} preskočené` : '',
    ].filter(Boolean)

    return parts.join(' · ')
  }

  function isTestBroadcast(broadcast: NotificationStateResponse['broadcasts'][number]) {
    return isInternalNotificationBroadcast(broadcast)
  }

  function getBroadcastLifecycle(
    broadcast: NotificationStateResponse['broadcasts'][number],
  ): NotificationLifecycle | undefined {
    const alert = alertById.value.get(broadcast.alertId)
    if (!alert) return undefined
    if (alert.endedAt || broadcast.endedAt) return 'ended'

    const expiresAt = alert.expiresAt ?? broadcast.expiresAt
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return 'expired'

    return 'active'
  }

  function lifecycleLabel(lifecycle: NotificationLifecycle) {
    if (lifecycle === 'ended') return 'ukončené'
    if (lifecycle === 'expired') return 'po platnosti'

    return 'aktívne'
  }

  function lifecycleIcon(lifecycle: NotificationLifecycle) {
    if (lifecycle === 'ended') return 'i-heroicons-stop-circle'
    if (lifecycle === 'expired') return 'i-heroicons-clock'

    return 'i-heroicons-eye'
  }

  function lifecycleTone(lifecycle: NotificationLifecycle): StatusBadgeTone {
    if (lifecycle === 'active') return 'success'
    if (lifecycle === 'ended') return 'muted'

    return 'neutral'
  }

  function broadcastLifecycleLabel(broadcast: NotificationStateResponse['broadcasts'][number]) {
    return lifecycleLabel(getBroadcastLifecycle(broadcast) ?? 'active')
  }

  function broadcastLifecycleIcon(broadcast: NotificationStateResponse['broadcasts'][number]) {
    return lifecycleIcon(getBroadcastLifecycle(broadcast) ?? 'active')
  }

  function broadcastLifecycleTone(broadcast: NotificationStateResponse['broadcasts'][number]) {
    return lifecycleTone(getBroadcastLifecycle(broadcast) ?? 'active')
  }

  function formatBroadcastLifecycleDetail(broadcast: NotificationStateResponse['broadcasts'][number]) {
    const alert = alertById.value.get(broadcast.alertId)
    const endedAt = alert?.endedAt ?? broadcast.endedAt
    if (endedAt) {
      return `ukončené ${formatDateTime(endedAt)}${broadcast.endedBy ? ` · ${broadcast.endedBy}` : ''}`
    }

    const expiresAt = alert?.expiresAt ?? broadcast.expiresAt
    return expiresAt ? `platnosť do ${formatDateTime(expiresAt)}` : 'bez automatického ukončenia'
  }

  function getBroadcastTimelineKind(broadcast: NotificationStateResponse['broadcasts'][number]) {
    return isTestBroadcast(broadcast) ? 'test' : 'public'
  }

  function matchesTimelineFilter(kind: Exclude<NotificationTimelineFilter, 'all'>, filter: NotificationTimelineFilter) {
    return filter === 'all' || kind === filter
  }

  function getBroadcastFilterCount(filter: NotificationTimelineFilter) {
    if (filter === 'public') return publicBroadcasts.value.length
    if (filter === 'test') return testBroadcasts.value.length

    return broadcasts.value.length
  }

  function getDeliveryFilterCount(filter: NotificationTimelineFilter) {
    if (filter === 'public') return publicDeliveryLogs.value.length
    if (filter === 'test') return testDeliveryLogs.value.length

    return deliveryLogs.value.length
  }

  function timelineFilterButtonClass(isActive: boolean) {
    return isActive
      ? 'border-primary-700 bg-primary-700 text-white'
      : 'border-border bg-white text-foreground-muted hover:border-primary-700 hover:text-primary-700'
  }

  function isInternalSubscription(subscription: NotificationStateResponse['subscriptions'][number]) {
    return Boolean(
      subscription.audienceRole ||
      subscription.marshalId ||
      subscription.sectorIds?.length ||
      subscription.tournamentIds?.length,
    )
  }

  function matchesSubscriptionStatusFilter(
    subscription: NotificationStateResponse['subscriptions'][number],
    filter: NotificationSubscriptionStatusFilter,
  ) {
    if (filter === 'active') return subscription.enabled
    if (filter === 'disabled') return !subscription.enabled

    return true
  }

  function matchesSubscriptionScopeFilter(
    subscription: NotificationStateResponse['subscriptions'][number],
    filter: NotificationSubscriptionScopeFilter,
  ) {
    if (filter === 'internal') return isInternalSubscription(subscription)
    if (filter === 'public') return !isInternalSubscription(subscription)

    return true
  }

  function matchesSubscriptionTopicFilter(
    subscription: NotificationStateResponse['subscriptions'][number],
    filter: NotificationSubscriptionTopicFilter,
  ) {
    return filter === 'all' || subscription.topics.includes(filter)
  }

  function getSubscriptionStatusFilterCount(filter: NotificationSubscriptionStatusFilter) {
    if (filter === 'active') return enabledSubscriptions.value.length
    if (filter === 'disabled') return disabledSubscriptions.value.length

    return subscriptions.value.length
  }

  function getSubscriptionScopeFilterCount(filter: NotificationSubscriptionScopeFilter) {
    if (filter === 'internal') return internalSubscriptions.value.length
    if (filter === 'public') return publicSubscriptions.value.length

    return subscriptions.value.length
  }

  function getSubscriptionTopicFilterCount(filter: NotificationSubscriptionTopicFilter) {
    if (filter === 'all') return subscriptions.value.length

    return subscriptions.value.filter((subscription) => subscription.topics.includes(filter)).length
  }

  function broadcastEmptyMessage() {
    if (broadcastFilter.value === 'public') return 'Pre verejný filter zatiaľ nie je pripravený žiadny oznam.'
    if (broadcastFilter.value === 'test') return 'Pre kontrolný filter zatiaľ nie je pripravené žiadne interné rozoslanie.'

    return 'Zatiaľ nie je pripravené žiadne rozoslanie.'
  }

  function deliveryEmptyMessage() {
    if (deliveryFilter.value === 'public') return 'Pre verejný filter zatiaľ nie je zaevidované žiadne doručenie.'
    if (deliveryFilter.value === 'test') return 'Pre kontrolný filter zatiaľ nie je zaevidované žiadne doručenie.'

    return 'Zatiaľ nie je zaevidované žiadne doručenie.'
  }

  function subscriptionEmptyMessage() {
    if (subscriptions.value.length === 0) return 'Zatiaľ nie je uložený žiadny odber notifikácií.'

    return 'Pre zvolený filter zatiaľ nie je uložený žiadny odber.'
  }

  function formatSubscriptionAudience(subscription: NotificationStateResponse['subscriptions'][number]) {
    const parts: string[] = []

    if (subscription.audienceRole) {
      parts.push(notificationAudienceRoleLabels[subscription.audienceRole])
    }
    if (subscription.tournamentIds?.length) {
      parts.push(`turnaje ${subscription.tournamentIds.join(', ')}`)
    }
    if (subscription.sectorIds?.length) {
      parts.push(`sektory ${subscription.sectorIds.map((sectorId) => sectorId.toUpperCase()).join(', ')}`)
    }
    if (subscription.marshalId) {
      parts.push(`kontrolór ${subscription.marshalId}`)
    }

    return parts.join(' · ')
  }

  function slugifyMockValue(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'scope'
  }

  function createMockSubscriptionEndpoint() {
    const sectorScope = isMockSectorScopedRole.value
      ? mockSubscriptionForm.sectorIds.map(slugifyMockValue).sort().join('-') || 'all-sectors'
      : 'all-sectors'
    const marshalScope = mockSubscriptionForm.audienceRole === 'marshal'
      ? mockSubscriptionForm.marshalId || 'marshal'
      : 'all-marshals'

    return [
      'mock://rybolov-cetin/internal',
      slugifyMockValue(mockSubscriptionForm.audienceRole),
      slugifyMockValue(mockSubscriptionForm.tournamentId || 'all-tournaments'),
      slugifyMockValue(marshalScope),
      slugifyMockValue(sectorScope),
    ].join('/')
  }

  function getApiErrorMessage(error: unknown, fallback = 'Notifikáciu sa nepodarilo pripraviť.') {
    const fetchError = error as {
      data?: {
        data?: {
          messages?: string[]
        }
        message?: string
        statusMessage?: string
      }
    }

    return fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      fallback
  }

  async function submitBroadcast() {
    if (!canOperateNotifications.value) {
      broadcastSubmitStatus.value = 'error'
      broadcastSubmitMessage.value = notificationReadOnlyMessage.value
      return
    }

    const expiresAt = new Date(broadcastForm.expiresAt)
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      broadcastSubmitStatus.value = 'error'
      broadcastSubmitMessage.value = 'Vyberte platnosť verejného oznamu v budúcnosti.'
      return
    }

    broadcastSubmitStatus.value = 'submitting'
    broadcastSubmitMessage.value = 'Pripravujem rozoslanie pre zvolené okruhy.'

    try {
      const result = await $fetch<NotificationBroadcastSuccess>('/api/admin/notifications/broadcast', {
        body: {
          ...broadcastForm,
          expiresAt: expiresAt.toISOString(),
          targetLakeIds: broadcastLakeScope.value === 'all' ? [] : [broadcastLakeScope.value],
          validUntil: formatNotificationValidity(expiresAt.toISOString()),
        },
        method: 'POST',
      })

      broadcastSubmitStatus.value = 'success'
      broadcastSubmitMessage.value = result.message
      broadcastForm.expiresAt = defaultNotificationExpiryInput()
      await refreshNotifications()
    }
    catch (error) {
      broadcastSubmitStatus.value = 'error'
      broadcastSubmitMessage.value = getApiErrorMessage(error)
    }
  }

  async function endPublicAlert(alert: NotificationStateResponse['alerts'][number]) {
    if (!canOperateNotifications.value) {
      alertActionId.value = alert.id
      alertActionStatus.value = 'error'
      alertActionMessage.value = notificationReadOnlyMessage.value
      return
    }

    alertActionId.value = alert.id
    alertActionStatus.value = 'submitting'
    alertActionMessage.value = 'Ukončujem oznam na verejnej stránke.'

    try {
      const result = await $fetch<NotificationAlertEndSuccess>(
        `/api/admin/notifications/alerts/${alert.id}/end`,
        { method: 'POST' },
      )

      alertActionStatus.value = 'success'
      alertActionMessage.value = result.message
      await refreshNotifications()
    }
    catch (error) {
      alertActionStatus.value = 'error'
      alertActionMessage.value = getApiErrorMessage(error, 'Verejný oznam sa nepodarilo ukončiť.')
    }
  }

  async function submitTestBroadcast() {
    if (!canOperateNotifications.value) {
      testBroadcastSubmitStatus.value = 'error'
      testBroadcastSubmitMessage.value = notificationReadOnlyMessage.value
      return
    }
    if (testBroadcastForm.targetTopics.length === 0) {
      testBroadcastSubmitStatus.value = 'error'
      testBroadcastSubmitMessage.value = 'Vyberte aspoň jeden okruh kontroly.'
      return
    }

    testBroadcastSubmitStatus.value = 'submitting'
    testBroadcastSubmitMessage.value = 'Pripravujem kontrolné rozoslanie.'

    try {
      const result = await $fetch<NotificationTestBroadcastSuccess>('/api/admin/notifications/test-broadcast', {
        body: testBroadcastForm,
        method: 'POST',
      })

      testBroadcastSubmitStatus.value = 'success'
      testBroadcastSubmitMessage.value = result.message
      await refreshNotifications()
    }
    catch (error) {
      testBroadcastSubmitStatus.value = 'error'
      testBroadcastSubmitMessage.value = getApiErrorMessage(error, 'Kontrolu doručenia sa nepodarilo spustiť.')
    }
  }

  async function submitTestCleanup() {
    if (!canOperateNotifications.value) {
      testCleanupSubmitStatus.value = 'error'
      testCleanupSubmitMessage.value = notificationReadOnlyMessage.value
      return
    }

    testCleanupSubmitStatus.value = 'submitting'
    testCleanupSubmitMessage.value = 'Čistím staršie kontrolné rozoslania.'

    try {
      const result = await $fetch<NotificationTestCleanupSuccess>('/api/admin/notifications/test-cleanup', {
        body: testCleanupForm,
        method: 'POST',
      })

      testCleanupSubmitStatus.value = 'success'
      testCleanupSubmitMessage.value = result.message
      await refreshNotifications()
    }
    catch (error) {
      testCleanupSubmitStatus.value = 'error'
      testCleanupSubmitMessage.value = getApiErrorMessage(error, 'Údržbu kontrolných rozoslaní sa nepodarilo spustiť.')
    }
  }

  async function submitMockSubscription() {
    if (!canOperateNotifications.value) {
      mockSubscriptionSubmitStatus.value = 'error'
      mockSubscriptionSubmitMessage.value = notificationReadOnlyMessage.value
      return
    }
    if (mockSubscriptionForm.topics.length === 0) {
      mockSubscriptionSubmitStatus.value = 'error'
      mockSubscriptionSubmitMessage.value = 'Vyberte aspoň jeden okruh odberu.'
      return
    }

    mockSubscriptionSubmitStatus.value = 'submitting'
    mockSubscriptionSubmitMessage.value = 'Ukladám interné zariadenie.'

    try {
      const result = await $fetch<PushSubscriptionMutationSuccess>('/api/admin/notifications/subscriptions', {
        body: {
          audienceRole: mockSubscriptionForm.audienceRole,
          auth: 'mock-internal-auth',
          deviceLabel: mockSubscriptionForm.deviceLabel,
          endpoint: createMockSubscriptionEndpoint(),
          marshalId: mockSubscriptionForm.audienceRole === 'marshal' ? mockSubscriptionForm.marshalId : undefined,
          p256dh: 'mock-internal-p256dh',
          permission: 'granted',
          sectorIds: isMockSectorScopedRole.value ? mockSubscriptionForm.sectorIds : [],
          topics: mockSubscriptionForm.topics,
          tournamentIds: mockSubscriptionForm.tournamentId ? [mockSubscriptionForm.tournamentId] : [],
          userAgent: 'Rybolov Cetín admin mock',
        },
        method: 'POST',
      })

      mockSubscriptionSubmitStatus.value = 'success'
      mockSubscriptionSubmitMessage.value = result.message
      await refreshNotifications()
    }
    catch (error) {
      mockSubscriptionSubmitStatus.value = 'error'
      mockSubscriptionSubmitMessage.value = getApiErrorMessage(error, 'Interné zariadenie sa nepodarilo uložiť.')
    }
  }

  function prepareManagerServiceSubscriptionForm() {
    mockSubscriptionForm.audienceRole = 'manager'
    mockSubscriptionForm.deviceLabel = 'Správca pri vode - mobil'
    mockSubscriptionForm.marshalId = ''
    mockSubscriptionForm.sectorIds = []
    mockSubscriptionForm.topics = ['service']
    mockSubscriptionForm.tournamentId = ''
  }

  async function createManagerServiceSubscription() {
    if (!canOperateNotifications.value) {
      managerServiceSubscriptionStatus.value = 'error'
      managerServiceSubscriptionMessage.value = notificationReadOnlyMessage.value
      return
    }

    managerServiceSubscriptionStatus.value = 'submitting'
    managerServiceSubscriptionMessage.value = 'Pridávam zariadenie správcu do prevádzkových odberov.'
    prepareManagerServiceSubscriptionForm()

    try {
      const result = await $fetch<PushSubscriptionMutationSuccess>('/api/admin/notifications/subscriptions', {
        body: {
          audienceRole: 'manager',
          auth: 'mock-manager-service-auth',
          deviceLabel: 'Správca pri vode - mobil',
          endpoint: 'mock://rybolov-cetin/internal/manager/all-tournaments/all-marshals/all-sectors/service',
          p256dh: 'mock-manager-service-p256dh',
          permission: 'granted',
          sectorIds: [],
          topics: ['service'],
          tournamentIds: [],
          userAgent: 'Rybolov Cetín admin quick setup',
        },
        method: 'POST',
      })

      managerServiceSubscriptionStatus.value = 'success'
      managerServiceSubscriptionMessage.value = result.message
      await refreshNotifications()
    }
    catch (error) {
      managerServiceSubscriptionStatus.value = 'error'
      managerServiceSubscriptionMessage.value = getApiErrorMessage(error, 'Odber správcu sa nepodarilo uložiť.')
    }
  }

  async function disableAdminSubscription(subscription: NotificationStateResponse['subscriptions'][number]) {
    if (!canOperateNotifications.value) {
      subscriptionActionId.value = subscription.id
      subscriptionActionStatus.value = 'error'
      subscriptionActionMessage.value = notificationReadOnlyMessage.value
      return
    }

    subscriptionActionId.value = subscription.id
    subscriptionActionStatus.value = 'submitting'
    subscriptionActionMessage.value = 'Vypínam odber zariadenia.'

    try {
      const result = await $fetch<PushSubscriptionMutationSuccess>(
        `/api/admin/notifications/subscriptions/${subscription.id}/disable`,
        { method: 'POST' },
      )

      subscriptionActionStatus.value = 'success'
      subscriptionActionMessage.value = result.message
      await refreshNotifications()
    }
    catch (error) {
      subscriptionActionStatus.value = 'error'
      subscriptionActionMessage.value = getApiErrorMessage(error, 'Odber sa nepodarilo vypnúť.')
    }
  }

  watch(() => route.query.sekcia, (view) => {
    activeNotificationView.value = parseNotificationAdminView(view)
  })

  watch(() => mockSubscriptionForm.audienceRole, (role) => {
    if (role === 'marshal') {
      mockSubscriptionForm.marshalId ||= tournamentMarshals[0]?.id ?? ''
      mockSubscriptionForm.sectorIds = [...(selectedMarshal.value?.assignedSectorIds ?? [])]
      mockSubscriptionForm.deviceLabel = selectedMarshal.value
        ? `Kontrolór ${selectedMarshal.value.name} - mobil`
        : 'Kontrolór - mobil'
      return
    }

    mockSubscriptionForm.marshalId = ''
    if (role !== 'tournament_team') {
      mockSubscriptionForm.sectorIds = []
    }
    if (role === 'tournament_organizer') {
      mockSubscriptionForm.deviceLabel = 'Organizátor súťaže - tablet'
    }
    else if (role === 'tournament_team') {
      mockSubscriptionForm.deviceLabel = 'Súťažný tím - mobil'
    }
    else {
      mockSubscriptionForm.deviceLabel = `${notificationAudienceRoleLabels[role]} - interné zariadenie`
    }
  })

  watch(() => mockSubscriptionForm.marshalId, () => {
    if (mockSubscriptionForm.audienceRole !== 'marshal') return

    mockSubscriptionForm.sectorIds = [...(selectedMarshal.value?.assignedSectorIds ?? [])]
    mockSubscriptionForm.deviceLabel = selectedMarshal.value
      ? `Kontrolór ${selectedMarshal.value.name} - mobil`
      : 'Kontrolór - mobil'
  })

  watch(() => mockSubscriptionForm.tournamentId, () => {
    const validSectorIds = new Set(mockTournamentSectors.value.map((sector) => sector.id))
    mockSubscriptionForm.sectorIds = mockSubscriptionForm.sectorIds.filter((sectorId) => validSectorIds.has(sectorId))
  })

  return {
    activeAlerts,
    activeMockTournament,
    activeNotificationView,
    alertActionId,
    alertActionMessage,
    alertActionNoticeTitle,
    alertActionNoticeTone,
    alertActionStatus,
    alertById,
    alerts,
    availableTopics,
    broadcastById,
    broadcastEmptyMessage,
    broadcastFilter,
    broadcastForm,
    broadcastLakeScope,
    broadcastLifecycleIcon,
    broadcastLifecycleLabel,
    broadcastLifecycleTone,
    broadcastNoticeTitle,
    broadcastNoticeTone,
    broadcastStatusIcon,
    broadcastStatusTone,
    broadcastSubmitMessage,
    broadcastSubmitStatus,
    broadcasts,
    canOperateNotifications,
    createManagerServiceSubscription,
    createMockSubscriptionEndpoint,
    deliveryDiagnostics,
    deliveryDiagnosticsIcon,
    deliveryDiagnosticsLabel,
    deliveryDiagnosticsTone,
    deliveryEmptyMessage,
    deliveryFilter,
    deliveryLogs,
    deliveryProviderLabels,
    deliveryStatusIcon,
    deliveryStatusTone,
    disableAdminSubscription,
    disabledSubscriptions,
    enabledSubscriptions,
    endPublicAlert,
    filteredBroadcasts,
    filteredDeliveryLogs,
    filteredSubscriptions,
    formatBroadcastLifecycleDetail,
    formatDateTime,
    formatDeliverySummary,
    formatDeliveryUrgency,
    formatDurationSeconds,
    formatLakes,
    formatNotificationAudience,
    formatNotificationBroadcastStatus,
    formatNotificationDeliveryStatus,
    formatNotificationValidity,
    formatPushEndpoint,
    formatStoredNotificationMessage,
    formatSubscriptionAudience,
    formatTopics,
    getApiErrorMessage,
    getBroadcastDeliveryLogs,
    getBroadcastFilterCount,
    getBroadcastLifecycle,
    getBroadcastTimelineKind,
    getDeliveryFilterCount,
    getSubscriptionScopeFilterCount,
    getSubscriptionStatusFilterCount,
    getSubscriptionTopicFilterCount,
    inactiveAlertCount,
    internalAudienceRoles,
    internalDeviceNoticeTitle,
    internalDeviceNoticeTone,
    internalSubscriptions,
    isInternalSubscription,
    isMockSectorScopedRole,
    isTestBroadcast,
    lakes,
    largeFishBroadcasts,
    largeFishReadinessLabel,
    largeFishReadinessTone,
    largeFishServiceSubscriptions,
    latestLargeFishBroadcast,
    latestLargeFishDeliveryLogs,
    lifecycleIcon,
    lifecycleLabel,
    lifecycleTone,
    managerDeviceNoticeTitle,
    managerDeviceNoticeTone,
    managerServiceSubscriptionMessage,
    managerServiceSubscriptionStatus,
    matchesSubscriptionScopeFilter,
    matchesSubscriptionStatusFilter,
    matchesSubscriptionTopicFilter,
    matchesTimelineFilter,
    minimumNotificationExpiryInput,
    missingDeliveryConfig,
    mockSubscriptionForm,
    mockSubscriptionSubmitMessage,
    mockSubscriptionSubmitStatus,
    mockSubscriptionTargetPreview,
    mockTournamentSectors,
    notificationAccessLabel,
    notificationAudienceRoleLabels,
    notificationBroadcastStatusLabels,
    notificationDeliveryStatusLabels,
    notificationReadOnlyMessage,
    notificationViewTabClass,
    notificationViewTabs,
    notificationsReadOnly,
    parseNotificationAdminView,
    prepareManagerServiceSubscriptionForm,
    publicBroadcasts,
    publicDeliveryLogs,
    publicSubscriptions,
    pushSubscriptionTopicLabels,
    selectNotificationView,
    selectedMarshal,
    serviceBroadcasts,
    serviceSubscriptions,
    severityIcon,
    severityTone,
    slugifyMockValue,
    submitBroadcast,
    submitMockSubscription,
    submitTestBroadcast,
    submitTestCleanup,
    subscriptionActionId,
    subscriptionActionMessage,
    subscriptionActionNoticeTitle,
    subscriptionActionNoticeTone,
    subscriptionActionStatus,
    subscriptionEmptyMessage,
    subscriptionScopeFilter,
    subscriptionScopeFilters,
    subscriptionStatusFilter,
    subscriptionStatusFilters,
    subscriptionStatusIcon,
    subscriptionStatusTone,
    subscriptionTopicFilter,
    subscriptionTopicFilters,
    subscriptions,
    testBroadcastForm,
    testBroadcastNoticeTitle,
    testBroadcastNoticeTone,
    testBroadcastSubmitMessage,
    testBroadcastSubmitStatus,
    testBroadcasts,
    testCleanupForm,
    testCleanupNoticeTitle,
    testCleanupNoticeTone,
    testCleanupSubmitMessage,
    testCleanupSubmitStatus,
    testDeliveryLogs,
    timelineFilterButtonClass,
    timelineFilters,
    toDateTimeInput,
    tournamentMarshals,
    tournaments,
  }
}
