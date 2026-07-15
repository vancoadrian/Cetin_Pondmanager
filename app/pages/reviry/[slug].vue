<script setup lang="ts">
import type { Peg } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import {
  createPublicReservationState,
  type PublicReservationStateResponse,
} from '~/services/publicAvailabilityService'
import { getPegAvailability } from '~/utils/availability'
import { formatAvailabilityDateRange, resolveAvailabilityDateRange } from '~/utils/availabilityDateRange'
import { buildCalendarDays } from '~/utils/calendar'
import { getOptimizedImageSrcset } from '~/utils/responsiveImage'

const route = useRoute()
const router = useRouter()
const { lakes, mapFacilities, mapLayers, mapShapes, pegs, reservations, rentalBookings } = usePondData()
const slug = String(route.params.slug)
const lake = lakes.find((item) => item.slug === slug)

if (!lake) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Revír sa nenašiel',
  })
}

usePublicSeo({
  title: lake.name,
  description: lake.summary,
  image: lake.image,
  imageAlt: lake.name,
})

const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const fallbackReservationState = (): PublicReservationStateResponse => createPublicReservationState({
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
} = await useAsyncData<PublicReservationStateResponse>(
  `public-revir-reservation-state-${lake.slug}`,
  () => $fetch<PublicReservationStateResponse>('/api/reservations'),
  {
    default: fallbackReservationState,
  },
)
const { liveClosures } = await useClosureState({ key: `public-revir-closure-state-${lake.slug}` })
const initialDateRange = resolveAvailabilityDateRange(route.query.od, route.query.do)
const dateFrom = ref(initialDateRange.dateFrom)
const dateTo = ref(initialDateRange.dateTo)
const isDatePickerExpanded = ref(false)
const livePegs = computed(() => mapState.value?.pegs ?? pegs)
const liveReservations = computed(() => reservationState.value?.reservations ?? reservations)
const lakePegs = computed(() => livePegs.value.filter((peg) => peg.lake === lake.slug))
const cabinCount = computed(() => lakePegs.value.filter((peg) => peg.type === 'cabin').length)
const isAvailabilityLoading = computed(() =>
  mapStateStatus.value === 'pending' || reservationStateStatus.value === 'pending',
)
const hasAvailabilityError = computed(() => Boolean(mapStateError.value || reservationStateError.value))
const rangeAvailabilityRows = computed(() =>
  lakePegs.value.map((peg) => ({
    availability: getPegAvailability(peg, {
      closures: liveClosures.value,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      reservations: liveReservations.value,
    }),
    peg,
  })),
)
const rangeReservableRows = computed(() =>
  rangeAvailabilityRows.value.filter((row) => row.availability.reservable),
)
const rangeCabinRows = computed(() =>
  rangeReservableRows.value.filter((row) => row.peg.type === 'cabin'),
)
const rangeBlockedRows = computed(() =>
  rangeAvailabilityRows.value.filter((row) => !row.availability.reservable),
)
const preferredRangeRow = computed(() =>
  rangeCabinRows.value[0] ?? rangeReservableRows.value[0],
)
const preferredRangePeg = computed(() =>
  preferredRangeRow.value?.peg ?? lakePegs.value[0],
)
const recommendedRangeRows = computed(() =>
  [...rangeReservableRows.value]
    .sort((left, right) => {
      const typeScore = Number(right.peg.type === 'cabin') - Number(left.peg.type === 'cabin')
      if (typeScore !== 0) return typeScore

      return left.peg.label.localeCompare(right.peg.label, 'sk')
    })
    .slice(0, 3),
)
const availabilityRangeLabel = computed(() => formatAvailabilityDateRange(dateFrom.value, dateTo.value))

function formatReservablePlaceCount(count: number) {
  if (count === 1) return '1 voľné miesto'
  if (count >= 2 && count <= 4) return `${count} voľné miesta`
  return `${count} voľných miest`
}

function mapTargetForPeg(peg?: Peg) {
  return {
    path: '/mapa',
    query: {
      do: dateTo.value,
      jazero: peg?.lake ?? lake!.slug,
      miesto: peg?.id,
      od: dateFrom.value,
      volne: '1',
    },
  }
}

function reservationTargetForPeg(peg?: Peg) {
  return peg
    ? {
        path: '/rezervacie',
        query: {
          do: dateTo.value,
          jazero: peg.lake,
          miesto: peg.id,
          od: dateFrom.value,
          typ: peg.type === 'cabin' ? 'chata' : undefined,
        },
      }
    : undefined
}

const mapTarget = computed(() => mapTargetForPeg(preferredRangePeg.value))
const reservationTarget = computed(() => reservationTargetForPeg(preferredRangeRow.value?.peg))

const availabilityDays = computed(() => buildCalendarDays(dateFrom.value, 7))
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

watch(
  [dateFrom, dateTo],
  () => {
    if (!import.meta.client) return

    void router.replace({
      query: {
        ...route.query,
        do: dateTo.value,
        od: dateFrom.value,
      },
    })
  },
)
</script>

<template>
  <div>
    <section class="relative min-h-[32rem] overflow-hidden bg-primary-950 text-white">
      <picture>
        <source
          type="image/avif"
          :srcset="getOptimizedImageSrcset(lake.image, [320, 500])"
          sizes="100vw"
        >
        <source
          type="image/webp"
          :srcset="getOptimizedImageSrcset(lake.image, [320, 500], 'webp')"
          sizes="100vw"
        >
        <img
          :src="lake.image"
          :alt="lake.name"
          width="500"
          height="400"
          fetchpriority="high"
          class="absolute inset-0 h-full w-full object-cover opacity-70"
        >
      </picture>
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
            Pozrieť voľné miesta
          </UButton>
          <UButton
            :to="reservationTarget"
            icon="i-heroicons-calendar-days"
            color="neutral"
            variant="solid"
            size="lg"
          >
            Rezervovať termín
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
              Vyberte termín a otvorte mapu už filtrovanú na voľné miesta.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton :to="mapTarget" icon="i-heroicons-map-pin" variant="soft">
              Mapa voľných miest
            </UButton>
            <UButton
              :to="reservationTarget"
              icon="i-heroicons-calendar-days"
              :disabled="!preferredRangeRow"
            >
              {{ preferredRangeRow ? 'Rezervovať' : 'Vyberte iný termín' }}
            </UButton>
          </div>
        </div>

        <div class="mt-5 flex items-center justify-between gap-3 rounded-md border border-primary-200 bg-primary-50 p-3 md:hidden">
          <div class="min-w-0">
            <p class="text-primary-800 text-xs font-semibold">Zvolený termín</p>
            <p class="mt-0.5 truncate font-bold">{{ availabilityRangeLabel }}</p>
          </div>
          <UButton
            type="button"
            :icon="isDatePickerExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-pencil-square'"
            size="sm"
            variant="soft"
            :aria-expanded="isDatePickerExpanded"
            aria-controls="revir-date-picker"
            @click="isDatePickerExpanded = !isDatePickerExpanded"
          >
            {{ isDatePickerExpanded ? 'Hotovo' : 'Zmeniť' }}
          </UButton>
        </div>

        <AvailabilityRangePicker
          id="revir-date-picker"
          v-model:date-from="dateFrom"
          v-model:date-to="dateTo"
          class="mt-3 md:mt-5 md:block"
          :class="isDatePickerExpanded ? 'block' : 'hidden'"
        />

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

        <div class="mt-5 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4">
          <div class="hidden rounded-md border border-border bg-white p-3 lg:block">
            <p class="text-foreground-muted text-xs">Zvolený termín</p>
            <p class="mt-1 font-bold">{{ availabilityRangeLabel }}</p>
          </div>
          <div class="min-w-0 rounded-md border border-success-200 bg-success-500/10 p-3">
            <p class="text-success-700 text-xs font-semibold">Voľné miesta</p>
            <p class="mt-1 text-2xl font-black">{{ rangeReservableRows.length }}</p>
          </div>
          <div class="min-w-0 rounded-md border border-warning-200 bg-warning-500/10 p-3">
            <p class="text-warning-700 text-xs font-semibold">Voľné chaty</p>
            <p class="mt-1 text-2xl font-black">{{ rangeCabinRows.length }}</p>
          </div>
          <div class="min-w-0 rounded-md border border-border bg-muted p-3">
            <p class="text-foreground-muted text-xs">Blokované</p>
            <p class="mt-1 text-2xl font-black">{{ rangeBlockedRows.length }}</p>
          </div>
        </div>

        <div
          v-if="preferredRangeRow"
          class="mt-5 grid gap-4 rounded-md border border-primary-200 bg-primary-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div class="min-w-0">
            <p class="text-primary-800 text-xs font-bold uppercase">Odporúčaný výber pre tento termín</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <h3 class="text-2xl font-black">{{ preferredRangeRow.peg.label }}</h3>
              <AvailabilityBadge :availability="preferredRangeRow.availability" />
              <StatusBadge
                :icon="preferredRangeRow.peg.type === 'cabin' ? 'i-heroicons-home-modern' : 'i-heroicons-map-pin'"
                :label="preferredRangeRow.peg.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto'"
                tone="primary"
                size="xs"
              />
            </div>
            <p class="text-foreground-muted mt-2 text-sm">{{ preferredRangeRow.peg.notes }}</p>
            <p class="text-primary-900 mt-2 text-sm font-semibold">
              {{ preferredRangeRow.availability.reasons[0] || preferredRangeRow.availability.description }}
            </p>
            <div v-if="recommendedRangeRows.length > 1" class="mt-4 flex flex-wrap gap-2">
              <NuxtLink
                v-for="row in recommendedRangeRows"
                :key="row.peg.id"
                :to="reservationTargetForPeg(row.peg)"
                class="inline-flex items-center gap-2 rounded-md border border-primary-200 bg-white px-3 py-2 text-sm font-bold text-primary-900 transition hover:border-primary-400 hover:bg-primary-100"
              >
                <UIcon :name="row.peg.type === 'cabin' ? 'i-heroicons-home-modern' : 'i-heroicons-map-pin'" class="h-4 w-4" />
                {{ row.peg.label }}
              </NuxtLink>
            </div>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <UButton :to="reservationTargetForPeg(preferredRangeRow.peg)" icon="i-heroicons-calendar-days" color="warning">
              Rezervovať toto miesto
            </UButton>
            <UButton :to="mapTargetForPeg(preferredRangeRow.peg)" icon="i-heroicons-map" variant="soft">
              Otvoriť na mape
            </UButton>
          </div>
        </div>

        <DataStatusNotice
          v-else
          class="mt-5"
          title="V zvolenom termíne nie je voľné miesto"
          description="Skúste kratší rozsah, iný deň alebo otvorte mapu a pozrite si dôvod blokácie pri jednotlivých miestach."
          tone="warning"
          icon="i-heroicons-calendar-days"
          action-label="Otvoriť mapu"
          @action="router.push(mapTarget)"
        />

        <div class="mt-5 md:hidden">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-bold">Najbližších 7 dní</h3>
            <span class="text-foreground-muted text-xs">od {{ availabilityDays[0]?.dayNumber }} {{ availabilityDays[0]?.monthName }}</span>
          </div>
          <div class="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border bg-white">
            <NuxtLink
              v-for="row in availabilityPreviewRows"
              :key="`mobile-${row.day.iso}`"
              :to="row.target"
              class="group grid min-h-18 grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-primary-50"
              :class="row.firstPeg ? '' : 'bg-muted/60'"
            >
              <div class="text-center">
                <p class="text-foreground-muted text-[0.6875rem] font-bold uppercase">{{ row.day.dayName }}</p>
                <p class="mt-0.5 font-black">{{ row.day.dayNumber }}</p>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5">
                  <UIcon
                    :name="row.firstPeg ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol'"
                    class="h-4 w-4 shrink-0"
                    :class="row.firstPeg ? 'text-success-600' : 'text-foreground-muted'"
                  />
                  <p class="truncate text-sm font-bold">{{ formatReservablePlaceCount(row.reservableCount) }}</p>
                </div>
                <p class="text-foreground-muted mt-0.5 truncate text-xs">
                  {{ row.firstPeg ? `Odporúčané: ${row.firstPeg.label}` : 'Skúste iný deň alebo mapu.' }}
                </p>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="text-primary-800 h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </NuxtLink>
          </div>
        </div>

        <div class="mt-5 hidden gap-3 md:grid md:grid-cols-7">
          <NuxtLink
            v-for="row in availabilityPreviewRows"
            :key="row.day.iso"
            :to="row.target"
            class="group rounded-md border border-border bg-white p-3 transition-colors hover:border-primary-300 hover:bg-primary-50"
          >
            <p class="text-xs font-bold uppercase">{{ row.day.dayName }}</p>
            <p class="mt-1 text-lg font-black">{{ row.day.dayNumber }} {{ row.day.monthName }}</p>
            <div class="mt-3">
              <AvailabilityBadge v-if="row.firstAvailability" :availability="row.firstAvailability" />
              <StatusBadge
                v-else
                icon="i-heroicons-no-symbol"
                label="Bez miesta"
                tone="muted"
              />
            </div>
            <p class="mt-3 text-sm font-bold">Voľné v tento deň: {{ row.reservableCount }}</p>
            <p class="mt-1 min-h-8 text-xs opacity-80">
              {{ row.firstPeg ? `Najbližšie: ${row.firstPeg.label}` : 'Skúste iný deň alebo zavolajte správcovi.' }}
            </p>
            <span class="text-primary-800 mt-3 inline-flex items-center gap-1 text-xs font-black">
              {{ row.firstPeg ? 'Vybrať deň' : 'Pozrieť možnosti' }}
              <UIcon name="i-heroicons-arrow-right" class="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
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

        <aside class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-start gap-3">
            <div class="rounded-md bg-primary-50 p-2 text-primary-800">
              <UIcon name="i-heroicons-shield-check" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="text-xl font-bold">Dôležité pravidlá</h2>
              <p class="text-foreground-muted mt-1 text-sm">
                Pravidlá platia pre celý revír a pri rezervácii ich treba dodržať.
              </p>
            </div>
          </div>
          <ul class="mt-4 space-y-3">
            <li v-for="rule in lake.rules" :key="rule" class="flex items-start gap-3">
              <UIcon name="i-heroicons-check-circle" class="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
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
          <picture
            v-for="(image, imageIndex) in lake.galleryImages"
            :key="image"
            class="block min-w-0"
          >
            <source
              type="image/avif"
              :srcset="getOptimizedImageSrcset(image, [320, 640, 1080])"
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            >
            <source
              type="image/webp"
              :srcset="getOptimizedImageSrcset(image, [320, 640, 1080], 'webp')"
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            >
            <img
              :src="image"
              :alt="`${lake.name} – pohľad na revír ${imageIndex + 1}`"
              width="1080"
              height="247"
              class="aspect-4/3 w-full rounded-md object-cover"
              loading="lazy"
              decoding="async"
            >
          </picture>
        </div>
      </div>
    </section>
  </div>
</template>
