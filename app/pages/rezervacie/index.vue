<script setup lang="ts">
import type { LakeSlug } from '~/data/pond'
import type {
  ReservationStateResponse,
  ReservationSubmissionSuccess,
} from '~/services/reservationApiService'
import { getValidationMessages, reservationRequestSchema } from '~/schemas/pondSchemas'
import {
  enqueueOfflineReservation,
  getOfflineReservationQueueErrorMessage,
  markOfflineReservationAttempt,
  readOfflineReservationQueue,
  removeOfflineReservation,
  shouldQueueReservationSubmission,
  type OfflineReservationPayload,
  type OfflineReservationQueueItem,
} from '~/services/offlineReservationQueueService'
import { getPegAvailability } from '~/utils/availability'
import { getRentalAvailability } from '~/utils/rentals'

useHead({ title: 'Rezervácie' })

const {
  cabinProducts,
  contactInfo,
  getLakeName,
  getPegLabel,
  lakes,
  pegs,
  permitProducts,
  rentalBookings,
  requiredEquipment,
  reservations,
} = usePondData()

const fallbackReservationState = (): ReservationStateResponse => ({
  ok: true,
  rentalBookings,
  reservations,
  updatedAt: 'seed',
})
const { data: reservationState, refresh: refreshReservationState } = await useAsyncData<ReservationStateResponse>(
  'public-reservation-state',
  () => $fetch<ReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
const { liveClosures } = await useClosureState({ key: 'public-reservation-closure-state' })
const { enabledPaymentMethods } = await usePaymentMethodState({ key: 'public-reservation-payment-state' })
const {
  activeRentalItems,
  activeReservationExtras,
} = await useRentalCatalogState({ key: 'public-reservation-rental-catalog-state' })

const route = useRoute()
const selectedLake = ref<LakeSlug>('velky-cetin')
const selectedPegId = ref(String(route.query.miesto ?? 'vc-03'))
const selectedPermitId = ref('permit-48h')
const reservationFrom = ref('2026-05-16')
const reservationTo = ref('2026-05-18')
const reservationContactName = ref('Marek H.')
const reservationContactPhone = ref('+421 900 123 456')
const selectedRentalIds = ref<string[]>([])
const selectedExtraIds = ref<string[]>([])
const reservationSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const reservationSubmitMessage = ref('')
const offlineReservationQueue = ref<OfflineReservationQueueItem[]>([])
const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineSyncMessage = ref('')
const isOnline = ref(true)
let offlineSyncInProgress = false

const liveReservations = computed(() => reservationState.value?.reservations ?? reservations)
const liveRentalBookings = computed(() => reservationState.value?.rentalBookings ?? rentalBookings)
const lakePegs = computed(() => pegs.filter((peg) => peg.lake === selectedLake.value))
const availabilityRows = computed(() =>
  lakePegs.value.map((peg) => ({
    availability: getPegAvailability(peg, {
      closures: liveClosures.value,
      dateFrom: reservationFrom.value,
      dateTo: reservationTo.value,
      reservations: liveReservations.value,
    }),
    peg,
    reservations: liveReservations.value.filter((reservation) => reservation.pegId === peg.id),
  })),
)

const actionablePegs = computed(() =>
  availabilityRows.value.filter((row) => row.availability.reservable),
)
const freeCabins = computed(() =>
  availabilityRows.value.filter((row) => row.peg.type === 'cabin' && row.availability.reservable),
)
const blockedPegs = computed(() =>
  availabilityRows.value.filter((row) => !row.availability.reservable),
)
const selectedPeg = computed(() => pegs.find((peg) => peg.id === selectedPegId.value))
const selectedAvailability = computed(() =>
  selectedPeg.value
    ? getPegAvailability(selectedPeg.value, {
      closures: liveClosures.value,
      dateFrom: reservationFrom.value,
      dateTo: reservationTo.value,
      reservations: liveReservations.value,
    })
    : undefined,
)
const selectedPermit = computed(
  () => permitProducts.find((permit) => permit.id === selectedPermitId.value) ?? permitProducts[2]!,
)
const selectedCabin = computed(() =>
  cabinProducts.find((cabin) => cabin.pegIds.includes(selectedPegId.value)),
)
const availableExtras = computed(() =>
  activeReservationExtras.value.filter((extra) => {
    const lakeMatches = !extra.lake || extra.lake === selectedLake.value
    const surfaceMatches = extra.appliesTo === 'all' || Boolean(selectedCabin.value)

    return lakeMatches && surfaceMatches
  }),
)
const rentalAvailabilityRows = computed(() =>
  activeRentalItems.value.map((item) => ({
    availability: getRentalAvailability(item, {
      bookings: liveRentalBookings.value,
      dateFrom: reservationFrom.value,
      dateTo: reservationTo.value,
    }),
    item,
  })),
)
const selectedRentalRows = computed(() =>
  rentalAvailabilityRows.value.filter((row) => selectedRentalIds.value.includes(row.item.id)),
)
const selectedRentals = computed(() => selectedRentalRows.value.map((row) => row.item))
const unavailableSelectedRentalLabels = computed(() =>
  selectedRentalRows.value.filter((row) => !row.availability.reservable).map((row) => row.item.label),
)
const selectedExtras = computed(() =>
  availableExtras.value.filter((item) => selectedExtraIds.value.includes(item.id)),
)
const reservationDraft = computed(() => ({
  cabinProductId: selectedCabin.value?.id,
  contactName: reservationContactName.value,
  contactPhone: reservationContactPhone.value,
  dateFrom: reservationFrom.value,
  dateTo: reservationTo.value,
  extraIds: selectedExtraIds.value,
  lake: selectedLake.value,
  pegId: selectedPegId.value,
  permitId: selectedPermitId.value,
  rentalIds: selectedRentalIds.value,
  requiresCabinReservation: Boolean(selectedPeg.value?.requiresCabinReservation),
  reservable: Boolean(selectedAvailability.value?.reservable),
  unavailableRentalLabels: unavailableSelectedRentalLabels.value,
}))
const reservationValidation = computed(() => reservationRequestSchema.safeParse(reservationDraft.value))
const reservationValidationMessages = computed(() => getValidationMessages(reservationValidation.value))

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

  return messages?.join(' ') || fetchError.data?.message || fetchError.data?.statusMessage || 'Žiadosť sa nepodarilo odoslať.'
}

