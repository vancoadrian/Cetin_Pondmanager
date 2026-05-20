<script setup lang="ts">
import type {
  NotificationBroadcastSuccess,
  NotificationStateResponse,
} from '~/services/notificationService'
import { pushSubscriptionTopicLabels } from '~/services/notificationService'
import type { AlertSeverity, PushSubscriptionTopic } from '~/data/pond'

useHead({ title: 'Admin notifikácie' })

const fallbackNotificationState = (): NotificationStateResponse => ({
  alerts: [],
  broadcasts: [],
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
const broadcastForm = reactive({
  body: 'O 18:30 sa očakáva prechod búrkového pásma. Skontrolujte bivaky a počas bleskov nemanipulujte s prútmi.',
  severity: 'storm' as AlertSeverity,
  targetTopics: ['weather', 'service'] as PushSubscriptionTopic[],
  title: 'Výstraha pred búrkou',
  validUntil: 'dnes 21:00',
})
const broadcastSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const broadcastSubmitMessage = ref('')

const alerts = computed(() => notificationState.value?.alerts ?? [])
const broadcasts = computed(() => notificationState.value?.broadcasts ?? [])
const subscriptions = computed(() => notificationState.value?.subscriptions ?? [])
const enabledSubscriptions = computed(() => subscriptions.value.filter((subscription) => subscription.enabled))
const availableTopics: PushSubscriptionTopic[] = ['weather', 'service', 'reservations', 'tournaments']

function severityClass(severity: AlertSeverity) {
  if (severity === 'storm') return 'bg-error-500/10 text-error-700'
  if (severity === 'water') return 'bg-info-500/10 text-info-500'
  if (severity === 'service') return 'bg-warning-500/10 text-warning-700'

  return 'bg-primary-50 text-primary-700'
}

function formatTopics(topics: PushSubscriptionTopic[]) {
  return topics.map((topic) => pushSubscriptionTopicLabels[topic]).join(', ')
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

      <div class="grid gap-4 md:grid-cols-3">
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
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <h2 class="text-lg font-bold">Nová notifikácia</h2>
          <p class="text-foreground-muted mt-1 text-sm">
            Vytvorí verejný oznam a pripraví push broadcast pre zvolené okruhy.
          </p>

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

          <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <UButton
              icon="i-heroicons-paper-airplane"
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
            <h2 class="text-lg font-bold">Odbery zariadení</h2>
            <div class="mt-4 space-y-3">
              <article v-for="subscription in subscriptions.slice(0, 6)" :key="subscription.id" class="rounded-md bg-muted p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-semibold">{{ subscription.deviceLabel }}</p>
                    <p class="text-foreground-muted mt-1 break-all text-xs">{{ subscription.endpoint }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">{{ formatTopics(subscription.topics) }}</p>
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
