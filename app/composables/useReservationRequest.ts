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

/**
 * Owns availability lookup, peg/cabin/rental/extras selection, payment method
 * selection and offline-queue submission for the public reservation request
 * form. Extracted from app/pages/rezervacie/index.vue so the page only wires
 * template bindings.
 */
export async function useReservationRequest() {
  // Po prvom await stráca Vue aktívnu inštanciu — hooky sa viažu na ňu explicitne
  const componentInstance = getCurrentInstance()
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
  }, componentInstance)

  onBeforeUnmount(() => {
    if (!import.meta.client) return

    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }, componentInstance)

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

  return {
    actionablePegs,
    availabilityCellClasses,
    availabilityLegend,
    availabilityOverviewDays,
    availabilityOverviewFreeCells,
    availabilityOverviewRangeLabel,
    availabilityOverviewRows,
    availabilityRows,
    availableExtras,
    blockedPegs,
    clearOfflineReservationEdit,
    contactInfo,
    discardOfflineReservation,
    editOfflineReservation,
    editingOfflineReservationId,
    enabledPaymentMethods,
    exportAvailabilityOverviewCsv,
    formatPlaceCount,
    formatReservationItemCount,
    freeCabins,
    getLakeName,
    getLivePegLabel,
    hasReservationDataError,
    isAvailabilityOverviewExpanded,
    isOnline,
    isPlaceListExpanded,
    isReservationDataLoading,
    lakes,
    liveReservations,
    mapTarget,
    offlineReservationEditDescription,
    offlineReservationQueue,
    offlineSyncMessage,
    offlineSyncStatus,
    permitProducts,
    publicAvailabilityReason,
    recommendedAvailableRow,
    recommendedPlaceActionLabel,
    rentalAvailabilityRows,
    requiredEquipment,
    reservationAccountHint,
    reservationCanSubmit,
    reservationChecklist,
    reservationContactEmail,
    reservationContactName,
    reservationContactPhone,
    reservationFrom,
    reservationRangeLabel,
    reservationServiceLines,
    reservationSubmitMessage,
    reservationSubmitNoticeTitle,
    reservationSubmitStatus,
    reservationTo,
    reservationValidationMessages,
    retryReservationData,
    scrollToReservationRequest,
    selectAvailabilityOverviewCell,
    selectRecommendedAvailablePlace,
    selectedAvailability,
    selectedCabin,
    selectedExtraIds,
    selectedLake,
    selectedPaymentMethodId,
    selectedPeg,
    selectedPegId,
    selectedPermitId,
    selectedPlaceIsUnavailable,
    selectedPlaceNoticeDescription,
    selectedPlaceNoticeTitle,
    selectedRentalIds,
    submitReservation,
    syncOfflineReservationQueue,
    syncableOfflineReservations,
  }
}
