<script setup lang="ts">
import { placeIssueCategoryLabels } from '~/data/pond'
import type { CatchSubmissionSuccess } from '~/services/catchApiService'
import type { PlaceIssueSubmissionSuccess } from '~/services/placeIssueService'
import type { ReservationSubmissionSuccess } from '~/services/reservationApiService'
import type {
  TournamentActionSuccess,
  TournamentCatchVerificationSuccess,
  TournamentPenaltySubmissionSuccess,
  TournamentRequestSubmissionSuccess,
  TournamentRuleCheckSubmissionSuccess,
} from '~/services/tournamentApiService'
import {
  getOfflineCatchQueueErrorMessage,
  markOfflineCatchAttempt,
  readOfflineCatchQueue,
  removeOfflineCatch,
  type OfflineCatchQueueItem,
} from '~/services/offlineCatchQueueService'
import {
  getOfflinePlaceIssueQueueErrorMessage,
  markOfflinePlaceIssueAttempt,
  readOfflinePlaceIssueQueue,
  removeOfflinePlaceIssue,
  type OfflinePlaceIssueQueueItem,
} from '~/services/offlinePlaceIssueQueueService'
import {
  getOfflineReservationQueueErrorMessage,
  markOfflineReservationAttempt,
  readOfflineReservationQueue,
  removeOfflineReservation,
  type OfflineReservationQueueItem,
} from '~/services/offlineReservationQueueService'
import {
  getOfflineTournamentAdminActionQueueErrorMessage,
  markOfflineTournamentAdminActionAttempt,
  readOfflineTournamentAdminActionQueue,
  removeOfflineTournamentAdminAction,
  withTournamentAdminActionClientMutationId,
  type OfflineTournamentAdminActionQueueItem,
} from '~/services/offlineTournamentAdminActionQueueService'
import {
  getOfflineTournamentRequestQueueErrorMessage,
  markOfflineTournamentRequestAttempt,
  readOfflineTournamentRequestQueue,
  removeOfflineTournamentRequest,
  type OfflineTournamentRequestQueueItem,
} from '~/services/offlineTournamentRequestQueueService'

useHead({ title: 'Offline režim' })

interface QueueSection {
  count: number
  description: string
  icon: string
  label: string
  to: string
}

interface OfflineItem {
  actionLabel: string
  description: string
  icon: string
  label: string
  tag: string
  to: string
}

type NoticeTone = 'error' | 'info' | 'success' | 'warning'

const {
  getLakeName,
  getPegLabel,
  mapFacilities,
  tournamentPenaltyTypeLabels,
  tournamentRequestTypeLabels,
} = usePondData()

const offlineReservations = ref<OfflineReservationQueueItem[]>([])
const offlineCatches = ref<OfflineCatchQueueItem[]>([])
const offlinePlaceIssues = ref<OfflinePlaceIssueQueueItem[]>([])
const offlineTournamentRequests = ref<OfflineTournamentRequestQueueItem[]>([])
const offlineTournamentAdminActions = ref<OfflineTournamentAdminActionQueueItem[]>([])
const isOnline = ref(true)
const queueLoadError = ref('')
const syncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const syncMessage = ref('')
const { user } = useMockAuth()
const currentRole = computed(() => user.value?.role ?? null)

const offlineItems: OfflineItem[] = [
  {
    actionLabel: 'Otvoriť mapu',
    description: 'Lovné miesta, chaty a orientácia pri vode ostávajú dostupné z poslednej načítanej verzie.',
    icon: 'i-heroicons-map',
    label: 'Mapa revíru',
    tag: 'orientácia',
    to: '/mapa',
  },
  {
    actionLabel: 'Skontrolovať termín',
    description: 'Rozpracovaný výber termínu si skontroluj po návrate signálu pred odoslaním žiadosti.',
    icon: 'i-heroicons-calendar-days',
    label: 'Rezervácie',
    tag: 'termíny',
    to: '/rezervacie',
  },
  {
    actionLabel: 'Pozrieť oznamy',
    description: 'Búrkové výstrahy a servisné oznamy sa obnovia pri najbližšom pripojení.',
    icon: 'i-heroicons-bell-alert',
    label: 'Výstrahy',
    tag: 'bezpečnosť',
    to: '/notifikacie',
  },
  {
    actionLabel: 'Kontaktovať správcu',
    description: 'Telefón na správcu je dobré mať poruke aj mimo dátového signálu.',
    icon: 'i-heroicons-phone',
    label: 'Kontakt',
    tag: 'pomoc',
    to: '/kontakt',
  },
]

