<script setup lang="ts">
import type { LakeSlug, PushSubscriptionTopic } from '~/data/pond'
import type {
  PushSubscriptionMutationSuccess,
  PushUnsubscribeSuccess,
} from '~/services/notificationService'
import {
  DEFAULT_PUBLIC_PUSH_LAKES,
  DEFAULT_PUBLIC_PUSH_TOPICS,
  getClientPushSupport,
  PUBLIC_NOTIFICATION_LAKES,
  PUSH_ENDPOINT_STORAGE_KEY,
  readPublicPushPreferences,
  type ClientPushSupport,
  type PublicNotificationDeviceState,
  writePublicPushPreferences,
} from '~/services/pushSubscriptionClient'

type NoticeTone = 'error' | 'info' | 'success' | 'warning'

const emit = defineEmits<{
  stateChange: [state: PublicNotificationDeviceState]
}>()

const runtimeConfig = useRuntimeConfig()
const requesting = ref(false)
const notificationStatus = ref<PublicNotificationDeviceState['permission']>('unknown')
const pushSupport = ref<ClientPushSupport>({
  mode: 'mock',
  reason: 'missing-notification',
})
const subscriptionEndpoint = ref('')
const selectedLakeIds = ref<LakeSlug[]>([...DEFAULT_PUBLIC_PUSH_LAKES])
const selectedTopics = ref<PushSubscriptionTopic[]>([...DEFAULT_PUBLIC_PUSH_TOPICS])
const subscriptionSubmitMessage = ref('')
const subscriptionSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')