const createReservationPayload = (data: OfflineReservationPayload): OfflineReservationPayload => ({
  cabinProductId: data.cabinProductId,
  contactName: data.contactName,
  contactPhone: data.contactPhone,
  dateFrom: data.dateFrom,
  dateTo: data.dateTo,
  extraIds: data.extraIds,
  lake: data.lake,
  pegId: data.pegId,
  permitId: data.permitId,
  rentalIds: data.rentalIds,
})

const getQueueFallbackErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Offline rezerváciu sa nepodarilo uložiť v zariadení.'

async function refreshOfflineReservationQueue() {
  if (!import.meta.client) return

  try {
    offlineReservationQueue.value = await readOfflineReservationQueue()
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function queueOfflineReservation(payload: OfflineReservationPayload) {
  try {
    const item = await enqueueOfflineReservation(payload)

    await refreshOfflineReservationQueue()
    reservationSubmitStatus.value = 'success'
    reservationSubmitMessage.value = `Slabý signál: žiadosť je uložená v tomto zariadení a odošle sa automaticky. Fronta: ${item.id}.`
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = `Vo fronte čaká ${offlineReservationQueue.value.length} rezervácia.`
  }
  catch (error) {
    reservationSubmitStatus.value = 'error'
    reservationSubmitMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function discardOfflineReservation(id: string) {
  try {
    await removeOfflineReservation(id)
    await refreshOfflineReservationQueue()
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = 'Offline žiadosť bola odstránená zo zariadenia.'
  }
  catch (error) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function syncOfflineReservationQueue(options: { silent?: boolean } = {}) {
  if (!import.meta.client || offlineSyncInProgress) return

  isOnline.value = navigator.onLine
  if (!isOnline.value) {
    offlineSyncStatus.value = 'error'
    offlineSyncMessage.value = 'Bez pripojenia nechávam žiadosti bezpečne v zariadení.'
    return
  }

  await refreshOfflineReservationQueue()
  if (offlineReservationQueue.value.length === 0) {
    if (!options.silent) {
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = 'Offline fronta rezervácií je prázdna.'
    }
    return
  }

  offlineSyncInProgress = true
  offlineSyncStatus.value = 'syncing'
  offlineSyncMessage.value = `Odosielam ${offlineReservationQueue.value.length} offline žiadostí.`

  let syncedCount = 0

  try {
    for (const queuedReservation of [...offlineReservationQueue.value]) {
      try {
        await $fetch<ReservationSubmissionSuccess>('/api/reservations', {
          body: queuedReservation.payload,
          method: 'POST',
        })
        await removeOfflineReservation(queuedReservation.id)
        syncedCount += 1
      }
      catch (error) {
        await markOfflineReservationAttempt(
          queuedReservation.id,
          getOfflineReservationQueueErrorMessage(error),
        )
      }
    }

    await refreshOfflineReservationQueue()
    if (syncedCount > 0) {
      await refreshReservationState()
    }

    offlineSyncStatus.value = offlineReservationQueue.value.length > 0 ? 'error' : 'success'
    offlineSyncMessage.value = offlineReservationQueue.value.length > 0
      ? `${syncedCount} žiadostí odoslaných, ${offlineReservationQueue.value.length} čaká na ďalší pokus.`
      : `${syncedCount} offline žiadostí bolo odoslaných správcovi.`
  }
  finally {
    offlineSyncInProgress = false
  }
}

const cleanSelectedExtras = () => {
  const availableIds = new Set(availableExtras.value.map((extra) => extra.id))
  selectedExtraIds.value = selectedExtraIds.value.filter((id) => availableIds.has(id))
}

const submitReservation = async () => {
  const validation = reservationValidation.value
  if (!validation.success) {
    reservationSubmitStatus.value = 'error'
    reservationSubmitMessage.value = reservationValidationMessages.value[0] ?? 'Skontrolujte údaje v žiadosti.'
    return
  }

  reservationSubmitStatus.value = 'submitting'
  reservationSubmitMessage.value = ''

  try {
    const payload = createReservationPayload(validation.data)
    const result = await $fetch<ReservationSubmissionSuccess>('/api/reservations', {
      body: payload,
      method: 'POST',
    })

    reservationSubmitStatus.value = 'success'
    reservationSubmitMessage.value = `${result.message} ID žiadosti: ${result.reservation.id}.`
    await refreshReservationState()
  }
  catch (error) {
    const payload = createReservationPayload(validation.data)

    if (import.meta.client && shouldQueueReservationSubmission(error, navigator.onLine)) {
      await queueOfflineReservation(payload)
      return
    }

    reservationSubmitStatus.value = 'error'
    reservationSubmitMessage.value = getApiErrorMessage(error)
  }
}

function handleOnline() {
  isOnline.value = true
  void syncOfflineReservationQueue({ silent: true })
}

function handleOffline() {
  isOnline.value = false
  offlineSyncStatus.value = 'idle'
  offlineSyncMessage.value = 'Signál vypadol. Nové rezervácie sa uložia v zariadení.'
}

onMounted(() => {
  if (!import.meta.client) return

  isOnline.value = navigator.onLine
  void refreshOfflineReservationQueue().then(() => {
    if (navigator.onLine && offlineReservationQueue.value.length > 0) {
      void syncOfflineReservationQueue({ silent: true })
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

watch(selectedLake, () => {
  selectedPegId.value = lakePegs.value[0]?.id ?? ''
  cleanSelectedExtras()
})

watch(selectedPegId, () => {
  cleanSelectedExtras()
})

watch(reservationDraft, () => {
  if (reservationSubmitStatus.value !== 'submitting') {
    reservationSubmitStatus.value = 'idle'
    reservationSubmitMessage.value = ''
  }
})

watch(
  activeRentalItems,
  (items) => {
    const activeIds = new Set(items.map((item) => item.id))
    const filteredIds = selectedRentalIds.value.filter((id) => activeIds.has(id))

    selectedRentalIds.value = filteredIds.length > 0
      ? filteredIds
      : items.filter((item) => item.recommended).map((item) => item.id)
  },
  { immediate: true },
)

watch(
  availableExtras,
  (extras) => {
    const availableIds = new Set(extras.map((extra) => extra.id))
    selectedExtraIds.value = selectedExtraIds.value.filter((id) => availableIds.has(id))
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Rezervácie"
      title="Lovné miesto, chata a doplnky v jednom toku"
      description="Rezervácia má fungovať ako praktický košík: rybár vyberie jazero, miesto, povolenku, povinnú výbavu na požičanie a služby navyše k pobytu."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

        <div class="grid gap-2 text-sm sm:grid-cols-3">
          <div class="rounded-md border border-border bg-white px-3 py-2">
            <p class="text-foreground-muted text-xs">Rezervovateľné</p>
            <p class="font-bold">{{ actionablePegs.length }} miest</p>
          </div>
          <div class="rounded-md border border-border bg-white px-3 py-2">
            <p class="text-foreground-muted text-xs">Voľné chaty</p>
            <p class="font-bold">{{ freeCabins.length }}</p>
          </div>
          <div class="rounded-md border border-border bg-white px-3 py-2">
            <p class="text-foreground-muted text-xs">Blokované</p>
            <p class="font-bold">{{ blockedPegs.length }} miest</p>
          </div>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-bold">Lovné miesta a chaty</h2>
                <p class="text-foreground-muted text-sm">
                  Stav sa počíta z lokálne uložených rezervácií. Chata môže mať v administrácii
                  pravidlo, že miesto sa nedá rezervovať bez chaty.
                </p>
              </div>
              <UButton to="/mapa" icon="i-heroicons-map-pin" variant="ghost">Mapa</UButton>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button
                v-for="row in availabilityRows"
                :key="row.peg.id"
                type="button"
                class="border-border rounded-md border p-4 text-left transition-colors hover:bg-muted"
                :class="selectedPegId === row.peg.id ? 'border-primary-600 bg-primary-50' : 'bg-white'"
                @click="selectedPegId = row.peg.id"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ row.peg.label }}</p>
                    <p class="text-foreground-muted text-xs">
                      {{ row.peg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto' }} ·
                      {{ row.peg.capacity }} osoby
                    </p>
                    <p v-if="row.peg.requiresCabinReservation" class="mt-1 text-xs font-semibold text-primary-800">
                      chata povinná
                    </p>
                  </div>
                  <AvailabilityBadge :availability="row.availability" />
                </div>
                <p class="text-foreground-muted mt-3 text-sm">
                  {{ row.availability.reasons[0] ?? row.reservations[0]?.guest }}
                </p>
              </button>
            </div>
            <AppState
              v-if="availabilityRows.length === 0"
              title="Žiadne miesta"
              description="Pre vybrané jazero ešte nie sú evidované lovné miesta."
            />
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Povinná výbava pri vode</h2>
                <p class="text-foreground-muted text-sm">
                  Základ z pravidiel revíru, ktorý má rezervácia pripomenúť pred odoslaním.
                </p>
              </div>
              <UButton to="/info" icon="i-heroicons-information-circle" variant="ghost">
                Pravidlá
              </UButton>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-2">
              <div
                v-for="item in requiredEquipment"
                :key="item.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ item.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ item.detail }}</p>
                  </div>
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-semibold"
                    :class="
                      item.rentable
                        ? 'bg-primary-50 text-primary-800'
                        : 'bg-warning-100 text-warning-800'
                    "
                  >
                    {{ item.rentable ? 'požičateľné' : 'vlastné' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Vzor mesačnej obsadenosti</h2>
                <p class="text-foreground-muted text-sm">
                  Tabuľková logika zostáva, ale primárny pohľad má byť miesto, termín a doplnky.
                </p>
              </div>
              <UButton icon="i-heroicons-arrow-down-tray" variant="ghost">Export CSV</UButton>
            </div>
            <div class="mt-5 overflow-hidden rounded-md border border-border">
              <img
                src="/images/obsadenost-vzor.png"
                alt="Vzor obsadenosti lovných miest"
                class="w-full object-cover"
                loading="lazy"
              >
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Žiadosť o rezerváciu</h2>
            <div
              v-if="!isOnline || offlineReservationQueue.length > 0 || offlineSyncMessage"
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
                      {{ isOnline ? 'Offline fronta rezervácií' : 'Bez pripojenia pri rezervácii' }}
                    </p>
                  </div>
                  <p class="mt-1 text-sm opacity-80">
                    {{ offlineSyncMessage || 'Pri výpadku signálu podržíme žiadosť v zariadení a odošleme ju hneď po návrate internetu.' }}
                  </p>
                </div>
                <UButton
                  v-if="offlineReservationQueue.length > 0"
                  size="sm"
                  icon="i-heroicons-arrow-path"
                  variant="soft"
                  :disabled="!isOnline || offlineSyncStatus === 'syncing'"
                  :loading="offlineSyncStatus === 'syncing'"
                  @click="syncOfflineReservationQueue()"
                >
                  Odoslať
                </UButton>
              </div>

              <div v-if="offlineReservationQueue.length > 0" class="mt-3 space-y-2">
                <div
                  v-for="item in offlineReservationQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ item.payload.contactName }} · {{ getPegLabel(item.payload.pegId) }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ item.payload.dateFrom }} až {{ item.payload.dateTo }} ·
                      {{ getLakeName(item.payload.lake) }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="text-foreground-muted hover:text-error-700 shrink-0 rounded-md p-1"
                    aria-label="Odstrániť offline rezerváciu"
                    @click="discardOfflineReservation(item.id)"
                  >
                    <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <form class="mt-5 space-y-5">
              <label class="block">
                <span class="text-sm font-semibold">Jazero</span>
                <select
                  v-model="selectedLake"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">
                    {{ lake.name }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Miesto</span>
                <select
                  v-model="selectedPegId"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                  <option v-for="peg in lakePegs" :key="peg.id" :value="peg.id">
                    {{ peg.label }}
                  </option>
                </select>
              </label>

              <div
                v-if="selectedAvailability"
                class="rounded-md border p-4"
                :class="selectedAvailability.classes"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-bold">Dostupnosť miesta</p>
                    <p class="mt-1 text-sm">{{ selectedAvailability.description }}</p>
                    <p class="mt-2 text-xs font-semibold">{{ selectedAvailability.reasons[0] }}</p>
                    <p v-if="selectedPeg?.requiresCabinReservation" class="mt-2 text-xs font-semibold">
                      Toto miesto sa rezervuje spolu s chatou.
                    </p>
                  </div>
                  <UIcon :name="selectedAvailability.icon" class="mt-0.5 h-5 w-5 shrink-0" />
                </div>
              </div>

              <div v-if="selectedCabin" class="rounded-md border border-primary-200 bg-primary-50 p-4">
                <p class="text-sm font-bold text-primary-900">{{ selectedCabin.label }}</p>
                <p class="text-primary-800 mt-1 text-sm">
                  {{ selectedCabin.pricePer24hEur }} € / 24 h · minimum
                  {{ selectedCabin.minimumHours }} h · kapacita {{ selectedCabin.capacity }}
                </p>
                <p class="text-primary-800 mt-2 text-xs">
                  {{ selectedCabin.requiresPermitNote }}
                </p>
              </div>

              <div>
                <p class="text-sm font-semibold">Povolenka</p>
                <div class="mt-2 grid gap-2">
                  <label
                    v-for="permit in permitProducts"
                    :key="permit.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-white p-3 transition-colors hover:bg-muted"
                    :class="selectedPermitId === permit.id ? 'border-primary-600 bg-primary-50' : ''"
                  >
                    <input
                      v-model="selectedPermitId"
                      type="radio"
                      name="permit"
                      :value="permit.id"
                      class="mt-1 h-4 w-4 accent-primary-700"
                    >
                    <span class="min-w-0 flex-1">
                      <span class="block font-semibold">{{ permit.label }}</span>
                      <span class="text-foreground-muted block text-sm">
                        {{ permit.priceEur }} € · {{ permit.durationHours }} h
                      </span>
                      <span v-if="permit.note" class="text-primary-800 mt-1 block text-xs">
                        {{ permit.note }}
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                <span class="text-sm font-semibold">Od</span>
                <input
                  v-model="reservationFrom"
                  type="date"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                </label>
                <label class="block">
                <span class="text-sm font-semibold">Do</span>
                <input
                  v-model="reservationTo"
                  type="date"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                >
                </label>
              </div>

              <div>
                <p class="text-sm font-semibold">Požičovňa výbavy</p>
                <div class="mt-2 grid gap-2">
                  <label
                    v-for="row in rentalAvailabilityRows"
                    :key="row.item.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted"
                    :class="
                      selectedRentalIds.includes(row.item.id)
                        ? 'border-primary-600 bg-primary-50'
                        : row.availability.status === 'unavailable'
                          ? 'border-error-500/25 bg-error-500/5'
                          : 'border-border bg-white'
                    "
                  >
                    <input
                      v-model="selectedRentalIds"
                      type="checkbox"
                      :value="row.item.id"
                      class="mt-1 h-4 w-4 rounded accent-primary-700"
                    >
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center justify-between gap-2">
                        <span class="font-semibold">{{ row.item.label }}</span>
                        <span
                          class="rounded-full border px-2 py-0.5 text-xs font-semibold"
                          :class="row.availability.classes"
                        >
                          {{ row.availability.label }}
                        </span>
                      </span>
                      <span class="text-foreground-muted mt-1 block text-sm">
                        {{ row.item.description }}
                      </span>
                      <span class="text-primary-800 mt-1 block text-xs">{{ row.item.priceLabel }}</span>
                      <span class="text-foreground-muted mt-1 block text-xs">
                        {{ row.availability.availableQuantity }} z {{ row.availability.stock }} ks voľné ·
                        {{ row.availability.reasons[0] }}
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div v-if="availableExtras.length">
                <p class="text-sm font-semibold">Doplnky k rezervácii</p>
                <div class="mt-2 grid gap-2">
                  <label
                    v-for="extra in availableExtras"
                    :key="extra.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-white p-3 transition-colors hover:bg-muted"
                  >
                    <input
                      v-model="selectedExtraIds"
                      type="checkbox"
                      :value="extra.id"
                      class="mt-1 h-4 w-4 rounded accent-primary-700"
                    >
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center justify-between gap-2">
                        <span class="font-semibold">{{ extra.label }}</span>
                        <span
                          class="rounded-full px-2 py-0.5 text-xs font-semibold"
                          :class="
                            extra.source === 'web'
                              ? 'bg-success-500/10 text-success-700'
                              : 'bg-warning-100 text-warning-800'
                          "
                        >
                          {{ extra.source === 'web' ? 'z webu' : 'návrh' }}
                        </span>
                      </span>
                      <span class="text-foreground-muted mt-1 block text-sm">
                        {{ extra.description }}
                      </span>
                      <span class="text-primary-800 mt-1 block text-xs">{{ extra.priceLabel }}</span>
                    </span>
                  </label>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Meno</span>
                  <input
                    v-model="reservationContactName"
                    type="text"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Telefón</span>
                  <input
                    v-model="reservationContactPhone"
                    type="tel"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                  >
                </label>
              </div>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">Súhrn žiadosti</p>
                <div class="mt-3 space-y-2 text-foreground-muted">
                  <p>{{ getLakeName(selectedLake) }} · {{ selectedPeg?.label ?? 'miesto' }}</p>
                  <p v-if="selectedAvailability">
                    Dostupnosť: {{ selectedAvailability.label }} · {{ selectedAvailability.reasons[0] }}
                  </p>
                  <p>{{ selectedPermit.label }} · {{ selectedPermit.priceEur }} €</p>
                  <p v-if="selectedCabin">
                    {{ selectedCabin.label }} · {{ selectedCabin.pricePer24hEur }} € / 24 h
                  </p>
                  <p v-if="selectedRentals.length">
                    Výbava: {{ selectedRentals.map((item) => item.label).join(', ') }}
                  </p>
                  <p v-if="selectedExtras.length">
                    Doplnky: {{ selectedExtras.map((item) => item.label).join(', ') }}
                  </p>
                  <p v-if="!selectedRentals.length && !selectedExtras.length">
                    Bez požičanej výbavy a doplnkov.
                  </p>
                </div>
              </div>

              <div class="rounded-md border border-border bg-white p-4 text-sm">
                <p class="font-bold">Platba po potvrdení</p>
                <div class="mt-3 space-y-2">
                  <div v-for="method in enabledPaymentMethods" :key="method.id" class="flex items-start gap-2">
                    <UIcon
                      :name="method.kind === 'cash' ? 'i-heroicons-banknotes' : 'i-heroicons-building-library'"
                      class="text-primary-800 mt-0.5 h-4 w-4 shrink-0"
                    />
                    <div>
                      <p class="font-semibold">{{ method.label }}</p>
                      <p class="text-foreground-muted">{{ method.instructions }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <ValidationSummary
                :messages="reservationValidationMessages"
                valid-title="Žiadosť je pripravená"
                valid-description="Validácia prešla lokálne; odoslanie ju ešte overí v lokálnom API."
              />

              <div
                v-if="reservationSubmitMessage"
                class="rounded-md border px-3 py-2 text-sm font-semibold"
                :class="
                  reservationSubmitStatus === 'success'
                    ? 'border-success-500/25 bg-success-500/10 text-success-700'
                    : 'border-error-500/25 bg-error-500/10 text-error-700'
                "
              >
                {{ reservationSubmitMessage }}
              </div>

              <UButton
                type="button"
                icon="i-heroicons-paper-airplane"
                block
                :disabled="!reservationValidation.success || reservationSubmitStatus === 'submitting'"
                :loading="reservationSubmitStatus === 'submitting'"
                @click="submitReservation"
              >
                Odoslať žiadosť
              </UButton>
            </form>
          </div>

          <div class="border-border bg-primary-900 rounded-card border p-5 text-white">
            <h2 class="text-lg font-bold">Kontakt na rezervácie</h2>
            <p class="mt-3 text-sm text-white/75">
              {{ contactInfo.managerName }} · {{ contactInfo.role }}
            </p>
            <div class="mt-4 space-y-2 text-sm">
              <a :href="`tel:${contactInfo.phoneHref}`" class="flex items-center gap-2 hover:text-accent-300">
                <UIcon name="i-heroicons-phone" class="h-4 w-4" />
                {{ contactInfo.phoneDisplay }}
              </a>
              <p v-for="hour in contactInfo.phoneHours" :key="hour" class="flex items-center gap-2">
                <UIcon name="i-heroicons-clock" class="h-4 w-4" />
                {{ hour }}
              </p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Aktuálne rezervácie</h2>
            <div class="mt-4 space-y-3">
              <div v-for="reservation in liveReservations" :key="reservation.id" class="bg-muted rounded-md p-3">
                <p class="font-semibold">{{ getPegLabel(reservation.pegId) }}</p>
                <p class="text-foreground-muted text-sm">
                  {{ getLakeName(reservation.lake) }} · {{ reservation.from }} až {{ reservation.to }}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