const canSeeTournamentRequests = computed(() =>
  currentRole.value === 'team' || canOperateAdminModule(currentRole.value, 'tournaments'),
)
const canSeeAdminTournamentActions = computed(() =>
  canOperateAdminModule(currentRole.value, 'tournaments'),
)
const visibleTournamentRequests = computed(() =>
  canSeeTournamentRequests.value ? offlineTournamentRequests.value : [],
)
const visibleTournamentAdminActions = computed(() =>
  canSeeAdminTournamentActions.value ? offlineTournamentAdminActions.value : [],
)

const totalQueued = computed(() =>
  offlineReservations.value.length +
  offlineCatches.value.length +
  offlinePlaceIssues.value.length +
  visibleTournamentRequests.value.length +
  visibleTournamentAdminActions.value.length,
)
const hasQueuedItems = computed(() => totalQueued.value > 0)
const issueCount = computed(() =>
  offlineReservations.value.filter((item) => item.lastError).length +
  offlineCatches.value.filter((item) => item.lastError).length +
  offlinePlaceIssues.value.filter((item) => item.lastError).length +
  visibleTournamentRequests.value.filter((item) => item.lastError).length +
  visibleTournamentAdminActions.value.filter((item) => item.lastError).length,
)
const offlineNoticeTitle = computed(() => {
  if (!isOnline.value) return 'Bez pripojenia'
  if (totalQueued.value > 0) return 'Čakajúce položky v zariadení'
  return 'Offline režim je pripravený'
})
const offlineNoticeDescription = computed(() => {
  if (!isOnline.value) {
    return 'Položky ostávajú bezpečne uložené v tomto zariadení a odošlú sa po návrate signálu.'
  }
  if (totalQueued.value > 0) {
    return 'Niektoré údaje môžu byť staršie. Pred odoslaním skontroluj položky, ktoré čakajú vo fronte.'
  }
  return 'Mapa, kontakty a posledné načítané údaje ostávajú dostupné aj pri slabom signáli.'
})
const offlineNoticeTone = computed<NoticeTone>(() => {
  if (!isOnline.value) return 'warning'
  if (totalQueued.value > 0) return 'info'
  return 'success'
})
const offlineNoticeIcon = computed(() =>
  isOnline.value ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash',
)
const syncNoticeTitle = computed(() => {
  if (queueLoadError.value) return 'Čakajúce položky sa nepodarilo načítať'
  if (syncStatus.value === 'syncing') return 'Odosielam čakajúce položky'
  if (syncStatus.value === 'error') return 'Odoslanie sa nedokončilo'
  if (syncStatus.value === 'success') return 'Offline fronta je spracovaná'
  return 'Stav offline fronty'
})
const syncNoticeTone = computed<NoticeTone>(() => {
  if (queueLoadError.value || syncStatus.value === 'error') return 'error'
  if (syncStatus.value === 'syncing') return 'info'
  if (syncStatus.value === 'success') return 'success'
  return 'warning'
})
const queueOverviewTitle = computed(() => {
  if (issueCount.value > 0) return 'Niečo čaká na kontrolu'
  if (hasQueuedItems.value) return 'Čakajúce odoslania'

  return 'Zariadenie je zosynchronizované'
})
const queueOverviewDescription = computed(() => {
  if (issueCount.value > 0) {
    return 'Otvorte príslušný formulár, skontrolujte údaje a odošlite položky znova po návrate signálu.'
  }
  if (hasQueuedItems.value) {
    return 'Tieto položky sú uložené iba v tomto zariadení. Po pripojení ich odošlite správcovi alebo do súťažnej prevádzky.'
  }

  return 'V tomto zariadení nie sú žiadne neodoslané rezervácie, úlovky, hlásenia ani súťažné úkony.'
})
const queueOverviewTone = computed<NoticeTone>(() => {
  if (issueCount.value > 0) return 'warning'
  if (hasQueuedItems.value) return 'info'

  return 'success'
})

