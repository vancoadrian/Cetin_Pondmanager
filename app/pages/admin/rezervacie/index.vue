<script setup lang="ts">
import type {
  LakeSlug,
  NotificationBroadcastStatus,
  NotificationDeliveryStatus,
  PaymentMethod,
  RentalBooking,
  Reservation,
} from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import type { PaymentMethodMutationSuccess } from '~/services/paymentMethodService'
import type {
  ReservationNotificationSummary,
  ReservationNotificationSummaryResponse,
  ReservationDecisionSuccess,
  ReservationSubmissionSuccess,
  ReservationStateResponse,
} from '~/services/reservationApiService'
import {
  reservationCommunicationDeliveryProviderLabels,
  reservationCommunicationDeliveryStatusLabels,
  type ReservationDecisionMode,
} from '~/services/reservationWorkflowService'
import { getPegAvailability, rangesOverlap } from '~/utils/availability'
import { addDays, addMonths, buildCalendarDays, buildMonthCalendarDays, getMonthStart } from '~/utils/calendar'
import { getRentalAvailability, type RentalAvailabilityStatus } from '~/utils/rentals'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Admin rezervácie' })

type ReservationAdminView = 'ziadosti' | 'kalendar' | 'nova' | 'nastavenia'

const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()
const {
  cabinProducts: seedCabinProducts,
  getLakeName,
  getPegLabel,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  permitProducts,
  rentalBookings,
  reservations,
} = usePondData()

