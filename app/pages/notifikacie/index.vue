<script setup lang="ts">
import type { StatusBadgeTone } from '~/utils/ui'
import type {
  PublicNotificationStateResponse,
  PushSubscriptionMutationSuccess,
  PushUnsubscribeSuccess,
} from '~/services/notificationService'
import {
  createWebPushSubscribeOptions,
  createWebPushSubscriptionPayload,
  getClientPushSupport,
  PUSH_ENDPOINT_STORAGE_KEY,
  type ClientPushSupport,
} from '~/services/pushSubscriptionClient'

type NoticeTone = 'error' | 'info' | 'success' | 'warning'

useHead({ title: 'Výstrahy' })

const { alerts: seedAlerts } = usePondData()
const runtimeConfig = useRuntimeConfig()

const fallbackNotificationState = (): PublicNotificationStateResponse => ({
  alerts: seedAlerts,
  ok: true,
  subscriptionCount: 0,
  updatedAt: 'seed',
})
const {
  data: notificationState,
  error: notificationError,
  refresh: refreshNotifications,
  status: notificationFetchStatus,
} = await useAsyncData<PublicNotificationStateResponse>(
  'public-notifications',
  () => $fetch<PublicNotificationStateResponse>('/api/notifications'),
  {
    default: fallbackNotificationState,
  },
)

