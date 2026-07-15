<script setup lang="ts">
import type { LakeSlug } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import type {
  ReservationSubmissionSuccess,
} from '~/services/reservationApiService'
import {
  createPublicReservationState,
  type PublicReservationStateResponse,
} from '~/services/publicAvailabilityService'
import { getValidationMessages, reservationRequestSchema } from '~/schemas/pondSchemas'
import {
  enqueueOfflineReservation,
  getOfflineReservationQueueErrorMessage,
  markOfflineReservationAttempt,
  readOfflineReservationQueue,
  removeOfflineReservation,
  shouldQueueReservationSubmission,
  updateOfflineReservation,
  type OfflineReservationPayload,
  type OfflineReservationQueueItem,
} from '~/services/offlineReservationQueueService'
import { getPegAvailability, type AvailabilityStatus } from '~/utils/availability'
import { resolveAvailabilityDateRange } from '~/utils/availabilityDateRange'
import { buildCalendarDays } from '~/utils/calendar'
import { getRentalAvailability } from '~/utils/rentals'

useHead({
  bodyAttrs: { class: 'overflow-x-hidden' },
  htmlAttrs: { class: 'overflow-x-hidden' },
})

usePublicSeo({
  title: 'Rezervácie',
  description: 'Vyberte jazero, termín, voľné lovné miesto alebo chatu a odošlite žiadosť o rezerváciu bez skrytých predvolieb.',
})

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

const fallbackReservationState = (): PublicReservationStateResponse => createPublicReservationState({
  rentalBookings,
  reservations,
  updatedAt: 'seed',
})
const {
  data: reservationState,
  error: reservationStateError,
  refresh: refreshReservationState,
  status: reservationStateStatus,
} = await useAsyncData<PublicReservationStateResponse>(
  'public-reservation-state',
  () => $fetch<PublicReservationStateResponse>('/api/reservations'),
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
const requestedQueuedReservationId = computed(() =>
  typeof route.query.cakajuca === 'string' ? route.query.cakajuca : '',
)

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
  ?? '',
)
const isPlaceListExpanded = ref(!selectedPegId.value)
const isAvailabilityOverviewExpanded = ref(false)
const selectedPermitId = ref('permit-48h')
const reservationFrom = ref(initialDateRange.dateFrom)
const reservationTo = ref(initialDateRange.dateTo)
const reservationContactName = ref(anglerAccount.value?.name ?? '')
const reservationContactEmail = ref(anglerAccount.value?.email ?? '')
const reservationContactPhone = ref(anglerAccount.value?.phone ?? '')
const selectedPaymentMethodId = ref('')
const selectedRentalIds = ref<string[]>(
  routeRentalIds.filter((id) => activeRentalItems.value.some((item) => item.id === id)),
)
const selectedExtraIds = ref<string[]>(
  routeExtraIds.filter((id) => activeReservationExtras.value.some((item) => item.id === id)),
)
const reservationSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const reservationSubmitMessage = ref('')
const reservationSubmitOutcome = ref<'none' | 'queued' | 'sent'>('none')
const offlineReservationQueue = ref<OfflineReservationQueueItem[]>([])
const offlineSyncStatus = ref<'idle' | 'syncing' | 'success' | 'error'>('idle')
const offlineSyncMessage = ref('')
const editingOfflineReservationId = ref('')
const offlineReservationEditWarnings = ref<string[]>([])
const isOnline = ref(true)
let offlineSyncInProgress = false

