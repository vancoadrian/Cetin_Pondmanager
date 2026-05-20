<script setup lang="ts">
import type { TournamentRequest } from '~/data/pond'
import type {
  TournamentRequestSubmissionSuccess,
  TournamentStateResponse,
} from '~/services/tournamentApiService'
import { getValidationMessages, tournamentRequestInputSchema } from '~/schemas/pondSchemas'
import {
  enqueueOfflineTournamentRequest,
  getOfflineTournamentRequestQueueErrorMessage,
  markOfflineTournamentRequestAttempt,
  readOfflineTournamentRequestQueue,
  removeOfflineTournamentRequest,
  shouldQueueTournamentRequestSubmission,
  type OfflineTournamentRequestPayload,
  type OfflineTournamentRequestQueueItem,
} from '~/services/offlineTournamentRequestQueueService'

useHead({ title: 'Súťaže' })

const {
  getLakeName,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentMarshalStatusLabels,
  tournamentPenalties: seedTournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests: seedTournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks: seedTournamentRuleChecks,
} = usePondData()

const fallbackTournamentState = (): TournamentStateResponse => ({
  ok: true,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournaments: seedTournaments,
  updatedAt: 'seed',
})
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'public-tournament-state',
  () => $fetch<TournamentStateResponse>('/api/tournaments'),
  {
    default: fallbackTournamentState,
  },
)

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
const liveTournamentMarshals = computed(() => tournamentState.value?.tournamentMarshals ?? seedTournamentMarshals)
const liveTournamentPenalties = computed(() => tournamentState.value?.tournamentPenalties ?? seedTournamentPenalties)
const liveTournamentRequests = computed(() => tournamentState.value?.tournamentRequests ?? seedTournamentRequests)
const liveTournamentRuleChecks = computed(() => tournamentState.value?.tournamentRuleChecks ?? seedTournamentRuleChecks)
const activeTournament = computed(() => liveTournaments.value[0] ?? seedTournaments[0]!)
const requestForm = reactive<{
  sectorId: string
  type: TournamentRequest['type']
  description: string
}>({
  sectorId: activeTournament.value.sectors[1]?.id ?? activeTournament.value.sectors[0]?.id ?? '',
  type: 'catch-measurement',
  description: '',
})
const requestSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const requestSubmitMessage = ref('')
const offlineRequestQueue = ref<OfflineTournamentRequestQueueItem[]>([])
const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineSyncMessage = ref('')
const isOnline = ref(true)
let offlineSyncInProgress = false

const requestTypeOptions = Object.entries(tournamentRequestTypeLabels) as [
  TournamentRequest['type'],
  string,
][]
const requestValidation = computed(() =>
  tournamentRequestInputSchema.safeParse({
    description: requestForm.description,
    sectorId: requestForm.sectorId,
    tournamentId: activeTournament.value.id,
    type: requestForm.type,
  }),
)
const requestValidationMessages = computed(() => getValidationMessages(requestValidation.value))

const activeRequests = computed(() =>
  liveTournamentRequests.value.filter(
    (request) => request.tournamentId === activeTournament.value.id && request.status !== 'resolved',
  ),
)
const pendingMeasurements = computed(() =>
  liveTournamentCatches.value.filter(
    (catchItem) => catchItem.tournamentId === activeTournament.value.id && catchItem.status === 'waiting',
  ),
)
const activePenalties = computed(() =>
  liveTournamentPenalties.value.filter(
    (penalty) => penalty.tournamentId === activeTournament.value.id && penalty.status === 'active',
  ),
)
const totalWeight = computed(() =>
  activeTournament.value.sectors.reduce((sum, sector) => sum + sector.weightKg, 0),
)
const selectedSector = computed(() =>
  activeTournament.value.sectors.find((sector) => sector.id === requestForm.sectorId),
)
const selectedMarshal = computed(() =>
  liveTournamentMarshals.value.find((marshal) => marshal.assignedSectorIds.includes(requestForm.sectorId)),
)