const notificationStatus = ref<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown')
const pushSupport = ref<ClientPushSupport>({
  mode: 'mock',
  reason: 'missing-notification',
})
const requesting = ref(false)
const subscriptionEndpoint = ref('')
const subscriptionSubmitMessage = ref('')
const subscriptionSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const alerts = computed(() => notificationState.value?.alerts ?? seedAlerts)
const alertSeverityPriority: Record<string, number> = {
  storm: 0,
  service: 1,
  water: 2,
  info: 3,
}
const sortedAlerts = computed(() =>
  [...alerts.value].sort((first, second) => {
    const priorityDiff = (alertSeverityPriority[first.severity] ?? 4) - (alertSeverityPriority[second.severity] ?? 4)
    if (priorityDiff !== 0) return priorityDiff

    return new Date(first.validUntil).getTime() - new Date(second.validUntil).getTime()
  }),
)
const activeAlertCount = computed(() => sortedAlerts.value.length)
const primaryAlert = computed(() => sortedAlerts.value[0])
const criticalAlertCount = computed(() =>
  sortedAlerts.value.filter((alert) => alert.severity === 'storm').length,
)
const serviceAlertCount = computed(() =>
  sortedAlerts.value.filter((alert) => alert.severity === 'service').length,
)
const isLoadingNotifications = computed(() => notificationFetchStatus.value === 'pending')
const notificationLoadError = computed(() =>
  notificationError.value
    ? 'Výstrahy sa nepodarilo obnoviť. Skontrolujte pripojenie a skúste to znova.'
    : '',
)
const lastNotificationUpdateLabel = computed(() => {
  const value = notificationState.value?.updatedAt

  if (!value || value === 'seed') {
    return 'priebežne'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'priebežne'
  }

  return new Intl.DateTimeFormat('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
})
const notificationsAvailable = computed(() => pushSupport.value.mode === 'web-push')
const notificationsEnabled = computed(() => notificationsAvailable.value && Boolean(subscriptionEndpoint.value))
const notificationAvailabilityMessage = computed(() => {
  if (notificationsAvailable.value) {
    return 'Toto zariadenie vie prijímať výstrahy z revíru.'
  }

  if (pushSupport.value.reason === 'missing-notification' || pushSupport.value.reason === 'missing-push-manager') {
    return 'Tento prehliadač nevie prijímať výstrahy. Aktuálne oznamy zostávajú dostupné na tejto stránke.'
  }

  return 'Upozornenia momentálne nie sú dostupné. Aktuálne oznamy zostávajú dostupné na tejto stránke.'
})
const notificationStatusBadge = computed<{
  icon: string
  label: string
  tone: StatusBadgeTone
}>(() => {
  if (notificationsAvailable.value && subscriptionEndpoint.value) {
    return {
      icon: 'i-heroicons-bell-alert',
      label: 'zapnuté',
      tone: 'success',
    }
  }

  if (notificationsAvailable.value && notificationStatus.value === 'granted') {
    return {
      icon: 'i-heroicons-bell',
      label: 'povolené v prehliadači',
      tone: 'primary',
    }
  }

  if (notificationStatus.value === 'denied') {
    return {
      icon: 'i-heroicons-bell-slash',
      label: 'zamietnuté',
      tone: 'error',
    }
  }

  if (!notificationsAvailable.value || notificationStatus.value === 'unsupported') {
    return {
      icon: 'i-heroicons-no-symbol',
      label: 'nedostupné',
      tone: 'neutral',
    }
  }

  return {
    icon: 'i-heroicons-bell',
    label: 'vypnuté',
    tone: 'warning',
  }
})
const subscriptionNoticeTitle = computed(() => {
  if (subscriptionSubmitStatus.value === 'error') return 'Upozornenia sa nepodarilo nastaviť'
  if (subscriptionSubmitStatus.value === 'submitting') return 'Spracúvam upozornenia'
  return subscriptionEndpoint.value ? 'Upozornenia sú zapnuté' : 'Upozornenia sú vypnuté'
})
const subscriptionNoticeTone = computed<NoticeTone>(() => {
  if (subscriptionSubmitStatus.value === 'error') return 'error'
  if (subscriptionSubmitStatus.value === 'submitting') return 'info'
  return 'success'
})
const notificationSupportNoticeTitle = computed(() => {
  if (notificationStatus.value === 'denied') return 'Upozornenia sú zamietnuté v prehliadači'
  if (notificationsAvailable.value) return 'Upozornenia môžete zapnúť'

  return 'Upozornenia tu nie sú dostupné'
})
const notificationSupportNoticeTone = computed<NoticeTone>(() => {
  if (notificationStatus.value === 'denied') return 'error'
  if (notificationsAvailable.value) return 'success'

  return 'warning'
})
const notificationSummaryItems = computed(() => [
  {
    icon: criticalAlertCount.value > 0 ? 'i-heroicons-bolt' : 'i-heroicons-megaphone',
    label: 'Stav pri vode',
    value: criticalAlertCount.value > 0
      ? `${criticalAlertCount.value} výstraha`
      : activeAlertCount.value > 0
        ? `${activeAlertCount.value} oznamy`
        : 'pokoj',
  },
  {
    icon: notificationsEnabled.value ? 'i-heroicons-bell-alert' : 'i-heroicons-bell-slash',
    label: 'Toto zariadenie',
    value: notificationsEnabled.value ? 'výstrahy zapnuté' : 'výstrahy vypnuté',
  },
  {
    icon: serviceAlertCount.value > 0 ? 'i-heroicons-wrench-screwdriver' : 'i-heroicons-clock',
    label: serviceAlertCount.value > 0 ? 'Prevádzka' : 'Aktualizované',
    value: serviceAlertCount.value > 0 ? `${serviceAlertCount.value} oznam` : lastNotificationUpdateLabel.value,
  },
])
const notificationTopicCards = [
  {
    description: 'búrky, vietor, nárazový dážď, bezpečnosť člnov a bivakov',
    icon: 'i-heroicons-bolt',
    title: 'Počasie',
  },
  {
    description: 'údržba chaty, zákaz vjazdu, zmena pravidiel a pohyb techniky',
    icon: 'i-heroicons-wrench-screwdriver',
    title: 'Revír',
  },
  {
    description: 'potvrdenie, presun termínu, pripomenutie príchodu a odchodu',
    icon: 'i-heroicons-calendar-days',
    title: 'Rezervácie',
  },
  {
    description: 'zmeny programu, váženia, uzávierky sektorov a organizačné pokyny',
    icon: 'i-heroicons-trophy',
    title: 'Súťaže',
  },
]

onMounted(() => {
  const vapidPublicKey = String(runtimeConfig.public.vapidPublicKey || '')
  pushSupport.value = getClientPushSupport({
    hasNotification: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    vapidPublicKey,
  })

  if (!('Notification' in window)) {
    notificationStatus.value = 'unsupported'
    return
  }
  notificationStatus.value = Notification.permission as 'granted' | 'denied' | 'unknown'
  subscriptionEndpoint.value = localStorage.getItem(PUSH_ENDPOINT_STORAGE_KEY) ?? ''
})

async function createSubscriptionPayload(permission: NotificationPermission) {
  const normalizedPermission = permission === 'granted'
    ? 'granted'
    : permission === 'denied' ? 'denied' : 'unknown'
  const vapidPublicKey = String(runtimeConfig.public.vapidPublicKey || '')
  pushSupport.value = getClientPushSupport({
    hasNotification: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    vapidPublicKey,
  })

  if (pushSupport.value.mode !== 'web-push') {
    throw new Error(notificationAvailabilityMessage.value)
  }

  const registration = await navigator.serviceWorker.ready
  const existingSubscription = await registration.pushManager.getSubscription()
  const subscription = existingSubscription ?? await registration.pushManager.subscribe({
    ...createWebPushSubscribeOptions(vapidPublicKey),
  })

  return createWebPushSubscriptionPayload(subscription, normalizedPermission)
}

function getApiErrorMessage(error: unknown, fallback: string) {
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

async function requestNotifications() {
  if (!('Notification' in window)) {
    notificationStatus.value = 'unsupported'
    subscriptionSubmitStatus.value = 'error'
    subscriptionSubmitMessage.value = 'Tento prehliadač nepodporuje upozornenia.'
    return
  }
  requesting.value = true
  subscriptionSubmitStatus.value = 'submitting'
  subscriptionSubmitMessage.value = 'Spracúvam zapnutie upozornení.'
  try {
    const permission = await Notification.requestPermission()
    notificationStatus.value = permission as 'granted' | 'denied'
    if (permission !== 'granted') {
      subscriptionSubmitStatus.value = 'error'
      subscriptionSubmitMessage.value = 'Prehliadač nepovolil notifikácie.'
      return
    }

    const subscriptionPayload = await createSubscriptionPayload(permission)
    const result = await $fetch<PushSubscriptionMutationSuccess>('/api/notifications/subscribe', {
      body: {
        ...subscriptionPayload,
        deviceLabel: 'Web PWA zariadenie',
        topics: ['weather', 'service', 'reservations', 'tournaments'],
        userAgent: navigator.userAgent,
      },
      method: 'POST',
    })

    subscriptionEndpoint.value = result.subscription.endpoint
    localStorage.setItem(PUSH_ENDPOINT_STORAGE_KEY, result.subscription.endpoint)
    subscriptionSubmitStatus.value = 'success'
    subscriptionSubmitMessage.value = result.subscription.enabled
      ? 'Výstrahy sú zapnuté pre toto zariadenie.'
      : 'Výstrahy sa nepodarilo zapnúť pre toto zariadenie.'
    await refreshNotifications()
  }
  catch (error) {
    subscriptionSubmitStatus.value = 'error'
    subscriptionSubmitMessage.value = getApiErrorMessage(error, 'Odber notifikácií sa nepodarilo uložiť.')
  } finally {
    requesting.value = false
  }
}

async function disableNotifications() {
  if (!subscriptionEndpoint.value) return

  requesting.value = true
  subscriptionSubmitStatus.value = 'submitting'
  subscriptionSubmitMessage.value = 'Spracúvam vypnutie upozornení.'
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      await subscription?.unsubscribe()
    }

    const result = await $fetch<PushUnsubscribeSuccess>('/api/notifications/unsubscribe', {
      body: {
        endpoint: subscriptionEndpoint.value,
      },
      method: 'POST',
    })

    localStorage.removeItem(PUSH_ENDPOINT_STORAGE_KEY)
    subscriptionEndpoint.value = ''
    subscriptionSubmitStatus.value = 'success'
    subscriptionSubmitMessage.value = result.subscription?.enabled
      ? 'Výstrahy zostali zapnuté pre toto zariadenie.'
      : 'Výstrahy sú vypnuté pre toto zariadenie.'
    await refreshNotifications()
  }
  catch (error) {
    subscriptionSubmitStatus.value = 'error'
    subscriptionSubmitMessage.value = getApiErrorMessage(error, 'Odber notifikácií sa nepodarilo vypnúť.')
  }
  finally {
    requesting.value = false
  }
}

