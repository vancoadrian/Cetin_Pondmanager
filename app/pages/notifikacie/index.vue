<script setup lang="ts">
import type {
  PublicNotificationStateResponse,
  PushSubscriptionMutationSuccess,
  PushUnsubscribeSuccess,
} from '~/services/notificationService'
import {
  createMockPushSubscriptionPayload,
  createWebPushSubscribeOptions,
  createWebPushSubscriptionPayload,
  getClientPushSupport,
  PUSH_ENDPOINT_STORAGE_KEY,
  type ClientPushMode,
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
const { data: notificationState, refresh: refreshNotifications } = await useAsyncData<PublicNotificationStateResponse>(
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
const activeSubscriptionCount = computed(() => notificationState.value?.subscriptionCount ?? 0)
const pushModeLabel: Record<ClientPushMode, string> = {
  mock: 'mock fallback',
  'web-push': 'reálny Web Push',
}
const pushSupportReasonLabels: Record<ClientPushSupport['reason'], string> = {
  'missing-notification': 'Prehliadač nepodporuje notifikácie.',
  'missing-push-manager': 'Prehliadač nepodporuje Push API.',
  'missing-service-worker': 'Service worker nie je dostupný.',
  'missing-vapid-public-key': 'Chýba verejný VAPID kľúč v konfigurácii.',
  ready: 'Browser endpoint sa uloží ako reálny Web Push odber.',
}

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

  if (pushSupport.value.mode === 'web-push') {
    const registration = await navigator.serviceWorker.ready
    const existingSubscription = await registration.pushManager.getSubscription()
    const subscription = existingSubscription ?? await registration.pushManager.subscribe({
      ...createWebPushSubscribeOptions(vapidPublicKey),
    })

    return createWebPushSubscriptionPayload(subscription, normalizedPermission)
  }

  return createMockPushSubscriptionPayload(localStorage, normalizedPermission, () => crypto.randomUUID())
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

function alertClass(severity: string) {
  switch (severity) {
    case 'storm':
      return 'bg-error-500/10 text-error-500'
    case 'water':
      return 'bg-info-500/10 text-info-500'
    case 'service':
      return 'bg-warning-500/10 text-warning-500'
    default:
      return 'bg-primary-50 text-primary-700'
  }
}

function pushModeClass() {
  return pushSupport.value.mode === 'web-push'
    ? 'bg-success-500/10 text-success-700'
    : 'bg-warning-500/10 text-warning-700'
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Výstrahy"
      title="Push notifikácie pre situácie pri vode"
      description="Búrka, vietor, zmena rezervácie, servis chaty alebo súťažný oznam. PWA vie po povolení posielať upozornenia aj mimo otvoreného prehliadača."
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
                V prototype sa uloží iba povolenie prehliadača. Reálne odosielanie pôjde cez web
                push subscription a serverový dispatcher.
              </p>
            </div>
          </div>

          <div class="bg-muted mt-5 rounded-md p-4">
            <p class="text-foreground-muted text-sm">Stav</p>
            <p class="mt-1 text-lg font-bold">
              <span v-if="subscriptionEndpoint">zapnuté v aplikácii</span>
              <span v-else-if="notificationStatus === 'granted'">povolené v prehliadači</span>
              <span v-else-if="notificationStatus === 'denied'">zamietnuté</span>
              <span v-else-if="notificationStatus === 'unsupported'">nepodporované</span>
              <span v-else>neznáme</span>
            </p>
            <p class="text-foreground-muted mt-1 text-xs">
              Aktívne odbery: {{ activeSubscriptionCount }}
            </p>
            <div class="mt-3 rounded-md border border-border bg-white px-3 py-2">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p class="text-foreground-muted text-xs font-semibold uppercase">Režim odberu</p>
                <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="pushModeClass()">
                  {{ pushModeLabel[pushSupport.mode] }}
                </span>
              </div>
              <p class="text-foreground-muted mt-2 text-xs">
                {{ pushSupportReasonLabels[pushSupport.reason] }}
              </p>
            </div>
          </div>

          <div class="mt-5 grid gap-2 sm:grid-cols-2">
            <UButton
              icon="i-heroicons-bell"
              :loading="requesting"
              :disabled="notificationStatus === 'unsupported'"
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
              <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="alertClass(alert.severity)">
                do {{ alert.validUntil }}
              </span>
            </div>
          </article>
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