const fallbackReservationState = (): ReservationStateResponse => ({
  ok: true,
  rentalBookings,
  reservations,
  updatedAt: 'seed',
})
const { data: reservationState, refresh: refreshReservationState } = await useAsyncData<ReservationStateResponse>(
  'admin-reservation-state',
  () => $fetch<ReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
const fallbackReservationNotificationState = (): ReservationNotificationSummaryResponse => ({
  notifications: [],
  ok: true,
  updatedAt: 'seed',
})
const { data: reservationNotificationState } = await useAsyncData<ReservationNotificationSummaryResponse>(
  'admin-reservation-notification-state',
  () => requestFetch<ReservationNotificationSummaryResponse>('/api/admin/reservations/notifications'),
  {
    default: fallbackReservationNotificationState,
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
const { data: mapState } = await useAsyncData<MapStateResponse>(
  'admin-reservation-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)
const { liveCabinProducts } = await useCabinCatalogState({ admin: true, key: 'admin-reservation-cabin-catalog-state' })
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-reservation-closure-state' })
const {
  enabledPaymentMethods,
  livePaymentMethods,
  refresh: refreshPaymentMethodState,
} = await usePaymentMethodState({ admin: true, key: 'admin-reservation-payment-state' })
const {
  activeRentalItems,
  activeReservationExtras,
  liveRentalItems,
  liveReservationExtras,
} = await useRentalCatalogState({ admin: true, key: 'admin-reservation-rental-catalog-state' })
const {
  canOperate: canOperateReservations,
  isReadOnly: reservationsReadOnly,
  label: reservationAccessLabel,
  readOnlyMessage: reservationReadOnlyMessage,
} = useAdminModuleAccess('reservations')

const reservationLakeFilter = ref<LakeSlug | 'all'>('all')
const {
  adminRentalBookings,
  adminReservations,
  clearWorkflowMessage,
  getDefaultDecisionMode,
  replaceReservationWorkflowState,
  workflowMessage,
} = useAdminReservationWorkflow(
  reservationState.value?.reservations ?? reservations,
  reservationState.value?.rentalBookings ?? rentalBookings,
)
const routeReservationId = computed(() =>
  typeof route.query.rezervacia === 'string'
    ? route.query.rezervacia
    : typeof route.query.reservationId === 'string' ? route.query.reservationId : '',
)
const activeReservationAdminView = ref<ReservationAdminView>(
  routeReservationId.value ? 'ziadosti' : parseReservationAdminView(route.query.sekcia),
)
const selectedReservationId = ref(
  adminReservations.value.find((reservation) => reservation.id === routeReservationId.value)?.id ??
    adminReservations.value.find((reservation) => reservation.status === 'pending')?.id ??
    adminReservations.value[0]?.id ??
    '',
)
const decisionMode = ref<ReservationDecisionMode>('approve')
const adminNoteDraft = ref('')
const calendarMode = ref<'week' | 'month'>('week')
const calendarStart = ref(new Date().toISOString().slice(0, 10))
const calendarLake = ref<LakeSlug>('velky-cetin')
const decisionSubmitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const decisionSubmitMessage = ref('')
const decisionCommunicationDraft = ref<ReservationDecisionSuccess['communicationDraft']>()
const decisionCommunicationDelivery = ref<ReservationDecisionSuccess['communicationDelivery']>()
const adminReservationSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const adminReservationSubmitMessage = ref('')
const paymentMethodSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const paymentMethodSubmitMessage = ref('')
const paymentMethodDraft = ref<PaymentMethod[]>([])
const reservationAdminTabScrollerElement = ref<HTMLElement | null>(null)
const reservationDetailElement = ref<HTMLElement | null>(null)
const showCalendarContext = ref(false)
const livePegs = computed(() => mapState.value?.pegs ?? pegs)
const activeCabinProducts = computed(() =>
  liveCabinProducts.value.length > 0 ? liveCabinProducts.value : seedCabinProducts,
)

function getFirstPegId(lake: LakeSlug) {
  return livePegs.value.find((peg) => peg.lake === lake)?.id ?? ''
}

function getLivePegLabel(pegId: string) {
  return livePegs.value.find((peg) => peg.id === pegId)?.label ?? getPegLabel(pegId)
}

const createDefaultAdminReservationDraft = () => ({
  contactEmail: '',
  contactName: '',
  contactPhone: '',
  dateFrom: '2026-06-10',
  dateTo: '2026-06-12',
  extraIds: [] as string[],
  internalNote: '',
  lake: 'velky-cetin' as LakeSlug,
  paymentMethodId: enabledPaymentMethods.value[0]?.id ?? '',
  pegId: getFirstPegId('velky-cetin'),
  permitId: permitProducts[0]?.id ?? '',
  rentalIds: [] as string[],
  source: 'phone' as Extract<Reservation['source'], 'phone' | 'admin'>,
  status: 'pending' as Extract<Reservation['status'], 'pending' | 'confirmed'>,
})
const adminReservationDraft = reactive(createDefaultAdminReservationDraft())

watch(
  reservationState,
  (state) => {
    if (!state) return
    replaceReservationWorkflowState(state.reservations, state.rentalBookings)
  },
  { immediate: true },
)

const reservationStatusOrder: Record<Reservation['status'], number> = {
  pending: 0,
  confirmed: 1,
  blocked: 2,
}
const filteredReservations = computed(() =>
  adminReservations.value
    .filter((reservation) => reservationLakeFilter.value === 'all' || reservation.lake === reservationLakeFilter.value)
    .sort((first, second) => reservationStatusOrder[first.status] - reservationStatusOrder[second.status]),
)
const selectedReservation = computed(() =>
  adminReservations.value.find((reservation) => reservation.id === selectedReservationId.value),
)
const reservationNotificationById = computed(() => {
  const notificationsById = new Map<string, ReservationNotificationSummary>()

  for (const notification of reservationNotificationState.value?.notifications ?? []) {
    const current = notificationsById.get(notification.reservationId)
    if (!current || notification.createdAt.localeCompare(current.createdAt) > 0) {
      notificationsById.set(notification.reservationId, notification)
    }
  }

  return notificationsById
})
const selectedReservationNotification = computed(() =>
  selectedReservation.value ? reservationNotificationById.value.get(selectedReservation.value.id) : undefined,
)

watch(
  filteredReservations,
  (rows) => {
    if (!rows.some((reservation) => reservation.id === selectedReservationId.value)) {
      if (rows[0]) {
        selectReservation(rows[0], { syncRoute: Boolean(routeReservationId.value) })
      }
      else {
        selectedReservationId.value = ''
      }
    }
  },
  { immediate: true },
)

watch(
  routeReservationId,
  (reservationId) => {
    if (!reservationId) return

    activeReservationAdminView.value = 'ziadosti'
    selectReservationById(reservationId, { syncLake: true, syncRoute: false })
  },
  { flush: 'post', immediate: true },
)
watch(
  [reservationDetailElement, routeReservationId],
  async ([detailElement, reservationId]) => {
    if (!import.meta.client || !detailElement || !reservationId) return

    await nextTick()
    detailElement.scrollIntoView({ behavior: 'auto', block: 'start' })
  },
  { flush: 'post' },
)

watch(
  selectedReservation,
  (reservation) => {
    adminNoteDraft.value = reservation?.internalNote ?? ''
    decisionMode.value = getDefaultDecisionMode(reservation)
    decisionSubmitStatus.value = 'idle'
    decisionSubmitMessage.value = ''
    decisionCommunicationDraft.value = undefined
    decisionCommunicationDelivery.value = undefined
    clearWorkflowMessage()
  },
  { immediate: true },
)

const reservationStats = computed(() => ({
  pending: adminReservations.value.filter((reservation) => reservation.status === 'pending').length,
  confirmed: adminReservations.value.filter((reservation) => reservation.status === 'confirmed').length,
  blocked: adminReservations.value.filter((reservation) => reservation.status === 'blocked').length,
  web: adminReservations.value.filter((reservation) => reservation.source === 'web').length,
}))
const reservationAdminViewTabs = computed(() => [
  {
    count: reservationStats.value.pending,
    icon: 'i-heroicons-inbox-arrow-down',
    label: 'Žiadosti',
    value: 'ziadosti' as const,
  },
  {
    icon: 'i-heroicons-calendar-days',
    label: 'Kalendár',
    value: 'kalendar' as const,
  },
  {
    icon: 'i-heroicons-plus-circle',
    label: 'Nová rezervácia',
    value: 'nova' as const,
  },
  {
    icon: 'i-heroicons-cog-6-tooth',
    label: 'Nastavenia',
    value: 'nastavenia' as const,
  },
])

const adminReservationPegs = computed(() =>
  livePegs.value.filter((peg) => peg.lake === adminReservationDraft.lake),
)
const adminReservationSelectedPeg = computed(() =>
  adminReservationPegs.value.find((peg) => peg.id === adminReservationDraft.pegId),
)
const adminReservationCabin = computed(() =>
  activeCabinProducts.value.find((cabin) => cabin.pegIds.includes(adminReservationDraft.pegId)),
)
const adminReservationAvailableExtras = computed(() =>
  activeReservationExtras.value.filter((extra) => {
    const lakeMatches = !extra.lake || extra.lake === adminReservationDraft.lake
    const surfaceMatches = extra.appliesTo === 'all' || Boolean(adminReservationCabin.value)

    return lakeMatches && surfaceMatches
  }),
)
const adminReservationAvailability = computed(() => {
  const peg = adminReservationSelectedPeg.value
  if (!peg) return undefined

  return getPegAvailability(peg, {
    closures: liveClosures.value,
    dateFrom: adminReservationDraft.dateFrom,
    dateTo: adminReservationDraft.dateTo,
    includePrivateReservationDetails: true,
    reservations: adminReservations.value,
  })
})
const adminReservationRentalRows = computed(() =>
  activeRentalItems.value.map((item) => ({
    availability: getRentalAvailability(item, {
      bookings: adminRentalBookings.value,
      dateFrom: adminReservationDraft.dateFrom,
      dateTo: adminReservationDraft.dateTo,
    }),
    item,
  })),
)
const adminReservationCanSubmit = computed(() =>
  Boolean(
    adminReservationDraft.contactName.trim().length >= 2 &&
    adminReservationDraft.contactPhone.trim().length >= 7 &&
    adminReservationDraft.pegId &&
    adminReservationDraft.permitId &&
    adminReservationAvailability.value?.reservable,
  ),
)

watch(
  () => adminReservationDraft.lake,
  (lake) => {
    if (!adminReservationPegs.value.some((peg) => peg.id === adminReservationDraft.pegId)) {
      adminReservationDraft.pegId = getFirstPegId(lake)
    }
  },
)

watch(adminReservationPegs, (rows) => {
  if (!rows.some((peg) => peg.id === adminReservationDraft.pegId)) {
    adminReservationDraft.pegId = rows[0]?.id ?? ''
  }
})

watch(
  adminReservationAvailableExtras,
  (extras) => {
    const allowedExtraIds = new Set(extras.map((extra) => extra.id))
    adminReservationDraft.extraIds = adminReservationDraft.extraIds.filter((id) => allowedExtraIds.has(id))
  },
)

watch(
  adminReservationRentalRows,
  (rows) => {
    const availableRentalIds = new Set(
      rows.filter((row) => row.availability.reservable).map((row) => row.item.id),
    )
    adminReservationDraft.rentalIds = adminReservationDraft.rentalIds.filter((id) => availableRentalIds.has(id))
  },
)

watch(
  livePaymentMethods,
  (methods) => {
    paymentMethodDraft.value = methods.map((method) => ({ ...method }))
  },
  { immediate: true },
)

const togglePaymentMethodDraft = (methodId: string, enabled: boolean) => {
  paymentMethodDraft.value = paymentMethodDraft.value.map((method) =>
    method.id === methodId ? { ...method, enabled } : method,
  )
  paymentMethodSubmitStatus.value = 'idle'
  paymentMethodSubmitMessage.value = ''
}
const handlePaymentMethodToggle = (methodId: string, event: Event) => {
  togglePaymentMethodDraft(methodId, Boolean((event.target as HTMLInputElement | null)?.checked))
}

const conflictingClosures = computed(() =>
  liveClosures.value.filter((closure) => closure.affectsReservations),
)
const pegAvailabilityRows = computed(() =>
  livePegs.value
    .filter((peg) => peg.lake === calendarLake.value)
    .map((peg) => ({
      availability: getPegAvailability(peg, {
        closures: liveClosures.value,
        includePrivateReservationDetails: true,
        reservations: adminReservations.value,
      }),
      peg,
    })),
)
const calendarDays = computed(() =>
  calendarMode.value === 'month'
    ? buildMonthCalendarDays(calendarStart.value)
    : buildCalendarDays(calendarStart.value, 7),
)
const calendarRangeLabel = computed(() => {
  const firstDay = calendarDays.value[0]
  const lastDay = calendarDays.value.at(-1)
  if (!firstDay || !lastDay) return calendarStart.value

  if (calendarMode.value === 'month') {
    return `${firstDay.monthName} ${firstDay.iso.slice(0, 4)}`
  }

  return `${firstDay.iso} až ${lastDay.iso}`
})
const calendarGridTemplate = computed(() =>
  `160px repeat(${calendarDays.value.length}, minmax(${calendarMode.value === 'month' ? '88px' : '104px'}, 1fr))`,
)
const calendarTableMinWidth = computed(() =>
  `${160 + calendarDays.value.length * (calendarMode.value === 'month' ? 88 : 104)}px`,
)
const calendarLakePegs = computed(() => livePegs.value.filter((peg) => peg.lake === calendarLake.value))
const calendarRows = computed(() =>
  calendarLakePegs.value.map((peg) => ({
    peg,
    cells: calendarDays.value.map((day) => {
      const availability = getPegAvailability(peg, {
        closures: liveClosures.value,
        dateFrom: day.iso,
        dateTo: day.iso,
        includePrivateReservationDetails: true,
        reservations: adminReservations.value,
      })
      const reservation = adminReservations.value.find(
        (item) => item.pegId === peg.id && rangesOverlap(day.iso, day.iso, item.from, item.to),
      )

      return {
        availability,
        day,
        reservation,
      }
    }),
  })),
)
const calendarDaySummaries = computed(() =>
  calendarDays.value.map((day) => {
    const cells = calendarRows.value.flatMap((row) => {
      const cell = row.cells.find((item) => item.day.iso === day.iso)
      return cell ? [{ ...cell, peg: row.peg }] : []
    })

    return {
      available: cells.filter((cell) => cell.availability.status === 'available').length,
      blocked: cells.filter((cell) => ['blocked', 'closed'].includes(cell.availability.status)).length,
      day,
      pending: cells.filter((cell) => ['limited', 'requires_approval'].includes(cell.availability.status)).length,
      reservations: cells.flatMap((cell) => cell.reservation ? [{ peg: cell.peg, reservation: cell.reservation }] : []),
      reserved: cells.filter((cell) => cell.availability.status === 'reserved').length,
    }
  }),
)
const calendarSummary = computed(() => {
  const cells = calendarRows.value.flatMap((row) => row.cells)

  return {
    available: cells.filter((cell) => cell.availability.status === 'available').length,
    blocked: cells.filter((cell) => ['blocked', 'closed'].includes(cell.availability.status)).length,
    pending: cells.filter((cell) => ['limited', 'requires_approval'].includes(cell.availability.status)).length,
    reserved: cells.filter((cell) => cell.availability.status === 'reserved').length,
  }
})

const selectedPeg = computed(() =>
  selectedReservation.value ? livePegs.value.find((peg) => peg.id === selectedReservation.value?.pegId) : undefined,
)
const selectedPermit = computed(() =>
  permitProducts.find((permit) => permit.id === selectedReservation.value?.permitId),
)
const selectedCabin = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return undefined
  if (reservation.cabinProductId) {
    return activeCabinProducts.value.find((cabin) => cabin.id === reservation.cabinProductId)
  }

  return activeCabinProducts.value.find((cabin) => cabin.pegIds.includes(reservation.pegId))
})
const selectedExtras = computed(() =>
  liveReservationExtras.value.filter((extra) => selectedReservation.value?.extraIds.includes(extra.id)),
)
const selectedAvailability = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation || !selectedPeg.value) return undefined

  return getPegAvailability(selectedPeg.value, {
    closures: liveClosures.value,
    dateFrom: reservation.from,
    dateTo: reservation.to,
    includePrivateReservationDetails: true,
    reservations: adminReservations.value.filter((item) => item.id !== reservation.id),
  })
})
const selectedClosureConflicts = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return []

  return liveClosures.value.filter((closure) => {
    const targetsLake = closure.lake === 'all' || closure.lake === reservation.lake
    const targetsPeg = !closure.pegIds || closure.pegIds.includes(reservation.pegId)

    return (
      closure.affectsReservations &&
      targetsLake &&
      targetsPeg &&
      rangesOverlap(reservation.from, reservation.to, closure.from, closure.to)
    )
  })
})
const selectedRentalRows = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return []

  return reservation.rentalIds.flatMap((id) => {
    const item = liveRentalItems.value.find((rentalItem) => rentalItem.id === id)
    if (!item) return []

    const bookings = adminRentalBookings.value.filter((booking) => booking.reservationId !== reservation.id)

    return [
      {
        availability: getRentalAvailability(item, {
          bookings,
          dateFrom: reservation.from,
          dateTo: reservation.to,
        }),
        booking: adminRentalBookings.value.find(
          (booking) => booking.reservationId === reservation.id && booking.rentalItemId === item.id,
        ),
        item,
      },
    ]
  })
})
const decisionSummary = computed(() => {
  if (!selectedReservation.value) return 'Vyberte rezerváciu zo zoznamu.'
  if (decisionMode.value === 'approve') return 'Rezerváciu možno schváliť po telefonickom potvrdení detailov.'
  if (decisionMode.value === 'call') return 'Rezervácia potrebuje doplňujúci telefonát alebo úpravu termínu.'

  return 'Rezerváciu označte na zamietnutie s krátkym dôvodom v internej poznámke.'
})

