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
import type { ReservationDecisionMode } from '~/services/reservationWorkflowService'
import { getPegAvailability, rangesOverlap } from '~/utils/availability'
import { addDays, addMonths, buildCalendarDays, buildMonthCalendarDays, getMonthStart } from '~/utils/calendar'
import { getRentalAvailability, type RentalAvailabilityStatus } from '~/utils/rentals'
import type { StatusBadgeTone } from '~/utils/ui'

type ReservationAdminView = 'ziadosti' | 'kalendar' | 'nova' | 'nastavenia'

/**
 * Owns all data fetching, state and business logic for the admin reservations screen
 * (Žiadosti / Kalendár / Nová rezervácia / Nastavenia tabs). Extracted from
 * app/pages/admin/rezervacie/index.vue so the page only wires template bindings.
 */
export async function useAdminReservationCalendar() {
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
    () => requestFetch<ReservationStateResponse>('/api/admin/reservations'),
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

  return {
    activeCabinProducts,
    activeReservationAdminView,
    activeReservationExtras,
    adminNoteDraft,
    adminReservationAvailability,
    adminReservationAvailableExtras,
    adminReservationCabin,
    adminReservationCanSubmit,
    adminReservationDraft,
    adminReservationPegs,
    adminReservationRentalRows,
    adminReservationSubmitMessage,
    adminReservationSubmitStatus,
    buildMailtoHref,
    buildSmsHref,
    calendarCellClass,
    calendarDays,
    calendarDaySummaries,
    calendarGridTemplate,
    calendarLake,
    calendarMode,
    calendarRangeLabel,
    calendarRows,
    calendarStart,
    calendarSummary,
    calendarTableMinWidth,
    canOperateReservations,
    conflictingClosures,
    decisionCommunicationDelivery,
    decisionCommunicationDraft,
    decisionMode,
    decisionSubmitMessage,
    decisionSubmitStatus,
    decisionSummary,
    deliveryStatusIcon,
    deliveryStatusTone,
    draftReservationStatusIcon,
    draftReservationStatusTone,
    enabledPaymentMethods,
    filteredReservations,
    formatDateTime,
    getLakeName,
    getLivePegLabel,
    getReservationNotificationDeliveryBadges,
    handlePaymentMethodToggle,
    handleReservationAdminTabKeydown,
    moveCalendar,
    notificationBroadcastStatusLabels,
    paymentMethodDraft,
    paymentMethodIcon,
    paymentMethodSubmitMessage,
    paymentMethodSubmitStatus,
    paymentMethodTone,
    pegAvailabilityRows,
    permitProducts,
    rentalAvailabilityIcon,
    rentalAvailabilityTone,
    rentalBookingStatusLabel,
    reservationAccessLabel,
    reservationAdminTabClass,
    reservationAdminTabScrollerElement,
    reservationAdminViewTabs,
    reservationDetailElement,
    reservationLakeFilter,
    reservationReadOnlyMessage,
    reservationsReadOnly,
    reservationStats,
    saveDecision,
    savePaymentMethodSettings,
    selectCalendarCell,
    selectedAvailability,
    selectedCabin,
    selectedClosureConflicts,
    selectedExtras,
    selectedPeg,
    selectedPermit,
    selectedRentalRows,
    selectedReservation,
    selectedReservationId,
    selectedReservationNotification,
    selectReservation,
    selectReservationAdminView,
    setCalendarMode,
    showCalendarContext,
    sourceIcon,
    sourceLabel,
    statusIcon,
    statusLabel,
    statusTone,
    submitAdminReservation,
    workflowMessage,
  }
}
