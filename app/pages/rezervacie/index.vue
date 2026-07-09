<script setup lang="ts">
import type { LakeSlug } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
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
import { getPegAvailability, type AvailabilityStatus } from '~/utils/availability'
import { resolveAvailabilityDateRange } from '~/utils/availabilityDateRange'
import { buildCalendarDays } from '~/utils/calendar'
import { getRentalAvailability } from '~/utils/rentals'

useHead({ title: 'Rezervácie' })

const {
  cabinProducts: seedCabinProducts,
  contactInfo,
  getLakeName,
  getPegLabel,
  lakes,
  mapFacilities,
  mapLayers,
  mapShapes,
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
const {
  data: reservationState,
  error: reservationStateError,
  refresh: refreshReservationState,
  status: reservationStateStatus,
} = await useAsyncData<ReservationStateResponse>(
  'public-reservation-state',
  () => $fetch<ReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
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
  'public-reservation-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)
const { liveCabinProducts } = await useCabinCatalogState({ key: 'public-reservation-cabin-catalog-state' })
const { liveClosures } = await useClosureState({ key: 'public-reservation-closure-state' })
const { enabledPaymentMethods } = await usePaymentMethodState({ key: 'public-reservation-payment-state' })
const {
  activeRentalItems,
  activeReservationExtras,
} = await useRentalCatalogState({ key: 'public-reservation-rental-catalog-state' })

const route = useRoute()
const router = useRouter()
const { account: anglerAccount } = useMockAnglerAuth()

const normalizeRouteIdList = (value: unknown) => {
  const values = Array.isArray(value) ? value : [value]

  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((item) => item.trim())
    .filter(Boolean)
}

const routeRentalIds = normalizeRouteIdList(route.query.vybava ?? route.query.vybavy)
const routeExtraIds = normalizeRouteIdList(route.query.doplnok ?? route.query.doplnky)
const routeCabinProductId = normalizeRouteIdList(route.query.chata)[0] ?? ''
const requestedCabinProduct = (liveCabinProducts.value.length > 0 ? liveCabinProducts.value : seedCabinProducts)
  .find((cabin) => cabin.id === routeCabinProductId)
const requestedCabinPeg = requestedCabinProduct
  ? pegs.find((peg) => requestedCabinProduct.pegIds.includes(peg.id))
  : undefined
const requestedExtraLake = routeExtraIds
  .map((id) => activeReservationExtras.value.find((extra) => extra.id === id)?.lake)
  .find((lake): lake is LakeSlug => Boolean(lake))
const routeLake = lakes.find((lake) => lake.slug === route.query.jazero)?.slug
const initialLake = routeLake ?? requestedCabinPeg?.lake ?? requestedExtraLake ?? 'velky-cetin'
const initialDateRange = resolveAvailabilityDateRange(route.query.od, route.query.do, new Date(), 2)
const selectedLake = ref<LakeSlug>(initialLake)
const requestedPegId = String(route.query.miesto ?? '')
const routePrefersCabin = route.query.typ === 'chata'
  || Boolean(requestedCabinProduct)
  || routeExtraIds.some((id) => activeReservationExtras.value.find((extra) => extra.id === id)?.appliesTo === 'cabin')
const requestedCabinPegId = requestedCabinProduct?.pegIds.find((pegId) =>
  pegs.some((peg) => peg.id === pegId && peg.lake === selectedLake.value),
)
const firstCabinPegId = routePrefersCabin
  ? pegs.find((peg) => peg.lake === selectedLake.value && peg.type === 'cabin')?.id
  : undefined
const selectedPegId = ref(
  pegs.find((peg) => peg.id === requestedPegId && peg.lake === selectedLake.value)?.id
  ?? requestedCabinPegId
  ?? firstCabinPegId
  ?? pegs.find((peg) => peg.lake === selectedLake.value)?.id
  ?? '',
)
const selectedPermitId = ref('permit-48h')
const reservationFrom = ref(initialDateRange.dateFrom)
const reservationTo = ref(initialDateRange.dateTo)
const reservationContactName = ref(anglerAccount.value?.name ?? '')
const reservationContactEmail = ref(anglerAccount.value?.email ?? '')
const reservationContactPhone = ref('')
const selectedRentalIds = ref<string[]>(
  routeRentalIds.filter((id) => activeRentalItems.value.some((item) => item.id === id)),
)
const selectedExtraIds = ref<string[]>(
  routeExtraIds.filter((id) => activeReservationExtras.value.some((item) => item.id === id)),
)
let rentalDefaultSelectionApplied = false
const reservationSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const reservationSubmitMessage = ref('')
const offlineReservationQueue = ref<OfflineReservationQueueItem[]>([])
const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineSyncMessage = ref('')
const isOnline = ref(true)
let offlineSyncInProgress = false

const isReservationDataLoading = computed(() =>
  reservationStateStatus.value === 'pending' || mapStateStatus.value === 'pending',
)
const hasReservationDataError = computed(() => Boolean(reservationStateError.value || mapStateError.value))
const liveReservations = computed(() => reservationState.value?.reservations ?? reservations)
const liveRentalBookings = computed(() => reservationState.value?.rentalBookings ?? rentalBookings)
const livePegs = computed(() => mapState.value?.pegs ?? pegs)
const lakePegs = computed(() => livePegs.value.filter((peg) => peg.lake === selectedLake.value))
const availabilityRows = computed(() =>
  lakePegs.value.map((peg) => ({
    availability: getPegAvailability(peg, {
      closures: liveClosures.value,
      dateFrom: reservationFrom.value,
      dateTo: reservationTo.value,
      reservations: liveReservations.value,
    }),
    peg,
  })),
)
const publicAvailabilityReason = (row: (typeof availabilityRows.value)[number]) => {
  const reason = row.availability.reasons[0]
  if (reason) return reason

  if (row.availability.reservable) {
    return row.peg.requiresCabinReservation
      ? 'Miesto je dostupné, rezervácia je viazaná na chatu.'
      : 'Miesto je dostupné pre zvolený termín.'
  }

  return row.availability.description
}
const availabilityOverviewDays = computed(() => buildCalendarDays(reservationFrom.value, 14))
const availabilityOverviewRows = computed(() =>
  lakePegs.value.map((peg) => ({
    days: availabilityOverviewDays.value.map((day) => ({
      availability: getPegAvailability(peg, {
        closures: liveClosures.value,
        dateFrom: day.iso,
        dateTo: day.iso,
        reservations: liveReservations.value,
      }),
      day,
    })),
    peg,
  })),
)
const availabilityOverviewRangeLabel = computed(() => {
  const firstDay = availabilityOverviewDays.value[0]
  const lastDay = availabilityOverviewDays.value.at(-1)

  return firstDay && lastDay
    ? `${formatShortDate(firstDay.iso)} - ${formatShortDate(lastDay.iso)}`
    : 'zvolený termín'
})
const availabilityOverviewFreeCells = computed(() =>
  availabilityOverviewRows.value.reduce(
    (count, row) => count + row.days.filter((day) => day.availability.reservable).length,
    0,
  ),
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
const selectedPeg = computed(() => livePegs.value.find((peg) => peg.id === selectedPegId.value))
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
const mapTarget = computed(() => ({
  path: '/mapa',
  query: {
    do: reservationTo.value,
    jazero: selectedLake.value,
    miesto: selectedPegId.value,
    od: reservationFrom.value,
  },
}))

async function retryReservationData() {
  await Promise.all([
    refreshReservationState(),
    refreshMapState(),
  ])
}
const selectedPermit = computed(
  () => permitProducts.find((permit) => permit.id === selectedPermitId.value) ?? permitProducts[2]!,
)
const selectedCabin = computed(() =>
  (liveCabinProducts.value.length > 0 ? liveCabinProducts.value : seedCabinProducts)
    .find((cabin) => cabin.pegIds.includes(selectedPegId.value)),
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
  contactEmail: reservationContactEmail.value,
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
const reservationAccountHint = computed(() =>
  anglerAccount.value
    ? `${anglerAccount.value.name} · ${anglerAccount.value.email}`
    : '',
)

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
  contactEmail: data.contactEmail,
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
  error instanceof Error ? error.message : 'Rezerváciu sa nepodarilo uložiť v tomto zariadení.'

const getLivePegLabel = (pegId: string) =>
  livePegs.value.find((peg) => peg.id === pegId)?.label ?? getPegLabel(pegId)

function formatReservationCount(count: number) {
  if (count === 1) return '1 rezervácia'
  if (count > 1 && count < 5) return `${count} rezervácie`

  return `${count} rezervácií`
}

const availabilityCellClasses: Record<AvailabilityStatus, string> = {
  available: 'border-success-200 bg-success-500/10 text-success-700 hover:bg-success-500/20',
  blocked: 'border-border bg-muted text-foreground-muted hover:bg-border',
  closed: 'border-error-200 bg-error-500/10 text-error-700 hover:bg-error-500/20',
  limited: 'border-warning-200 bg-warning-500/10 text-warning-700 hover:bg-warning-500/20',
  requires_approval: 'border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100',
  reserved: 'border-error-200 bg-error-500/10 text-error-700 hover:bg-error-500/20',
}

const availabilityLegend = [
  { classes: availabilityCellClasses.available, icon: 'i-heroicons-check-circle', label: 'Dostupné' },
  { classes: availabilityCellClasses.limited, icon: 'i-heroicons-exclamation-triangle', label: 'Čaká na potvrdenie' },
  { classes: availabilityCellClasses.reserved, icon: 'i-heroicons-lock-closed', label: 'Obsadené' },
  { classes: availabilityCellClasses.closed, icon: 'i-heroicons-no-symbol', label: 'Zatvorené' },
]

function formatShortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('sk-SK', {
    day: 'numeric',
    month: 'numeric',
  })
}

function selectAvailabilityOverviewCell(pegId: string, dayIso: string) {
  selectedPegId.value = pegId
  reservationFrom.value = dayIso
  reservationTo.value = dayIso
}

function csvCell(value: string | number | undefined) {
  const rawValue = value ?? ''
  const stringValue = typeof rawValue === 'number'
    ? rawValue.toLocaleString('sk-SK')
    : rawValue

  if (/[;"\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function exportAvailabilityOverviewCsv() {
  if (!import.meta.client || availabilityOverviewRows.value.length === 0) return

  const header = ['Jazero', 'Lovné miesto', 'Dátum', 'Stav', 'Dôvod']
  const rows = availabilityOverviewRows.value.flatMap((row) =>
    row.days.map((day) => [
      getLakeName(row.peg.lake),
      row.peg.label,
      day.day.iso,
      day.availability.label,
      day.availability.reasons.join(', '),
    ]),
  )
  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `rybolov-cetin-dostupnost-${selectedLake.value}-${reservationFrom.value}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

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
    await enqueueOfflineReservation(payload)

    await refreshOfflineReservationQueue()
    reservationSubmitStatus.value = 'success'
    reservationSubmitMessage.value = 'Slabý signál: žiadosť je uložená v tomto zariadení a odošle sa automaticky po obnovení pripojenia.'
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = `Na odoslanie čaká ${formatReservationCount(offlineReservationQueue.value.length)}.`
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
    offlineSyncMessage.value = 'Čakajúca žiadosť bola odstránená zo zariadenia.'
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
    offlineSyncMessage.value = 'Bez pripojenia zostanú žiadosti bezpečne v tomto zariadení.'
    return
  }

  await refreshOfflineReservationQueue()
  if (offlineReservationQueue.value.length === 0) {
    if (!options.silent) {
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = 'V tomto zariadení nečaká žiadna rezervácia na odoslanie.'
    }
    return
  }

  offlineSyncInProgress = true
  offlineSyncStatus.value = 'syncing'
  offlineSyncMessage.value = `Odosielam ${formatReservationCount(offlineReservationQueue.value.length)}.`

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
      ? `${formatReservationCount(syncedCount)} odoslaných, ${formatReservationCount(offlineReservationQueue.value.length)} čaká na ďalší pokus.`
      : `${formatReservationCount(syncedCount)} bolo odoslaných správcovi.`
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
  reservationSubmitMessage.value = 'Odosielam žiadosť správcovi.'

  try {
    const payload = createReservationPayload(validation.data)
    const result = await $fetch<ReservationSubmissionSuccess>('/api/reservations', {
      body: payload,
      method: 'POST',
    })

    reservationSubmitStatus.value = 'success'
    reservationSubmitMessage.value = `${result.message} Správca termín potvrdí v aplikácii, telefonicky alebo e-mailom.`
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
  offlineSyncMessage.value = 'Signál vypadol. Nové rezervácie sa uložia v tomto zariadení.'
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

watch(lakePegs, (rows) => {
  if (!rows.some((peg) => peg.id === selectedPegId.value)) {
    selectedPegId.value = rows[0]?.id ?? ''
  }
})

watch(selectedPegId, () => {
  cleanSelectedExtras()
})

watch(
  anglerAccount,
  (account, previousAccount) => {
    if (!account) return

    if (!reservationContactName.value || reservationContactName.value === previousAccount?.name) {
      reservationContactName.value = account.name
    }

    if (!reservationContactEmail.value || reservationContactEmail.value === previousAccount?.email) {
      reservationContactEmail.value = account.email
    }
  },
  { immediate: true },
)

watch(reservationDraft, () => {
  if (reservationSubmitStatus.value !== 'submitting') {
    reservationSubmitStatus.value = 'idle'
    reservationSubmitMessage.value = ''
  }
})

const selectedQueryList = (ids: string[]) => ids.length > 0 ? ids.join(',') : undefined

watch(
  () => [
    selectedLake.value,
    selectedPegId.value,
    reservationFrom.value,
    reservationTo.value,
    selectedRentalIds.value.join(','),
    selectedExtraIds.value.join(','),
    selectedCabin.value?.id ?? '',
  ],
  () => {
    if (!import.meta.client) return
    void router.replace({
      query: {
        ...route.query,
        chata: selectedCabin.value?.id,
        do: reservationTo.value,
        doplnok: selectedQueryList(selectedExtraIds.value),
        jazero: selectedLake.value,
        miesto: selectedPegId.value || undefined,
        od: reservationFrom.value,
        typ: selectedCabin.value ? 'chata' : undefined,
        vybava: selectedQueryList(selectedRentalIds.value),
      },
    })
  },
)

watch(
  rentalAvailabilityRows,
  (rows) => {
    if (rows.length === 0) return

    const reservableIds = new Set(
      rows
        .filter((row) => row.availability.reservable)
        .map((row) => row.item.id),
    )
    const filteredIds = selectedRentalIds.value.filter((id) => reservableIds.has(id))

    if (filteredIds.length !== selectedRentalIds.value.length) {
      selectedRentalIds.value = filteredIds
    }

    if (selectedRentalIds.value.length > 0) {
      rentalDefaultSelectionApplied = true
      return
    }

    if (!rentalDefaultSelectionApplied) {
      selectedRentalIds.value = rows
        .filter((row) => row.item.recommended && row.availability.reservable)
        .map((row) => row.item.id)
      rentalDefaultSelectionApplied = true
    }
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
      title="Vyberte si miesto a služby"
      description="Zvoľte termín, jazero, lovné miesto, povolenku a vybavenie, ktoré chcete mať pripravené pri príchode."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AvailabilityRangePicker
        v-model:date-from="reservationFrom"
        v-model:date-to="reservationTo"
        class="mb-5"
      />

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

      <DataStatusNotice
        v-if="isReservationDataLoading || hasReservationDataError"
        class="mb-5"
        :title="hasReservationDataError ? 'Dostupnosť sa nepodarilo obnoviť' : 'Načítavam dostupnosť miest'"
        :description="hasReservationDataError ? 'Zobrazujeme posledný dostupný stav rezervácií a lovných miest.' : 'Kontrolujeme aktuálne rezervácie, uzávierky a väzby miest na chaty.'"
        :tone="hasReservationDataError ? 'warning' : 'info'"
        :loading="isReservationDataLoading && !hasReservationDataError"
        :action-label="hasReservationDataError ? 'Skúsiť znova' : ''"
        :action-loading="isReservationDataLoading"
        @action="retryReservationData"
      />

      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-lg font-bold">Lovné miesta a chaty</h2>
                <p class="text-foreground-muted text-sm">
                  Vyberte si voľné miesto pre zvolený termín. Pri miestach s povinnou chatou sa
                  ubytovanie pridá automaticky.
                </p>
              </div>
              <UButton :to="mapTarget" icon="i-heroicons-map-pin" variant="ghost">Mapa</UButton>
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
                  {{ publicAvailabilityReason(row) }}
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
                  <StatusBadge
                    class="shrink-0"
                    :icon="item.rentable ? 'i-heroicons-arrow-path-rounded-square' : 'i-heroicons-shield-check'"
                    :label="item.rentable ? 'požičateľné' : 'vlastné'"
                    size="xs"
                    :tone="item.rentable ? 'primary' : 'warning'"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Dostupnosť po dňoch</h2>
                <p class="text-foreground-muted text-sm">
                  Najbližších 14 dní od zvoleného dátumu. Kliknutím na bunku vyberiete miesto aj deň.
                </p>
              </div>
              <UButton
                icon="i-heroicons-arrow-down-tray"
                variant="ghost"
                :disabled="availabilityOverviewRows.length === 0"
                @click="exportAvailabilityOverviewCsv"
              >
                Stiahnuť prehľad
              </UButton>
            </div>

            <div class="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div class="rounded-md border border-border bg-white px-3 py-2">
                <p class="text-foreground-muted text-xs">Rozsah</p>
                <p class="font-bold">{{ availabilityOverviewRangeLabel }}</p>
              </div>
              <div class="rounded-md border border-border bg-white px-3 py-2">
                <p class="text-foreground-muted text-xs">Jazero</p>
                <p class="font-bold">{{ getLakeName(selectedLake) }}</p>
              </div>
              <div class="rounded-md border border-border bg-white px-3 py-2">
                <p class="text-foreground-muted text-xs">Voľné miesto-dni</p>
                <p class="font-bold">{{ availabilityOverviewFreeCells }}</p>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="item in availabilityLegend"
                :key="item.label"
                class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                :class="item.classes"
              >
                <UIcon :name="item.icon" class="h-4 w-4" />
                {{ item.label }}
              </span>
            </div>

            <div class="mt-5 overflow-x-auto rounded-md border border-border bg-white">
              <table class="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr class="bg-muted text-left">
                    <th class="sticky left-0 z-10 w-44 bg-muted px-3 py-3 font-semibold">
                      Miesto
                    </th>
                    <th
                      v-for="day in availabilityOverviewDays"
                      :key="day.iso"
                      class="border-border border-l px-2 py-3 text-center font-semibold"
                    >
                      <span class="text-foreground-muted block text-xs">{{ day.dayName }}</span>
                      <span>{{ day.dayNumber }}. {{ day.monthName }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in availabilityOverviewRows"
                    :key="row.peg.id"
                    class="border-border border-t"
                  >
                    <th class="sticky left-0 z-10 bg-white px-3 py-3 text-left align-top">
                      <button
                        type="button"
                        class="text-left font-semibold hover:text-primary-800"
                        @click="selectedPegId = row.peg.id"
                      >
                        {{ row.peg.label }}
                      </button>
                      <p class="text-foreground-muted mt-1 text-xs font-normal">
                        {{ row.peg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto' }}
                      </p>
                    </th>
                    <td
                      v-for="cell in row.days"
                      :key="`${row.peg.id}-${cell.day.iso}`"
                      class="border-border border-l p-1"
                    >
                      <button
                        type="button"
                        class="flex h-9 w-full items-center justify-center rounded-md border transition-colors"
                        :class="availabilityCellClasses[cell.availability.status]"
                        :title="`${row.peg.label}, ${cell.day.iso}: ${cell.availability.label}. ${cell.availability.reasons[0] ?? ''}`"
                        @click="selectAvailabilityOverviewCell(row.peg.id, cell.day.iso)"
                      >
                        <UIcon :name="cell.availability.icon" class="h-4 w-4" />
                        <span class="sr-only">
                          {{ row.peg.label }} {{ cell.day.iso }} {{ cell.availability.label }}
                        </span>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Žiadosť o rezerváciu</h2>
            <div
              v-if="!isOnline || offlineReservationQueue.length > 0 || offlineSyncMessage"
              class="mt-4 space-y-3"
            >
              <DataStatusNotice
                :action-label="offlineReservationQueue.length > 0 && isOnline ? 'Odoslať' : ''"
                :action-loading="offlineSyncStatus === 'syncing'"
                :description="offlineSyncMessage || 'Pri výpadku signálu podržíme žiadosť v zariadení a odošleme ju hneď po návrate internetu.'"
                :icon="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                :loading="offlineSyncStatus === 'syncing'"
                :title="
                  !isOnline
                    ? 'Bez pripojenia pri rezervácii'
                    : offlineSyncStatus === 'syncing'
                      ? 'Odosielam čakajúce rezervácie'
                      : 'Čakajúce rezervácie v zariadení'
                "
                :tone="
                  offlineSyncStatus === 'error' || !isOnline
                    ? 'warning'
                    : offlineSyncStatus === 'success'
                      ? 'success'
                      : 'info'
                "
                @action="syncOfflineReservationQueue()"
              />

              <div
                v-if="offlineReservationQueue.length > 0"
                class="space-y-2 rounded-md border border-border bg-muted/50 p-3"
              >
                <div
                  v-for="item in offlineReservationQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ item.payload.contactName }} · {{ getLivePegLabel(item.payload.pegId) }}
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
                    aria-label="Odstrániť čakajúcu rezerváciu"
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
                    class="flex items-start gap-3 rounded-md border p-3 transition-colors"
                    :class="
                      selectedRentalIds.includes(row.item.id)
                        ? 'border-primary-600 bg-primary-50'
                        : !row.availability.reservable
                          ? 'cursor-not-allowed border-error-500/25 bg-error-500/5 opacity-80'
                          : 'cursor-pointer border-border bg-white hover:bg-muted'
                    "
                    :aria-disabled="!row.availability.reservable"
                  >
                    <input
                      v-model="selectedRentalIds"
                      type="checkbox"
                      :value="row.item.id"
                      :disabled="!row.availability.reservable"
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
                        <StatusBadge
                          :icon="extra.source === 'web' ? 'i-heroicons-building-storefront' : 'i-heroicons-plus-circle'"
                          :label="extra.source === 'web' ? 'služba revíru' : 'doplnok'"
                          size="xs"
                          :tone="extra.source === 'web' ? 'success' : 'warning'"
                        />
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
                <div
                  v-if="reservationAccountHint"
                  class="rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-950 sm:col-span-2"
                >
                  <div class="flex items-start gap-2">
                    <UIcon name="i-heroicons-user-circle" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
                    <div>
                      <p class="font-bold">Rezervácia sa uloží k vášmu účtu</p>
                      <p class="mt-1 text-primary-800">{{ reservationAccountHint }}</p>
                    </div>
                  </div>
                </div>

                <label class="block">
                  <span class="text-sm font-semibold">Meno</span>
                  <input
                    v-model="reservationContactName"
                    type="text"
                    autocomplete="name"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="Meno a priezvisko"
                    required
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">E-mail</span>
                  <input
                    v-model="reservationContactEmail"
                    type="email"
                    autocomplete="email"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="meno@example.com"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Telefón</span>
                  <input
                    v-model="reservationContactPhone"
                    type="tel"
                    autocomplete="tel"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm"
                    placeholder="+421 ..."
                    required
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
                valid-description="Termín, miesto, kontakt a vybrané služby sú vyplnené."
              />

              <DataStatusNotice
                v-if="reservationSubmitMessage"
                :description="reservationSubmitMessage"
                :loading="reservationSubmitStatus === 'submitting'"
                :title="
                  reservationSubmitStatus === 'error'
                    ? 'Žiadosť sa nepodarilo odoslať'
                    : reservationSubmitStatus === 'submitting'
                      ? 'Odosielam žiadosť'
                      : 'Žiadosť je odoslaná'
                "
                :tone="
                  reservationSubmitStatus === 'error'
                    ? 'error'
                    : reservationSubmitStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

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
                <p class="font-semibold">{{ getLivePegLabel(reservation.pegId) }}</p>
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