function buildSmsHref(draft: NonNullable<ReservationDecisionSuccess['communicationDraft']>) {
  return `sms:${encodeURIComponent(draft.recipientPhone)}?body=${encodeURIComponent(draft.smsBody)}`
}

function buildMailtoHref(draft: NonNullable<ReservationDecisionSuccess['communicationDraft']>) {
  if (!draft.emailTo) return ''

  return `mailto:${encodeURIComponent(draft.emailTo)}?subject=${encodeURIComponent(draft.emailSubject)}&body=${encodeURIComponent(draft.emailBody ?? '')}`
}

function deliveryStatusTone(status: NotificationBroadcastStatus | NotificationDeliveryStatus | NonNullable<ReservationDecisionSuccess['communicationDelivery']>['status']): StatusBadgeTone {
  switch (status) {
    case 'sent':
      return 'success'
    case 'failed':
      return 'error'
    case 'skipped':
      return 'muted'
    case 'prepared':
      return 'warning'
  }
}

function deliveryStatusIcon(status: NotificationBroadcastStatus | NotificationDeliveryStatus | NonNullable<ReservationDecisionSuccess['communicationDelivery']>['status']) {
  switch (status) {
    case 'sent':
      return 'i-heroicons-paper-airplane'
    case 'failed':
      return 'i-heroicons-x-circle'
    case 'skipped':
      return 'i-heroicons-minus-circle'
    case 'prepared':
      return 'i-heroicons-clock'
  }
}

const statusTone = (status: Reservation['status']): StatusBadgeTone =>
  status === 'confirmed' ? 'success' : status === 'pending' ? 'warning' : 'error'

const statusIcon = (status: Reservation['status']) =>
  status === 'confirmed'
    ? 'i-heroicons-check-circle'
    : status === 'pending'
      ? 'i-heroicons-clock'
      : 'i-heroicons-no-symbol'

const statusLabel = (status: Reservation['status']) => {
  switch (status) {
    case 'confirmed':
      return 'potvrdené'
    case 'pending':
      return 'čaká'
    case 'blocked':
      return 'blokované'
  }
}
const sourceLabel = (source: Reservation['source']) => {
  switch (source) {
    case 'phone':
      return 'telefón'
    case 'web':
      return 'web'
    case 'admin':
      return 'admin'
  }
}
const sourceIcon = (source: Reservation['source']) =>
  source === 'web'
    ? 'i-heroicons-globe-alt'
    : source === 'phone'
      ? 'i-heroicons-phone'
      : 'i-heroicons-user-circle'