const queueSections = computed<QueueSection[]>(() => {
  const sections: QueueSection[] = [
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
      count: offlinePlaceIssues.value.length,
      description: 'Nedostatky na lovných miestach, chatách a servisných bodoch čakajúce na odoslanie.',
      icon: 'i-heroicons-wrench-screwdriver',
      label: 'Nedostatky',
      to: '/mapa',
    },
  ]

  if (canSeeTournamentRequests.value) {
    sections.push({
      count: visibleTournamentRequests.value.length,
      description: 'Privolanie kontrolóra, hlásenie porušenia alebo technická pomoc počas súťaže.',
      icon: 'i-heroicons-flag',
      label: 'Súťažné hlásenia',
      to: currentRole.value === 'team' ? '/sutaze/tim' : '/admin/sutaze',
    })
  }

  if (canSeeAdminTournamentActions.value) {
    sections.push({
      count: visibleTournamentAdminActions.value.length,
      description: 'Prevzatie hlásení, váženia, tresty a kontroly sektorov čakajúce na odoslanie.',
      icon: 'i-heroicons-clipboard-document-check',
      label: 'Kontrolórske úkony',
      to: currentRole.value === 'marshal' ? '/admin/sutaze/kontrolor' : '/admin/sutaze',
    })
  }

  return sections
})

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}

function getQueueFallbackErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Čakajúce položky sa nepodarilo načítať.'
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

function getQueueStatusTone(item: { attempts: number, lastError?: string }) {
  if (item.lastError) return 'error'
  if (item.attempts > 0) return 'warning'

  return 'primary'
}

function getQueueStatusIcon(item: { attempts: number, lastError?: string }) {
  if (item.lastError) return 'i-heroicons-exclamation-triangle'
  if (item.attempts > 0) return 'i-heroicons-arrow-path'

  return 'i-heroicons-clock'
}

function getQueueActionCopy(
  kind: 'admin-tournament-action' | 'catch' | 'place-issue' | 'reservation' | 'tournament-request',
) {
  if (kind === 'reservation') {
    return 'Skontroluj termín, miesto alebo dostupnosť výbavy v rezervačnom formulári.'
  }
  if (kind === 'catch') {
    return 'Skontroluj jazero, lovné miesto alebo väzbu na zápisník v denníku úlovkov.'
  }
  if (kind === 'place-issue') {
    return 'Skontroluj jazero, miesto, servisný bod alebo popis nedostatku na mape.'
  }
  if (kind === 'admin-tournament-action') {
    return 'Skontroluj súťažný stav, sektor, kontrolóra alebo konkrétny úlovok v pracovnom súťažnom paneli.'
  }

  return 'Skontroluj sektor, typ hlásenia alebo popis v súťažnom formulári.'
}

function getPlaceIssueTargetLabel(item: OfflinePlaceIssueQueueItem) {
  if (item.payload.targetType === 'lake') return getLakeName(item.payload.lake)
  if (item.payload.targetType === 'peg' && item.payload.targetId) return getPegLabel(item.payload.targetId)

  return mapFacilities.find((facility) => facility.id === item.payload.targetId)?.label ??
    item.payload.targetId ??
    getLakeName(item.payload.lake)
}

