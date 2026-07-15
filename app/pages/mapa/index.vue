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
import { formatAvailabilityDateRange, resolveAvailabilityDateRange } from '~/utils/availabilityDateRange'

usePublicSeo({
  title: 'Mapa lovných miest',
  description: 'Interaktívna mapa lovných miest, chát, sektorov a aktuálnej dostupnosti na Veľkom Cetíne a Štrkovisku Kocka.',
})

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
const initialSelectedPegId =
  pegs.find((peg) => peg.id === route.query.miesto && peg.lake === selectedLake.value)?.id
  ?? pegs.find((peg) => peg.lake === selectedLake.value)?.id
  ?? ''
const selectedPegId = ref(initialSelectedPegId)
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
  targetKey: initialSelectedPegId ? `peg:${initialSelectedPegId}` : `lake:${selectedLake.value}`,
  title: '',
})
const issueTemplateCards: Array<{
  category: PlaceIssueCategory
  description: string
  icon: string
  title: string
}> = [
  {
    category: 'lighting',
    description: 'Napr. nesvieti lampa, zásuvka alebo osvetlenie pri chate.',
    icon: 'i-heroicons-light-bulb',
    title: 'Nesvieti alebo nejde elektrina',
  },
  {
    category: 'missing-equipment',
    description: 'Napr. chýba podberák, podložka, drevo, kľúč alebo dohodnutá výbava.',
    icon: 'i-heroicons-archive-box',
    title: 'Niečo chýba',
  },
  {
    category: 'broken',
    description: 'Napr. poškodený prístup, lavica, mólo, zámok, dvere alebo vybavenie chaty.',
    icon: 'i-heroicons-wrench-screwdriver',
    title: 'Niečo je poškodené',
  },
  {
    category: 'safety',
    description: 'Napr. nebezpečný konár, šmykľavý vstup, otvorená jama alebo riziko úrazu.',
    icon: 'i-heroicons-exclamation-triangle',
    title: 'Bezpečnostný problém',
  },
]

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
const unavailableCount = computed(() => Math.max(availabilityRows.value.length - reservableCount.value, 0))
const firstReservableRow = computed(() =>
  availabilityRows.value.find((row) => row.availability.reservable),
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
const selectedPegCanReserve = computed(() => Boolean(selectedPeg.value && selectedAvailability.value?.reservable))
const reservationTarget = computed(() => ({
  path: '/rezervacie',
  query: {
    do: dateTo.value,
    jazero: selectedLake.value,
    miesto: selectedPegId.value,
    od: dateFrom.value,
  },
}))
const reservationActionTarget = computed(() => selectedPegCanReserve.value ? reservationTarget.value : undefined)
const reservationActionLabel = computed(() => {
  if (!selectedPeg.value) return 'Vyberte miesto'
  if (!selectedPegCanReserve.value) return 'Miesto nie je dostupné'

  return 'Rezervovať vybrané miesto'
})
const mapRangeLabel = computed(() => formatAvailabilityDateRange(dateFrom.value, dateTo.value))
const selectedIssueContextLabel = computed(() => {
  if (!selectedPeg.value) return currentLake.value.name

  return `${selectedPeg.value.label} · ${mapRangeLabel.value}`
})
const mapVisibilityTitle = computed(() => {
  if (showOnlyReservable.value) return 'Mapa ukazuje iba voľné miesta'
  if (reservableCount.value === 0) return 'V tomto termíne nie je voľné miesto'

  return 'Mapa ukazuje voľné aj obsadené miesta'
})
const mapVisibilityDescription = computed(() => {
  if (availabilityRows.value.length === 0) return 'Pre toto jazero zatiaľ nie sú zverejnené lovné miesta.'
  if (showOnlyReservable.value) {
    return unavailableCount.value > 0
      ? `Skryté sú ${unavailableCount.value} obsadené alebo blokované miesta. Zmeňte termín alebo zobrazte všetky miesta, ak chcete vidieť dôvod.`
      : 'Všetky zverejnené miesta sú v tomto termíne rezervovateľné.'
  }
  if (reservableCount.value === 0) {
    return 'Skúste iný termín alebo druhé jazero. Dôvod nedostupnosti vidíte pri každom mieste v zozname.'
  }

  return `Rezervovateľné miesta sú zvýraznené na mape aj v zozname. Najrýchlejšie môžete vybrať ${firstReservableRow.value?.peg.label ?? 'prvé voľné miesto'}.`
})

function formatMapDate(value: string) {
  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

type MapSummaryTone = 'primary' | 'success' | 'warning'

const availabilitySummaryItems = computed<Array<{
  description: string
  icon: string
  label: string
  tone: MapSummaryTone
  value: string
}>>(() => [
  {
    description: `${formatMapDate(dateFrom.value)} až ${formatMapDate(dateTo.value)}`,
    icon: 'i-heroicons-check-circle',
    label: 'Rezervovateľné miesta',
    tone: reservableCount.value > 0 ? 'success' : 'warning',
    value: `${reservableCount.value} z ${availabilityRows.value.length}`,
  },
  {
    description: showOnlyReservable.value
      ? `${unavailableCount.value} obsadených alebo blokovaných miest je skrytých.`
      : 'Mapa ukazuje voľné aj obsadené miesta.',
    icon: showOnlyReservable.value ? 'i-heroicons-funnel' : 'i-heroicons-map-pin',
    label: 'Zobrazenie mapy',
    tone: showOnlyReservable.value ? 'success' : 'primary',
    value: showOnlyReservable.value ? 'len voľné' : 'všetky miesta',
  },
  {
    description: selectedPeg.value
      ? selectedAvailabilityReason.value || 'Vybrané miesto je pripravené na rezerváciu.'
      : 'Vyberte bod na mape alebo v zozname miest.',
    icon: selectedPegCanReserve.value ? 'i-heroicons-calendar-days' : 'i-heroicons-exclamation-triangle',
    label: 'Vybrané miesto',
    tone: selectedPegCanReserve.value ? 'success' : 'warning',
    value: selectedPeg.value?.label ?? 'žiadne',
  },
])

function mapSummaryToneClass(tone: MapSummaryTone) {
  if (tone === 'success') return 'border-success-500/25 bg-success-500/10 text-success-800'
  if (tone === 'warning') return 'border-warning-200 bg-warning-500/10 text-warning-950'

  return 'border-primary-200 bg-primary-50 text-primary-950'
}

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
const selectedIssueTargetLabel = computed(() =>
  issueTargetOptions.value.find((option) => option.value === issueForm.targetKey)?.label ?? currentLake.value.name,
)
const selectedIssueCategoryLabel = computed(() =>
  placeIssueCategoryLabels[issueForm.category],
)
const issueSubmitNoticeTitle = computed(() => {
  if (issueSubmitStatus.value === 'error') return 'Hlásenie sa nepodarilo odoslať'
  if (issueSubmitStatus.value === 'submitting') return 'Odosielam hlásenie'

  return 'Hlásenie je prijaté'
})
const issueSubmitNoticeTone = computed(() => {
  if (issueSubmitStatus.value === 'error') return 'error'
  if (issueSubmitStatus.value === 'submitting') return 'info'

  return 'success'
})

watch(selectedLake, () => {
  selectedPegId.value = lakePegs.value[0]?.id ?? ''
  issueForm.targetKey = selectedPegId.value ? `peg:${selectedPegId.value}` : `lake:${selectedLake.value}`
})

watch(selectedPegId, (pegId) => {
  issueForm.targetKey = pegId ? `peg:${pegId}` : `lake:${selectedLake.value}`
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

function selectFirstReservablePlace() {
  const row = firstReservableRow.value
  if (!row) return

  showOnlyReservable.value = true
  selectPeg(row.peg)
}

function showAllPlaces() {
  showOnlyReservable.value = false
}

function applyIssueTemplate(template: (typeof issueTemplateCards)[number]) {
  issueForm.category = template.category
  issueForm.title = template.title
  issueForm.description = template.description
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

const offlinePlaceIssueSyncInProgress = ref(false)

async function syncOfflinePlaceIssueQueue(options: { silent?: boolean } = {}) {
  if (!import.meta.client || offlinePlaceIssueSyncInProgress.value) return

  isClientOnline.value = navigator.onLine
  if (!isClientOnline.value) return

  offlinePlaceIssueSyncInProgress.value = true
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
    offlinePlaceIssueSyncInProgress.value = false
  }
}

async function submitPlaceIssue() {
  issueSubmitStatus.value = 'submitting'
  issueSubmitMessage.value = 'Odosielam hlásenie správcovi.'
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
        compact-on-mobile
        class="mb-5"
      />

      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="inline-flex rounded-lg bg-muted p-1">
          <button
            v-for="lake in lakes"
            :key="lake.slug"
            type="button"
            class="min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            :class="
              selectedLake === lake.slug
                ? 'bg-white text-primary-900 shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            "
            :aria-pressed="selectedLake === lake.slug"
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
          <UButton
            :to="reservationActionTarget"
            icon="i-heroicons-calendar-days"
            color="warning"
            :disabled="!selectedPegCanReserve"
          >
            {{ reservationActionLabel }}
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

      <div class="mt-5 grid gap-3 md:grid-cols-3">
        <div
          v-for="item in availabilitySummaryItems"
          :key="item.label"
          class="rounded-md border p-4"
          :class="mapSummaryToneClass(item.tone)"
        >
          <div class="flex items-start gap-3">
            <UIcon :name="item.icon" class="mt-0.5 h-5 w-5 shrink-0" />
            <div class="min-w-0">
              <p class="text-xs font-semibold opacity-75">{{ item.label }}</p>
              <p class="mt-1 truncate text-lg font-black">{{ item.value }}</p>
              <p class="mt-1 text-sm opacity-80">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-5 rounded-md border border-border bg-white p-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex items-start gap-3">
            <UIcon
              :name="showOnlyReservable ? 'i-heroicons-funnel' : 'i-heroicons-map'"
              class="mt-0.5 h-5 w-5 shrink-0 text-primary-700"
            />
            <div>
              <h2 class="text-sm font-bold">{{ mapVisibilityTitle }}</h2>
              <p class="mt-1 text-sm text-foreground-muted">{{ mapVisibilityDescription }}</p>
            </div>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
            <UButton
              v-if="firstReservableRow"
              type="button"
              icon="i-heroicons-check-circle"
              variant="soft"
              @click="selectFirstReservablePlace"
            >
              Vybrať prvé voľné
            </UButton>
            <UButton
              v-if="showOnlyReservable"
              type="button"
              icon="i-heroicons-map-pin"
              variant="ghost"
              @click="showAllPlaces"
            >
              Ukázať všetky miesta
            </UButton>
            <UButton
              v-else
              type="button"
              icon="i-heroicons-funnel"
              variant="ghost"
              :disabled="reservableCount === 0"
              @click="showOnlyReservable = true"
            >
              Ukázať iba voľné
            </UButton>
          </div>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
        <div class="border-border bg-surface min-w-0 rounded-card border p-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Nahlásiť nedostatok</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Hlásenie sa priradí k vybranému miestu, jazeru alebo servisnému bodu.
              </p>
            </div>
            <UIcon name="i-heroicons-wrench-screwdriver" class="text-primary-700 h-5 w-5 shrink-0" />
          </div>
          <div v-if="selectedPeg" class="mt-4 space-y-4">
            <div class="rounded-md border border-border bg-muted/60 p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-foreground-muted text-xs">Aktuálny kontext</p>
                  <p class="truncate font-bold">{{ selectedIssueContextLabel }}</p>
                </div>
                <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
              </div>
              <p class="text-foreground-muted mt-2 text-sm">{{ selectedPeg.notes }}</p>
            </div>
            <form class="border-border space-y-3 border-t pt-4" @submit.prevent="submitPlaceIssue">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h3 class="font-bold">Čo treba vyriešiť</h3>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Správca dostane miesto, kategóriu a popis. Kontakt vyplňte iba vtedy, ak má zavolať späť.
                  </p>
                </div>
                <UIcon name="i-heroicons-paper-airplane" class="text-primary-700 h-5 w-5" />
              </div>

              <div class="rounded-md border border-border bg-muted/60 p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    icon="i-heroicons-map-pin"
                    :label="selectedIssueTargetLabel"
                    tone="primary"
                    size="xs"
                  />
                  <StatusBadge
                    icon="i-heroicons-tag"
                    :label="selectedIssueCategoryLabel"
                    tone="neutral"
                    size="xs"
                  />
                </div>
                <p class="text-foreground-muted mt-2 text-xs">
                  Cieľ hlásenia môžete zmeniť nižšie, ak problém patrí k inému miestu alebo servisnému bodu.
                </p>
              </div>

              <div>
                <p class="text-sm font-semibold">Rýchle voľby</p>
                <div class="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    v-for="template in issueTemplateCards"
                    :key="template.title"
                    type="button"
                    class="rounded-md border border-border bg-white p-3 text-left transition hover:border-primary-300 hover:bg-primary-50"
                    @click="applyIssueTemplate(template)"
                  >
                    <div class="flex items-start gap-2">
                      <UIcon :name="template.icon" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                      <div>
                        <p class="text-sm font-bold">{{ template.title }}</p>
                        <p class="text-foreground-muted mt-1 text-xs">{{ template.description }}</p>
                      </div>
                    </div>
                  </button>
                </div>
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
                  <input v-model="issueForm.reporterName" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="meno pre spätný kontakt">
                </label>
                <label class="space-y-1 text-sm font-semibold">
                  <span>Telefón</span>
                  <input v-model="issueForm.reporterPhone" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="+421 ...">
                </label>
              </div>

              <label class="block space-y-1 text-sm font-semibold">
                <span>Fotka alebo poznámka</span>
                <input v-model="issueForm.photoLabel" class="w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="napr. fotka v telefóne, pošlem správcovi cez SMS">
              </label>

              <DataStatusNotice
                v-if="offlinePlaceIssueQueue.length"
                :action-label="isClientOnline ? 'Odoslať teraz' : ''"
                :action-loading="offlinePlaceIssueSyncInProgress"
                :description="
                  isClientOnline
                    ? 'Hlásenia sa odošlú pri najbližšej synchronizácii alebo ich môžete odoslať hneď.'
                    : 'Hlásenia ostanú uložené v tomto zariadení a odošlú sa po obnovení signálu.'
                "
                icon="i-heroicons-cloud-arrow-up"
                :title="`V tomto zariadení čaká ${offlinePlaceIssueQueue.length} hlásení na odoslanie`"
                tone="warning"
                @action="syncOfflinePlaceIssueQueue()"
              />

              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <DataStatusNotice
                  v-if="issueSubmitMessage"
                  class="sm:flex-1"
                  :description="issueSubmitMessage"
                  :loading="issueSubmitStatus === 'submitting'"
                  :title="issueSubmitNoticeTitle"
                  :tone="issueSubmitNoticeTone"
                />
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
          <AppState
            v-else
            class="mt-4"
            title="Najprv vyberte miesto"
            description="Kliknite na bod v mape alebo vypnite filter, ak chcete nahlásiť problém na obsadenom mieste."
            icon="i-heroicons-map-pin"
          />
        </div>

        <div class="border-border bg-surface min-w-0 rounded-card border p-5">
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
              :aria-pressed="selectedPegId === row.peg.id"
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
