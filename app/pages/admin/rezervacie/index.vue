<script setup lang="ts">
import type { LakeSlug, RentalBooking, Reservation } from '~/data/pond'
import type {
  ReservationDecisionSuccess,
  ReservationStateResponse,
} from '~/services/reservationApiService'
import type { ReservationDecisionMode } from '~/services/reservationWorkflowService'
import { getPegAvailability, rangesOverlap } from '~/utils/availability'
import { addDays, buildCalendarDays } from '~/utils/calendar'
import { getRentalAvailability } from '~/utils/rentals'

useHead({ title: 'Admin rezervácie' })

const {
  cabinProducts,
  getLakeName,
  getPegLabel,
  pegs,
  permitProducts,
  rentalBookings,
  rentalItems,
  reservationExtras,
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
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-reservation-closure-state' })
const {
  canOperate: canOperateReservations,
  isReadOnly: reservationsReadOnly,
  label: reservationAccessLabel,
  readOnlyMessage: reservationReadOnlyMessage,
} = useAdminModuleAccess('reservations')

const selectedLake = ref<LakeSlug | 'all'>('all')
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
const selectedReservationId = ref(
  adminReservations.value.find((reservation) => reservation.status === 'pending')?.id ??
    adminReservations.value[0]?.id ??
    '',
)
const decisionMode = ref<ReservationDecisionMode>('approve')
const adminNoteDraft = ref('')
const calendarStart = ref('2026-05-16')
const decisionSubmitStatus = ref<'idle' | 'submitting' | 'error'>('idle')
const decisionSubmitMessage = ref('')

watch(
  reservationState,
  (state) => {
    if (!state) return
    replaceReservationWorkflowState(state.reservations, state.rentalBookings)
  },
  { immediate: true },
)

const filteredReservations = computed(() =>
  adminReservations.value.filter((reservation) => selectedLake.value === 'all' || reservation.lake === selectedLake.value),
)
const selectedReservation = computed(() =>
  adminReservations.value.find((reservation) => reservation.id === selectedReservationId.value),
)

watch(
  filteredReservations,
  (rows) => {
    if (!rows.some((reservation) => reservation.id === selectedReservationId.value)) {
      selectedReservationId.value = rows[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(
  selectedReservation,
  (reservation) => {
    adminNoteDraft.value = reservation?.internalNote ?? ''
    decisionMode.value = getDefaultDecisionMode(reservation)
    decisionSubmitStatus.value = 'idle'
    decisionSubmitMessage.value = ''
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

const conflictingClosures = computed(() =>
  liveClosures.value.filter((closure) => closure.affectsReservations),
)
const pegAvailabilityRows = computed(() =>
  pegs
    .filter((peg) => selectedLake.value === 'all' || peg.lake === selectedLake.value)
    .map((peg) => ({
      availability: getPegAvailability(peg, { closures: liveClosures.value, reservations: adminReservations.value }),
      peg,
    })),
)
const calendarLake = computed<LakeSlug>(() => (selectedLake.value === 'all' ? 'velky-cetin' : selectedLake.value))
const calendarDays = computed(() => buildCalendarDays(calendarStart.value, 7))
const calendarLakePegs = computed(() => pegs.filter((peg) => peg.lake === calendarLake.value))
const calendarRows = computed(() =>
  calendarLakePegs.value.map((peg) => ({
    peg,
    cells: calendarDays.value.map((day) => {
      const availability = getPegAvailability(peg, {
        closures: liveClosures.value,
        dateFrom: day.iso,
        dateTo: day.iso,
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
  selectedReservation.value ? pegs.find((peg) => peg.id === selectedReservation.value?.pegId) : undefined,
)
const selectedPermit = computed(() =>
  permitProducts.find((permit) => permit.id === selectedReservation.value?.permitId),
)
const selectedCabin = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation) return undefined
  if (reservation.cabinProductId) {
    return cabinProducts.find((cabin) => cabin.id === reservation.cabinProductId)
  }

  return cabinProducts.find((cabin) => cabin.pegIds.includes(reservation.pegId))
})
const selectedExtras = computed(() =>
  reservationExtras.filter((extra) => selectedReservation.value?.extraIds.includes(extra.id)),
)
const selectedAvailability = computed(() => {
  const reservation = selectedReservation.value
  if (!reservation || !selectedPeg.value) return undefined

  return getPegAvailability(selectedPeg.value, {
    closures: liveClosures.value,
    dateFrom: reservation.from,
    dateTo: reservation.to,
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
    const item = rentalItems.find((rentalItem) => rentalItem.id === id)
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

const statusClass = (status: Reservation['status']) => {
  switch (status) {
    case 'confirmed':
      return 'bg-success-500/10 text-success-700'
    case 'pending':
      return 'bg-warning-500/10 text-warning-700'
    case 'blocked':
      return 'bg-error-500/10 text-error-700'
  }
}
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
const moveCalendar = (days: number) => {
  calendarStart.value = addDays(calendarStart.value, days)
}
const selectCalendarCell = (reservation?: Reservation) => {
  if (reservation) {
    selectedLake.value = reservation.lake
    selectedReservationId.value = reservation.id
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
    })
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

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Čaká</p>
          <p class="mt-2 text-3xl font-bold">{{ reservationStats.pending }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Potvrdené</p>
          <p class="mt-2 text-3xl font-bold">{{ reservationStats.confirmed }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Blokované</p>
          <p class="mt-2 text-3xl font-bold">{{ reservationStats.blocked }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Z webu</p>
          <p class="mt-2 text-3xl font-bold">{{ reservationStats.web }}</p>
        </div>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Týždenný kalendár obsadenosti</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              {{ getLakeName(calendarLake) }} · od {{ calendarStart }} · bunky používajú rovnaký availability engine ako mapa.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton size="sm" icon="i-heroicons-chevron-left" color="neutral" variant="soft" @click="moveCalendar(-7)">
              Týždeň späť
            </UButton>
            <input
              v-model="calendarStart"
              type="date"
              class="h-9 rounded-md border border-border bg-white px-3 text-sm"
              aria-label="Začiatok kalendára"
            >
            <UButton size="sm" icon="i-heroicons-chevron-right" color="neutral" variant="soft" @click="moveCalendar(7)">
              Týždeň ďalej
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

        <div class="mt-5 overflow-x-auto rounded-md border border-border">
          <div class="min-w-[920px]">
            <div class="grid grid-cols-[160px_repeat(7,minmax(104px,1fr))] border-b border-border bg-muted">
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
              class="grid grid-cols-[160px_repeat(7,minmax(104px,1fr))] border-b border-border last:border-b-0"
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

      <div class="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Žiadosti a termíny</h2>
              <p class="text-foreground-muted text-sm">Kliknutím vyberiete rezerváciu na schválenie.</p>
            </div>
            <select v-model="selectedLake" class="h-10 rounded-md border border-border bg-white px-3 text-sm">
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
              @click="selectedReservationId = reservation.id"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ reservation.guest }}</p>
                  <p class="text-foreground-muted text-sm">
                    {{ getLakeName(reservation.lake) }} · {{ getPegLabel(reservation.pegId) }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="statusClass(reservation.status)">
                    {{ statusLabel(reservation.status) }}
                  </span>
                  <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                    {{ sourceLabel(reservation.source) }}
                  </span>
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
          <div v-if="selectedReservation" class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Detail rezervácie</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedReservation.guest }} · {{ selectedReservation.contactPhone }}
                </p>
              </div>
              <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="statusClass(selectedReservation.status)">
                {{ statusLabel(selectedReservation.status) }}
              </span>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Miesto</p>
                <p class="font-semibold">{{ getPegLabel(selectedReservation.pegId) }}</p>
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
                    <span class="rounded-md border px-2 py-1 text-xs font-bold" :class="row.availability.classes">
                      {{ row.availability.label }}
                    </span>
                  </div>
                </div>
                <AppState
                  v-if="selectedRentalRows.length === 0"
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
                <UButton icon="i-heroicons-phone" color="neutral" variant="soft">Zavolať hosťovi</UButton>
              </div>
              <p
                v-if="decisionSubmitMessage"
                class="mt-3 rounded-md bg-error-500/10 px-3 py-2 text-sm font-semibold text-error-700"
              >
                {{ decisionSubmitMessage }}
              </p>
              <p v-if="workflowMessage" class="mt-3 rounded-md bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-800">
                {{ workflowMessage }}
              </p>
            </div>
          </div>

          <AppState
            v-else
            title="Vyberte rezerváciu"
            description="Detail sa zobrazí po kliknutí na rezerváciu v zozname."
          />

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
                title="Bez konfliktov"
                description="Availability engine zatiaľ nehlási žiadnu uzávierku blokujúcu rezervácie."
              />
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Miesta podľa stavu</h2>
            <div class="mt-4 grid gap-2">
              <div
                v-for="row in pegAvailabilityRows"
                :key="row.peg.id"
                class="flex items-center justify-between gap-3 rounded-md bg-muted p-3"
              >
                <div>
                  <p class="font-semibold">{{ row.peg.label }}</p>
                  <p class="text-foreground-muted text-xs">
                    {{ getLakeName(row.peg.lake) }} · {{ row.availability.reasons[0] }}
                  </p>
                </div>
                <AvailabilityBadge :availability="row.availability" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
