<script setup lang="ts">
import type { MapStateResponse } from '~/services/mapApiService'
import type { ReservationStateResponse } from '~/services/reservationApiService'
import { getPegAvailability, type AvailabilityStatus } from '~/utils/availability'
import { buildCalendarDays } from '~/utils/calendar'

const route = useRoute()
const { lakes, mapFacilities, mapLayers, mapShapes, pegs, reservations, rentalBookings } = usePondData()
const slug = String(route.params.slug)
const lake = lakes.find((item) => item.slug === slug)

if (!lake) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Revír sa nenašiel',
  })
}

useHead({ title: lake.name })

const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const fallbackReservationState = (): ReservationStateResponse => ({
  ok: true,
  rentalBookings,
  reservations,
  updatedAt: 'seed',
})
const {
  data: mapState,
  error: mapStateError,
  refresh: refreshMapState,
  status: mapStateStatus,
} = await useAsyncData<MapStateResponse>(
  `public-revir-map-state-${lake.slug}`,
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)
const {
  data: reservationState,
  error: reservationStateError,
  refresh: refreshReservationState,
  status: reservationStateStatus,
} = await useAsyncData<ReservationStateResponse>(
  `public-revir-reservation-state-${lake.slug}`,
  () => $fetch<ReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
const { liveClosures } = await useClosureState({ key: `public-revir-closure-state-${lake.slug}` })
const availabilityStartIso = new Date().toISOString().slice(0, 10)
const livePegs = computed(() => mapState.value?.pegs ?? pegs)
const liveReservations = computed(() => reservationState.value?.reservations ?? reservations)
const lakePegs = computed(() => livePegs.value.filter((peg) => peg.lake === lake.slug))
const cabinCount = computed(() => lakePegs.value.filter((peg) => peg.type === 'cabin').length)
const isAvailabilityLoading = computed(() =>
  mapStateStatus.value === 'pending' || reservationStateStatus.value === 'pending',
)
const hasAvailabilityError = computed(() => Boolean(mapStateError.value || reservationStateError.value))
const mapTarget = computed(() => ({
  path: '/mapa',
  query: { jazero: lake.slug },
}))
const reservationTarget = computed(() => ({
  path: '/rezervacie',
  query: { jazero: lake.slug },
}))

const availabilityDays = computed(() => buildCalendarDays(availabilityStartIso, 7))
const availabilityStatusClasses: Record<AvailabilityStatus | 'unavailable', string> = {
  available: 'border-success-200 bg-success-500/10 text-success-700',
  blocked: 'border-border bg-muted text-foreground-muted',
  closed: 'border-error-200 bg-error-500/10 text-error-700',
  limited: 'border-warning-200 bg-warning-500/10 text-warning-700',
  requires_approval: 'border-primary-200 bg-primary-50 text-primary-800',
  reserved: 'border-error-200 bg-error-500/10 text-error-700',
  unavailable: 'border-border bg-muted text-foreground-muted',
}
const availabilityPreviewRows = computed(() =>
  availabilityDays.value.map((day) => {
    const pegRows = lakePegs.value.map((peg) => ({
      availability: getPegAvailability(peg, {
        closures: liveClosures.value,
        dateFrom: day.iso,
        dateTo: day.iso,
        reservations: liveReservations.value,
      }),
      peg,
    }))
    const reservableRows = pegRows.filter((row) => row.availability.reservable)
    const preferredRow = reservableRows.find((row) => row.peg.type === 'cabin') ?? reservableRows[0]

    return {
      day,
      firstAvailability: preferredRow?.availability,
      firstPeg: preferredRow?.peg,
      reservableCount: reservableRows.length,
      target: {
        path: '/rezervacie',
        query: {
          do: day.iso,
          jazero: lake.slug,
          miesto: preferredRow?.peg.id,
          od: day.iso,
        },
      },
    }
  }),
)

async function retryAvailability() {
  await Promise.all([
    refreshMapState(),
    refreshReservationState(),
  ])
}
</script>

<template>
  <div>
    <section class="relative min-h-[32rem] overflow-hidden bg-primary-950 text-white">
      <img
        :src="lake.image"
        :alt="lake.name"
        class="absolute inset-0 h-full w-full object-cover opacity-70"
      >
      <div class="absolute inset-0 bg-linear-to-t from-primary-950 via-primary-950/55 to-primary-950/10" />
      <div class="relative mx-auto flex min-h-[32rem] max-w-7xl flex-col justify-end px-4 pb-10 pt-24 sm:px-6 lg:px-8">
        <NuxtLink
          to="/reviry"
          class="mb-auto inline-flex w-fit items-center gap-2 rounded-md bg-black/30 px-3 py-2 text-sm font-bold backdrop-blur-sm hover:bg-black/45"
        >
          <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
          Všetky revíry
        </NuxtLink>
        <p class="font-bold text-accent-200">{{ lake.areaHa }} ha · {{ lake.mode }}</p>
        <h1 class="mt-2 max-w-4xl text-4xl font-bold sm:text-5xl">{{ lake.name }}</h1>
        <p class="mt-4 max-w-3xl text-base text-white/85 sm:text-lg">{{ lake.summary }}</p>
        <div class="mt-6 flex flex-wrap gap-3">
          <UButton :to="mapTarget" icon="i-heroicons-map" color="warning" size="lg">
            Otvoriť mapu miest
          </UButton>
          <UButton
            :to="reservationTarget"
            icon="i-heroicons-calendar-days"
            color="neutral"
            variant="solid"
            size="lg"
          >
            Rezervovať na tomto jazere
          </UButton>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="border-y border-border py-4">
          <p class="text-sm text-foreground-muted">Vodná plocha</p>
          <p class="mt-1 text-2xl font-bold">{{ lake.areaHa }} ha</p>
        </div>
        <div class="border-y border-border py-4">
          <p class="text-sm text-foreground-muted">Lovné miesta</p>
          <p class="mt-1 text-2xl font-bold">{{ lakePegs.length }}</p>
        </div>
        <div class="border-y border-border py-4">
          <p class="text-sm text-foreground-muted">Miesta s chatou</p>
          <p class="mt-1 text-2xl font-bold">{{ cabinCount }}</p>
        </div>
      </div>

      <div class="border-border bg-surface mt-10 rounded-card border p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-2xl font-bold">Najbližšia dostupnosť</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Stav vychádza z publikovaných lovných miest, rezervácií a uzávierok revíru.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton :to="mapTarget" icon="i-heroicons-map-pin" variant="soft">
              Mapa jazera
            </UButton>
            <UButton :to="reservationTarget" icon="i-heroicons-calendar-days">
              Rezervácie
            </UButton>
          </div>
        </div>

        <DataStatusNotice
          v-if="isAvailabilityLoading || hasAvailabilityError"
          class="mt-4"
          :title="hasAvailabilityError ? 'Dostupnosť sa nepodarilo obnoviť' : 'Načítavam dostupnosť revíru'"
          :description="hasAvailabilityError ? 'Zobrazujeme posledný dostupný stav miest a rezervácií.' : 'Kontrolujeme aktuálne rezervácie, uzávierky a mapové miesta.'"
          :tone="hasAvailabilityError ? 'warning' : 'info'"
          :loading="isAvailabilityLoading && !hasAvailabilityError"
          :action-label="hasAvailabilityError ? 'Skúsiť znova' : ''"
          :action-loading="isAvailabilityLoading"
          @action="retryAvailability"
        />

        <div class="mt-5 grid gap-3 md:grid-cols-7">
          <NuxtLink
            v-for="row in availabilityPreviewRows"
            :key="row.day.iso"
            :to="row.target"
            class="rounded-md border p-3 transition-colors hover:border-primary-300 hover:bg-primary-50"
            :class="availabilityStatusClasses[row.firstAvailability?.status ?? 'unavailable']"
          >
            <p class="text-xs font-bold uppercase">{{ row.day.dayName }}</p>
            <p class="mt-1 text-lg font-black">{{ row.day.dayNumber }}. {{ row.day.monthName }}</p>
            <p class="mt-3 text-sm font-bold">
              {{ row.reservableCount > 0 ? `${row.reservableCount} miest` : 'Bez voľného miesta' }}
            </p>
            <p class="mt-1 min-h-8 text-xs opacity-80">
              {{ row.firstPeg ? `Najbližšie: ${row.firstPeg.label}` : 'Skúste iný deň alebo zavolajte správcovi.' }}
            </p>
          </NuxtLink>
        </div>
      </div>

      <div class="mt-10 grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h2 class="text-2xl font-bold">Charakter revíru</h2>
          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <div
              v-for="highlight in lake.highlights"
              :key="highlight"
              class="flex items-start gap-3 border-b border-border pb-3"
            >
              <UIcon name="i-heroicons-check-circle" class="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
              <span class="font-semibold">{{ highlight }}</span>
            </div>
          </div>

          <h2 class="mt-10 text-2xl font-bold">Vybavenie a prístup</h2>
          <ul class="mt-5 grid gap-3 sm:grid-cols-2">
            <li
              v-for="facility in lake.facilities"
              :key="facility"
              class="flex items-start gap-3 rounded-md bg-muted p-3"
            >
              <UIcon name="i-heroicons-map-pin" class="mt-0.5 h-5 w-5 shrink-0 text-primary-700" />
              <span>{{ facility }}</span>
            </li>
          </ul>
        </div>

        <aside class="border-l-4 border-warning-400 bg-warning-500/10 p-5">
          <h2 class="text-xl font-bold">Dôležité pravidlá</h2>
          <ul class="mt-4 space-y-3">
            <li v-for="rule in lake.rules" :key="rule" class="flex items-start gap-3">
              <UIcon name="i-heroicons-shield-check" class="mt-0.5 h-5 w-5 shrink-0 text-warning-800" />
              <span>{{ rule }}</span>
            </li>
          </ul>

          <h3 class="mt-8 font-bold">Ryby v revíri</h3>
          <div class="mt-3 flex flex-wrap gap-2">
            <StatusBadge
              v-for="fish in lake.fishStock"
              :key="fish"
              :label="fish"
              tone="neutral"
              size="xs"
            />
          </div>
        </aside>
      </div>

      <div class="mt-12">
        <h2 class="text-2xl font-bold">Fotogaléria</h2>
        <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <img
            v-for="image in lake.galleryImages"
            :key="image"
            :src="image"
            :alt="`${lake.name} – pohľad na revír`"
            class="aspect-4/3 w-full rounded-md object-cover"
            loading="lazy"
          >
        </div>
      </div>
    </section>
  </div>
</template>
