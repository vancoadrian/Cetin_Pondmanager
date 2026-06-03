<script setup lang="ts">
import type {
  NotificationBroadcastSuccess,
  NotificationStateResponse,
  PushSubscriptionMutationSuccess,
} from '~/services/notificationService'
import {
  formatNotificationAudience,
  notificationAudienceRoleLabels,
  pushSubscriptionTopicLabels,
} from '~/services/notificationService'
import type {
  AlertSeverity,
  NotificationAudienceRole,
  NotificationDeliveryProvider,
  NotificationDeliveryStatus,
  PushSubscriptionTopic,
} from '~/data/pond'

useHead({ title: 'Admin notifikácie' })

const { tournaments, tournamentMarshals } = usePondData()
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
const { data: notificationState, refresh: refreshNotifications } = await useAsyncData<NotificationStateResponse>(
  'admin-notifications',
  () => $fetch<NotificationStateResponse>('/api/admin/notifications'),
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
  severity: 'storm' as AlertSeverity,
  targetTopics: ['weather', 'service'] as PushSubscriptionTopic[],
  title: 'Výstraha pred búrkou',
  validUntil: 'dnes 21:00',
})
const broadcastSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const broadcastSubmitMessage = ref('')
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

const alerts = computed(() => notificationState.value?.alerts ?? [])
const broadcasts = computed(() => notificationState.value?.broadcasts ?? [])
const deliveryDiagnostics = computed(() => notificationState.value?.deliveryDiagnostics ?? fallbackDeliveryDiagnostics)
const deliveryLogs = computed(() => notificationState.value?.deliveryLogs ?? [])
const subscriptions = computed(() => notificationState.value?.subscriptions ?? [])
const enabledSubscriptions = computed(() => subscriptions.value.filter((subscription) => subscription.enabled))
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
  mock: 'mock',
  'web-push': 'web push',
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
const mockSubscriptionEndpointPreview = computed(() => createMockSubscriptionEndpoint())
const missingDeliveryConfig = computed(() => deliveryDiagnostics.value.missingConfigKeys)

function severityClass(severity: AlertSeverity) {
  if (severity === 'storm') return 'bg-error-500/10 text-error-700'
  if (severity === 'water') return 'bg-info-500/10 text-info-500'
  if (severity === 'service') return 'bg-warning-500/10 text-warning-700'

  return 'bg-primary-50 text-primary-700'
}

function deliveryStatusClass(status: NotificationDeliveryStatus) {
  if (status === 'sent') return 'bg-success-500/10 text-success-700'
  if (status === 'failed') return 'bg-error-500/10 text-error-700'
  if (status === 'skipped') return 'bg-muted text-foreground-muted'

  return 'bg-warning-500/10 text-warning-700'
}

function deliveryDiagnosticsClass() {
  if (deliveryDiagnostics.value.webPushReady) return 'bg-success-500/10 text-success-700'
  if (deliveryDiagnostics.value.provider === 'disabled') return 'bg-muted text-foreground-muted'
  if (deliveryDiagnostics.value.provider === 'web-push') return 'bg-warning-500/10 text-warning-700'

  return 'bg-info-500/10 text-info-700'
}

function deliveryDiagnosticsLabel() {
  if (deliveryDiagnostics.value.webPushReady) return 'web push pripravený'
  if (deliveryDiagnostics.value.provider === 'disabled') return 'doručovanie vypnuté'
  if (deliveryDiagnostics.value.provider === 'web-push') return 'chýba VAPID'

  return 'mock režim'
}

function formatDurationSeconds(value: number) {
  if (value >= 3600 && value % 3600 === 0) return `${value / 3600} h`
  if (value >= 60 && value % 60 === 0) return `${value / 60} min`

  return `${value} s`
}