function getAdminTournamentActionLabel(item: OfflineTournamentAdminActionQueueItem) {
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

function getAdminTournamentActionTarget(item: OfflineTournamentAdminActionQueueItem) {
  if (item.payload.kind === 'request-action') {
    return `hlásenie ${item.payload.payload.requestId}`
  }
  if (item.payload.kind === 'catch-verification') {
    return `úlovok ${item.payload.payload.catchId}`
  }

  return `sektor ${item.payload.payload.sectorId.toUpperCase()}`
}

async function refreshOfflineQueues() {
  if (!import.meta.client) return

  try {
    const [reservations, catches, placeIssues, tournamentRequests, tournamentAdminActions] = await Promise.all([
      readOfflineReservationQueue(),
      readOfflineCatchQueue(),
      readOfflinePlaceIssueQueue(),
      canSeeTournamentRequests.value ? readOfflineTournamentRequestQueue() : Promise.resolve([]),
      canSeeAdminTournamentActions.value ? readOfflineTournamentAdminActionQueue() : Promise.resolve([]),
    ])

    offlineReservations.value = reservations
    offlineCatches.value = catches
    offlinePlaceIssues.value = placeIssues
    offlineTournamentRequests.value = tournamentRequests
    offlineTournamentAdminActions.value = tournamentAdminActions
    queueLoadError.value = ''
  }
  catch (error) {
    queueLoadError.value = getQueueFallbackErrorMessage(error)
  }
}

async function discardQueuedItem(
  kind: 'admin-tournament-action' | 'catch' | 'place-issue' | 'reservation' | 'tournament-request',
  id: string,
) {
  try {
    if (kind === 'reservation') {
      await removeOfflineReservation(id)
    }
    else if (kind === 'catch') {
      await removeOfflineCatch(id)
    }
    else if (kind === 'place-issue') {
      await removeOfflinePlaceIssue(id)
    }
    else if (kind === 'tournament-request') {
      await removeOfflineTournamentRequest(id)
    }
    else {
      await removeOfflineTournamentAdminAction(id)
    }

    await refreshOfflineQueues()
    syncStatus.value = 'success'
    syncMessage.value = 'Položka bola odstránená z čakajúcich odoslaní v tomto zariadení.'
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
    syncMessage.value = 'V zariadení nič nečaká na odoslanie.'
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

  for (const item of [...offlinePlaceIssues.value]) {
    try {
      await $fetch<PlaceIssueSubmissionSuccess>('/api/place-issues', {
        body: item.payload,
        method: 'POST',
      })
      await removeOfflinePlaceIssue(item.id)
      syncedCount += 1
    }
    catch (error) {
      await markOfflinePlaceIssueAttempt(item.id, getOfflinePlaceIssueQueueErrorMessage(error))
    }
  }

  for (const item of [...visibleTournamentRequests.value]) {
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

  for (const item of [...visibleTournamentAdminActions.value]) {
    try {
      const payload = withTournamentAdminActionClientMutationId(item.payload, { id: item.id })

      if (payload.kind === 'request-action') {
        await $fetch<TournamentActionSuccess>(`/api/admin/tournaments/requests/${payload.payload.requestId}/action`, {
          body: {
            action: payload.payload.action,
            clientMutationId: payload.payload.clientMutationId,
            marshalId: payload.payload.marshalId,
          },
          method: 'POST',
        })
      }
      else if (payload.kind === 'catch-verification') {
        await $fetch<TournamentCatchVerificationSuccess>(
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
      else if (payload.kind === 'penalty') {
        await $fetch<TournamentPenaltySubmissionSuccess>('/api/admin/tournaments/penalties', {
          body: payload.payload,
          method: 'POST',
        })
      }
      else {
        await $fetch<TournamentRuleCheckSubmissionSuccess>('/api/admin/tournaments/rule-checks', {
          body: payload.payload,
          method: 'POST',
        })
      }
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

watch(currentRole, () => {
  void refreshOfflineQueues()
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
      eyebrow="Bez pripojenia"
      title="Offline režim"
      description="Aj pri slabom signále môžete pracovať s naposledy načítanými údajmi a skontrolovať položky, ktoré čakajú na odoslanie."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DataStatusNotice
            class="flex-1"
            :description="offlineNoticeDescription"
            :icon="offlineNoticeIcon"
            :title="offlineNoticeTitle"
            :tone="offlineNoticeTone"
          />
          <UButton
            icon="i-heroicons-cloud-arrow-up"
            color="primary"
            variant="soft"
            :disabled="!isOnline || syncStatus === 'syncing' || totalQueued === 0"
            :loading="syncStatus === 'syncing'"
            @click="syncAllQueues"
          >
            Odoslať čakajúce
          </UButton>
        </div>
      </div>

      <section class="mt-8">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 class="text-2xl font-black tracking-normal text-foreground">Dostupné aj bez signálu</h2>
            <p class="text-foreground-muted mt-2 max-w-3xl text-sm leading-6">
              Tieto časti aplikácie majú zmysel otvoriť aj pri slabom internete. Po návrate pripojenia sa údaje obnovia.
            </p>
          </div>
          <StatusBadge
            :icon="isOnline ? 'i-heroicons-signal' : 'i-heroicons-signal-slash'"
            :label="isOnline ? 'online' : 'offline'"
            :tone="isOnline ? 'success' : 'warning'"
            size="xs"
          />
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NuxtLink
            v-for="item in offlineItems"
            :key="item.to"
            :to="item.to"
            class="rounded-card border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-sm"
          >
            <div class="flex items-start gap-3">
              <div class="rounded-md bg-primary-50 p-2 text-primary-700">
                <UIcon :name="item.icon" class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-bold text-foreground">{{ item.label }}</h3>
                  <StatusBadge :label="item.tag" tone="neutral" size="xs" />
                </div>
                <p class="text-foreground-muted mt-2 text-sm leading-6">{{ item.description }}</p>
                <p class="text-primary-700 mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                  {{ item.actionLabel }}
                  <UIcon name="i-heroicons-arrow-right" class="h-4 w-4" />
                </p>
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="mt-8 space-y-4">
        <DataStatusNotice
          :description="queueOverviewDescription"
          icon="i-heroicons-inbox-stack"
          :title="queueOverviewTitle"
          :tone="queueOverviewTone"
        />

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
      </section>

      <DataStatusNotice
        v-if="queueLoadError || syncMessage"
        class="mt-6"
        :description="queueLoadError || syncMessage"
        :loading="syncStatus === 'syncing'"
        :title="syncNoticeTitle"
        :tone="syncNoticeTone"
      />

      <DataStatusNotice
        v-if="issueCount > 0"
        class="mt-6"
        description="Odoslanie zlyhalo alebo sa zmenila dostupnosť. Otvor príslušný formulár, uprav údaje a potom položku odstráň z čakajúcich odoslaní alebo ju skús odoslať znova."
        icon="i-heroicons-exclamation-triangle"
        title="Niektoré položky sa neodoslali"
        tone="warning"
      />

      <div class="mt-8 grid gap-6 lg:grid-cols-2 xl:grid-cols-5">
        <section class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Rezervácie</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Miesto, termín, výbava a doplnky čakajúce na odoslanie správcovi.
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
                <StatusBadge
                  size="xs"
                  :icon="getQueueStatusIcon(item)"
                  :label="getQueueStatusLabel(item)"
                  :tone="getQueueStatusTone(item)"
                />
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <DataStatusNotice
                v-if="item.lastError"
                class="mt-3"
                :description="getQueueActionCopy('reservation')"
                icon="i-heroicons-exclamation-triangle"
                :title="item.lastError"
                tone="error"
              />
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  :to="{ path: '/rezervacie', query: { cakajuca: item.id } }"
                  icon="i-heroicons-pencil-square"
                  size="xs"
                  variant="soft"
                >
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
            description="Rezervačný formulár nemá v tomto zariadení uloženú neodoslanú žiadosť."
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
                <StatusBadge
                  size="xs"
                  :icon="getQueueStatusIcon(item)"
                  :label="getQueueStatusLabel(item)"
                  :tone="getQueueStatusTone(item)"
                />
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <DataStatusNotice
                v-if="item.lastError"
                class="mt-3"
                :description="getQueueActionCopy('catch')"
                icon="i-heroicons-exclamation-triangle"
                :title="item.lastError"
                tone="error"
              />
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
            description="Denník úlovkov nemá v tomto zariadení uložený neodoslaný zápis."
          />
        </section>

        <section class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Nedostatky</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Problémy na miestach, chatách a servisných bodoch čakajúce na správcu.
              </p>
            </div>
            <UButton to="/mapa" icon="i-heroicons-plus" size="sm" variant="soft">
              Pridať
            </UButton>
          </div>

          <div v-if="offlinePlaceIssues.length" class="mt-4 space-y-3">
            <div
              v-for="item in offlinePlaceIssues"
              :key="item.id"
              class="rounded-md border bg-white p-3"
              :class="item.lastError ? 'border-error-500/30' : 'border-border'"
            >
              <div class="min-w-0">
                <p class="truncate font-bold">{{ item.payload.title }}</p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ placeIssueCategoryLabels[item.payload.category] }} · {{ getPlaceIssueTargetLabel(item) }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">{{ formatDateTime(item.createdAt) }}</p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge
                  size="xs"
                  :icon="getQueueStatusIcon(item)"
                  :label="getQueueStatusLabel(item)"
                  :tone="getQueueStatusTone(item)"
                />
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <DataStatusNotice
                v-if="item.lastError"
                class="mt-3"
                :description="getQueueActionCopy('place-issue')"
                icon="i-heroicons-exclamation-triangle"
                :title="item.lastError"
                tone="error"
              />
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton to="/mapa" icon="i-heroicons-pencil-square" size="xs" variant="soft">
                  Skontrolovať
                </UButton>
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  size="xs"
                  variant="ghost"
                  @click="discardQueuedItem('place-issue', item.id)"
                >
                  Odstrániť
                </UButton>
              </div>
            </div>
          </div>
          <AppState
            v-else
            title="Bez čakajúcich nedostatkov"
            description="Mapa revíru nemá v tomto zariadení uložené čakajúce hlásenia."
          />
        </section>

        <section v-if="canSeeTournamentRequests" class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Súťažné hlásenia</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Požiadavky tímu čakajúce na odoslanie do súťažnej prevádzky.
              </p>
            </div>
            <UButton
              :to="currentRole === 'team' ? '/sutaze/tim' : '/admin/sutaze'"
              icon="i-heroicons-plus"
              size="sm"
              variant="soft"
            >
              Pridať
            </UButton>
          </div>

          <div v-if="visibleTournamentRequests.length" class="mt-4 space-y-3">
            <div
              v-for="item in visibleTournamentRequests"
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
                <StatusBadge
                  size="xs"
                  :icon="getQueueStatusIcon(item)"
                  :label="getQueueStatusLabel(item)"
                  :tone="getQueueStatusTone(item)"
                />
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <DataStatusNotice
                v-if="item.lastError"
                class="mt-3"
                :description="getQueueActionCopy('tournament-request')"
                icon="i-heroicons-exclamation-triangle"
                :title="item.lastError"
                tone="error"
              />
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  :to="currentRole === 'team' ? '/sutaze/tim' : '/admin/sutaze'"
                  icon="i-heroicons-pencil-square"
                  size="xs"
                  variant="soft"
                >
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
            description="V tomto zariadení nie sú uložené žiadne neodoslané súťažné hlásenia."
          />
        </section>

        <section v-if="canSeeAdminTournamentActions" class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Kontrolórske úkony</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Prevzatia hlásení, váženia, tresty a kontroly sektorov čakajúce na odoslanie.
              </p>
            </div>
            <UButton
              :to="currentRole === 'marshal' ? '/admin/sutaze/kontrolor' : '/admin/sutaze'"
              icon="i-heroicons-shield-check"
              size="sm"
              variant="soft"
            >
              Otvoriť
            </UButton>
          </div>

          <div v-if="visibleTournamentAdminActions.length" class="mt-4 space-y-3">
            <div
              v-for="item in visibleTournamentAdminActions"
              :key="item.id"
              class="rounded-md border bg-white p-3"
              :class="item.lastError ? 'border-error-500/30' : 'border-border'"
            >
              <div class="min-w-0">
                <p class="truncate font-bold">{{ getAdminTournamentActionLabel(item) }}</p>
                <p class="text-foreground-muted mt-1 text-sm">{{ getAdminTournamentActionTarget(item) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ formatDateTime(item.createdAt) }}</p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge
                  size="xs"
                  :icon="getQueueStatusIcon(item)"
                  :label="getQueueStatusLabel(item)"
                  :tone="getQueueStatusTone(item)"
                />
                <span class="text-foreground-muted text-xs font-semibold">
                  {{ getAttemptLabel(item.attempts) }}
                </span>
              </div>
              <DataStatusNotice
                v-if="item.lastError"
                class="mt-3"
                :description="getQueueActionCopy('admin-tournament-action')"
                icon="i-heroicons-exclamation-triangle"
                :title="item.lastError"
                tone="error"
              />
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  :to="currentRole === 'marshal' ? '/admin/sutaze/kontrolor' : '/admin/sutaze'"
                  icon="i-heroicons-pencil-square"
                  size="xs"
                  variant="soft"
                >
                  Skontrolovať
                </UButton>
                <UButton
                  icon="i-heroicons-trash"
                  color="error"
                  size="xs"
                  variant="ghost"
                  @click="discardQueuedItem('admin-tournament-action', item.id)"
                >
                  Odstrániť
                </UButton>
              </div>
            </div>
          </div>
          <AppState
            v-else
            title="Bez čakajúcich kontrolórskych úkonov"
            description="V tomto zariadení nie sú uložené žiadne neodoslané kontrolórske úkony."
          />
        </section>
      </div>
    </section>
  </div>
</template>
