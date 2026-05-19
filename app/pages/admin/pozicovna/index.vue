<script setup lang="ts">
import { getRentalAvailability } from '~/utils/rentals'

useHead({ title: 'Admin požičovňa' })

const { getLakeName, getPegLabel, rentalBookings, rentalItems, reservationExtras, reservations } = usePondData()

const rangeFrom = ref('2026-05-16')
const rangeTo = ref('2026-05-18')
const totalStock = computed(() => rentalItems.reduce((sum, item) => sum + item.stock, 0))
const recommendedItems = computed(() => rentalItems.filter((item) => item.recommended))
const cabinExtras = computed(() => reservationExtras.filter((extra) => extra.appliesTo === 'cabin'))
const rentalAvailabilityRows = computed(() =>
  rentalItems.map((item) => ({
    availability: getRentalAvailability(item, {
      bookings: rentalBookings,
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
      reservation: reservations.find((reservation) => reservation.id === booking.reservationId),
    })),
  ),
)
const rangeAvailableStock = computed(() =>
  rentalAvailabilityRows.value.reduce((sum, row) => sum + row.availability.availableQuantity, 0),
)
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

      <div class="grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Položky výbavy</p>
          <p class="mt-2 text-3xl font-bold">{{ rentalItems.length }}</p>
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
              <p class="text-foreground-muted text-sm">Ceny a sklad sú mock, dostupnosť sa už počíta podľa rezervácií.</p>
            </div>
            <UButton icon="i-heroicons-plus" variant="soft">Pridať položku</UButton>
          </div>

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
            >
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-bold">{{ row.item.label }}</p>
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
              </div>
              <div class="grid grid-cols-4 gap-2 text-center text-xs sm:min-w-72">
                <div class="rounded-md bg-muted p-2">
                  <p class="text-foreground-muted">Sklad</p>
                  <p class="text-lg font-bold">{{ row.availability.stock }}</p>
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
              <div v-for="extra in reservationExtras" :key="extra.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ extra.label }}</p>
                    <p class="text-foreground-muted mt-1 text-sm">{{ extra.description }}</p>
                  </div>
                  <span
                    class="rounded-md px-2 py-1 text-xs font-bold"
                    :class="extra.source === 'web' ? 'bg-success-500/10 text-success-700' : 'bg-warning-500/10 text-warning-700'"
                  >
                    {{ extra.source === 'web' ? 'web' : 'návrh' }}
                  </span>
                </div>
                <p class="text-primary-800 mt-2 text-xs font-semibold">{{ extra.priceLabel }}</p>
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