async function retryNotifications() {
  await refreshNotifications()
}

function alertTone(severity: string): StatusBadgeTone {
  switch (severity) {
    case 'storm':
      return 'error'
    case 'water':
      return 'info'
    case 'service':
      return 'warning'
    default:
      return 'primary'
  }
}

function alertIcon(severity: string) {
  if (severity === 'storm') return 'i-heroicons-bolt'
  if (severity === 'water') return 'i-heroicons-beaker'
  if (severity === 'service') return 'i-heroicons-wrench-screwdriver'

  return 'i-heroicons-information-circle'
}

function alertSeverityLabel(severity: string) {
  if (severity === 'storm') return 'počasie'
  if (severity === 'water') return 'voda'
  if (severity === 'service') return 'prevádzka'

  return 'oznam'
}

function alertActionText(severity: string) {
  if (severity === 'storm') {
    return 'Pri búrke prerušte lov, zabezpečte výbavu a sledujte pokyny správcu.'
  }
  if (severity === 'water') {
    return 'Skontrolujte podmienky na mieste a prispôsobte lov aktuálnemu stavu vody.'
  }
  if (severity === 'service') {
    return 'Overte, či sa oznam týka vášho miesta, chaty alebo príchodu do areálu.'
  }

  return 'Prečítajte oznam pred príchodom alebo pokračovaním v love.'
}

