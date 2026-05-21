<script setup lang="ts">
import type { RentalItem, ReservationExtra } from '~/data/pond'
import type { ReservationStateResponse } from '~/services/reservationApiService'
import type { RentalCatalogMutationSuccess } from '~/services/rentalCatalogService'
import { getRentalAvailability } from '~/utils/rentals'

useHead({ title: 'Admin požičovňa' })

const { getLakeName, getPegLabel, rentalBookings, reservations } = usePondData()
const {
  canOperate: canOperateRentals,
  isReadOnly: rentalsReadOnly,
  label: rentalAccessLabel,
  readOnlyMessage: rentalReadOnlyMessage,
} = useAdminModuleAccess('rentals')

const fallbackReservationState = (): ReservationStateResponse => ({
  ok: true,
  rentalBookings,
  reservations,
  updatedAt: 'seed',
})
const { data: reservationState } = await useAsyncData<ReservationStateResponse>(
  'admin-rentals-reservation-state',
  () => $fetch<ReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
const {
  liveRentalItems,
  liveReservationExtras,
  refresh: refreshRentalCatalogState,
} = await useRentalCatalogState({ admin: true, key: 'admin-rentals-catalog-state' })

const rangeFrom = ref('2026-05-16')
const rangeTo = ref('2026-05-18')
const rentalItemDraft = ref<RentalItem[]>([])
const reservationExtraDraft = ref<ReservationExtra[]>([])
const catalogSubmitStatus = ref<'idle' | 'submitting' | 'success' | 'error'>('idle')
const catalogSubmitMessage = ref('')
const liveReservations = computed(() => reservationState.value?.reservations ?? reservations)
const liveRentalBookings = computed(() => reservationState.value?.rentalBookings ?? rentalBookings)
const activeRentalItemDraft = computed(() => rentalItemDraft.value.filter((item) => item.active))
const totalStock = computed(() => activeRentalItemDraft.value.reduce((sum, item) => sum + item.stock, 0))
const recommendedItems = computed(() => activeRentalItemDraft.value.filter((item) => item.recommended))
const cabinExtras = computed(() => reservationExtraDraft.value.filter((extra) => extra.active && extra.appliesTo === 'cabin'))
const rentalAvailabilityRows = computed(() =>
  rentalItemDraft.value.map((item) => ({
    availability: getRentalAvailability(item, {
      bookings: liveRentalBookings.value,
      dateFrom: rangeFrom.value,
      dateTo: rangeTo.value,
    }),
    item,
  })),
)
const unavailableItems = computed(() =>
  rentalAvailabilityRows.value.filter((row) => row.availability.status === 'unavailable'),
)
const activeRentalBookings = computed(() =>
  rentalAvailabilityRows.value.flatMap((row) =>
    row.availability.bookings.map((booking) => ({
      booking,
      item: row.item,
      reservation: liveReservations.value.find((reservation) => reservation.id === booking.reservationId),
    })),
  ),
)
const rangeAvailableStock = computed(() =>
  rentalAvailabilityRows.value.reduce((sum, row) => sum + row.availability.availableQuantity, 0),
)

watch(
  liveRentalItems,
  (items) => {
    rentalItemDraft.value = items.map((item) => ({ ...item }))
  },
  { immediate: true },
)

watch(
  liveReservationExtras,
  (extras) => {
    reservationExtraDraft.value = extras.map((extra) => ({ ...extra }))
  },
  { immediate: true },
)

watch(
  [rentalItemDraft, reservationExtraDraft],
  () => {
    if (catalogSubmitStatus.value !== 'submitting') {
      catalogSubmitStatus.value = 'idle'
      catalogSubmitMessage.value = ''
    }
  },
  { deep: true },
)

async function saveRentalCatalogSettings() {
  if (!canOperateRentals.value) {
    catalogSubmitStatus.value = 'error'
    catalogSubmitMessage.value = rentalReadOnlyMessage.value
    return
  }

  catalogSubmitStatus.value = 'submitting'
  catalogSubmitMessage.value = ''

  try {
    const result = await $fetch<RentalCatalogMutationSuccess>('/api/admin/rental-catalog', {
      body: {
        rentalItems: rentalItemDraft.value.map((item) => ({
          active: item.active,
          id: item.id,
          priceLabel: item.priceLabel,
          recommended: item.recommended,
          stock: item.stock,
        })),
        reservationExtras: reservationExtraDraft.value.map((extra) => ({
          active: extra.active,
          id: extra.id,
          priceLabel: extra.priceLabel,
          source: extra.source,
        })),
      },
      method: 'PUT',
    })

    await refreshRentalCatalogState()
    catalogSubmitStatus.value = 'success'
    catalogSubmitMessage.value = result.message
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
    catalogSubmitStatus.value = 'error'
    catalogSubmitMessage.value =
      fetchError.data?.data?.messages?.join(' ') ??
      fetchError.data?.message ??
      fetchError.data?.statusMessage ??
      'Požičovňu sa nepodarilo uložiť.'
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Požičovňa a doplnky"
      description="Mock sklad povinnej výbavy, vecí k chate a doplnkov, ktoré si rybár vie pridať k rezervácii."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div
        v-if="rentalsReadOnly"
        class="mb-5 rounded-card border border-info-500/25 bg-info-500/10 p-4 text-info-700"
      >
        <p class="text-sm font-bold">Režim prístupu: {{ rentalAccessLabel }}</p>
        <p class="mt-1 text-sm">{{ rentalReadOnlyMessage }}</p>
      </div>

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Položky výbavy</p>
          <p class="mt-2 text-3xl font-bold">{{ activeRentalItemDraft.length }}/{{ rentalItemDraft.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Sklad spolu</p>
          <p class="mt-2 text-3xl font-bold">{{ totalStock }} ks</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Odporúčané pri rezervácii</p>
          <p class="mt-2 text-3xl font-bold">{{ recommendedItems.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Voľné v termíne</p>
          <p class="mt-2 text-3xl font-bold">{{ rangeAvailableStock }} ks</p>
        </div>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Sklad výbavy</h2>
              <p class="text-foreground-muted text-sm">Správca vie vypnúť položku, upraviť sklad a cenníkový text pre rezervácie.</p>
            </div>
            <UButton
              icon="i-heroicons-check"
              variant="soft"
              :disabled="!canOperateRentals || catalogSubmitStatus === 'submitting'"
              :loading="catalogSubmitStatus === 'submitting'"
              @click="saveRentalCatalogSettings"
            >
              Uložiť požičovňu
            </UButton>
          </div>
          <p
            v-if="catalogSubmitMessage"
            class="mt-4 rounded-md px-3 py-2 text-sm font-semibold"
            :class="
              catalogSubmitStatus === 'error'
                ? 'bg-error-500/10 text-error-700'
                : 'bg-success-500/10 text-success-700'
            "
          >
            {{ catalogSubmitMessage }}
          </p>

          <div class="mt-5 grid gap-3 rounded-md bg-muted p-3 sm:grid-cols-2">
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Od</span>
              <input
                v-model="rangeFrom"
                type="date"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-foreground-muted">Do</span>
              <input
                v-model="rangeTo"
                type="date"
                class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
            </label>
          </div>

          <div class="mt-5 overflow-hidden rounded-md border border-border">
            <div
              v-for="row in rentalAvailabilityRows"
              :key="row.item.id"
              class="grid gap-3 border-b border-border bg-white p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
              :class="!row.item.active ? 'opacity-70' : ''"
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-bold">{{ row.item.label }}</p>
                  <span
                    class="rounded-md px-2 py-1 text-xs font-bold"
                    :class="row.item.active ? 'bg-success-500/10 text-success-700' : 'bg-foreground-muted/10 text-foreground-muted'"
                  >
                    {{ row.item.active ? 'aktívne' : 'vypnuté' }}
                  </span>
                  <span v-if="row.item.recommended" class="rounded-md bg-primary-50 px-2 py-1 text-xs font-bold text-primary-800">
                    odporúčané
                  </span>
                  <span class="rounded-md border px-2 py-1 text-xs font-bold" :class="row.availability.classes">
                    {{ row.availability.label }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-1 text-sm">{{ row.item.description }}</p>
                <p class="text-primary-800 mt-2 text-xs font-semibold">{{ row.item.priceLabel }}</p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ row.availability.reasons[0] }}
                </p>
                <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
                  <label class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold">
                    <input
                      v-model="row.item.active"
                      type="checkbox"
                      :disabled="!canOperateRentals"
                      class="h-4 w-4 accent-primary-700"
                    >
                    Aktívne
                  </label>
                  <label class="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold">
                    <input
                      v-model="row.item.recommended"
                      type="checkbox"
                      :disabled="!canOperateRentals || !row.item.active"
                      class="h-4 w-4 accent-primary-700"
                    >
                    Odporúčané
                  </label>
                  <label class="block">
                    <span class="sr-only">Cenníkový text</span>
                    <input
                      v-model="row.item.priceLabel"
                      :disabled="!canOperateRentals"
                      class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                      placeholder="cena po potvrdení správcom"
                    >
                  </label>
                </div>
              </div>
              <div class="grid grid-cols-4 gap-2 text-center text-xs sm:min-w-72">
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Sklad</p>
                  <input
                    v-model.number="row.item.stock"
                    type="number"
                    min="0"
                    max="100"
                    :disabled="!canOperateRentals"
                    class="mt-1 h-9 w-full rounded-md border border-border bg-white px-2 text-center text-lg font-bold"
                    aria-label="Sklad"
                  >
                </div>
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Potvrdené</p>
                  <p class="text-lg font-bold">{{ row.availability.reservedQuantity }}</p>
                </div>
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Čaká</p>
                  <p class="text-lg font-bold">{{ row.availability.requestedQuantity }}</p>
                </div>
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Voľné</p>
                  <p class="text-lg font-bold">{{ row.availability.availableQuantity }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Výpožičky v termíne</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Aktívne väzby na rezervácie od {{ rangeFrom }} do {{ rangeTo }}.
                </p>
              </div>
              <span
                class="rounded-md px-2 py-1 text-xs font-bold"
                :class="unavailableItems.length ? 'bg-error-500/10 text-error-700' : 'bg-success-500/10 text-success-700'"
              >
                {{ unavailableItems.length ? `${unavailableItems.length} konflikt` : 'bez konfliktu' }}
              </span>
            </div>

            <div class="mt-4 space-y-3">
              <div
                v-for="entry in activeRentalBookings"
                :key="entry.booking.id"
                class="rounded-md bg-muted p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ entry.item.label }} · {{ entry.booking.quantity }} ks</p>
                    <p class="text-foreground-muted mt-1 text-sm">
                      {{ entry.reservation?.guest ?? entry.booking.reservationId }} ·
                      {{ entry.reservation ? getLakeName(entry.reservation.lake) : getLakeName(entry.booking.lake) }}
                    </p>
                    <p v-if="entry.reservation" class="text-foreground-muted mt-1 text-xs">
                      {{ getPegLabel(entry.reservation.pegId) }} · {{ entry.booking.from }} až {{ entry.booking.to }}
                    </p>
                  </div>
                  <span
                    class="rounded-md px-2 py-1 text-xs font-bold"
                    :class="entry.booking.status === 'reserved' ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-700'"
                  >
                    {{ entry.booking.status === 'reserved' ? 'potvrdené' : 'čaká' }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-2 text-xs">{{ entry.booking.note }}</p>
              </div>
              <AppState
                v-if="activeRentalBookings.length === 0"
                title="Bez výpožičiek"
                description="V zvolenom termíne nie je k rezerváciám priradená žiadna výbava."
              />
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Doplnky k rezervácii</h2>
            <div class="mt-4 space-y-3">
              <div v-for="extra in reservationExtraDraft" :key="extra.id" class="rounded-md bg-muted p-4" :class="!extra.active ? 'opacity-70' : ''">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ extra.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ extra.description }}</p>
                  </div>
                  <div class="flex flex-wrap justify-end gap-2">
                    <span
                      class="rounded-md px-2 py-1 text-xs font-bold"
                      :class="extra.active ? 'bg-success-500/10 text-success-700' : 'bg-foreground-muted/10 text-foreground-muted'"
                    >
                      {{ extra.active ? 'aktívne' : 'vypnuté' }}
                    </span>
                    <span
                      class="rounded-md px-2 py-1 text-xs font-bold"
                      :class="extra.source === 'web' ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-700'"
                    >
                      {{ extra.source === 'web' ? 'web' : 'návrh' }}
                    </span>
                  </div>
                </div>
                <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
                  <label class="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold">
                    <input
                      v-model="extra.active"
                      type="checkbox"
                      :disabled="!canOperateRentals"
                      class="h-4 w-4 accent-primary-700"
                    >
                    Aktívne
                  </label>
                  <label class="block">
                    <span class="sr-only">Zdroj doplnku</span>
                    <select
                      v-model="extra.source"
                      :disabled="!canOperateRentals"
                      class="h-10 w-full rounded-md border border-border bg-white px-2 text-xs"
                    >
                      <option value="web">z webu</option>
                      <option value="proposal">návrh</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="sr-only">Cenníkový text doplnku</span>
                    <input
                      v-model="extra.priceLabel"
                      :disabled="!canOperateRentals"
                      class="h-10 w-full rounded-md border border-border bg-white px-3 text-xs"
                    >
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Chata doplnky</h2>
            <p class="text-foreground-muted mt-2 text-sm">
              {{ cabinExtras.length }} položky sa zobrazia iba pri miestach s chatou. Sem patria drevo, gril alebo vybavenie k pobytu.
            </p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