const notificationBroadcastStatusLabels: Record<NotificationBroadcastStatus, string> = {
  failed: 'chyba',
  prepared: 'pripravené',
  sent: 'odoslané',
  skipped: 'bez príjemcu',
}
const notificationDeliveryStatusLabels: Record<NotificationDeliveryStatus, string> = {
  failed: 'chyba',
  prepared: 'pripravené',
  sent: 'odoslané',
  skipped: 'preskočené',
}
const notificationDeliveryStatuses: NotificationDeliveryStatus[] = ['sent', 'prepared', 'failed', 'skipped']
const paymentMethodTone = (enabled: boolean): StatusBadgeTone => enabled ? 'success' : 'warning'
const paymentMethodIcon = (enabled: boolean) => enabled ? 'i-heroicons-check-circle' : 'i-heroicons-pause-circle'
const draftReservationStatusTone = computed(() => adminReservationDraft.status === 'confirmed' ? 'success' : 'warning')
const draftReservationStatusIcon = computed(() =>
  adminReservationDraft.status === 'confirmed' ? 'i-heroicons-check-circle' : 'i-heroicons-clock',
)
function rentalAvailabilityTone(status: RentalAvailabilityStatus): StatusBadgeTone {
  if (status === 'available') return 'success'
  if (status === 'limited') return 'warning'

  return 'error'
}
function rentalAvailabilityIcon(status: RentalAvailabilityStatus) {
  if (status === 'available') return 'i-heroicons-check-circle'
  if (status === 'limited') return 'i-heroicons-exclamation-triangle'

  return 'i-heroicons-x-circle'
}
function formatDateTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}
function getReservationNotificationDeliveryBadges(summary: ReservationNotificationSummary) {
  return notificationDeliveryStatuses
    .map((status) => ({
      count: summary.deliveryCounts[status],
      label: notificationDeliveryStatusLabels[status],
      status,
    }))
    .filter((item) => item.count > 0)
}
const rentalBookingStatusLabel = (status?: RentalBooking['status']) => {
  switch (status) {
    case 'reserved':
      return 'potvrdené'
    case 'requested':
      return 'žiadané'
    case 'returned':
      return 'vrátené'
    case 'unavailable':
      return 'nedostupné'
    case 'cancelled':
      return 'zrušené'
    default:
      return 'bez záznamu'
  }
}
function parseReservationAdminView(value: unknown): ReservationAdminView {
  const normalizedValue = Array.isArray(value) ? value[0] : value

  if (normalizedValue === 'kalendar' || normalizedValue === 'nova' || normalizedValue === 'nastavenia') {
    return normalizedValue
  }

  return 'ziadosti'
}
function reservationAdminTabClass(isActive: boolean) {
  return isActive
    ? 'border-primary-700 text-primary-900'
    : 'border-transparent text-foreground-muted hover:border-border hover:text-foreground'
}
function selectReservationAdminView(view: ReservationAdminView) {
  activeReservationAdminView.value = view
  const query = { ...route.query }

  if (view === 'ziadosti') delete query.sekcia
  else query.sekcia = view

  if (view !== 'ziadosti') {
    delete query.rezervacia
    delete query.reservationId
  }

  void router.replace({ query })
}
function handleReservationAdminTabKeydown(event: KeyboardEvent, index: number) {
  let targetIndex: number | undefined

  if (event.key === 'ArrowLeft') {
    targetIndex = (index - 1 + reservationAdminViewTabs.value.length) % reservationAdminViewTabs.value.length
  }
  else if (event.key === 'ArrowRight') {
    targetIndex = (index + 1) % reservationAdminViewTabs.value.length
  }
  else if (event.key === 'Home') {
    targetIndex = 0
  }
  else if (event.key === 'End') {
    targetIndex = reservationAdminViewTabs.value.length - 1
  }

  if (targetIndex === undefined) return

  event.preventDefault()
  const tabList = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
  const targetView = reservationAdminViewTabs.value[targetIndex]?.value
  if (!targetView) return

  selectReservationAdminView(targetView)
  void nextTick(() => {
    tabList?.querySelectorAll<HTMLElement>('[role="tab"]')[targetIndex]?.focus()
  })
}
async function revealActiveReservationAdminTab(behavior: ScrollBehavior = 'auto') {
  if (!import.meta.client) return

  await nextTick()
  const scroller = reservationAdminTabScrollerElement.value
  const activeTab = scroller?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  if (!scroller || !activeTab) return

  const centeredLeft = activeTab.offsetLeft - (scroller.clientWidth - activeTab.offsetWidth) / 2
  scroller.scrollTo({ behavior, left: Math.max(0, centeredLeft) })
}
watch(
  () => route.query.sekcia,
  (view) => {
    activeReservationAdminView.value = routeReservationId.value ? 'ziadosti' : parseReservationAdminView(view)
  },
)
watch(
  activeReservationAdminView,
  () => void revealActiveReservationAdminTab('smooth'),
  { flush: 'post', immediate: true },
)
function replaceReservationQuery(reservationId: string) {
  const nextQuery = { ...route.query }
  delete nextQuery.reservationId
  delete nextQuery.sekcia

  if (reservationId) {
    nextQuery.rezervacia = reservationId
  }
  else {
    delete nextQuery.rezervacia
  }

  void router.replace({ query: nextQuery })
}
function selectReservation(
  reservation: Reservation,
  options: { syncLake?: boolean, syncRoute?: boolean } = {},
) {
  if (options.syncLake) {
    reservationLakeFilter.value = reservation.lake
  }

  selectedReservationId.value = reservation.id

  if (options.syncRoute ?? true) {
    activeReservationAdminView.value = 'ziadosti'
    replaceReservationQuery(reservation.id)
  }
}
function selectReservationById(
  reservationId: string,
  options: { syncLake?: boolean, syncRoute?: boolean } = {},
) {
  const reservation = adminReservations.value.find((item) => item.id === reservationId)
  if (!reservation) return false

  selectReservation(reservation, options)

  return true
}
const setCalendarMode = (mode: 'week' | 'month') => {
  calendarMode.value = mode
  if (mode === 'month') {
    calendarStart.value = getMonthStart(calendarStart.value)
  }
}
const moveCalendar = (direction: number) => {
  calendarStart.value = calendarMode.value === 'month'
    ? addMonths(calendarStart.value, direction > 0 ? 1 : -1)
    : addDays(calendarStart.value, direction)
}
const selectCalendarCell = (reservation?: Reservation) => {
  if (reservation) {
    selectReservation(reservation, { syncLake: true })
  }
}
const calendarCellClass = (status: string, selected?: boolean) => {
  if (selected) return 'border-primary-600 bg-primary-50 text-primary-900 ring-2 ring-primary-200'

  switch (status) {
    case 'available':
      return 'border-success-500/25 bg-success-500/10 text-success-700'
    case 'limited':
    case 'requires_approval':
      return 'border-warning-500/25 bg-warning-500/10 text-warning-800'
    case 'reserved':
      return 'border-error-500/25 bg-error-500/10 text-error-700'
    case 'blocked':
      return 'border-foreground-muted/20 bg-foreground-muted/10 text-foreground-muted'
    case 'closed':
      return 'border-error-500/30 bg-error-500/15 text-error-800'
    default:
      return 'border-border bg-white text-foreground-muted'
  }
}
const saveDecision = () => {
  const reservation = selectedReservation.value
  if (!reservation) return
  if (!canOperateReservations.value) {
    decisionSubmitStatus.value = 'error'
    decisionSubmitMessage.value = reservationReadOnlyMessage.value
    return
  }

  decisionSubmitStatus.value = 'submitting'
  decisionSubmitMessage.value = ''
  decisionCommunicationDraft.value = undefined
  decisionCommunicationDelivery.value = undefined

  $fetch<ReservationDecisionSuccess>(`/api/admin/reservations/${reservation.id}/decision`, {
    body: {
      decisionMode: decisionMode.value,
      note: adminNoteDraft.value,
    },
    method: 'POST',
  })
    .then(async (result) => {
      replaceReservationWorkflowState(result.reservations, result.rentalBookings)
      workflowMessage.value = result.message
      decisionCommunicationDraft.value = result.communicationDraft
      decisionCommunicationDelivery.value = result.communicationDelivery
      decisionSubmitStatus.value = 'idle'
      await refreshReservationState()
    })
    .catch((error: unknown) => {
      const fetchError = error as {
        data?: {
          data?: {
            messages?: string[]
          }
          message?: string
          statusMessage?: string
        }
      }
      decisionSubmitStatus.value = 'error'
      decisionSubmitMessage.value =
        fetchError.data?.data?.messages?.join(' ') ??
        fetchError.data?.message ??
        fetchError.data?.statusMessage ??
        'Rozhodnutie sa nepodarilo uložiť.'
      decisionCommunicationDraft.value = undefined
      decisionCommunicationDelivery.value = undefined
    })
}

async function submitAdminReservation() {
  if (!canOperateReservations.value) {
    adminReservationSubmitStatus.value = 'error'
    adminReservationSubmitMessage.value = reservationReadOnlyMessage.value
    return
  }

  adminReservationSubmitStatus.value = 'submitting'
  adminReservationSubmitMessage.value = ''

  try {
    const result = await $fetch<ReservationSubmissionSuccess>('/api/admin/reservations', {
      body: {
        ...adminReservationDraft,
        internalNote: adminReservationDraft.internalNote.trim() || undefined,
        paymentMethodId: adminReservationDraft.paymentMethodId || undefined,
        extraIds: [...adminReservationDraft.extraIds],
        rentalIds: [...adminReservationDraft.rentalIds],
      },
      method: 'POST',
    })

    await refreshReservationState()
    selectReservation(result.reservation, { syncLake: true })
    adminReservationDraft.contactName = ''
    adminReservationDraft.contactEmail = ''
    adminReservationDraft.contactPhone = ''
    adminReservationDraft.internalNote = ''
    adminReservationSubmitStatus.value = 'success'
    adminReservationSubmitMessage.value = result.message
  }
  catch (error) {
    const fetchError = error as {
      data?: {
        data?: {
          messages?: string[]
        }
        message?: string
        statusMessage?: string
      }
    }
    adminReservationSubmitStatus.value = 'error'
    adminReservationSubmitMessage.value =
      fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      'Rezerváciu sa nepodarilo vytvoriť.'
  }
}