const sectorById = (id: string) =>
  activeTournament.value.sectors.find((sector) => sector.id === id)

const marshalById = (id?: string) =>
  liveTournamentMarshals.value.find((marshal) => marshal.id === id)

const requestsForSector = (sectorId: string) =>
  activeRequests.value.filter((request) => request.sectorId === sectorId)

const hasActivePenalty = (sectorId: string) =>
  activePenalties.value.some((penalty) => penalty.sectorId === sectorId)

const requestStatusClass = (status: TournamentRequest['status']) => {
  switch (status) {
    case 'new':
      return 'bg-error-500/10 text-error-700'
    case 'assigned':
      return 'bg-warning-500/10 text-warning-700'
    case 'resolved':
      return 'bg-success-500/10 text-success-700'
    default:
      return 'bg-muted text-foreground-muted'
  }
}

const catchStatusLabel = (status: string) => {
  switch (status) {
    case 'waiting':
      return 'čaká na kontrolóra'
    case 'verified':
      return 'overené'
    case 'disputed':
      return 'sporné'
    default:
      return status
  }
}

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

  return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Hlásenie sa nepodarilo uložiť.'
}

const getQueueFallbackErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Offline hlásenie sa nepodarilo uložiť v zariadení.'

async function refreshOfflineRequestQueue() {
  if (!import.meta.client) return

  try {
    offlineRequestQueue.value = await readOfflineTournamentRequestQueue()
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function queueOfflineRequest(payload: OfflineTournamentRequestPayload) {
  try {
    const item = await enqueueOfflineTournamentRequest(payload)

    await refreshOfflineRequestQueue()
    requestSubmitStatus.value = 'success'
    requestSubmitMessage.value = `Slabý signál: hlásenie je uložené v tomto zariadení a odošle sa automaticky. Fronta: ${item.id}.`
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = `Vo fronte čaká ${offlineRequestQueue.value.length} súťažné hlásenie.`
    requestForm.description = ''
  }
  catch (error) {
    requestSubmitStatus.value = 'error'
    requestSubmitMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function discardOfflineRequest(id: string) {
  try {
    await removeOfflineTournamentRequest(id)
    await refreshOfflineRequestQueue()
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = 'Offline hlásenie bolo odstránené zo zariadenia.'
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function syncOfflineRequestQueue(options: { silent?: boolean } = {}) {
  if (!import.meta.client || offlineSyncInProgress) return

  isOnline.value = navigator.onLine
  if (!isOnline.value) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = 'Bez pripojenia nechávam hlásenia bezpečne v zariadení.'
    return
  }

  await refreshOfflineRequestQueue()
  if (offlineRequestQueue.value.length === 0) {
    if (!options.silent) {
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = 'Offline fronta hlásení je prázdna.'
    }
    return
  }

  offlineSyncInProgress = true
  offlineSyncStatus.value = 'syncing'
  offlineSyncMessage.value = `Odosielam ${offlineRequestQueue.value.length} offline hlásení.`

  let syncedCount = 0

  try {
    for (const queuedRequest of [...offlineRequestQueue.value]) {
      try {
        await $fetch<TournamentRequestSubmissionSuccess>('/api/tournament-requests', {
          body: queuedRequest.payload,
          method: 'POST',
        })
        await removeOfflineTournamentRequest(queuedRequest.id)
        syncedCount += 1
      }
      catch (error) {
        await markOfflineTournamentRequestAttempt(
          queuedRequest.id,
          getOfflineTournamentRequestQueueErrorMessage(error),
        )
      }
    }

    await refreshOfflineRequestQueue()
    if (syncedCount > 0) {
      await refreshTournamentState()
    }

    offlineSyncStatus.value = offlineRequestQueue.value.length > 0 ? 'error' : 'success'
    offlineSyncMessage.value = offlineRequestQueue.value.length > 0
      ? `${syncedCount} hlásení odoslaných, ${offlineRequestQueue.value.length} čaká na ďalší pokus.`
      : `${syncedCount} offline hlásení bolo odoslaných do dispečingu.`
  }
  finally {
    offlineSyncInProgress = false
  }
}

const submitRequest = async () => {
  const validation = requestValidation.value
  if (!validation.success) {
    requestSubmitStatus.value = 'error'
    requestSubmitMessage.value = requestValidationMessages.value[0] ?? 'Skontrolujte hlásenie.'
    return
  }

  requestSubmitStatus.value = 'submitting'
  requestSubmitMessage.value = ''

  try {
    const result = await $fetch<TournamentRequestSubmissionSuccess>('/api/tournament-requests', {
      body: validation.data,
      method: 'POST',
    })

    requestSubmitStatus.value = 'success'
    requestSubmitMessage.value = `${result.message} ID: ${result.request.id}.`
    requestForm.description = ''
    await refreshTournamentState()
  }
  catch (error) {
    const payload: OfflineTournamentRequestPayload = validation.data

    if (import.meta.client && shouldQueueTournamentRequestSubmission(error, navigator.onLine)) {
      await queueOfflineRequest(payload)
      return
    }

    requestSubmitStatus.value = 'error'
    requestSubmitMessage.value = getApiErrorMessage(error)
  }
}

function handleOnline() {
  isOnline.value = true
  void syncOfflineRequestQueue({ silent: true })
}

function handleOffline() {
  isOnline.value = false
  offlineSyncStatus.value = 'idle'
  offlineSyncMessage.value = 'Signál vypadol. Nové súťažné hlásenia sa uložia v zariadení.'
}

onMounted(() => {
  if (!import.meta.client) return

  isOnline.value = navigator.onLine
  void refreshOfflineRequestQueue().then(() => {
    if (navigator.onLine && offlineRequestQueue.value.length > 0) {
      void syncOfflineRequestQueue({ silent: true })
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

watch(requestValidation, () => {
  if (requestSubmitStatus.value !== 'submitting') {
    requestSubmitStatus.value = 'idle'
    requestSubmitMessage.value = ''
  }
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Súťaže"
      title="Dispečing kontrolórov, merania a trestov"
      description="Tím vie privolať kontrolóra k úlovku alebo nahlásiť porušenie. Kontrolór má sektory, kontroly, váženia a disciplinárne zásahy na jednom mieste."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="border-border bg-surface overflow-hidden rounded-card border">
          <div class="border-border flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-primary-700 text-sm font-semibold">
                {{ getLakeName(activeTournament.lake) }} · {{ activeTournament.dateRange }}
              </p>
              <h2 class="text-2xl font-bold">{{ activeTournament.name }}</h2>
            </div>
            <span class="bg-success-500/10 text-success-700 rounded-md px-3 py-1 text-sm font-bold">
              live
            </span>
          </div>

          <div class="bg-primary-950 relative aspect-[4/3] overflow-hidden">
            <img
              src="/images/velky-cetin-sutazna-mapa.jpg"
              alt="Súťažná mapa Veľký Cetín"
              class="absolute inset-0 h-full w-full object-cover opacity-90"
              loading="lazy"
            >
            <div class="absolute inset-0 bg-linear-to-t from-primary-950/35 to-transparent" />
            <button
              v-for="sector in activeTournament.sectors"
              :key="sector.id"
              type="button"
              class="map-dot-shadow absolute flex h-12 min-w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-accent-400 px-2 text-sm font-black text-primary-950 ring-2 ring-white transition-transform hover:scale-105"
              :class="hasActivePenalty(sector.id) ? 'bg-error-500 text-white' : ''"
              :style="{ left: `${sector.x}%`, top: `${sector.y}%` }"
              :aria-label="sector.label"
              @click="requestForm.sectorId = sector.id"
            >
              {{ sector.label }}
              <span
                v-if="requestsForSector(sector.id).length"
                class="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs text-error-700"
              >
                {{ requestsForSector(sector.id).length }}
              </span>
            </button>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Aktívne hlásenia</p>
              <p class="mt-2 text-3xl font-bold">{{ activeRequests.length }}</p>
            </div>
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Čaká na váženie</p>
              <p class="mt-2 text-3xl font-bold">{{ pendingMeasurements.length }}</p>
            </div>
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Priebežná váha</p>
              <p class="mt-2 text-3xl font-bold">{{ totalWeight }} kg</p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Privolať kontrolóra</h2>
            <div
              v-if="!isOnline || offlineRequestQueue.length > 0 || offlineSyncMessage"
              class="mt-4 rounded-md border p-3"
              :class="
                offlineSyncStatus === 'error' || !isOnline
                  ? 'border-warning-200 bg-warning-500/10 text-warning-900'
                  : 'border-primary-200 bg-primary-50 text-primary-950'
              "
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                      class="h-5 w-5"
                    />
                    <p class="text-sm font-bold">
                      {{ isOnline ? 'Offline fronta hlásení' : 'Bez pripojenia pri sektore' }}
                    </p>
                  </div>
                  <p class="mt-1 text-sm opacity-80">
                    {{ offlineSyncMessage || 'Pri výpadku signálu podržíme hlásenie v zariadení a odošleme ho hneď po návrate internetu.' }}
                  </p>
                </div>
                <UButton
                  v-if="offlineRequestQueue.length > 0"
                  size="sm"
                  icon="i-heroicons-arrow-path"
                  variant="soft"
                  :disabled="!isOnline || offlineSyncStatus === 'syncing'"
                  :loading="offlineSyncStatus === 'syncing'"
                  @click="syncOfflineRequestQueue()"
                >
                  Odoslať
                </UButton>
              </div>

              <div v-if="offlineRequestQueue.length > 0" class="mt-3 space-y-2">
                <div
                  v-for="item in offlineRequestQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ tournamentRequestTypeLabels[item.payload.type] }} ·
                      {{ sectorById(item.payload.sectorId)?.label ?? item.payload.sectorId }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ sectorById(item.payload.sectorId)?.team ?? 'tím čaká na synchronizáciu' }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="text-foreground-muted hover:text-error-700 shrink-0 rounded-md p-1"
                    aria-label="Odstrániť offline hlásenie"
                    @click="discardOfflineRequest(item.id)"
                  >
                    <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <form class="mt-5 space-y-4" @submit.prevent="submitRequest">
              <label class="block">
                <span class="text-sm font-semibold">Sektor tímu</span>
                <select
                  v-model="requestForm.sectorId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                    {{ sector.label }} · {{ sector.team }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <select
                  v-model="requestForm.type"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="[value, label] in requestTypeOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="requestForm.description"
                  rows="3"
                  placeholder="Napr. úlovok pripravený na váženie pri sektore..."
                  class="border-border mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </label>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">{{ selectedSector?.team }}</p>
                <p class="text-foreground-muted mt-1">
                  Sektor {{ selectedSector?.label }} · kontrolór
                  {{ selectedMarshal?.name ?? 'bude priradený dispečingom' }}
                </p>
              </div>

              <ValidationSummary
                :messages="requestValidationMessages"
                valid-title="Hlásenie je pripravené"
                valid-description="Dispečing dostane sektor, typ udalosti a prípadnú poznámku."
              />

              <p
                v-if="requestSubmitMessage"
                class="rounded-md px-3 py-2 text-sm font-semibold"
                :class="
                  requestSubmitStatus === 'success'
                    ? 'bg-success-500/10 text-success-700'
                    : 'bg-error-500/10 text-error-700'
                "
              >
                {{ requestSubmitMessage }}
              </p>

              <UButton
                type="submit"
                icon="i-heroicons-paper-airplane"
                block
                :disabled="!requestValidation.success || requestSubmitStatus === 'submitting'"
                :loading="requestSubmitStatus === 'submitting'"
              >
                Odoslať hlásenie
              </UButton>
            </form>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Kontrolóri a sektory</h2>
            <div class="mt-4 space-y-3">
              <div
                v-for="marshal in liveTournamentMarshals"
                :key="marshal.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map((id) => sectorById(id)?.label ?? id).join(', ') }}
                    </p>
                  </div>
                  <span class="rounded-md bg-primary-50 px-2 py-1 text-xs font-bold text-primary-800">
                    {{ tournamentMarshalStatusLabels[marshal.status] }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Požiadavky tímov</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="request in liveTournamentRequests"
              :key="request.id"
              class="rounded-md border border-border bg-white p-4"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">
                    {{ sectorById(request.sectorId)?.label }} · {{ request.team }}
                  </p>
                  <p class="text-primary-800 text-sm font-semibold">
                    {{ tournamentRequestTypeLabels[request.type] }}
                  </p>
                </div>
                <span
                  class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="requestStatusClass(request.status)"
                >
                  {{ tournamentRequestStatusLabels[request.status] }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{{ request.createdAt }}</span>
                <span v-if="request.assignedMarshalId">
                  kontrolór {{ marshalById(request.assignedMarshalId)?.name }}
                </span>
                <span v-if="request.priority === 'high'" class="font-bold text-error-700">
                  priorita
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Meranie a evidencia úlovkov</h2>
          <div class="mt-4 overflow-hidden rounded-md border border-border">
            <div
              v-for="catchItem in liveTournamentCatches"
              :key="catchItem.id"
              class="grid gap-3 border-b border-border bg-white p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p class="font-bold">
                  {{ catchItem.team }} · {{ sectorById(catchItem.sectorId)?.label }}
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  Chytené {{ catchItem.caughtAt }} · merané {{ catchItem.measuredAt }}
                </p>
                <p class="text-foreground-muted mt-2 text-xs">{{ catchItem.notes }}</p>
              </div>
              <div class="flex flex-row items-center gap-2 md:flex-col md:items-end">
                <span
                  class="rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="
                    catchItem.status === 'verified'
                      ? 'bg-success-500/10 text-success-700'
                      : 'bg-warning-500/10 text-warning-700'
                  "
                >
                  {{ catchStatusLabel(catchItem.status) }}
                </span>
                <span class="text-foreground-muted text-xs">
                  {{ marshalById(catchItem.verifiedByMarshalId)?.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Tresty a napomenutia</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="penalty in liveTournamentPenalties"
              :key="penalty.id"
              class="rounded-md border border-border bg-white p-4"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">
                    {{ sectorById(penalty.sectorId)?.label }} · {{ penalty.team }}
                  </p>
                  <p class="text-error-700 text-sm font-semibold">
                    {{ tournamentPenaltyTypeLabels[penalty.type] }}
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold">
                  {{ penalty.status === 'active' ? 'aktívne' : 'uzavreté' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ penalty.reason }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{{ penalty.issuedAt }}</span>
                <span>kontrolór {{ marshalById(penalty.issuedByMarshalId)?.name }}</span>
                <span v-if="penalty.durationHours">{{ penalty.durationHours }} h</span>
                <span v-if="penalty.rodsLess">-{{ penalty.rodsLess }} prút</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Kontroly pravidiel</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="check in liveTournamentRuleChecks"
              :key="check.id"
              class="rounded-md border border-border bg-white p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-bold">
                    {{ sectorById(check.sectorId)?.label }} · {{ marshalById(check.marshalId)?.name }}
                  </p>
                  <p class="text-foreground-muted text-sm">{{ check.checkedAt }}</p>
                </div>
                <span
                  class="rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="
                    check.result === 'ok'
                      ? 'bg-success-500/10 text-success-700'
                      : check.result === 'warning'
                        ? 'bg-warning-500/10 text-warning-700'
                        : 'bg-error-500/10 text-error-700'
                  "
                >
                  {{ check.result === 'ok' ? 'OK' : check.result === 'warning' ? 'napomenutie' : 'trest' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ check.note }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
