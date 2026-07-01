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
const subscriptionSubmitStatus = ref<'idle' | 'success' | 'error'>('idle')
const alerts = computed(() => notificationState.value?.alerts ?? seedAlerts)
const isLoadingNotifications = computed(() => notificationFetchStatus.value === 'pending')
const notificationLoadError = computed(() =>
  notificationError.value
    ? 'Výstrahy sa nepodarilo obnoviť. Skontrolujte pripojenie a skúste to znova.'
    : '',
)
const notificationsAvailable = computed(() => pushSupport.value.mode === 'web-push')
const notificationAvailabilityMessage = computed(() => {
  if (notificationsAvailable.value) {
    return 'Upozornenia sú v tomto zariadení dostupné.'
  }

  if (pushSupport.value.reason === 'missing-notification' || pushSupport.value.reason === 'missing-push-manager') {
    return 'Tento prehliadač nepodporuje upozornenia. Aktuálne výstrahy zostávajú dostupné na tejto stránke.'
  }

  return 'Upozornenia momentálne nie sú dostupné. Aktuálne výstrahy zostávajú dostupné na tejto stránke.'
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
    return
  }
  requesting.value = true
  subscriptionSubmitMessage.value = ''
  subscriptionSubmitStatus.value = 'idle'
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
    subscriptionSubmitMessage.value = result.message
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
  subscriptionSubmitMessage.value = ''
  subscriptionSubmitStatus.value = 'idle'
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
    subscriptionSubmitMessage.value = result.message
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
            <div class="bg-primary-50 text-primary-700 rounded-full p-2">
              <UIcon name="i-heroicons-bell-alert" class="h-6 w-6" />
            </div>
            <div>
              <h2 class="text-xl font-bold">Povolenie notifikácií</h2>
              <p class="text-foreground-muted mt-2 text-sm">
                Povoľte upozornenia, aby ste dostali výstrahy a dôležité prevádzkové oznamy aj
                mimo otvorenej stránky.
              </p>
            </div>
          </div>

          <div class="bg-muted mt-5 rounded-md p-4">
            <p class="text-foreground-muted text-sm">Stav</p>
            <StatusBadge
              class="mt-2"
              :icon="notificationStatusBadge.icon"
              :label="notificationStatusBadge.label"
              :tone="notificationStatusBadge.tone"
            />
            <p class="text-foreground-muted mt-2 text-sm">{{ notificationAvailabilityMessage }}</p>
          </div>

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
          <p
            v-if="subscriptionSubmitMessage"
            class="mt-3 text-sm font-semibold"
            :class="subscriptionSubmitStatus === 'error' ? 'text-error-700' : 'text-success-700'"
          >
            {{ subscriptionSubmitMessage }}
          </p>
        </div>

        <div class="space-y-4">
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
              v-for="alert in alerts"
              :key="alert.id"
              class="border-border bg-surface rounded-card border p-5"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 class="text-xl font-bold">{{ alert.title }}</h2>
                  <p class="text-foreground-muted mt-2 text-sm">{{ alert.body }}</p>
                </div>
                <StatusBadge
                  class="shrink-0"
                  :icon="alertIcon(alert.severity)"
                  :label="`do ${alert.validUntil}`"
                  :tone="alertTone(alert.severity)"
                  size="xs"
                />
              </div>
            </article>
          </template>
        </div>
      </div>

      <div class="mt-8 grid gap-6 md:grid-cols-3">
        <div class="border-border bg-surface rounded-card border p-5">
          <h3 class="font-bold">Počasie</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            búrky, vietor, nárazový dážď, bezpečnosť člnov a bivakov
          </p>
        </div>
        <div class="border-border bg-surface rounded-card border p-5">
          <h3 class="font-bold">Revír</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            údržba chaty, zákaz vjazdu, zmena pravidiel, zvýšený pohyb techniky
          </p>
        </div>
        <div class="border-border bg-surface rounded-card border p-5">
          <h3 class="font-bold">Rezervácie</h3>
          <p class="text-foreground-muted mt-2 text-sm">
            potvrdenie, presun termínu, pripomenutie príchodu a odchodu
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