async function savePaymentMethodSettings() {
  if (!canOperateReservations.value) {
    paymentMethodSubmitStatus.value = 'error'
    paymentMethodSubmitMessage.value = reservationReadOnlyMessage.value
    return
  }

  paymentMethodSubmitStatus.value = 'submitting'
  paymentMethodSubmitMessage.value = ''

  try {
    const result = await $fetch<PaymentMethodMutationSuccess>('/api/admin/payment-methods', {
      body: {
        methods: paymentMethodDraft.value.map((method) => ({
          enabled: method.enabled,
          id: method.id,
        })),
      },
      method: 'PUT',
    })

    await refreshPaymentMethodState()
    const enabledIds = new Set(result.paymentMethods.filter((method) => method.enabled).map((method) => method.id))
    if (adminReservationDraft.paymentMethodId && !enabledIds.has(adminReservationDraft.paymentMethodId)) {
      adminReservationDraft.paymentMethodId = result.paymentMethods.find((method) => method.enabled)?.id ?? ''
    }
    paymentMethodSubmitStatus.value = 'success'
    paymentMethodSubmitMessage.value = result.message
  }
  catch (error) {
    const fetchError = error as {
      data?: {
        data?: {
          messages?: string[]
        }
        message?: string
        statusMessage?: string
      }
    }
    paymentMethodSubmitStatus.value = 'error'
    paymentMethodSubmitMessage.value =
      fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      'Platobné metódy sa nepodarilo uložiť.'
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Rezervácie a dostupnosť"
      description="Pracovisko správcu pre schvaľovanie rezervácií, kontrolu konfliktov, doplnkov a interných poznámok."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="reservationsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ reservationAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ reservationReadOnlyMessage }}</p>
      </div>

      <nav
        ref="reservationAdminTabScrollerElement"
        aria-label="Pracovné pohľady rezervácií"
        class="mt-6 overflow-x-auto border-b border-border"
      >
        <div role="tablist" aria-label="Rezervácie" class="flex min-w-max gap-1">
          <button
            v-for="(view, index) in reservationAdminViewTabs"
            :id="`reservation-admin-tab-${view.value}`"
            :key="view.value"
            type="button"
            role="tab"
            aria-controls="reservation-admin-panel"
            :aria-selected="activeReservationAdminView === view.value"
            :tabindex="activeReservationAdminView === view.value ? 0 : -1"
            class="flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-bold transition-colors"
            :class="reservationAdminTabClass(activeReservationAdminView === view.value)"
            @click="selectReservationAdminView(view.value)"
            @keydown="handleReservationAdminTabKeydown($event, index)"
          >
            <UIcon :name="view.icon" class="h-4 w-4 shrink-0" />
            <span>{{ view.label }}</span>
            <span
              v-if="view.count !== undefined"
              class="min-w-5 rounded-full bg-warning-500/15 px-1.5 py-0.5 text-center text-xs font-bold text-warning-800"
            >
              {{ view.count }}
            </span>
          </button>
        </div>
      </nav>

      <div
        id="reservation-admin-panel"
        role="tabpanel"
        :aria-labelledby="`reservation-admin-tab-${activeReservationAdminView}`"
      >
        <div
          v-if="activeReservationAdminView === 'ziadosti'"
          class="mt-5 flex flex-col gap-4 rounded-md border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-clock" class="h-4 w-4 text-warning-700" />
              <strong>{{ reservationStats.pending }}</strong> čaká
            </span>
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-check-circle" class="h-4 w-4 text-success-700" />
              <strong>{{ reservationStats.confirmed }}</strong> potvrdené
            </span>
            <span class="flex items-center gap-2">
              <UIcon name="i-heroicons-globe-alt" class="h-4 w-4 text-primary-700" />
              <strong>{{ reservationStats.web }}</strong> z webu
            </span>
            <span v-if="reservationStats.blocked" class="flex items-center gap-2">
              <UIcon name="i-heroicons-no-symbol" class="h-4 w-4 text-error-700" />
              <strong>{{ reservationStats.blocked }}</strong> blokované
            </span>
          </div>
          <UButton icon="i-heroicons-plus" variant="soft" @click="selectReservationAdminView('nova')">
            Nová rezervácia
          </UButton>
        </div>

      <div
        v-if="activeReservationAdminView === 'nastavenia'"
        class="mt-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Platobné metódy rezervácií</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Zapnuté možnosti sa zobrazia rybárom aj správcovi pri vytváraní rezervácie.
            </p>
          </div>
          <UButton
            icon="i-heroicons-check"
            variant="soft"
            :disabled="!canOperateReservations || paymentMethodSubmitStatus === 'submitting'"
            :loading="paymentMethodSubmitStatus === 'submitting'"
            @click="savePaymentMethodSettings"
          >
            Uložiť platby
          </UButton>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <label
            v-for="method in paymentMethodDraft"
            :key="method.id"
            class="flex min-h-32 flex-col justify-between rounded-md border border-border bg-white p-4"
          >
            <span>
              <span class="flex items-start justify-between gap-3">
                <span>
                  <span class="block font-bold">{{ method.label }}</span>
                  <span class="text-foreground-muted mt-1 block text-sm">{{ method.instructions }}</span>
                </span>
                <input
                  :checked="method.enabled"
                  type="checkbox"
                  :disabled="!canOperateReservations"
                  class="mt-1 h-5 w-5 accent-primary-700"
                  @change="handlePaymentMethodToggle(method.id, $event)"
                >
              </span>
            </span>
            <StatusBadge
              class="mt-4 w-fit"
              :icon="paymentMethodIcon(method.enabled)"
              :label="method.enabled ? 'zapnuté' : 'vypnuté'"
              size="xs"
              :tone="paymentMethodTone(method.enabled)"
            />
          </label>
        </div>
        <DataStatusNotice
          v-if="paymentMethodSubmitMessage"
          class="mt-4"
          :description="paymentMethodSubmitMessage"
          :title="paymentMethodSubmitStatus === 'error' ? 'Platobné metódy sa nepodarilo uložiť' : 'Platobné metódy sú uložené'"
          :tone="paymentMethodSubmitStatus === 'error' ? 'error' : 'success'"
        />
      </div>

      <div
        v-if="activeReservationAdminView === 'nova'"
        class="mt-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Nová rezervácia správcu</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Pre telefonát, osobnú dohodu alebo internú blokáciu bez toho, aby správca vypĺňal public formulár.
            </p>
          </div>
          <StatusBadge
            class="w-fit"
            :icon="draftReservationStatusIcon"
            :label="adminReservationDraft.status === 'confirmed' ? 'uloží sa ako potvrdená' : 'uloží sa ako čakajúca'"
            :tone="draftReservationStatusTone"
          />
        </div>

        <form class="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]" @submit.prevent="submitAdminReservation">
          <fieldset :disabled="!canOperateReservations" class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="text-sm font-semibold">Meno hosťa</span>
              <input
                v-model="adminReservationDraft.contactName"
                required
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="napr. Peter Novák"
              >
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Telefón</span>
              <input
                v-model="adminReservationDraft.contactPhone"
                required
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="+421 ..."
              >
            </label>
            <label class="block">
              <span class="text-sm font-semibold">E-mail</span>
              <input
                v-model="adminReservationDraft.contactEmail"
                type="email"
                autocomplete="email"
                class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
                placeholder="meno@example.com"
              >
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Zdroj</span>
              <select v-model="adminReservationDraft.source" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="phone">Telefonát</option>
                <option value="admin">Admin / osobne</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Stav po uložení</span>
              <select v-model="adminReservationDraft.status" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="pending">Čaká na potvrdenie</option>
                <option value="confirmed">Rovno potvrdená</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Jazero</span>
              <select v-model="adminReservationDraft.lake" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="velky-cetin">Veľký Cetín</option>
                <option value="strkovisko-kocka">Štrkovisko Kocka</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Lovné miesto</span>
              <select v-model="adminReservationDraft.pegId" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option v-for="peg in adminReservationPegs" :key="peg.id" :value="peg.id">
                  {{ peg.label }} · {{ peg.type === 'cabin' ? 's chatou' : 'miesto' }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Od</span>
              <input v-model="adminReservationDraft.dateFrom" required type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Do</span>
              <input v-model="adminReservationDraft.dateTo" required type="date" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Povolenka</span>
              <select v-model="adminReservationDraft.permitId" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option v-for="permit in permitProducts" :key="permit.id" :value="permit.id">
                  {{ permit.label }} · {{ permit.priceEur }} €
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm font-semibold">Platba</span>
              <select v-model="adminReservationDraft.paymentMethodId" class="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm">
                <option value="">Bez platby v zázname</option>
                <option v-for="method in enabledPaymentMethods" :key="method.id" :value="method.id">
                  {{ method.label }}
                </option>
              </select>
            </label>
            <label class="block md:col-span-2">
              <span class="text-sm font-semibold">Interná poznámka</span>
              <textarea
                v-model="adminReservationDraft.internalNote"
                rows="3"
                class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                placeholder="napr. potvrdené telefonicky, príchod večer, drevo pripraviť pri chate..."
              />
            </label>
          </fieldset>

          <div class="space-y-4">
            <div
              v-if="adminReservationAvailability"
              class="rounded-md border p-4"
              :class="adminReservationAvailability.classes"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold">{{ adminReservationAvailability.label }}</p>
                  <p class="mt-1 text-sm">{{ adminReservationAvailability.description }}</p>
                  <p class="mt-2 text-xs font-semibold">{{ adminReservationAvailability.reasons[0] }}</p>
                </div>
                <UIcon :name="adminReservationAvailability.icon" class="mt-0.5 h-5 w-5 shrink-0" />
              </div>
            </div>

            <div v-if="adminReservationCabin" class="rounded-md bg-primary-50 p-4 text-primary-900">
              <p class="text-sm font-bold">{{ adminReservationCabin.label }}</p>
              <p class="mt-1 text-xs text-primary-800">
                {{ adminReservationCabin.pricePer24hEur }} € / 24 h · kapacita {{ adminReservationCabin.capacity }}
              </p>
            </div>

            <div>
              <p class="text-sm font-semibold">Požičovňa</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <label
                  v-for="row in adminReservationRentalRows"
                  :key="row.item.id"
                  class="flex items-start gap-2 rounded-md border border-border bg-white p-3 text-sm"
                  :class="!row.availability.reservable ? 'opacity-55' : ''"
                >
                  <input
                    v-model="adminReservationDraft.rentalIds"
                    type="checkbox"
                    :value="row.item.id"
                    :disabled="!canOperateReservations || !row.availability.reservable"
                    class="mt-0.5 h-4 w-4 accent-primary-700"
                  >
                  <span>
                    <span class="block font-semibold">{{ row.item.label }}</span>
                    <span class="text-foreground-muted block text-xs">
                      {{ row.availability.label }} · {{ row.item.priceLabel }}
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <p class="text-sm font-semibold">Doplnky</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <label
                  v-for="extra in adminReservationAvailableExtras"
                  :key="extra.id"
                  class="flex items-start gap-2 rounded-md border border-border bg-white p-3 text-sm"
                >
                  <input
                    v-model="adminReservationDraft.extraIds"
                    type="checkbox"
                    :value="extra.id"
                    :disabled="!canOperateReservations"
                    class="mt-0.5 h-4 w-4 accent-primary-700"
                  >
                  <span>
                    <span class="block font-semibold">{{ extra.label }}</span>
                    <span class="text-foreground-muted block text-xs">{{ extra.priceLabel }}</span>
                  </span>
                </label>
              </div>
            </div>

            <UButton
              type="submit"
              icon="i-heroicons-calendar-days"
              block
              :disabled="!canOperateReservations || !adminReservationCanSubmit || adminReservationSubmitStatus === 'submitting'"
              :loading="adminReservationSubmitStatus === 'submitting'"
            >
              Vytvoriť rezerváciu
            </UButton>
            <DataStatusNotice
              v-if="adminReservationSubmitMessage"
              :description="adminReservationSubmitMessage"
              :title="adminReservationSubmitStatus === 'error' ? 'Rezerváciu sa nepodarilo vytvoriť' : 'Rezervácia je vytvorená'"
              :tone="adminReservationSubmitStatus === 'error' ? 'error' : 'success'"
            />
          </div>
        </form>
      </div>

      <div
        v-if="activeReservationAdminView === 'kalendar'"
        class="mt-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">
              {{ calendarMode === 'month' ? 'Mesačný kalendár obsadenosti' : 'Týždenný kalendár obsadenosti' }}
            </h2>
            <p class="text-foreground-muted mt-1 text-sm">
              {{ getLakeName(calendarLake) }} · {{ calendarRangeLabel }} · bunky používajú rovnaké pravidlá dostupnosti ako mapa.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="calendarLake"
              aria-label="Jazero v kalendári"
              class="h-11 rounded-md border border-border bg-white px-3 text-sm"
            >
              <option value="velky-cetin">Veľký Cetín</option>
              <option value="strkovisko-kocka">Štrkovisko Kocka</option>
            </select>
            <div class="flex rounded-md border border-border bg-white p-1">
              <button
                type="button"
                class="min-h-9 rounded px-3 py-1.5 text-sm font-semibold"
                :class="calendarMode === 'week' ? 'bg-primary-700 text-white' : 'text-foreground-muted hover:bg-muted'"
                @click="setCalendarMode('week')"
              >
                Týždeň
              </button>
              <button
                type="button"
                class="min-h-9 rounded px-3 py-1.5 text-sm font-semibold"
                :class="calendarMode === 'month' ? 'bg-primary-700 text-white' : 'text-foreground-muted hover:bg-muted'"
                @click="setCalendarMode('month')"
              >
                Mesiac
              </button>
            </div>
            <UButton icon="i-heroicons-chevron-left" color="neutral" variant="soft" @click="moveCalendar(-7)">
              {{ calendarMode === 'month' ? 'Mesiac späť' : 'Týždeň späť' }}
            </UButton>
            <input
              v-model="calendarStart"
              type="date"
              class="h-11 rounded-md border border-border bg-white px-3 text-sm"
              aria-label="Začiatok kalendára"
            >
            <UButton icon="i-heroicons-chevron-right" color="neutral" variant="soft" @click="moveCalendar(7)">
              {{ calendarMode === 'month' ? 'Mesiac ďalej' : 'Týždeň ďalej' }}
            </UButton>
          </div>
        </div>

        <div class="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div class="rounded-md bg-success-500/10 p-3 text-success-700">
            <p class="text-xs font-semibold">Rezervovateľné dni</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.available }}</p>
          </div>
          <div class="rounded-md bg-error-500/10 p-3 text-error-700">
            <p class="text-xs font-semibold">Obsadené</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.reserved }}</p>
          </div>
          <div class="rounded-md bg-warning-500/10 p-3 text-warning-800">
            <p class="text-xs font-semibold">Čaká / obmedzené</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.pending }}</p>
          </div>
          <div class="rounded-md bg-foreground-muted/10 p-3 text-foreground-muted">
            <p class="text-xs font-semibold">Blokované</p>
            <p class="mt-1 text-2xl font-bold">{{ calendarSummary.blocked }}</p>
          </div>
        </div>

        <div class="mt-5 grid gap-3 md:hidden">
          <div
            v-for="summary in calendarDaySummaries"
            :key="summary.day.iso"
            class="rounded-md border border-border bg-white p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold">{{ summary.day.dayName }} {{ summary.day.dayNumber }} {{ summary.day.monthName }}</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ getLakeName(calendarLake) }}</p>
              </div>
              <span class="rounded-md bg-muted px-2 py-1 text-xs font-bold text-foreground-muted">
                {{ summary.reserved }} obs.
              </span>
            </div>
            <div class="mt-3 grid grid-cols-4 gap-2 text-center text-xs font-semibold">
              <div class="rounded bg-success-500/10 px-2 py-1 text-success-700">{{ summary.available }} voľné</div>
              <div class="rounded bg-error-500/10 px-2 py-1 text-error-700">{{ summary.reserved }} obs.</div>
              <div class="rounded bg-warning-500/10 px-2 py-1 text-warning-800">{{ summary.pending }} čaká</div>
              <div class="rounded bg-foreground-muted/10 px-2 py-1 text-foreground-muted">{{ summary.blocked }} blok.</div>
            </div>
            <div v-if="summary.reservations.length" class="mt-3 space-y-2">
              <button
                v-for="item in summary.reservations"
                :key="`${summary.day.iso}-${item.reservation.id}-${item.peg.id}`"
                type="button"
                class="w-full rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-left text-sm text-primary-900"
                @click="selectCalendarCell(item.reservation)"
              >
                <span class="block font-semibold">{{ item.reservation.guest }}</span>
                <span class="mt-0.5 block text-xs text-primary-800">
                  {{ item.peg.label }} · {{ statusLabel(item.reservation.status) }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div class="mt-5 hidden overflow-x-auto rounded-md border border-border md:block">
          <div :style="{ minWidth: calendarTableMinWidth }">
            <div
              class="grid border-b border-border bg-muted"
              :style="{ gridTemplateColumns: calendarGridTemplate }"
            >
              <div class="px-3 py-3 text-xs font-bold uppercase text-foreground-muted">Miesto</div>
              <div
                v-for="day in calendarDays"
                :key="day.iso"
                class="border-l border-border px-3 py-3 text-center"
              >
                <p class="text-xs font-bold uppercase text-foreground-muted">{{ day.dayName }}</p>
                <p class="font-bold">{{ day.dayNumber }} {{ day.monthName }}</p>
              </div>
            </div>

            <div
              v-for="row in calendarRows"
              :key="row.peg.id"
              class="grid border-b border-border last:border-b-0"
              :style="{ gridTemplateColumns: calendarGridTemplate }"
            >
              <div class="bg-white px-3 py-3">
                <p class="font-semibold">{{ row.peg.label }}</p>
                <p class="text-foreground-muted text-xs">
                  {{ row.peg.type === 'cabin' ? 'chata' : 'miesto' }} · {{ row.peg.capacity }} osoby
                </p>
              </div>
              <div
                v-for="cell in row.cells"
                :key="`${row.peg.id}-${cell.day.iso}`"
                class="border-l border-border bg-white p-1.5"
              >
                <button
                  type="button"
                  class="h-20 w-full rounded-md border px-2 py-1.5 text-left text-xs leading-tight transition-colors"
                  :class="[
                    calendarCellClass(cell.availability.status, cell.reservation?.id === selectedReservationId),
                    cell.reservation ? 'hover:ring-2 hover:ring-primary-200' : 'cursor-default',
                  ]"
                  :aria-label="`${row.peg.label} ${cell.day.iso}: ${cell.availability.label}`"
                  @click="selectCalendarCell(cell.reservation)"
                >
                  <span class="block truncate font-bold">{{ cell.availability.label }}</span>
                  <span class="mt-1 block truncate">
                    {{ cell.reservation?.guest ?? cell.availability.reasons[0] }}
                  </span>
                  <span v-if="cell.reservation" class="mt-1 block truncate opacity-80">
                    {{ statusLabel(cell.reservation.status) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activeReservationAdminView === 'kalendar'" class="mt-4">
        <UButton
          icon="i-heroicons-adjustments-horizontal"
          color="neutral"
          variant="soft"
          :aria-expanded="showCalendarContext"
          @click="showCalendarContext = !showCalendarContext"
        >
          {{ showCalendarContext ? 'Skryť prevádzkové obmedzenia' : 'Prevádzkové obmedzenia a stav miest' }}
        </UButton>

        <div v-if="showCalendarContext" class="mt-4 grid gap-6 xl:grid-cols-2">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Konflikty dostupnosti</h2>
            <div class="mt-4 space-y-3">
              <div v-for="closure in conflictingClosures" :key="closure.id" class="rounded-md bg-muted p-4">
                <p class="font-semibold">{{ closure.title }}</p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} ·
                  {{ closure.from }} až {{ closure.to }}
                </p>
                <p class="text-foreground-muted mt-2 text-sm">{{ closure.notes }}</p>
              </div>
              <AppState
                v-if="conflictingClosures.length === 0"
                compact
                title="Bez konfliktov"
                description="Dostupnosť zatiaľ nehlási žiadnu uzávierku blokujúcu rezervácie."
              />
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Miesta podľa stavu</h2>
            <p class="text-foreground-muted mt-1 text-sm">{{ getLakeName(calendarLake) }}</p>
            <div class="mt-4 grid gap-2">
              <div
                v-for="row in pegAvailabilityRows"
                :key="row.peg.id"
                class="flex items-center justify-between gap-3 rounded-md bg-muted p-3"
              >
                <div>
                  <p class="font-semibold">{{ row.peg.label }}</p>
                  <p class="text-foreground-muted text-xs">{{ row.availability.reasons[0] }}</p>
                </div>
                <AvailabilityBadge :availability="row.availability" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeReservationAdminView === 'ziadosti'"
        class="mt-5 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"
      >
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Rezervácie</h2>
              <p class="text-foreground-muted text-sm">Čakajúce žiadosti sú vždy navrchu.</p>
            </div>
            <select
              v-model="reservationLakeFilter"
              aria-label="Filtrovať rezervácie podľa jazera"
              class="h-11 rounded-md border border-border bg-white px-3 text-sm"
            >
              <option value="all">Všetky jazerá</option>
              <option value="velky-cetin">Veľký Cetín</option>
              <option value="strkovisko-kocka">Štrkovisko Kocka</option>
            </select>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="reservation in filteredReservations"
              :key="reservation.id"
              type="button"
              class="w-full rounded-md border p-4 text-left transition-colors hover:bg-muted"
              :class="selectedReservationId === reservation.id ? 'border-primary-600 bg-primary-50' : 'border-border bg-white'"
              @click="selectReservation(reservation)"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ reservation.guest }}</p>
                  <p class="text-foreground-muted text-sm">
                    {{ getLakeName(reservation.lake) }} · {{ getLivePegLabel(reservation.pegId) }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <StatusBadge
                    :icon="statusIcon(reservation.status)"
                    :label="statusLabel(reservation.status)"
                    size="xs"
                    :tone="statusTone(reservation.status)"
                  />
                  <StatusBadge
                    :icon="sourceIcon(reservation.source)"
                    :label="sourceLabel(reservation.source)"
                    size="xs"
                    tone="muted"
                  />
                </div>
              </div>
              <div class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Od</p>
                  <p class="font-semibold">{{ reservation.from }}</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Do</p>
                  <p class="font-semibold">{{ reservation.to }}</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Typ</p>
                  <p class="font-semibold">{{ reservation.type }}</p>
                </div>
              </div>
            </button>
            <AppState
              v-if="filteredReservations.length === 0"
              title="Žiadne rezervácie"
              description="Pre vybraný filter zatiaľ nie je žiadna žiadosť ani potvrdený termín."
            />
          </div>
        </div>

        <aside class="space-y-6">
          <div
            v-if="selectedReservation"
            ref="reservationDetailElement"
            class="scroll-mt-24 rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Detail rezervácie</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedReservation.guest }} · {{ selectedReservation.contactPhone }}
                  <span v-if="selectedReservation.contactEmail"> · {{ selectedReservation.contactEmail }}</span>
                </p>
              </div>
              <StatusBadge
                class="w-fit"
                :icon="statusIcon(selectedReservation.status)"
                :label="statusLabel(selectedReservation.status)"
                :tone="statusTone(selectedReservation.status)"
              />
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Miesto</p>
                <p class="font-semibold">{{ getLivePegLabel(selectedReservation.pegId) }}</p>
                <p v-if="selectedPeg" class="text-foreground-muted mt-1 text-xs">{{ selectedPeg.notes }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Povolenka</p>
                <p class="font-semibold">{{ selectedPermit?.label ?? selectedReservation.permitId }}</p>
                <p v-if="selectedPermit" class="text-foreground-muted mt-1 text-xs">
                  {{ selectedPermit.priceEur }} € · {{ selectedPermit.durationHours }} h
                </p>
              </div>
              <div v-if="selectedCabin" class="rounded-md bg-primary-50 p-3 text-primary-900">
                <p class="text-xs font-semibold text-primary-800">Chata</p>
                <p class="font-semibold">{{ selectedCabin.label }}</p>
                <p class="mt-1 text-xs text-primary-800">
                  {{ selectedCabin.pricePer24hEur }} € / 24 h · kapacita {{ selectedCabin.capacity }}
                </p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Zdroj</p>
                <p class="font-semibold">{{ sourceLabel(selectedReservation.source) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">ID {{ selectedReservation.id }}</p>
              </div>
            </div>

            <div v-if="selectedAvailability" class="mt-5 rounded-md border p-4" :class="selectedAvailability.classes">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold">Kontrola miesta bez aktuálnej rezervácie</p>
                  <p class="mt-1 text-sm">{{ selectedAvailability.description }}</p>
                  <p class="mt-2 text-xs font-semibold">{{ selectedAvailability.reasons[0] }}</p>
                </div>
                <UIcon :name="selectedAvailability.icon" class="mt-0.5 h-5 w-5 shrink-0" />
              </div>
            </div>

            <div
              v-if="selectedReservationNotification"
              class="mt-5 rounded-md border border-primary-200 bg-primary-50 p-4 text-primary-900"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold">Interná notifikácia</p>
                  <p class="mt-1 text-sm">
                    {{ selectedReservationNotification.title }}
                  </p>
                  <p class="mt-1 text-xs text-primary-800">
                    {{ formatDateTime(selectedReservationNotification.createdAt) }} ·
                    {{ selectedReservationNotification.recipientCount }} zariadení ·
                    {{ selectedReservationNotification.message }}
                  </p>
                </div>
                <StatusBadge
                  class="w-fit"
                  :icon="deliveryStatusIcon(selectedReservationNotification.status)"
                  :label="notificationBroadcastStatusLabels[selectedReservationNotification.status]"
                  :tone="deliveryStatusTone(selectedReservationNotification.status)"
                />
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <StatusBadge
                  v-for="badge in getReservationNotificationDeliveryBadges(selectedReservationNotification)"
                  :key="badge.status"
                  :icon="deliveryStatusIcon(badge.status)"
                  :label="`${badge.count}× ${badge.label}`"
                  size="xs"
                  :tone="deliveryStatusTone(badge.status)"
                />
                <StatusBadge
                  v-if="getReservationNotificationDeliveryBadges(selectedReservationNotification).length === 0"
                  icon="i-heroicons-minus-circle"
                  label="Bez pokusu doručenia"
                  size="xs"
                  tone="muted"
                />
              </div>
            </div>
            <div
              v-else-if="selectedReservation.source === 'web'"
              class="mt-5 rounded-md border border-warning-500/25 bg-warning-500/10 p-4 text-warning-900"
            >
              <p class="text-sm font-bold">Interná notifikácia</p>
              <p class="mt-1 text-sm">
                K tejto webovej žiadosti zatiaľ nie je uložený záznam push upozornenia.
              </p>
            </div>

            <div v-if="selectedClosureConflicts.length" class="mt-5 rounded-md border border-warning-500/25 bg-warning-500/10 p-4">
              <p class="text-sm font-bold text-warning-800">Konflikty a uzávierky</p>
              <div class="mt-3 space-y-2">
                <div v-for="closure in selectedClosureConflicts" :key="closure.id">
                  <p class="text-sm font-semibold text-warning-900">{{ closure.title }}</p>
                  <p class="text-xs text-warning-800">{{ closure.from }} až {{ closure.to }} · {{ closure.notes }}</p>
                </div>
              </div>
            </div>

            <div class="mt-5">
              <h3 class="text-sm font-bold">Požičovňa</h3>
              <div class="mt-2 grid gap-2">
                <div
                  v-for="row in selectedRentalRows"
                  :key="row.item.id"
                  class="rounded-md border border-border bg-white p-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="font-semibold">{{ row.item.label }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">
                        {{ rentalBookingStatusLabel(row.booking?.status) }} ·
                        {{ row.availability.availableQuantity }} ks voľné po ostatných rezerváciách
                      </p>
                    </div>
                    <StatusBadge
                      class="shrink-0"
                      :icon="rentalAvailabilityIcon(row.availability.status)"
                      :label="row.availability.label"
                      size="xs"
                      :tone="rentalAvailabilityTone(row.availability.status)"
                    />
                  </div>
                </div>
                <AppState
                  v-if="selectedRentalRows.length === 0"
                  compact
                  title="Bez výbavy"
                  description="K tejto rezervácii nie je priradená žiadna položka požičovne."
                />
              </div>
            </div>

            <div class="mt-5">
              <h3 class="text-sm font-bold">Doplnky</h3>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="extra in selectedExtras"
                  :key="extra.id"
                  class="rounded-md bg-muted px-3 py-2 text-sm font-semibold"
                >
                  {{ extra.label }}
                </span>
                <span v-if="selectedExtras.length === 0" class="text-foreground-muted text-sm">
                  Bez doplnkov.
                </span>
              </div>
            </div>

            <div class="mt-5 rounded-md border border-border bg-white p-4">
              <p class="text-sm font-bold">Pracovné rozhodnutie</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canOperateReservations"
                  :class="decisionMode === 'approve' ? 'border-success-500 bg-success-500/10 text-success-700' : 'border-border bg-white'"
                  @click="decisionMode = 'approve'"
                >
                  Schváliť
                </button>
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canOperateReservations"
                  :class="decisionMode === 'call' ? 'border-warning-500 bg-warning-500/10 text-warning-800' : 'border-border bg-white'"
                  @click="decisionMode = 'call'"
                >
                  Telefonát
                </button>
                <button
                  type="button"
                  class="rounded-md border px-3 py-2 text-sm font-semibold"
                  :disabled="!canOperateReservations"
                  :class="decisionMode === 'reject' ? 'border-error-500 bg-error-500/10 text-error-700' : 'border-border bg-white'"
                  @click="decisionMode = 'reject'"
                >
                  Zamietnuť
                </button>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ decisionSummary }}</p>
              <label class="mt-4 block">
                <span class="text-sm font-semibold">Interná poznámka</span>
                <textarea
                  v-model="adminNoteDraft"
                  rows="4"
                  :readonly="!canOperateReservations"
                  class="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                />
              </label>
              <div class="mt-4 flex flex-wrap gap-2">
                <UButton
                  data-testid="save-reservation-decision"
                  icon="i-heroicons-check"
                  variant="soft"
                  :disabled="!canOperateReservations || decisionSubmitStatus === 'submitting'"
                  :loading="decisionSubmitStatus === 'submitting'"
                  @click="saveDecision"
                >
                  Uložiť rozhodnutie
                </UButton>
                <UButton :to="`tel:${selectedReservation.contactPhone}`" icon="i-heroicons-phone" color="neutral" variant="soft">
                  Zavolať hosťovi
                </UButton>
              </div>
              <DataStatusNotice
                v-if="decisionSubmitMessage"
                class="mt-3"
                :description="decisionSubmitMessage"
                title="Rozhodnutie sa nepodarilo uložiť"
                tone="error"
              />
              <DataStatusNotice
                v-if="workflowMessage"
                class="mt-3"
                :description="workflowMessage"
                title="Rozhodnutie je uložené"
                tone="success"
              />
              <div
                v-if="decisionCommunicationDraft"
                class="mt-4 rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="text-sm font-bold">Správa pre hosťa</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      {{ decisionCommunicationDelivery?.message ?? (decisionCommunicationDraft.channel === 'email' ? 'E-mailový draft je pripravený.' : 'E-mail chýba, použi SMS alebo telefonát.') }}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <StatusBadge
                      v-if="decisionCommunicationDelivery"
                      :icon="deliveryStatusIcon(decisionCommunicationDelivery.status)"
                      :label="reservationCommunicationDeliveryStatusLabels[decisionCommunicationDelivery.status]"
                      :tone="deliveryStatusTone(decisionCommunicationDelivery.status)"
                    />
                    <StatusBadge
                      v-if="decisionCommunicationDelivery"
                      icon="i-heroicons-server-stack"
                      :label="reservationCommunicationDeliveryProviderLabels[decisionCommunicationDelivery.provider]"
                      tone="muted"
                    />
                    <UButton
                      :to="buildSmsHref(decisionCommunicationDraft)"
                      icon="i-heroicons-chat-bubble-left-right"
                      size="xs"
                      variant="soft"
                    >
                      SMS
                    </UButton>
                    <UButton
                      v-if="decisionCommunicationDraft.emailTo"
                      :to="buildMailtoHref(decisionCommunicationDraft)"
                      icon="i-heroicons-envelope"
                      size="xs"
                      variant="soft"
                    >
                      E-mail
                    </UButton>
                  </div>
                </div>
                <div class="mt-3 grid gap-3">
                  <div class="rounded-md bg-muted p-3">
                    <p class="text-foreground-muted text-xs font-semibold uppercase">SMS text</p>
                    <p class="mt-1 text-sm">{{ decisionCommunicationDraft.smsBody }}</p>
                  </div>
                  <div v-if="decisionCommunicationDraft.emailBody" class="rounded-md bg-muted p-3">
                    <p class="text-foreground-muted text-xs font-semibold uppercase">{{ decisionCommunicationDraft.emailSubject }}</p>
                    <p class="mt-1 whitespace-pre-line text-sm">{{ decisionCommunicationDraft.emailBody }}</p>
                  </div>
                  <div class="rounded-md bg-muted p-3">
                    <p class="text-foreground-muted text-xs font-semibold uppercase">Telefonát</p>
                    <p class="mt-1 text-sm">{{ decisionCommunicationDraft.callScript }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <AppState
            v-else
            title="Vyberte rezerváciu"
            description="Detail sa zobrazí po kliknutí na rezerváciu v zozname."
          />
        </aside>
      </div>
      </div>
    </section>
  </div>
</template>
