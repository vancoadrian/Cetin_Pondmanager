<script setup lang="ts">
import type { CatchSubmissionSuccess } from '~/services/catchApiService'
import type { ReservationSubmissionSuccess } from '~/services/reservationApiService'
import type { TournamentRequestSubmissionSuccess } from '~/services/tournamentApiService'
import {
  getOfflineCatchQueueErrorMessage,
  markOfflineCatchAttempt,
  readOfflineCatchQueue,
  removeOfflineCatch,
  type OfflineCatchQueueItem,
} from '~/services/offlineCatchQueueService'
import {
  getOfflineReservationQueueErrorMessage,
  markOfflineReservationAttempt,
  readOfflineReservationQueue,
  removeOfflineReservation,
  type OfflineReservationQueueItem,
} from '~/services/offlineReservationQueueService'
import {
  getOfflineTournamentRequestQueueErrorMessage,
  markOfflineTournamentRequestAttempt,
  readOfflineTournamentRequestQueue,
  removeOfflineTournamentRequest,
  type OfflineTournamentRequestQueueItem,
} from '~/services/offlineTournamentRequestQueueService'

useHead({ title: 'Offline režim' })

const {
  getLakeName,
  getPegLabel,
  tournamentRequestTypeLabels,
} = usePondData()

const offlineReservations = ref<OfflineReservationQueueItem[]>([])
const offlineCatches = ref<OfflineCatchQueueItem[]>([])
const offlineTournamentRequests = ref<OfflineTournamentRequestQueueItem[]>([])
const isOnline = ref(true)
const queueLoadError = ref('')
const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const syncMessage = ref('')

const offlineItems = [
  {
    description: 'Lovné miesta, chaty a orientácia pri vode ostávajú dostupné z poslednej načítanej verzie.',
    icon: 'i-heroicons-map',
    label: 'Mapa revíru',
    to: '/mapa',
  },
  {
    description: 'Rozpracovaný výber termínu si skontroluj po návrate signálu pred odoslaním žiadosti.',
    icon: 'i-heroicons-calendar-days',
    label: 'Rezervácie',
    to: '/rezervacie',
  },
  {
    description: 'Búrkové výstrahy a servisné oznamy sa obnovia pri najbližšom pripojení.',
    icon: 'i-heroicons-bell-alert',
    label: 'Výstrahy',
    to: '/notifikacie',
  },
  {
    description: 'Telefón na správcu je dobré mať poruke aj mimo dátového signálu.',
    icon: 'i-heroicons-phone',
    label: 'Kontakt',
    to: '/kontakt',
  },
]

const totalQueued = computed(() =>
  offlineReservations.value.length + offlineCatches.value.length + offlineTournamentRequests.value.length,
)
const issueCount = computed(() =>
  offlineReservations.value.filter((item) => item.lastError).length +
  offlineCatches.value.filter((item) => item.lastError).length +
  offlineTournamentRequests.value.filter((item) => item.lastError).length,
)

const queueSections = computed(() => [
  {
    count: offlineReservations.value.length,
    description: 'Žiadosti o miesto, chatu, výbavu a doplnky čakajúce na odoslanie správcovi.',
    icon: 'i-heroicons-calendar-days',
    label: 'Rezervácie',
    to: '/rezervacie',
  },
  {
    count: offlineCatches.value.length,
    description: 'Úlovky a fotky čakajúce na uloženie a následné schválenie správcom.',
    icon: 'i-heroicons-camera',
    label: 'Úlovky',
    to: '/ulovky',
  },
  {
    count: offlineTournamentRequests.value.length,
    description: 'Privolanie kontrolóra, hlásenie porušenia alebo technická pomoc pre dispečing.',
    icon: 'i-heroicons-flag',
    label: 'Súťažné hlásenia',
    to: '/sutaze',
  },
])

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}

function getQueueFallbackErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Offline fronty sa nepodarilo načítať.'
}

function getAttemptLabel(attempts: number) {
  if (attempts === 0) return 'bez pokusu'
  if (attempts === 1) return '1 pokus'
  if (attempts > 1 && attempts < 5) return `${attempts} pokusy`

  return `${attempts} pokusov`
}

function getQueueStatusLabel(item: { attempts: number, lastError?: string }) {
  if (item.lastError) return 'treba skontrolovať'
  if (item.attempts > 0) return 'čaká na ďalší pokus'

  return 'čaká na odoslanie'
}