const editingOfflineReservation = computed(() =>
  offlineReservationQueue.value.find((item) => item.id === editingOfflineReservationId.value),
)
const syncableOfflineReservations = computed(() =>
  offlineReservationQueue.value.filter((item) => item.id !== editingOfflineReservationId.value),
)
const offlineReservationEditDescription = computed(() => {
  const parts = [
    editingOfflineReservation.value?.lastError
      ? `Posledné odoslanie: ${editingOfflineReservation.value.lastError}`
      : 'Údaje z čakajúcej žiadosti sú načítané vo formulári.',
    ...offlineReservationEditWarnings.value,
  ]

  return parts.join(' ')
})
const reservationSubmitNoticeTitle = computed(() => {
  if (reservationSubmitStatus.value === 'error') return 'Žiadosť sa nepodarilo odoslať'
  if (reservationSubmitStatus.value === 'submitting') return 'Odosielam žiadosť'
  if (reservationSubmitOutcome.value === 'queued') {
    return editingOfflineReservationId.value
      ? 'Zmeny sú uložené v zariadení'
      : 'Žiadosť je uložená v zariadení'
  }

  return 'Žiadosť je odoslaná'
})

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
const recommendedAvailableRow = computed(() => {
  const selectedNeedsCabin = selectedPeg.value?.type === 'cabin' || selectedPeg.value?.requiresCabinReservation
  if (selectedNeedsCabin) return freeCabins.value[0] ?? actionablePegs.value[0]

  return actionablePegs.value[0]
})
const selectedAvailabilityReason = computed(() =>
  selectedAvailability.value?.reasons[0]
  ?? selectedAvailability.value?.description
  ?? '',
)
const selectedPlaceIsUnavailable = computed(() =>
  Boolean(selectedPeg.value && selectedAvailability.value && !selectedAvailability.value.reservable),
)
const selectedPlaceNoticeTitle = computed(() => {
  if (!selectedPeg.value) return 'Vyberte lovné miesto'
  if (selectedAvailability.value?.reservable) return 'Miesto je dostupné'

  return 'Vybrané miesto nie je voľné'
})
const selectedPlaceNoticeDescription = computed(() => {
  if (!selectedPeg.value) return 'Vyberte miesto zo zoznamu alebo otvorte mapu s rovnakým termínom.'
  if (selectedAvailability.value?.reservable) {
    return selectedPeg.value.requiresCabinReservation
      ? 'Miesto je dostupné a do žiadosti sa automaticky pripojí príslušná chata.'
      : 'Miesto je dostupné pre zvolený termín a môžete pokračovať v žiadosti.'
  }

  const recommendedLabel = recommendedAvailableRow.value?.peg.label
  const alternative = recommendedLabel
    ? ` Najbližšia použiteľná voľba v tomto termíne je ${recommendedLabel}.`
    : ' Skúste zmeniť termín alebo druhé jazero.'

  return `${selectedAvailabilityReason.value || 'Vybrané miesto sa v tomto termíne nedá rezervovať.'}${alternative}`
})
const recommendedPlaceActionLabel = computed(() =>
  recommendedAvailableRow.value ? `Prepnúť na ${recommendedAvailableRow.value.peg.label}` : '',
)
const mapTarget = computed(() => ({
  path: '/mapa',
  query: {
    do: reservationTo.value,
    jazero: selectedLake.value,
    miesto: selectedPegId.value || undefined,
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
const selectedPaymentMethod = computed(() =>
  enabledPaymentMethods.value.find((method) => method.id === selectedPaymentMethodId.value),
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
  paymentMethodId: selectedPaymentMethodId.value || undefined,
  pegId: selectedPegId.value,
  permitId: selectedPermitId.value,
  rentalIds: selectedRentalIds.value,
  requiresCabinReservation: Boolean(selectedPeg.value?.requiresCabinReservation),
  reservable: Boolean(selectedAvailability.value?.reservable),
  unavailableRentalLabels: unavailableSelectedRentalLabels.value,
}))
const reservationValidation = computed(() => reservationRequestSchema.safeParse(reservationDraft.value))
const reservationValidationMessages = computed(() => [
  ...getValidationMessages(reservationValidation.value),
  ...(!selectedPaymentMethod.value ? ['Vyberte spôsob platby.'] : []),
])
const reservationCanSubmit = computed(() =>
  reservationValidation.value.success && Boolean(selectedPaymentMethod.value),
)
const reservationAccountHint = computed(() =>
  anglerAccount.value
    ? `${anglerAccount.value.name} · ${anglerAccount.value.email}`
    : '',
)
const reservationRangeLabel = computed(() =>
  reservationFrom.value === reservationTo.value
    ? formatShortDate(reservationFrom.value)
    : `${formatShortDate(reservationFrom.value)} - ${formatShortDate(reservationTo.value)}`,
)
const reservationServiceLines = computed(() => {
  const lines = [
    {
      id: 'permit',
      icon: 'i-heroicons-ticket',
      label: selectedPermit.value.label,
      meta: `${selectedPermit.value.priceEur} € · ${selectedPermit.value.durationHours} h`,
    },
  ]

  if (selectedCabin.value) {
    lines.push({
      id: 'cabin',
      icon: 'i-heroicons-home-modern',
      label: selectedCabin.value.label,
      meta: `${selectedCabin.value.pricePer24hEur} € / 24 h · kapacita ${selectedCabin.value.capacity}`,
    })
  }

  selectedRentals.value.forEach((item) => {
    lines.push({
      id: `rental-${item.id}`,
      icon: 'i-heroicons-archive-box',
      label: item.label,
      meta: item.priceLabel,
    })
  })

  selectedExtras.value.forEach((item) => {
    lines.push({
      id: `extra-${item.id}`,
      icon: item.appliesTo === 'cabin' ? 'i-heroicons-home' : 'i-heroicons-plus-circle',
      label: item.label,
      meta: item.priceLabel,
    })
  })

  return lines
})
const formatReservationItemCount = (count: number) => {
  if (count === 1) return '1 položka'
  if (count > 1 && count < 5) return `${count} položky`

  return `${count} položiek`
}
const reservationChecklist = computed(() => {
  const dateReady = Boolean(reservationFrom.value && reservationTo.value && reservationTo.value >= reservationFrom.value)
  const placeReady = Boolean(selectedPeg.value && selectedAvailability.value?.reservable)
  const equipmentReady = unavailableSelectedRentalLabels.value.length === 0
  const contactReady = reservationContactName.value.trim().length >= 2 && reservationContactPhone.value.trim().length >= 7
  const paymentReady = Boolean(selectedPaymentMethod.value)

  return [
    {
      id: 'date',
      description: dateReady ? reservationRangeLabel.value : 'Skontrolujte dátum príchodu a odchodu.',
      icon: 'i-heroicons-calendar-days',
      ready: dateReady,
      title: 'Termín',
    },
    {
      id: 'place',
      description: placeReady
        ? `${getLakeName(selectedLake.value)} · ${selectedPeg.value?.label}`
        : selectedAvailability.value?.reasons[0] ?? 'Vyberte dostupné miesto.',
      icon: 'i-heroicons-map-pin',
      ready: placeReady,
      title: 'Miesto',
    },
    {
      id: 'equipment',
      description: equipmentReady
        ? formatReservationItemCount(reservationServiceLines.value.length)
        : `Nedostupné: ${unavailableSelectedRentalLabels.value.join(', ')}`,
      icon: 'i-heroicons-archive-box',
      ready: equipmentReady,
      title: 'Služby',
    },
    {
      id: 'contact',
      description: contactReady
        ? `${reservationContactName.value.trim()} · ${reservationContactPhone.value.trim()}`
        : 'Doplňte meno a telefón.',
      icon: 'i-heroicons-user-circle',
      ready: contactReady,
      title: 'Kontakt',
    },
    {
      id: 'payment',
      description: paymentReady
        ? `${selectedPaymentMethod.value?.label}. Pokyny dostanete po potvrdení.`
        : 'Vyberte jeden z dostupných spôsobov platby.',
      icon: 'i-heroicons-banknotes',
      ready: paymentReady,
      title: 'Platba',
    },
  ]
})

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
  paymentMethodId: data.paymentMethodId,
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

function formatPlaceCount(count: number) {
  if (count === 1) return '1 miesto'
  if (count > 1 && count < 5) return `${count} miesta`

  return `${count} miest`
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

function selectRecommendedAvailablePlace() {
  const row = recommendedAvailableRow.value
  if (!row) return

  selectedPegId.value = row.peg.id
}

function scrollToReservationRequest() {
  if (!import.meta.client) return

  isPlaceListExpanded.value = false
  void nextTick(() => {
    const target = document.getElementById('ziadost-rezervacie')
    if (!target) return

    target.focus({ preventScroll: true })
    const top = target.getBoundingClientRect().top + window.scrollY - 88
    window.scrollTo({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      top: Math.max(top, 0),
    })
  })
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

async function clearOfflineReservationEdit() {
  editingOfflineReservationId.value = ''
  offlineReservationEditWarnings.value = []

  if (route.query.cakajuca) {
    await router.replace({
      query: {
        ...route.query,
        cakajuca: undefined,
      },
    })
  }
}

async function editOfflineReservation(item: OfflineReservationQueueItem) {
  const payload = item.payload
  const warnings: string[] = []

  editingOfflineReservationId.value = item.id
  reservationFrom.value = payload.dateFrom
  reservationTo.value = payload.dateTo
  selectedLake.value = payload.lake
  reservationContactName.value = payload.contactName
  reservationContactEmail.value = payload.contactEmail ?? ''
  reservationContactPhone.value = payload.contactPhone
  selectedPermitId.value = permitProducts.some((permit) => permit.id === payload.permitId)
    ? payload.permitId
    : permitProducts[0]?.id ?? ''

  await nextTick()

  if (livePegs.value.some((peg) => peg.id === payload.pegId && peg.lake === payload.lake)) {
    selectedPegId.value = payload.pegId
    isPlaceListExpanded.value = false
  }
  else {
    selectedPegId.value = ''
    isPlaceListExpanded.value = true
    warnings.push('Pôvodné lovné miesto už nie je dostupné, preto vyberte náhradné miesto.')
  }

  await nextTick()

  const reservableRentalIds = new Set(
    rentalAvailabilityRows.value
      .filter((row) => row.availability.reservable)
      .map((row) => row.item.id),
  )
  selectedRentalIds.value = payload.rentalIds.filter((id) => reservableRentalIds.has(id))
  if (selectedRentalIds.value.length !== payload.rentalIds.length) {
    warnings.push('Nedostupná výbava bola z výberu odstránená.')
  }

  const availableExtraIds = new Set(availableExtras.value.map((extra) => extra.id))
  selectedExtraIds.value = payload.extraIds.filter((id) => availableExtraIds.has(id))
  if (selectedExtraIds.value.length !== payload.extraIds.length) {
    warnings.push('Nedostupné doplnky boli z výberu odstránené.')
  }

  const paymentMethod = enabledPaymentMethods.value.find((method) => method.id === payload.paymentMethodId)
  selectedPaymentMethodId.value = paymentMethod?.id ?? ''
  if (payload.paymentMethodId && !paymentMethod) {
    warnings.push('Pôvodný spôsob platby už nie je zapnutý, preto vyberte nový spôsob platby.')
  }

  offlineReservationEditWarnings.value = warnings
  reservationSubmitStatus.value = 'idle'
  reservationSubmitMessage.value = ''

  if (requestedQueuedReservationId.value !== item.id) {
    await router.replace({
      query: {
        ...route.query,
        cakajuca: item.id,
      },
    })
  }

  scrollToReservationRequest()
}

async function queueOfflineReservation(payload: OfflineReservationPayload) {
  try {
    if (editingOfflineReservationId.value) {
      await updateOfflineReservation(editingOfflineReservationId.value, payload)
    }
    else {
      await enqueueOfflineReservation(payload)
    }

    await refreshOfflineReservationQueue()
    reservationSubmitStatus.value = 'success'
    reservationSubmitOutcome.value = 'queued'
    reservationSubmitMessage.value = editingOfflineReservationId.value
      ? 'Slabý signál: zmeny sú uložené v pôvodnej čakajúcej žiadosti. Nevytvorili sme jej druhú kópiu.'
      : 'Slabý signál: žiadosť je uložená v tomto zariadení a odošle sa automaticky po obnovení pripojenia.'
    offlineSyncStatus.value = 'success'
    offlineSyncMessage.value = `Na odoslanie čaká ${formatReservationCount(offlineReservationQueue.value.length)}.`
  }
  catch (error) {
    reservationSubmitStatus.value = 'error'
    reservationSubmitOutcome.value = 'none'
    reservationSubmitMessage.value = getQueueFallbackErrorMessage(error)
  }
}

async function discardOfflineReservation(id: string) {
  try {
    await removeOfflineReservation(id)
    if (editingOfflineReservationId.value === id) {
      await clearOfflineReservationEdit()
    }
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
  if (syncableOfflineReservations.value.length === 0) {
    if (!options.silent) {
      offlineSyncStatus.value = 'success'
      offlineSyncMessage.value = editingOfflineReservationId.value
        ? 'Upravovanú žiadosť odošlite tlačidlom na konci formulára.'
        : 'V tomto zariadení nečaká žiadna rezervácia na odoslanie.'
    }
    return
  }

  offlineSyncInProgress = true
  offlineSyncStatus.value = 'syncing'
  offlineSyncMessage.value = `Odosielam ${formatReservationCount(syncableOfflineReservations.value.length)}.`

  let syncedCount = 0

  try {
    for (const queuedReservation of [...syncableOfflineReservations.value]) {
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

    const remainingReservations = syncableOfflineReservations.value.length
    offlineSyncStatus.value = remainingReservations > 0 ? 'error' : 'success'
    offlineSyncMessage.value = remainingReservations > 0
      ? `${formatReservationCount(syncedCount)} odoslaných, ${formatReservationCount(remainingReservations)} čaká na ďalší pokus.`
      : editingOfflineReservationId.value
        ? `${formatReservationCount(syncedCount)} bolo odoslaných. Upravovaná žiadosť zostáva otvorená vo formulári.`
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
  if (!validation.success || !selectedPaymentMethod.value) {
    reservationSubmitStatus.value = 'error'
    reservationSubmitOutcome.value = 'none'
    reservationSubmitMessage.value = reservationValidationMessages.value[0] ?? 'Skontrolujte údaje v žiadosti.'
    return
  }

  reservationSubmitStatus.value = 'submitting'
  reservationSubmitOutcome.value = 'none'
  reservationSubmitMessage.value = 'Odosielam žiadosť správcovi.'
  const payload = createReservationPayload(validation.data)
  const queuedReservationId = editingOfflineReservationId.value

  if (queuedReservationId) {
    try {
      await updateOfflineReservation(queuedReservationId, payload)
      await refreshOfflineReservationQueue()
    }
    catch (error) {
      reservationSubmitStatus.value = 'error'
      reservationSubmitOutcome.value = 'none'
      reservationSubmitMessage.value = getQueueFallbackErrorMessage(error)
      return
    }
  }

  let result: ReservationSubmissionSuccess
  try {
    result = await $fetch<ReservationSubmissionSuccess>('/api/reservations', {
      body: payload,
      method: 'POST',
    })
  }
  catch (error) {
    if (import.meta.client && shouldQueueReservationSubmission(error, navigator.onLine)) {
      await queueOfflineReservation(payload)
      return
    }

    const errorMessage = getApiErrorMessage(error)
    if (queuedReservationId) {
      await markOfflineReservationAttempt(queuedReservationId, errorMessage)
      await refreshOfflineReservationQueue()
    }
    reservationSubmitStatus.value = 'error'
    reservationSubmitOutcome.value = 'none'
    reservationSubmitMessage.value = errorMessage
    return
  }

  if (queuedReservationId) {
    try {
      await removeOfflineReservation(queuedReservationId)
      await clearOfflineReservationEdit()
      await refreshOfflineReservationQueue()
    }
    catch (error) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = `Žiadosť bola odoslaná, ale jej lokálnu kópiu sa nepodarilo odstrániť. ${getQueueFallbackErrorMessage(error)}`
    }
  }

  await refreshReservationState()
  reservationSubmitStatus.value = 'success'
  reservationSubmitOutcome.value = 'sent'
  reservationSubmitMessage.value = `${result.message} Správca termín potvrdí v aplikácii, telefonicky alebo e-mailom.`
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
    const requestedItem = offlineReservationQueue.value.find(
      (item) => item.id === requestedQueuedReservationId.value,
    )
    if (requestedItem) {
      void editOfflineReservation(requestedItem)
      return
    }

    if (requestedQueuedReservationId.value) {
      offlineSyncStatus.value = 'error'
      offlineSyncMessage.value = 'Vybraná čakajúca rezervácia už v tomto zariadení nie je uložená.'
      void clearOfflineReservationEdit()
      return
    }

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
  selectedPegId.value = ''
  isPlaceListExpanded.value = true
  cleanSelectedExtras()
})

watch(lakePegs, (rows) => {
  if (!rows.some((peg) => peg.id === selectedPegId.value)) {
    selectedPegId.value = ''
    isPlaceListExpanded.value = true
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

    if (!reservationContactPhone.value || reservationContactPhone.value === previousAccount?.phone) {
      reservationContactPhone.value = account.phone ?? ''
    }
  },
  { immediate: true },
)

watch(reservationDraft, () => {
  if (reservationSubmitStatus.value !== 'submitting') {
    reservationSubmitStatus.value = 'idle'
    reservationSubmitMessage.value = ''
    reservationSubmitOutcome.value = 'none'
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

watch(
  enabledPaymentMethods,
  (methods) => {
    if (methods.some((method) => method.id === selectedPaymentMethodId.value)) return

    selectedPaymentMethodId.value = ''
  },
  { immediate: true },
)
</script>

<template>
  <div class="overflow-x-clip">
    <PageHeader
      eyebrow="Rezervácie"
      title="Vyberte si miesto a služby"
      description="Zvoľte termín, jazero, lovné miesto, povolenku a vybavenie, ktoré chcete mať pripravené pri príchode."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AvailabilityRangePicker
        id="vyber-rezervacie"
        v-model:date-from="reservationFrom"
        v-model:date-to="reservationTo"
        class="mb-5 scroll-mt-24"
      />

      <div class="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

        <div class="grid grid-cols-3 gap-2 text-sm">
          <div class="rounded-md border border-border bg-white px-3 py-2">
            <p class="text-foreground-muted text-xs">Voľné miesta</p>
            <p class="font-bold">{{ formatPlaceCount(actionablePegs.length) }}</p>
          </div>
          <div class="rounded-md border border-border bg-white px-3 py-2">
            <p class="text-foreground-muted text-xs">Voľné chaty</p>
            <p class="font-bold">{{ freeCabins.length }}</p>
          </div>
          <div class="rounded-md border border-border bg-white px-3 py-2">
            <p class="text-foreground-muted text-xs">Nedostupné</p>
            <p class="font-bold">{{ formatPlaceCount(blockedPegs.length) }}</p>
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

      <DataStatusNotice
        v-if="selectedPlaceIsUnavailable || actionablePegs.length === 0"
        class="mb-5"
        :action-label="selectedPlaceIsUnavailable ? recommendedPlaceActionLabel : ''"
        :description="selectedPlaceNoticeDescription"
        :icon="selectedPlaceIsUnavailable ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-calendar-days'"
        :title="selectedPlaceNoticeTitle"
        tone="warning"
        @action="selectRecommendedAvailablePlace"
      />

      <div class="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div class="contents">
          <div class="border-border bg-surface order-1 min-w-0 rounded-card border p-5 lg:col-start-1 lg:row-start-1">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Lovné miesta a chaty</h2>
                <p class="text-foreground-muted text-sm">
                  Vyberte si voľné miesto pre zvolený termín. Pri miestach s povinnou chatou sa
                  ubytovanie pridá automaticky.
                </p>
              </div>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <UButton
                  v-if="selectedAvailability?.reservable"
                  data-testid="reservation-continue"
                  type="button"
                  icon="i-heroicons-arrow-right"
                  @click="scrollToReservationRequest"
                >
                  Pokračovať k žiadosti
                </UButton>
                <UButton
                  v-else-if="recommendedAvailableRow"
                  type="button"
                  icon="i-heroicons-check-circle"
                  variant="soft"
                  @click="selectRecommendedAvailablePlace"
                >
                  Vybrať {{ recommendedAvailableRow.peg.label }}
                </UButton>
                <UButton
                  v-if="selectedPeg"
                  type="button"
                  :icon="isPlaceListExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-pencil-square'"
                  variant="soft"
                  class="md:hidden"
                  @click="isPlaceListExpanded = !isPlaceListExpanded"
                >
                  {{ isPlaceListExpanded ? 'Skryť zoznam' : 'Zmeniť miesto' }}
                </UButton>
                <UButton :to="mapTarget" icon="i-heroicons-map-pin" variant="ghost">Mapa</UButton>
              </div>
            </div>

            <div
              v-if="selectedPeg && !isPlaceListExpanded"
              class="mt-5 rounded-md border border-primary-300 bg-primary-50 p-4 md:hidden"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-bold">{{ selectedPeg.label }}</p>
                  <p class="mt-0.5 text-xs text-foreground-muted">
                    {{ selectedPeg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto' }} ·
                    {{ selectedPeg.capacity }} osoby
                  </p>
                </div>
                <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
              </div>
              <p class="mt-3 text-sm text-foreground-muted">
                {{ selectedAvailability ? publicAvailabilityReason({ peg: selectedPeg, availability: selectedAvailability }) : '' }}
              </p>
            </div>

            <div
              class="mt-5 gap-3 md:grid md:grid-cols-2 xl:grid-cols-3"
              :class="isPlaceListExpanded || !selectedPeg ? 'grid' : 'hidden'"
            >
              <button
                v-for="row in availabilityRows"
                :key="row.peg.id"
                type="button"
                class="border-border rounded-md border p-4 text-left transition-colors hover:bg-muted"
                :class="selectedPegId === row.peg.id ? 'border-primary-600 bg-primary-50' : 'bg-white'"
                :aria-pressed="selectedPegId === row.peg.id"
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

          <div class="border-border bg-surface order-3 min-w-0 rounded-card border p-5 lg:col-start-1 lg:row-start-2">
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

          <div class="border-border bg-surface order-4 min-w-0 overflow-hidden rounded-card border p-5 lg:col-start-1 lg:row-start-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Dostupnosť po dňoch</h2>
                <p class="text-foreground-muted text-sm">
                  Najbližších 14 dní od zvoleného dátumu. Kliknutím na bunku vyberiete miesto aj deň.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  id="availability-overview-toggle"
                  type="button"
                  :icon="isAvailabilityOverviewExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  variant="soft"
                  :aria-expanded="isAvailabilityOverviewExpanded"
                  aria-controls="availability-overview-table"
                  @click="isAvailabilityOverviewExpanded = !isAvailabilityOverviewExpanded"
                >
                  {{ isAvailabilityOverviewExpanded ? 'Skryť 14-dňový prehľad' : 'Zobraziť 14-dňový prehľad' }}
                </UButton>
                <UButton
                  icon="i-heroicons-arrow-down-tray"
                  variant="ghost"
                  :disabled="availabilityOverviewRows.length === 0"
                  @click="exportAvailabilityOverviewCsv"
                >
                  Stiahnuť prehľad
                </UButton>
              </div>
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

            <div
              v-if="isAvailabilityOverviewExpanded"
              id="availability-overview-table"
              role="region"
              aria-labelledby="availability-overview-toggle"
              class="mt-5 max-w-full overflow-x-auto rounded-md border border-border bg-white [contain:layout_paint]"
            >
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
                      <span>{{ day.dayNumber }} {{ day.monthName }}</span>
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

        <aside class="order-2 min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
          <div
            id="ziadost-rezervacie"
            tabindex="-1"
            aria-labelledby="ziadost-rezervacie-title"
            class="border-border bg-surface scroll-mt-24 rounded-card border p-5"
          >
            <div class="flex items-center justify-between gap-3">
              <h2 id="ziadost-rezervacie-title" class="text-lg font-bold">Žiadosť o rezerváciu</h2>
              <UButton
                to="#vyber-rezervacie"
                icon="i-heroicons-pencil-square"
                size="sm"
                variant="ghost"
              >
                Upraviť výber
              </UButton>
            </div>

            <DataStatusNotice
              v-if="editingOfflineReservationId"
              class="mt-4"
              action-label="Ukončiť úpravu"
              :description="offlineReservationEditDescription"
              icon="i-heroicons-pencil-square"
              title="Upravujete čakajúcu žiadosť"
              tone="warning"
              @action="clearOfflineReservationEdit"
            />

            <div class="border-border mt-4 border-y py-4">
              <p class="text-foreground-muted text-xs font-semibold uppercase">Aktuálny výber</p>
              <div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between lg:flex-col xl:flex-row">
                <div class="min-w-0">
                  <p class="truncate text-xl font-black">
                    {{ selectedPeg?.label ?? 'Vyberte miesto' }}
                  </p>
                  <p class="text-foreground-muted mt-1 text-sm">
                    {{ getLakeName(selectedLake) }} · {{ reservationRangeLabel }}
                  </p>
                </div>
                <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
              </div>
              <p class="text-foreground-muted mt-3 text-sm">
                Po odoslaní príde správcovi žiadosť s termínom, miestom, kontaktom a vybranými službami.
              </p>
            </div>

            <div class="border-border divide-border divide-y border-b">
              <div
                v-for="step in reservationChecklist"
                :key="step.id"
                class="flex items-start gap-3 py-3 text-sm"
              >
                <div
                  class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  :class="step.ready ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-800'"
                >
                  <UIcon :name="step.ready ? 'i-heroicons-check-circle' : step.icon" class="h-4 w-4" />
                </div>
                <div class="min-w-0">
                  <p class="font-bold">{{ step.title }}</p>
                  <p class="text-foreground-muted mt-0.5 break-words">{{ step.description }}</p>
                </div>
              </div>
            </div>

            <div
              v-if="!isOnline || offlineReservationQueue.length > 0 || offlineSyncMessage"
              class="mt-4 space-y-3"
            >
              <DataStatusNotice
                :action-label="syncableOfflineReservations.length > 0 && isOnline ? 'Odoslať ostatné' : ''"
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
                  class="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm text-foreground"
                  :class="editingOfflineReservationId === item.id ? 'border-warning-300 bg-warning-50' : 'border-transparent bg-white/70'"
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
                  <div class="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      class="rounded-md p-1.5"
                      :class="editingOfflineReservationId === item.id ? 'text-warning-800' : 'text-foreground-muted hover:text-primary-800'"
                      :aria-label="editingOfflineReservationId === item.id ? 'Táto čakajúca rezervácia sa upravuje' : 'Upraviť čakajúcu rezerváciu'"
                      :title="editingOfflineReservationId === item.id ? 'Práve upravujete' : 'Upraviť žiadosť'"
                      @click="editOfflineReservation(item)"
                    >
                      <UIcon name="i-heroicons-pencil-square" class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      class="text-foreground-muted hover:text-error-700 rounded-md p-1.5"
                      aria-label="Odstrániť čakajúcu rezerváciu"
                      title="Odstrániť zo zariadenia"
                      @click="discardOfflineReservation(item.id)"
                    >
                      <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <form class="mt-5 space-y-5" @submit.prevent="submitReservation">
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
                    <UButton
                      v-if="selectedPlaceIsUnavailable && recommendedAvailableRow"
                      type="button"
                      class="mt-3"
                      icon="i-heroicons-check-circle"
                      size="sm"
                      variant="soft"
                      @click="selectRecommendedAvailablePlace"
                    >
                      Prepnúť na {{ recommendedAvailableRow.peg.label }}
                    </UButton>
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

              <fieldset class="min-w-0">
                <legend class="text-sm font-semibold">Povolenka</legend>
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
              </fieldset>

              <fieldset class="min-w-0">
                <legend class="text-sm font-semibold">Požičovňa výbavy</legend>
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
              </fieldset>

              <fieldset v-if="availableExtras.length" class="min-w-0">
                <legend class="text-sm font-semibold">Doplnky k rezervácii</legend>
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
              </fieldset>

              <fieldset class="min-w-0">
                <legend class="text-sm font-semibold">Kontaktné údaje</legend>
                <div class="mt-2 grid gap-3 sm:grid-cols-2">
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
              </fieldset>

              <div class="rounded-md bg-muted p-4 text-sm">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-bold">Vybrané služby</p>
                    <p class="text-foreground-muted mt-1">
                      {{ formatReservationItemCount(reservationServiceLines.length) }} v žiadosti.
                    </p>
                  </div>
                  <UIcon name="i-heroicons-clipboard-document-check" class="text-primary-800 h-5 w-5 shrink-0" />
                </div>
                <div class="border-border divide-border mt-3 divide-y border-y">
                  <div
                    v-for="line in reservationServiceLines"
                    :key="line.id"
                    class="flex items-start gap-3 py-3"
                  >
                    <UIcon :name="line.icon" class="text-primary-800 mt-0.5 h-4 w-4 shrink-0" />
                    <div class="min-w-0">
                      <p class="font-semibold">{{ line.label }}</p>
                      <p class="text-foreground-muted mt-0.5">{{ line.meta }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <fieldset class="min-w-0 rounded-md border border-border bg-white p-4 text-sm">
                <legend class="px-1 font-bold">Spôsob platby (povinné)</legend>
                <p id="payment-method-help" class="text-foreground-muted mt-1">
                  Platobné pokyny dostanete až po potvrdení rezervácie správcom.
                </p>
                <div v-if="enabledPaymentMethods.length" class="mt-3 grid gap-2">
                  <label
                    v-for="method in enabledPaymentMethods"
                    :key="method.id"
                    class="flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
                    :class="selectedPaymentMethodId === method.id ? 'border-primary-600 bg-primary-50' : 'border-border bg-white hover:bg-muted'"
                  >
                    <input
                      v-model="selectedPaymentMethodId"
                      :data-testid="`payment-method-${method.id}`"
                      type="radio"
                      name="payment-method"
                      :value="method.id"
                      aria-describedby="payment-method-help"
                      required
                      class="mt-1 h-4 w-4 accent-primary-700"
                    >
                    <UIcon
                      :name="method.kind === 'cash' ? 'i-heroicons-banknotes' : method.kind === 'bank-transfer' ? 'i-heroicons-building-library' : 'i-heroicons-credit-card'"
                      class="text-primary-800 mt-0.5 h-5 w-5 shrink-0"
                    />
                    <div class="min-w-0">
                      <p class="font-semibold">{{ method.label }}</p>
                      <p class="text-foreground-muted">{{ method.instructions }}</p>
                    </div>
                  </label>
                </div>
                <AppState
                  v-else
                  class="mt-3"
                  title="Platba sa dohodne so správcom"
                  description="Momentálne nie je zapnutý žiadny spôsob platby v aplikácii."
                />
              </fieldset>

              <ValidationSummary
                :messages="reservationValidationMessages"
                valid-title="Žiadosť je pripravená"
                valid-description="Termín, miesto, kontakt a vybrané služby sú vyplnené."
              />

              <DataStatusNotice
                v-if="reservationSubmitMessage"
                :description="reservationSubmitMessage"
                :loading="reservationSubmitStatus === 'submitting'"
                :title="reservationSubmitNoticeTitle"
                :tone="
                  reservationSubmitStatus === 'error'
                    ? 'error'
                    : reservationSubmitStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

              <UButton
                type="submit"
                icon="i-heroicons-paper-airplane"
                block
                :disabled="!reservationCanSubmit || reservationSubmitStatus === 'submitting'"
                :loading="reservationSubmitStatus === 'submitting'"
              >
                {{ editingOfflineReservationId ? 'Odoslať opravenú žiadosť' : 'Odoslať žiadosť' }}
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

          <div class="border-border bg-surface hidden rounded-card border p-5 lg:block">
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