const notificationsAvailable = computed(() => pushSupport.value.mode === 'web-push')
const hasNotificationSelection = computed(() =>
  selectedTopics.value.length > 0 && selectedLakeIds.value.length > 0,
)
const notificationSelectionLabel = computed(() => [
  formatSlovakCount(selectedTopics.value.length, ['okruh', 'okruhy', 'okruhov']),
  formatSlovakCount(selectedLakeIds.value.length, ['jazero', 'jazerá', 'jazier']),
].join(' · '))
const notificationPrimaryActionLabel = computed(() =>
  subscriptionEndpoint.value ? 'Uložiť výber' : 'Zapnúť vybrané upozornenia',
)
const notificationAvailabilityMessage = computed(() => {
  if (notificationsAvailable.value) {
    return 'Toto zariadenie vie prijímať výstrahy z revíru.'
  }

  if (pushSupport.value.reason === 'missing-notification' || pushSupport.value.reason === 'missing-push-manager') {
    return 'Tento prehliadač nevie prijímať výstrahy. Aktuálne oznamy zostávajú dostupné na tejto stránke.'
  }

  return 'Upozornenia momentálne nie sú dostupné. Aktuálne oznamy zostávajú dostupné na tejto stránke.'
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
const notificationTopicCards = [
  {
    description: 'búrky, vietor, nárazový dážď, bezpečnosť člnov a bivakov',
    icon: 'i-heroicons-bolt',
    title: 'Počasie',
    value: 'weather' as const,
  },
  {
    description: 'údržba chaty, zákaz vjazdu, zmena pravidiel a pohyb techniky',
    icon: 'i-heroicons-wrench-screwdriver',
    title: 'Revír',
    value: 'service' as const,
  },
  {
    description: 'potvrdenie, presun termínu, pripomenutie príchodu a odchodu',
    icon: 'i-heroicons-calendar-days',
    title: 'Rezervácie',
    value: 'reservations' as const,
  },
  {
    description: 'zmeny programu, váženia, uzávierky sektorov a organizačné pokyny',
    icon: 'i-heroicons-trophy',
    title: 'Súťaže',
    value: 'tournaments' as const,
  },
]

function formatSlovakCount(count: number, forms: [string, string, string]) {
  const form = count === 1 ? forms[0] : count >= 2 && count <= 4 ? forms[1] : forms[2]

  return `${count} ${form}`
}

function currentDeviceState(): PublicNotificationDeviceState {
  return {
    lakeIds: [...selectedLakeIds.value],
    permission: notificationStatus.value,
    subscriptionEndpoint: subscriptionEndpoint.value,
    support: pushSupport.value,
    topics: [...selectedTopics.value],
  }
}

function emitDeviceState() {
  emit('stateChange', currentDeviceState())
}

onMounted(() => {
  const preferences = readPublicPushPreferences(localStorage)
  selectedLakeIds.value = preferences.lakeIds
  selectedTopics.value = preferences.topics
  const vapidPublicKey = String(runtimeConfig.public.vapidPublicKey || '')
  pushSupport.value = getClientPushSupport({
    hasNotification: 'Notification' in window,
    hasPushManager: 'PushManager' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    vapidPublicKey,
  })

  if (!('Notification' in window)) {
    notificationStatus.value = 'unsupported'
    emitDeviceState()
    return
  }

  notificationStatus.value = Notification.permission as 'granted' | 'denied' | 'unknown'
  subscriptionEndpoint.value = localStorage.getItem(PUSH_ENDPOINT_STORAGE_KEY) ?? ''
  emitDeviceState()
})

watch([selectedLakeIds, selectedTopics], () => emitDeviceState(), { deep: true })

async function createSubscriptionPayload(permission: NotificationPermission) {
  const {
    createWebPushSubscribeOptions,
    createWebPushSubscriptionPayload,
  } = await import('~/services/webPushSubscriptionClient')
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
  if (!hasNotificationSelection.value) {
    subscriptionSubmitStatus.value = 'error'
    subscriptionSubmitMessage.value = 'Vyberte aspoň jeden okruh a jedno jazero.'
    return
  }
  if (!('Notification' in window)) {
    notificationStatus.value = 'unsupported'
    subscriptionSubmitStatus.value = 'error'
    subscriptionSubmitMessage.value = 'Tento prehliadač nepodporuje upozornenia.'
    emitDeviceState()
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
      emitDeviceState()
      return
    }

    const subscriptionPayload = await createSubscriptionPayload(permission)
    const result = await $fetch<PushSubscriptionMutationSuccess>('/api/notifications/subscribe', {
      body: {
        ...subscriptionPayload,
        deviceLabel: 'Web PWA zariadenie',
        lakeIds: selectedLakeIds.value,
        topics: selectedTopics.value,
        userAgent: navigator.userAgent,
      },
      method: 'POST',
    })

    subscriptionEndpoint.value = result.subscription.endpoint
    selectedLakeIds.value = result.subscription.lakeIds?.length
      ? [...result.subscription.lakeIds]
      : [...selectedLakeIds.value]
    selectedTopics.value = [...result.subscription.topics]
    localStorage.setItem(PUSH_ENDPOINT_STORAGE_KEY, result.subscription.endpoint)
    writePublicPushPreferences(localStorage, {
      lakeIds: selectedLakeIds.value,
      topics: selectedTopics.value,
    })
    subscriptionSubmitStatus.value = 'success'
    subscriptionSubmitMessage.value = result.subscription.enabled
      ? 'Výber upozornení je uložený pre toto zariadenie.'
      : 'Výstrahy sa nepodarilo zapnúť pre toto zariadenie.'
    emitDeviceState()
    await refreshNuxtData('public-notifications')
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
    emitDeviceState()
    await refreshNuxtData('public-notifications')
  }
  catch (error) {
    subscriptionSubmitStatus.value = 'error'
    subscriptionSubmitMessage.value = getApiErrorMessage(error, 'Odber notifikácií sa nepodarilo vypnúť.')
  }
  finally {
    requesting.value = false
  }
}
</script>

<template>
  <div class="border-y border-border py-8">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 class="text-xl font-bold">Upozornenia pre toto zariadenie</h2>
        <p class="mt-1 text-sm text-foreground-muted">
          Výber sa uloží iba v tomto telefóne alebo prehliadači.
        </p>
      </div>
      <StatusBadge
        icon="i-heroicons-adjustments-horizontal"
        :label="notificationSelectionLabel"
        :tone="hasNotificationSelection ? 'primary' : 'warning'"
      />
    </div>

    <fieldset class="mt-6">
      <legend class="text-sm font-bold">Okruhy</legend>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label
          v-for="topic in notificationTopicCards"
          :key="topic.value"
          class="flex min-h-32 cursor-pointer items-start gap-3 rounded-md border p-4 transition"
          :class="selectedTopics.includes(topic.value)
            ? 'border-primary-600 bg-primary-50/60'
            : 'border-border bg-surface hover:border-primary-300'"
        >
          <input
            v-model="selectedTopics"
            :value="topic.value"
            type="checkbox"
            class="mt-1 h-4 w-4 shrink-0 accent-primary-700"
          >
          <span class="min-w-0">
            <UIcon :name="topic.icon" class="h-5 w-5 text-primary-700" />
            <span class="mt-2 block font-bold">{{ topic.title }}</span>
            <span class="mt-1 block text-sm text-foreground-muted">{{ topic.description }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <fieldset class="mt-6">
      <legend class="text-sm font-bold">Jazerá</legend>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label
          v-for="lake in PUBLIC_NOTIFICATION_LAKES"
          :key="lake.slug"
          class="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition"
          :class="selectedLakeIds.includes(lake.slug)
            ? 'border-primary-600 bg-primary-50/60'
            : 'border-border bg-surface hover:border-primary-300'"
        >
          <input
            v-model="selectedLakeIds"
            :value="lake.slug"
            type="checkbox"
            class="h-4 w-4 shrink-0 accent-primary-700"
          >
          <UIcon name="i-heroicons-map-pin" class="h-5 w-5 shrink-0 text-primary-700" />
          <span class="font-bold">{{ lake.name }}</span>
        </label>
      </div>
    </fieldset>

    <DataStatusNotice
      v-if="!hasNotificationSelection"
      class="mt-4"
      description="Vyberte aspoň jeden okruh a jedno jazero."
      title="Výber nie je úplný"
      tone="warning"
    />

    <div class="mt-6 grid gap-2 sm:max-w-xl sm:grid-cols-2">
      <UButton
        :icon="subscriptionEndpoint ? 'i-heroicons-check' : 'i-heroicons-bell'"
        :loading="requesting"
        :disabled="!notificationsAvailable || notificationStatus === 'unsupported' || !hasNotificationSelection"
        block
        @click="requestNotifications"
      >
        {{ notificationPrimaryActionLabel }}
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
        Vypnúť upozornenia
      </UButton>
    </div>
    <DataStatusNotice
      v-if="subscriptionSubmitMessage"
      class="mt-3 sm:max-w-xl"
      :description="subscriptionSubmitMessage"
      :loading="subscriptionSubmitStatus === 'submitting'"
      :title="subscriptionNoticeTitle"
      :tone="subscriptionNoticeTone"
    />
  </div>
</template>