function getQueueStatusClass(item: { attempts: number, lastError?: string }) {
  if (item.lastError) return 'bg-error-500/10 text-error-700'
  if (item.attempts > 0) return 'bg-warning-500/10 text-warning-800'

  return 'bg-primary-50 text-primary-800'
}

function getQueueActionCopy(kind: 'catch' | 'reservation' | 'tournament-request') {
  if (kind === 'reservation') {
    return 'Skontroluj termín, miesto alebo dostupnosť výbavy v rezervačnom formulári.'
  }
  if (kind === 'catch') {
    return 'Skontroluj jazero, lovné miesto alebo väzbu na zápisník v denníku úlovkov.'
  }

  return 'Skontroluj sektor, typ hlásenia alebo popis v súťažnom formulári.'
}

async function refreshOfflineQueues() {
  if (!import.meta.client) return

  try {
    const [reservations, catches, tournamentRequests] = await Promise.all([
      readOfflineReservationQueue(),
      readOfflineCatchQueue(),
      readOfflineTournamentRequestQueue(),
    ])

    offlineReservations.value = reservations
    offlineCatches.value = catches
    offlineTournamentRequests.value = tournamentRequests
    queueLoadError.value = ''
  }
  catch (error) {
    queueLoadError.value = getQueueFallbackErrorMessage(error)
  }
}

