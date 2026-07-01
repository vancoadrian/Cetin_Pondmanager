<script setup lang="ts">
import type { LakeSlug, Peg, PlaceIssueCategory, PlaceIssueTargetType } from '~/data/pond'
import { placeIssueCategoryLabels } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import {
  enqueueOfflinePlaceIssue,
  getOfflinePlaceIssueQueueErrorMessage,
  markOfflinePlaceIssueAttempt,
  readOfflinePlaceIssueQueue,
  removeOfflinePlaceIssue,
  shouldQueuePlaceIssueSubmission,
  type OfflinePlaceIssuePayload,
  type OfflinePlaceIssueQueueItem,
} from '~/services/offlinePlaceIssueQueueService'
import type { PlaceIssueSubmissionSuccess } from '~/services/placeIssueService'
import { getPegAvailability } from '~/utils/availability'
import { resolveAvailabilityDateRange } from '~/utils/availabilityDateRange'

useHead({ title: 'Mapa lovných miest' })

const { lakes, mapFacilities, mapLayers, mapShapes, pegs, reservations } = usePondData()
const route = useRoute()
const router = useRouter()
const { liveClosures } = await useClosureState({ key: 'public-map-closure-state' })

const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const {
  data: mapState,
  error: mapStateError,
  refresh: refreshMapState,
  status: mapStateStatus,
} = await useAsyncData<MapStateResponse>(
  'public-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)

const routeLake = lakes.find((lake) => lake.slug === route.query.jazero)?.slug
const initialDateRange = resolveAvailabilityDateRange(route.query.od, route.query.do)
const selectedLake = ref<LakeSlug>(routeLake ?? 'velky-cetin')
const dateFrom = ref(initialDateRange.dateFrom)
const dateTo = ref(initialDateRange.dateTo)
const showOnlyReservable = ref(route.query.volne === '1')
const selectedPegId = ref(
  pegs.find((peg) => peg.id === route.query.miesto && peg.lake === selectedLake.value)?.id
  ?? pegs.find((peg) => peg.lake === selectedLake.value)?.id
  ?? '',
)
const offlinePlaceIssueQueue = ref<OfflinePlaceIssueQueueItem[]>([])
const isClientOnline = ref(true)
const issueSubmitStatus = ref<'error' | 'idle' | 'submitting' | 'success'>('idle')
const issueSubmitMessage = ref('')
const issueForm = reactive({
  category: 'broken' as PlaceIssueCategory,
  description: '',
  photoLabel: '',
  reporterName: '',
  reporterPhone: '',
  targetKey: 'peg:vc-03',
  title: '',
})

const isMapStateLoading = computed(() => mapStateStatus.value === 'pending')
const hasMapStateError = computed(() => Boolean(mapStateError.value))
const currentLake = computed(() => lakes.find((lake) => lake.slug === selectedLake.value) ?? lakes[0]!)
const livePegs = computed(() => mapState.value.pegs)
const liveMapFacilities = computed(() => mapState.value.mapFacilities)
const liveMapLayers = computed(() => mapState.value.mapLayers)
const liveMapShapes = computed(() => mapState.value.mapShapes)
const activeBackgroundLayer = computed(() =>
  liveMapLayers.value.find(
    (layer) => layer.lake === selectedLake.value && layer.kind === 'background' && layer.enabled,
  ),
)
const activeBackgroundImage = computed(() =>
  activeBackgroundLayer.value?.source ?? currentLake.value.mapImage,
)
const lakePegs = computed(() => livePegs.value.filter((peg) => peg.lake === selectedLake.value))
const publicFacilitiesForLake = computed(() =>
  liveMapFacilities.value.filter((facility) => facility.lake === selectedLake.value && facility.visibility === 'public'),
)
const availabilityRows = computed(() =>
  lakePegs.value.map((peg) => ({
    availability: getPegAvailability(peg, {
      closures: liveClosures.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      reservations,
    }),
    peg,
  })),
)
const visibleAvailabilityRows = computed(() =>
  showOnlyReservable.value
    ? availabilityRows.value.filter((row) => row.availability.reservable)
    : availabilityRows.value,
)
const visiblePegs = computed(() => visibleAvailabilityRows.value.map((row) => row.peg))
const reservableCount = computed(() =>
  availabilityRows.value.filter((row) => row.availability.reservable).length,
)
const selectedPeg = computed(() => lakePegs.value.find((peg) => peg.id === selectedPegId.value))
const selectedAvailability = computed(() =>
  selectedPeg.value
    ? getPegAvailability(selectedPeg.value, {
        closures: liveClosures.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        reservations,
      })
    : undefined,
)
const selectedAvailabilityReason = computed(() =>
  selectedAvailability.value?.reasons[0]
  ?? selectedAvailability.value?.description
  ?? '',
)
const reservationTarget = computed(() => ({
  path: '/rezervacie',
  query: {
    do: dateTo.value,
    jazero: selectedLake.value,
    miesto: selectedPegId.value,
    od: dateFrom.value,
  },
}))

async function retryMapState() {
  await refreshMapState()
}
const issueCategoryOptions = computed(() =>
  Object.entries(placeIssueCategoryLabels).map(([value, label]) => ({
    label,
    value: value as PlaceIssueCategory,
  })),
)
const issueTargetOptions = computed(() => [
  {
    label: currentLake.value.name,
    value: `lake:${selectedLake.value}`,
  },
  ...lakePegs.value.map((peg) => ({
    label: peg.label,
    value: `peg:${peg.id}`,
  })),
  ...publicFacilitiesForLake.value.map((facility) => ({
    label: facility.label,
    value: `facility:${facility.id}`,
  })),
])

watch(selectedLake, () => {
  selectedPegId.value = lakePegs.value[0]?.id ?? ''
  issueForm.targetKey = selectedPegId.value ? `peg:${selectedPegId.value}` : `lake:${selectedLake.value}`
})

watch(visiblePegs, (points) => {
  if (!points.some((point) => point.id === selectedPegId.value)) {
    selectedPegId.value = points[0]?.id ?? ''
  }
})

watch(
  [selectedLake, selectedPegId, dateFrom, dateTo, showOnlyReservable],
  () => {
    if (!import.meta.client) return
    void router.replace({
      query: {
        ...route.query,
        do: dateTo.value,
        jazero: selectedLake.value,
        miesto: selectedPegId.value || undefined,
        od: dateFrom.value,
        volne: showOnlyReservable.value ? '1' : undefined,
      },
    })
  },
)

function selectPeg(peg: Peg) {
  selectedPegId.value = peg.id
  issueForm.targetKey = `peg:${peg.id}`
}

function parseIssueTarget(targetKey: string): { targetId?: string, targetType: PlaceIssueTargetType } {
  const [targetType, targetId] = targetKey.split(':') as [PlaceIssueTargetType, string | undefined]

  return {
    targetId: targetType === 'lake' ? undefined : targetId,
    targetType,
  }
}

function buildPlaceIssuePayload(): OfflinePlaceIssuePayload {
  const target = parseIssueTarget(issueForm.targetKey)

  return {
    category: issueForm.category,
    description: issueForm.description,
    lake: selectedLake.value,
    photoLabel: issueForm.photoLabel,
    reporterName: issueForm.reporterName,
    reporterPhone: issueForm.reporterPhone,
    targetId: target.targetId,
    targetType: target.targetType,
    title: issueForm.title,
  }
}

function resetIssueForm() {
  issueForm.category = 'broken'
  issueForm.description = ''
  issueForm.photoLabel = ''
  issueForm.title = ''
}

function getApiErrorMessage(error: unknown, fallback = 'Hlásenie sa nepodarilo uložiť.') {
  const maybeError = error as {
    data?: {
      data?: { messages?: string[] }
      message?: string
    }
    message?: string
  }
  const messages = maybeError.data?.data?.messages
  if (Array.isArray(messages) && messages.length > 0) return messages.join(' ')

  return maybeError.data?.message ?? maybeError.message ?? fallback
}

async function refreshOfflinePlaceIssueQueue() {
  if (!import.meta.client) return

  offlinePlaceIssueQueue.value = await readOfflinePlaceIssueQueue()
}

let offlinePlaceIssueSyncInProgress = false

async function syncOfflinePlaceIssueQueue(options: { silent?: boolean } = {}) {
  if (!import.meta.client || offlinePlaceIssueSyncInProgress) return

  isClientOnline.value = navigator.onLine
  if (!isClientOnline.value) return

  offlinePlaceIssueSyncInProgress = true
  let syncedCount = 0

  try {
    await refreshOfflinePlaceIssueQueue()

    for (const item of [...offlinePlaceIssueQueue.value]) {
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

    await refreshOfflinePlaceIssueQueue()
    if (!options.silent && syncedCount > 0) {
      issueSubmitStatus.value = offlinePlaceIssueQueue.value.length > 0 ? 'error' : 'success'
      issueSubmitMessage.value = offlinePlaceIssueQueue.value.length > 0
        ? `${syncedCount} hlásení odoslaných, ${offlinePlaceIssueQueue.value.length} čaká na ďalší pokus.`
        : `${syncedCount} čakajúcich hlásení bolo odoslaných.`
    }
  }
  catch (error) {
    if (!options.silent) {
      issueSubmitStatus.value = 'error'
      issueSubmitMessage.value = getApiErrorMessage(error, 'Offline frontu hlásení sa nepodarilo načítať.')
    }
  }
  finally {
    offlinePlaceIssueSyncInProgress = false
  }
}

async function submitPlaceIssue() {
  issueSubmitStatus.value = 'submitting'
  issueSubmitMessage.value = ''
  const payload = buildPlaceIssuePayload()

  try {
    const result = await $fetch<PlaceIssueSubmissionSuccess>('/api/place-issues', {
      body: payload,
      method: 'POST',
    })

    issueSubmitStatus.value = 'success'
    issueSubmitMessage.value = result.message
    resetIssueForm()
    await syncOfflinePlaceIssueQueue({ silent: true })
  }
  catch (error) {
    if (import.meta.client && shouldQueuePlaceIssueSubmission(error, navigator.onLine)) {
      await enqueueOfflinePlaceIssue(payload)
      await refreshOfflinePlaceIssueQueue()
      issueSubmitStatus.value = 'success'
      issueSubmitMessage.value = `Slabý signál: hlásenie je uložené v tomto zariadení a odošle sa automaticky. Čaká ${offlinePlaceIssueQueue.value.length}.`
      resetIssueForm()
      return
    }

    issueSubmitStatus.value = 'error'
    issueSubmitMessage.value = getApiErrorMessage(error)
  }
}

function handleOnline() {
  isClientOnline.value = true
  void syncOfflinePlaceIssueQueue({ silent: true })
}

function handleOffline() {
  isClientOnline.value = false
}

onMounted(() => {
  if (!import.meta.client) return

  isClientOnline.value = navigator.onLine
  void refreshOfflinePlaceIssueQueue()
  if (isClientOnline.value) void syncOfflinePlaceIssueQueue({ silent: true })
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
      eyebrow="Mapa"
      title="Lovné miesta, chaty a dostupnosť"
      description="Vyberte termín a jazero. Na mape ihneď uvidíte dostupné miesta, chaty a dôležité body v areáli."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AvailabilityRangePicker
        v-model:date-from="dateFrom"
        v-model:date-to="dateTo"
        class="mb-5"
      />

      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="inline-flex rounded-lg bg-muted p-1">
          <button
            v-for="lake in lakes"
            :key="lake.slug"
            type="button"
            class="rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              selectedLake === lake.slug
                ? 'bg-white text-primary-900 shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            "
            @click="selectedLake = lake.slug"
          >
            {{ lake.name }}
          </button>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold">
            <input v-model="showOnlyReservable" type="checkbox" class="h-4 w-4 accent-primary-700">
            Len rezervovateľné
          </label>
          <UButton :to="reservationTarget" icon="i-heroicons-calendar-days" color="warning">
            Rezervovať vybrané miesto
          </UButton>
        </div>
      </div>

      <DataStatusNotice
        v-if="isMapStateLoading || hasMapStateError"
        class="mb-5"
        :title="hasMapStateError ? 'Mapu sa nepodarilo obnoviť' : 'Načítavam aktuálnu mapu'"
        :description="hasMapStateError ? 'Zobrazujeme posledný dostupný stav lovných miest a bodov v areáli.' : 'Kontrolujeme aktuálne lovné miesta, chaty a servisné body.'"
        :tone="hasMapStateError ? 'warning' : 'info'"
        :loading="isMapStateLoading && !hasMapStateError"
        :action-label="hasMapStateError ? 'Skúsiť znova' : ''"
        :action-loading="isMapStateLoading"
        @action="retryMapState"
      />

      <LakeMap
        :title="currentLake.name"
        :image="activeBackgroundImage"
        :image-settings="activeBackgroundLayer?.imageSettings"
        :closures="liveClosures"
        :date-from="dateFrom"
        :date-to="dateTo"
        :facilities="liveMapFacilities"
        :points="visiblePegs"
        :reservations="reservations"
        :shapes="liveMapShapes"
        :selected-id="selectedPegId"
        @select="selectPeg"
      />

      <div class="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Vybrané miesto</h2>
          <div v-if="selectedPeg" class="mt-4 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <p class="text-2xl font-bold">{{ selectedPeg.label }}</p>
              <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
            </div>
            <p class="text-foreground-muted text-sm">{{ selectedPeg.notes }}</p>
            <p v-if="selectedAvailabilityReason" class="text-primary-800 text-sm font-semibold">
              {{ selectedAvailabilityReason }}
            </p>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-muted rounded-md p-3">
                <p class="text-foreground-muted text-xs">Kapacita</p>
                <p class="font-semibold">{{ selectedPeg.capacity }} osoby</p>
              </div>
              <div class="bg-muted rounded-md p-3">
                <p class="text-foreground-muted text-xs">Typ</p>
                <p class="font-semibold">{{ selectedPeg.type === 'cabin' ? 'chata' : 'breh' }}</p>
              </div>
            </div>

            <form class="border-border space-y-3 border-t pt-4" @submit.prevent="submitPlaceIssue">
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-bold">Nahlásiť nedostatok</h3>
                <UIcon name="i-heroicons-wrench-screwdriver" class="text-primary-700 h-5 w-5" />
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1 text-sm font-semibold">
                  <span>Kategória</span>
                  <select v-model="issueForm.category" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm">
                    <option v-for="option in issueCategoryOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <label class="space-y-1 text-sm font-semibold">
                  <span>Týka sa</span>
                  <select v-model="issueForm.targetKey" class="w-full rounded-md border border-border bg-white px-3 py-2 text-sm">
                    <option v-for="option in issueTargetOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Názov</span>
                <input v-model="issueForm.title" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Napr. nesvieti lampa" required>
              </label>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Popis</span>
                <textarea v-model="issueForm.description" class="min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Čo chýba, čo je pokazené alebo kde je problém?" required />
              </label>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1 text-sm font-semibold">
                  <span>Meno</span>
                  <input v-model="issueForm.reporterName" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="voliteľné">
                </label>
                <label class="space-y-1 text-sm font-semibold">
                  <span>Telefón</span>
                  <input v-model="issueForm.reporterPhone" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="voliteľné">
                </label>
              </div>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Fotka</span>
                <input v-model="issueForm.photoLabel" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="názov fotky alebo poznámka">
              </label>

              <div
                v-if="offlinePlaceIssueQueue.length"
                class="rounded-md border border-warning-300 bg-warning-100 px-3 py-2 text-sm text-warning-900"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p class="font-semibold">
                    V tomto zariadení čaká {{ offlinePlaceIssueQueue.length }} hlásení na odoslanie.
                  </p>
                  <UButton
                    type="button"
                    icon="i-heroicons-cloud-arrow-up"
                    size="xs"
                    variant="soft"
                    :disabled="!isClientOnline"
                    @click="syncOfflinePlaceIssueQueue()"
                  >
                    Odoslať teraz
                  </UButton>
                </div>
              </div>

              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p
                  v-if="issueSubmitMessage"
                  class="text-sm font-semibold"
                  :class="issueSubmitStatus === 'error' ? 'text-error-700' : 'text-success-700'"
                >
                  {{ issueSubmitMessage }}
                </p>
                <UButton
                  type="submit"
                  icon="i-heroicons-paper-airplane"
                  color="warning"
                  class="sm:ml-auto"
                  :loading="issueSubmitStatus === 'submitting'"
                >
                  Odoslať hlásenie
                </UButton>
              </div>
            </form>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Zoznam miest</h2>
              <p class="mt-1 text-sm text-foreground-muted">
                {{ reservableCount }} z {{ availabilityRows.length }} miest je rezervovateľných.
              </p>
            </div>
            <StatusBadge :label="`${reservableCount} voľných`" tone="success" size="xs" />
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              v-for="row in visibleAvailabilityRows"
              :key="row.peg.id"
              type="button"
              class="border-border rounded-md border p-3 text-left transition-colors hover:bg-muted"
              :class="selectedPegId === row.peg.id ? 'border-primary-600 bg-primary-50' : 'bg-white'"
              @click="selectPeg(row.peg)"
            >
              <div class="flex items-start justify-between gap-3">
                <p class="font-semibold">{{ row.peg.label }}</p>
                <AvailabilityBadge :availability="row.availability" />
              </div>
              <p class="text-foreground-muted mt-2 line-clamp-2 text-sm">{{ row.peg.notes }}</p>
              <p class="text-primary-800 mt-2 line-clamp-1 text-xs font-semibold">
                {{ row.availability.reasons[0] }}
              </p>
            </button>
          </div>
          <AppState
            v-if="visibleAvailabilityRows.length === 0"
            title="V tomto termíne nie je voľné miesto"
            description="Skúste zmeniť rozsah dátumov alebo vypnúť filter rezervovateľných miest."
            icon="i-heroicons-calendar-days"
          />
        </div>
      </div>
    </section>
  </div>
</template>