function formatAlertValidUntil(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Výstrahy"
      title="Dôležité upozornenia pri vode"
      description="Búrka, silný vietor, zmena rezervácie, servisný oznam alebo informácia k súťaži na jednom mieste."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <div class="flex items-start gap-3">
            <div class="bg-primary-50 text-primary-700 rounded-md p-2">
              <UIcon name="i-heroicons-bell-alert" class="h-6 w-6" />
            </div>
            <div>
              <h2 class="text-xl font-bold">Upozornenia do telefónu</h2>
              <p class="text-foreground-muted mt-2 text-sm">
                Zapnite si výstrahy, aby vás revír upozornil na búrku, silný vietor, zmenu rezervácie alebo dôležitý oznam.
              </p>
            </div>
          </div>

          <div class="bg-muted mt-5 rounded-md p-4">
            <p class="text-foreground-muted text-sm">Stav zariadenia</p>
            <StatusBadge
              class="mt-2"
              :icon="notificationStatusBadge.icon"
              :label="notificationStatusBadge.label"
              :tone="notificationStatusBadge.tone"
            />
            <p class="text-foreground-muted mt-2 text-sm">{{ notificationAvailabilityMessage }}</p>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div
              v-for="item in notificationSummaryItems"
              :key="item.label"
              class="rounded-md border border-border bg-muted/60 p-3"
            >
              <UIcon :name="item.icon" class="h-5 w-5 text-primary-700" />
              <p class="text-foreground-muted mt-2 text-xs">{{ item.label }}</p>
              <p class="mt-1 font-bold">{{ item.value }}</p>
            </div>
          </div>

          <DataStatusNotice
            v-if="!notificationsAvailable || notificationStatus === 'denied'"
            class="mt-4"
            :description="notificationAvailabilityMessage"
            :title="notificationSupportNoticeTitle"
            :tone="notificationSupportNoticeTone"
          />

          <div class="mt-5 grid gap-2 sm:grid-cols-2">
            <UButton
              icon="i-heroicons-bell"
              :loading="requesting"
              :disabled="!notificationsAvailable || notificationStatus === 'unsupported'"
              block
              @click="requestNotifications"
            >
              Zapnúť upozornenia
            </UButton>
            <UButton
              icon="i-heroicons-bell-slash"
              color="neutral"
              variant="soft"
              :loading="requesting"
              :disabled="!subscriptionEndpoint"
              block
              @click="disableNotifications"
            >
              Vypnúť
            </UButton>
          </div>
          <DataStatusNotice
            v-if="subscriptionSubmitMessage"
            class="mt-3"
            :description="subscriptionSubmitMessage"
            :loading="subscriptionSubmitStatus === 'submitting'"
            :title="subscriptionNoticeTitle"
            :tone="subscriptionNoticeTone"
          />
        </div>

        <div class="space-y-4">
          <DataStatusNotice
            v-if="primaryAlert"
            :description="alertActionText(primaryAlert.severity)"
            :icon="alertIcon(primaryAlert.severity)"
            :title="primaryAlert.severity === 'storm' ? 'Najdôležitejšia výstraha pri vode' : 'Najdôležitejší aktuálny oznam'"
            :tone="primaryAlert.severity === 'storm' ? 'error' : primaryAlert.severity === 'service' ? 'warning' : 'info'"
          />

          <AppState
            v-if="isLoadingNotifications"
            type="loading"
            title="Načítavam výstrahy"
            description="Kontrolujeme aktuálne oznamy pre revír, počasie, rezervácie a súťaže."
          />
          <AppState
            v-else-if="notificationLoadError"
            type="error"
            title="Výstrahy sa nedajú načítať"
            :description="notificationLoadError"
          >
            <UButton icon="i-heroicons-arrow-path" variant="soft" @click="retryNotifications">
              Skúsiť znova
            </UButton>
          </AppState>
          <AppState
            v-else-if="alerts.length === 0"
            title="Žiadne aktívne výstrahy"
            description="Momentálne nie je zverejnený žiadny oznam pre revír."
            icon="i-heroicons-bell"
          />
          <template v-else>
            <article
              v-for="alert in sortedAlerts"
              :key="alert.id"
              class="border-border bg-surface rounded-card border p-5"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 class="text-xl font-bold">{{ alert.title }}</h2>
                  <p class="text-foreground-muted mt-2 text-sm">{{ alert.body }}</p>
                </div>
                <div class="flex shrink-0 flex-wrap gap-2">
                  <StatusBadge
                    :icon="alertIcon(alert.severity)"
                    :label="alertSeverityLabel(alert.severity)"
                    :tone="alertTone(alert.severity)"
                    size="xs"
                  />
                  <StatusBadge
                    icon="i-heroicons-clock"
                    :label="`do ${formatAlertValidUntil(alert.validUntil)}`"
                    tone="neutral"
                    size="xs"
                  />
                </div>
              </div>
              <div class="mt-4 rounded-md border border-border bg-muted/60 p-3">
                <div class="flex items-start gap-2">
                  <UIcon name="i-heroicons-clipboard-document-check" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                  <div>
                    <p class="text-sm font-bold">Odporúčaná reakcia</p>
                    <p class="mt-1 text-sm text-foreground-muted">{{ alertActionText(alert.severity) }}</p>
                  </div>
                </div>
              </div>
            </article>
          </template>
        </div>
      </div>

      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="topic in notificationTopicCards"
          :key="topic.title"
          class="border-border bg-surface rounded-card border p-5"
        >
          <UIcon :name="topic.icon" class="h-5 w-5 text-primary-700" />
          <h3 class="mt-3 font-bold">{{ topic.title }}</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            {{ topic.description }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