async function discardQueuedItem(kind: 'catch' | 'reservation' | 'tournament-request', id: string) {
  try {
    if (kind === 'reservation') {
      await removeOfflineReservation(id)
    }
    else if (kind === 'catch') {
      await removeOfflineCatch(id)
    }
    else {
      await removeOfflineTournamentRequest(id)
    }

    await refreshOfflineQueues()
    syncStatus.value = 'success'
    syncMessage.value = 'Položka bola odstránená z offline fronty v tomto zariadení.'
  }
  catch (error) {
    syncStatus.value = 'error'
    syncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function syncAllQueues() {
  if (!import.meta.client || syncStatus.value === 'syncing') return

  isOnline.value = navigator.onLine
  if (!isOnline.value) {
    syncStatus.value = 'error'
    syncMessage.value = 'Bez pripojenia nechávam položky bezpečne v zariadení.'
    return
  }

  await refreshOfflineQueues()
  if (totalQueued.value === 0) {
    syncStatus.value = 'success'
    syncMessage.value = 'Offline fronta je prázdna.'
    return
  }

  syncStatus.value = 'syncing'
  syncMessage.value = `Odosielam ${totalQueued.value} čakajúcich položiek.`
  let syncedCount = 0

  for (const item of [...offlineReservations.value]) {
    try {
      await $fetch<ReservationSubmissionSuccess>('/api/reservations', {
        body: item.payload,
        method: 'POST',
      })
      await removeOfflineReservation(item.id)
      syncedCount += 1
    }
    catch (error) {
      await markOfflineReservationAttempt(item.id, getOfflineReservationQueueErrorMessage(error))
    }
  }

  for (const item of [...offlineCatches.value]) {
    try {
      await $fetch<CatchSubmissionSuccess>('/api/catches', {
        body: item.payload,
        method: 'POST',
      })
      await removeOfflineCatch(item.id)
      syncedCount += 1
    }
    catch (error) {
      await markOfflineCatchAttempt(item.id, getOfflineCatchQueueErrorMessage(error))
    }
  }

  for (const item of [...offlineTournamentRequests.value]) {
    try {
      await $fetch<TournamentRequestSubmissionSuccess>('/api/tournament-requests', {
        body: item.payload,
        method: 'POST',
      })
      await removeOfflineTournamentRequest(item.id)
      syncedCount += 1
    }
    catch (error) {
      await markOfflineTournamentRequestAttempt(item.id, getOfflineTournamentRequestQueueErrorMessage(error))
    }
  }

  await refreshOfflineQueues()
  syncStatus.value = totalQueued.value > 0 ? 'error' : 'success'
  syncMessage.value = totalQueued.value > 0
    ? `${syncedCount} položiek odoslaných, ${totalQueued.value} čaká na ďalší pokus.`
    : `${syncedCount} položiek bolo odoslaných.`
}

function handleOnline() {
  isOnline.value = true
}

function handleOffline() {
  isOnline.value = false
  syncStatus.value = 'idle'
  syncMessage.value = 'Signál vypadol. Čakajúce položky ostávajú v zariadení.'
}

onMounted(() => {
  if (!import.meta.client) return

  isOnline.value = navigator.onLine
  void refreshOfflineQueues()
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
      eyebrow="PWA"
      title="Offline režim"
      description="Aplikácia používa uloženú verziu stránok a dát. Čakajúce rezervácie, úlovky a súťažné hlásenia vieš skontrolovať a odoslať z jedného miesta."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="rounded-card border border-warning-500/25 bg-warning-500/10 p-5 text-warning-800">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-start gap-3">
            <div class="rounded-full bg-warning-500 p-2 text-primary-950">
              <UIcon name="i-heroicons-signal-slash" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-lg font-bold">Slabý alebo žiadny signál</h2>
              <p class="mt-1 text-sm">
                Niektoré údaje môžu byť staršie. Po návrate online sa obrazovky znovu zosynchronizujú.
              </p>
            </div>
          </div>
          <UButton
            icon="i-heroicons-cloud-arrow-up"
            color="warning"
            variant="soft"
            :disabled="!isOnline || syncStatus === 'syncing' || totalQueued === 0"
            :loading="syncStatus === 'syncing'"
            @click="syncAllQueues"
          >
            Odoslať čakajúce
          </UButton>
        </div>
      </div>

      <div class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Čaká v zariadení</p>
          <p class="mt-2 text-3xl font-bold">{{ totalQueued }}</p>
        </div>
        <div
          class="rounded-card border p-4"
          :class="issueCount > 0 ? 'border-error-500/25 bg-error-500/10' : 'border-border bg-surface'"
        >
          <p class="text-foreground-muted text-sm">Treba skontrolovať</p>
          <p class="mt-2 text-3xl font-bold" :class="issueCount > 0 ? 'text-error-700' : ''">
            {{ issueCount }}
          </p>
        </div>
        <div
          v-for="section in queueSections"
          :key="section.label"
          class="rounded-card border border-border bg-surface p-4"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-foreground-muted text-sm">{{ section.label }}</p>
              <p class="mt-2 text-3xl font-bold">{{ section.count }}</p>
            </div>
            <UIcon :name="section.icon" class="text-primary-700 h-6 w-6" />
          </div>
        </div>
      </div>

      <div
        v-if="queueLoadError || syncMessage"
        class="mt-6 rounded-md border px-4 py-3 text-sm font-semibold"
        :class="
          syncStatus === 'error' || queueLoadError
            ? 'border-error-500/25 bg-error-500/10 text-error-700'
            : 'border-success-500/25 bg-success-500/10 text-success-700'
        "
      >
        {{ queueLoadError || syncMessage }}
      </div>

      <div
        v-if="issueCount > 0"
        class="mt-6 rounded-md border border-warning-300 bg-warning-100 px-4 py-3 text-sm text-warning-900"
      >
        <div class="flex items-start gap-3">
          <UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p class="font-bold">Niektoré položky sa neodoslali</p>
            <p class="mt-1">
              Server ich odmietol alebo sa zmenila dostupnosť. Otvor príslušný formulár, uprav údaje a potom položku z offline fronty odstráň alebo skús odoslať znova.
            </p>
          </div>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-3">
        <section class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Rezervácie</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Miesto, termín, výbava a doplnky čakajúce na server.
              </p>
            </div>
            <UButton to="/rezervacie" icon="i-heroicons-plus" size="sm" variant="soft">
              Pridať
            </UButton>
          </div>

          <div v-if="offlineReservations.length" class="mt-4 space-y-3">
            <div
              v-for="item in offlineReservations"
              :key="item.id"
              class="rounded-md border bg-white p-3"
              :class="item.lastError ? 'border-error-500/30' : 'border-border'"
            >
              <div class="min-w-0">
                <p class="truncate font-bold">{{ item.payload.contactName }}</p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ getPegLabel(item.payload.pegId) }} · {{ getLakeName(item.payload.lake) }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ item.payload.dateFrom }} až {{ item.payload.dateTo }}
                </p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span
                  class="rounded-md px-2 py-1 text-xs font-bold"
                  :class="getQueueStatusClass(item)"
                >
                  {{ getQueueStatusLabel(item) }}
                </span>
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <div v-if="item.lastError" class="mt-3 rounded-md bg-error-500/10 p-3 text-xs text-error-800">
                <p class="font-bold">{{ item.lastError }}</p>
                <p class="mt-1">{{ getQueueActionCopy('reservation') }}</p>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton to="/rezervacie" icon="i-heroicons-pencil-square" size="xs" variant="soft">
                  Skontrolovať
                </UButton>
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  size="xs"
                  variant="ghost"
                  @click="discardQueuedItem('reservation', item.id)"
                >
                  Odstrániť
                </UButton>
              </div>
            </div>
          </div>
          <AppState
            v-else
            title="Bez čakajúcich rezervácií"
            description="Rezervačný formulár nemá v tomto zariadení uložený offline odosielací rad."
          />
        </section>

        <section class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Úlovky</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Zápisy a fotky čakajúce na schválenie po odoslaní.
              </p>
            </div>
            <UButton to="/ulovky" icon="i-heroicons-plus" size="sm" variant="soft">
              Pridať
            </UButton>
          </div>

          <div v-if="offlineCatches.length" class="mt-4 space-y-3">
            <div
              v-for="item in offlineCatches"
              :key="item.id"
              class="rounded-md border bg-white p-3"
              :class="item.lastError ? 'border-error-500/30' : 'border-border'"
            >
              <div class="min-w-0">
                <p class="truncate font-bold">
                  {{ item.payload.species }} {{ item.payload.weightKg }} kg
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ item.payload.angler }} · {{ getPegLabel(item.payload.pegId) }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ formatDateTime(item.payload.caughtAt) }}
                </p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span
                  class="rounded-md px-2 py-1 text-xs font-bold"
                  :class="getQueueStatusClass(item)"
                >
                  {{ getQueueStatusLabel(item) }}
                </span>
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <div v-if="item.lastError" class="mt-3 rounded-md bg-error-500/10 p-3 text-xs text-error-800">
                <p class="font-bold">{{ item.lastError }}</p>
                <p class="mt-1">{{ getQueueActionCopy('catch') }}</p>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton to="/ulovky" icon="i-heroicons-pencil-square" size="xs" variant="soft">
                  Skontrolovať
                </UButton>
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  size="xs"
                  variant="ghost"
                  @click="discardQueuedItem('catch', item.id)"
                >
                  Odstrániť
                </UButton>
              </div>
            </div>
          </div>
          <AppState
            v-else
            title="Bez čakajúcich úlovkov"
            description="Denník úlovkov nemá v tomto zariadení uložený offline odosielací rad."
          />
        </section>

        <section class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Súťažné hlásenia</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Požiadavky tímov čakajúce na súťažný dispečing.
              </p>
            </div>
            <UButton to="/sutaze" icon="i-heroicons-plus" size="sm" variant="soft">
              Pridať
            </UButton>
          </div>

          <div v-if="offlineTournamentRequests.length" class="mt-4 space-y-3">
            <div
              v-for="item in offlineTournamentRequests"
              :key="item.id"
              class="rounded-md border bg-white p-3"
              :class="item.lastError ? 'border-error-500/30' : 'border-border'"
            >
              <div class="min-w-0">
                <p class="truncate font-bold">{{ tournamentRequestTypeLabels[item.payload.type] }}</p>
                <p class="text-foreground-muted mt-1 text-sm">{{ item.payload.sectorId }}</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ formatDateTime(item.createdAt) }}</p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span
                  class="rounded-md px-2 py-1 text-xs font-bold"
                  :class="getQueueStatusClass(item)"
                >
                  {{ getQueueStatusLabel(item) }}
                </span>
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <div v-if="item.lastError" class="mt-3 rounded-md bg-error-500/10 p-3 text-xs text-error-800">
                <p class="font-bold">{{ item.lastError }}</p>
                <p class="mt-1">{{ getQueueActionCopy('tournament-request') }}</p>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton to="/sutaze" icon="i-heroicons-pencil-square" size="xs" variant="soft">
                  Skontrolovať
                </UButton>
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  size="xs"
                  variant="ghost"
                  @click="discardQueuedItem('tournament-request', item.id)"
                >
                  Odstrániť
                </UButton>
              </div>
            </div>
          </div>
          <AppState
            v-else
            title="Bez čakajúcich hlásení"
            description="Súťažný formulár nemá v tomto zariadení uložený offline odosielací rad."
          />
        </section>
      </div>

      <div class="mt-8 grid gap-4 md:grid-cols-2">
        <NuxtLink
          v-for="item in offlineItems"
          :key="item.to"
          :to="item.to"
          class="rounded-card border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-sm"
        >
          <div class="flex items-start gap-3">
            <div class="rounded-full bg-primary-50 p-2 text-primary-700">
              <UIcon :name="item.icon" class="h-5 w-5" />
            </div>
            <div>
              <h3 class="font-bold">{{ item.label }}</h3>
              <p class="text-foreground-muted mt-1 text-sm">{{ item.description }}</p>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