function formatTopics(topics: PushSubscriptionTopic[]) {
  return topics.map((topic) => pushSubscriptionTopicLabels[topic]).join(', ')
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

  broadcastSubmitStatus.value = 'submitting'
  broadcastSubmitMessage.value = ''

  try {
    const result = await $fetch<NotificationBroadcastSuccess>('/api/admin/notifications/broadcast', {
      body: broadcastForm,
      method: 'POST',
    })

    broadcastSubmitStatus.value = 'success'
    broadcastSubmitMessage.value = result.message
    await refreshNotifications()
  }
  catch (error) {
    broadcastSubmitStatus.value = 'error'
    broadcastSubmitMessage.value = getApiErrorMessage(error)
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
  mockSubscriptionSubmitMessage.value = ''

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
    mockSubscriptionSubmitMessage.value = getApiErrorMessage(error, 'Mock odber sa nepodarilo uložiť.')
  }
}

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
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interná zóna"
      title="Notifikácie a výstrahy"
      description="Správca vie pripraviť búrkovú výstrahu, servisný oznam alebo správu k rezerváciám pre PWA odbery."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="notificationsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ notificationAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ notificationReadOnlyMessage }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Aktívne odbery</p>
          <p class="mt-2 text-3xl font-bold">{{ enabledSubscriptions.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">zariadenia s povolenými push notifikáciami</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Verejné oznamy</p>
          <p class="mt-2 text-3xl font-bold">{{ alerts.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">zobrazené na stránke výstrah</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Broadcasty</p>
          <p class="mt-2 text-3xl font-bold">{{ broadcasts.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">mock dispatcher log</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Doručenia</p>
          <p class="mt-2 text-3xl font-bold">{{ deliveryLogs.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">záznamy po zariadeniach</p>
        </div>
      </div>

      <div class="mt-5 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Web Push provider</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Stav doručovania podľa aktuálneho serverového nastavenia.
            </p>
          </div>
          <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="deliveryDiagnosticsClass()">
            {{ deliveryDiagnosticsLabel() }}
          </span>
        </div>

        <dl class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">Provider</dt>
            <dd class="mt-1 text-sm font-bold">{{ deliveryProviderLabels[deliveryDiagnostics.provider] }}</dd>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">VAPID</dt>
            <dd class="mt-1 text-sm font-bold">{{ deliveryDiagnostics.hasVapidConfig ? 'kompletný' : 'nekompletný' }}</dd>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">TTL</dt>
            <dd class="mt-1 text-sm font-bold">{{ formatDurationSeconds(deliveryDiagnostics.ttlSeconds) }}</dd>
          </div>
          <div class="rounded-md bg-muted px-3 py-3">
            <dt class="text-foreground-muted text-xs font-semibold uppercase">Urgentnosť</dt>
            <dd class="mt-1 text-sm font-bold">{{ deliveryDiagnostics.urgency }}</dd>
          </div>
        </dl>

        <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <p class="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground-muted">
            Subject: <span class="font-semibold text-foreground">{{ deliveryDiagnostics.subject || 'nenastavený' }}</span>
          </p>
          <p class="rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground-muted">
            Timeout: <span class="font-semibold text-foreground">{{ formatDurationSeconds(deliveryDiagnostics.timeoutMs / 1000) }}</span>
          </p>
        </div>

        <p
          v-if="missingDeliveryConfig.length > 0"
          class="mt-4 rounded-md border border-warning-500/25 bg-warning-500/10 px-3 py-2 text-sm font-semibold text-warning-700"
        >
          Chýba: {{ missingDeliveryConfig.join(', ') }}
        </p>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Nová notifikácia</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Vytvorí verejný oznam a pripraví push broadcast pre zvolené okruhy.
            </p>

            <fieldset :disabled="!canOperateNotifications" class="contents">
              <div class="mt-5 grid gap-3">
                <label class="block">
                  <span class="text-sm font-semibold">Nadpis</span>
                  <input
                    v-model="broadcastForm.title"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Text</span>
                  <textarea
                    v-model="broadcastForm.body"
                    rows="4"
                    class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Typ</span>
                    <select
                      v-model="broadcastForm.severity"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="storm">búrka</option>
                      <option value="water">voda/vietor</option>
                      <option value="service">prevádzka</option>
                      <option value="info">info</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Platné do</span>
                    <input
                      v-model="broadcastForm.validUntil"
                      type="text"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                </div>
                <div>
                  <p class="text-sm font-semibold">Okruhy</p>
                  <div class="mt-2 flex flex-wrap gap-3 text-sm">
                    <label v-for="topic in availableTopics" :key="topic" class="flex items-center gap-2">
                      <input
                        v-model="broadcastForm.targetTopics"
                        :value="topic"
                        type="checkbox"
                        class="h-4 w-4 accent-primary-700"
                      >
                      {{ pushSubscriptionTopicLabels[topic] }}
                    </label>
                  </div>
                </div>
              </div>
            </fieldset>

            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-paper-airplane"
                :disabled="!canOperateNotifications"
                :loading="broadcastSubmitStatus === 'submitting'"
                @click="submitBroadcast"
              >
                Pripraviť broadcast
              </UButton>
              <p
                v-if="broadcastSubmitMessage"
                class="text-sm font-semibold"
                :class="broadcastSubmitStatus === 'error' ? 'text-error-700' : 'text-success-700'"
              >
                {{ broadcastSubmitMessage }}
              </p>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Mock interný odber</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Testovací odber pre interné role, súťažné sektory a kontrolórov.
            </p>

            <fieldset :disabled="!canOperateNotifications" class="contents">
              <div class="mt-5 grid gap-3">
                <label class="block">
                  <span class="text-sm font-semibold">Zariadenie</span>
                  <input
                    v-model="mockSubscriptionForm.deviceLabel"
                    type="text"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                </label>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Rola</span>
                    <select
                      v-model="mockSubscriptionForm.audienceRole"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option v-for="role in internalAudienceRoles" :key="role" :value="role">
                        {{ notificationAudienceRoleLabels[role] }}
                      </option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Turnaj</span>
                    <select
                      v-model="mockSubscriptionForm.tournamentId"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                      <option value="">všetky turnaje</option>
                      <option v-for="tournament in tournaments" :key="tournament.id" :value="tournament.id">
                        {{ tournament.name }}
                      </option>
                    </select>
                  </label>
                </div>
                <label v-if="mockSubscriptionForm.audienceRole === 'marshal'" class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="mockSubscriptionForm.marshalId"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  >
                    <option v-for="marshal in tournamentMarshals" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
                <div v-if="isMockSectorScopedRole">
                  <p class="text-sm font-semibold">Sektory</p>
                  <div class="mt-2 flex flex-wrap gap-2 text-sm">
                    <label
                      v-for="sector in mockTournamentSectors"
                      :key="sector.id"
                      class="rounded-md border border-border bg-white px-2.5 py-1.5"
                    >
                      <input
                        v-model="mockSubscriptionForm.sectorIds"
                        :value="sector.id"
                        type="checkbox"
                        class="mr-2 h-4 w-4 accent-primary-700"
                      >
                      {{ sector.label }}
                    </label>
                  </div>
                </div>
                <div>
                  <p class="text-sm font-semibold">Okruhy</p>
                  <div class="mt-2 flex flex-wrap gap-3 text-sm">
                    <label v-for="topic in availableTopics" :key="topic" class="flex items-center gap-2">
                      <input
                        v-model="mockSubscriptionForm.topics"
                        :value="topic"
                        type="checkbox"
                        class="h-4 w-4 accent-primary-700"
                      >
                      {{ pushSubscriptionTopicLabels[topic] }}
                    </label>
                  </div>
                </div>
                <p class="break-all rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted">
                  {{ mockSubscriptionEndpointPreview }}
                </p>
              </div>
            </fieldset>

            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                icon="i-heroicons-device-phone-mobile"
                :disabled="!canOperateNotifications"
                :loading="mockSubscriptionSubmitStatus === 'submitting'"
                @click="submitMockSubscription"
              >
                Uložiť mock odber
              </UButton>
              <p
                v-if="mockSubscriptionSubmitMessage"
                class="text-sm font-semibold"
                :class="mockSubscriptionSubmitStatus === 'error' ? 'text-error-700' : 'text-success-700'"
              >
                {{ mockSubscriptionSubmitMessage }}
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Posledné broadcasty</h2>
            <div class="mt-4 space-y-3">
              <article v-for="broadcast in broadcasts.slice(0, 5)" :key="broadcast.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 class="font-bold">{{ broadcast.title }}</h3>
                    <p class="text-foreground-muted mt-1 text-sm">{{ broadcast.message }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">
                      {{ formatTopics(broadcast.targetTopics) }} · {{ broadcast.recipientCount }} odberov
                    </p>
                    <p v-if="broadcast.targetAudience" class="text-foreground-muted mt-1 text-xs">
                      {{ formatNotificationAudience(broadcast.targetAudience) }}
                    </p>
                  </div>
                  <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="severityClass(broadcast.severity)">
                    {{ broadcast.status }}
                  </span>
                </div>
              </article>
              <p v-if="broadcasts.length === 0" class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">
                Zatiaľ nie je pripravený žiadny broadcast.
              </p>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Doručenia</h2>
            <div class="mt-4 space-y-3">
              <article v-for="delivery in deliveryLogs.slice(0, 6)" :key="delivery.id" class="rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold">{{ delivery.deviceLabel }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ delivery.message }}</p>
                    <p class="text-foreground-muted mt-2 break-all text-xs">
                      {{ deliveryProviderLabels[delivery.provider] }} · {{ delivery.endpoint }}
                    </p>
                  </div>
                  <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="deliveryStatusClass(delivery.status)">
                    {{ delivery.status }}
                  </span>
                </div>
              </article>
              <p v-if="deliveryLogs.length === 0" class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">
                Zatiaľ nie je zaevidované žiadne doručenie.
              </p>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Odbery zariadení</h2>
            <div class="mt-4 space-y-3">
              <article v-for="subscription in subscriptions.slice(0, 6)" :key="subscription.id" class="rounded-md bg-muted p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold">{{ subscription.deviceLabel }}</p>
                    <p class="text-foreground-muted mt-1 break-all text-xs">{{ subscription.endpoint }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">{{ formatTopics(subscription.topics) }}</p>
                    <p v-if="formatSubscriptionAudience(subscription)" class="text-foreground-muted mt-1 text-xs">
                      {{ formatSubscriptionAudience(subscription) }}
                    </p>
                  </div>
                  <span
                    class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                    :class="subscription.enabled ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
                  >
                    {{ subscription.enabled ? 'aktívny' : 'vypnutý' }}
                  </span>
                </div>
              </article>
              <p v-if="subscriptions.length === 0" class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted">
                Zatiaľ nie je uložený žiadny push odber.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
