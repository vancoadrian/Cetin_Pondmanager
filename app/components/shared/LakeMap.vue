<script setup lang="ts">
import type { LakeClosure, MapFacility, MapLayerImageSettings, MapShape, Peg, Reservation } from '~/data/pond'
import { getPegAvailability } from '~/utils/availability'
import {
  getMapFacilityShortLabel,
  getMapFacilityStyle,
  getMapLayerImageAttributes,
  getMapMarkerStyle,
  getMapPointLabel,
  getMapShapePoints,
  getMapShapeStyle,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  toSvgY,
} from '~/utils/map'

const props = defineProps<{
  closures?: LakeClosure[]
  dateFrom?: string
  dateTo?: string
  facilities?: MapFacility[]
  title: string
  image?: string
  imageSettings?: MapLayerImageSettings
  points: Peg[]
  reservations?: Reservation[]
  shapes?: MapShape[]
  selectedId?: string
}>()

const emit = defineEmits<{
  select: [peg: Peg]
}>()

const { lakeClosures, mapFacilities, mapShapes, reservations: seedReservations } = usePondData()

const activeClosures = computed(() => props.closures ?? lakeClosures)
const activeReservations = computed(() => props.reservations ?? seedReservations)
const selectedPeg = computed(() => props.points.find((point) => point.id === props.selectedId) ?? props.points[0])
const currentLakeSlug = computed(() => props.points[0]?.lake)
const currentShapes = computed(() => props.shapes ?? mapShapes)
const currentFacilities = computed(() => props.facilities ?? mapFacilities)
const imageAttributes = computed(() => getMapLayerImageAttributes(props.imageSettings))
const visibleShapes = computed(() =>
  currentShapes.value.filter((shape) => shape.lake === currentLakeSlug.value && shape.visibility === 'public'),
)
const visibleFacilities = computed(() =>
  currentFacilities.value.filter((facility) => facility.lake === currentLakeSlug.value && facility.visibility === 'public'),
)
const selectedAvailability = computed(() =>
  selectedPeg.value
    ? getPegAvailability(selectedPeg.value, {
        closures: activeClosures.value,
        dateFrom: props.dateFrom,
        dateTo: props.dateTo,
        reservations: activeReservations.value,
      })
    : undefined,
)
const selectedAvailabilityReason = computed(() =>
  selectedAvailability.value?.reasons[0]
  ?? selectedAvailability.value?.description
  ?? '',
)
const mapLegendItems = [
  {
    icon: 'i-heroicons-check-circle',
    label: 'dostupné',
    tone: 'success',
  },
  {
    icon: 'i-heroicons-clipboard-document-check',
    label: 'na schválenie',
    tone: 'primary',
  },
  {
    icon: 'i-heroicons-lock-closed',
    label: 'nedostupné',
    tone: 'error',
  },
] as const

function markerStyle(point: Peg) {
  const availability = getPegAvailability(point, {
    closures: activeClosures.value,
    dateFrom: props.dateFrom,
    dateTo: props.dateTo,
    reservations: activeReservations.value,
  })
  return getMapMarkerStyle(availability.status)
}

function reservationTarget(point: Peg) {
  return {
    path: '/rezervacie',
    query: {
      do: props.dateTo,
      jazero: point.lake,
      miesto: point.id,
      od: props.dateFrom,
    },
  }
}

function selectFromKeyboard(event: KeyboardEvent, point: Peg) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('select', point)
  }
}
</script>

<template>
  <div class="border-border bg-surface overflow-hidden rounded-card border">
    <div class="border-border flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-foreground text-sm font-semibold">{{ title }}</p>
        <p class="text-foreground-muted text-xs">Kliknutím vyberiete miesto.</p>
      </div>
      <div class="flex flex-wrap gap-2 sm:justify-end">
        <StatusBadge
          v-for="item in mapLegendItems"
          :key="item.label"
          :icon="item.icon"
          :label="item.label"
          :tone="item.tone"
          size="xs"
        />
      </div>
    </div>

    <div class="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div class="bg-primary-950 relative aspect-[4/3] overflow-hidden">
        <svg
          class="absolute inset-0 h-full w-full"
          :viewBox="`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`"
          role="img"
          :aria-label="title"
        >
          <image
            v-if="image"
            :href="image"
            :aria-label="title"
            :x="imageAttributes.x"
            :y="imageAttributes.y"
            :width="imageAttributes.width"
            :height="imageAttributes.height"
            :preserveAspectRatio="imageAttributes.preserveAspectRatio"
            :opacity="imageAttributes.opacity"
          />
          <g v-else>
            <rect width="100" height="75" fill="#d7f1ff" />
            <ellipse cx="50" cy="37.5" rx="42" ry="23" fill="#48b9f5" opacity="0.75" />
            <ellipse cx="50" cy="37.5" rx="21" ry="10" fill="#116199" opacity="0.22" />
          </g>

          <polygon
            v-for="shape in visibleShapes"
            :key="shape.id"
            :points="getMapShapePoints(shape)"
            :fill="getMapShapeStyle(shape.tone).fill"
            :stroke="getMapShapeStyle(shape.tone).stroke"
            stroke-width="0.5"
          />

          <rect width="100" height="75" fill="url(#lake-map-fade)" />

          <defs>
            <linearGradient id="lake-map-fade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#062523" stop-opacity="0" />
              <stop offset="100%" stop-color="#062523" stop-opacity="0.24" />
            </linearGradient>
          </defs>

          <g
            v-for="facility in visibleFacilities"
            :key="facility.id"
            pointer-events="none"
          >
            <rect
              :x="facility.x - 3.2"
              :y="toSvgY(facility.y) - 3.2"
              width="6.4"
              height="6.4"
              rx="1.6"
              :fill="getMapFacilityStyle(facility).fill"
              :stroke="getMapFacilityStyle(facility).stroke"
              stroke-width="0.9"
              filter="url(#map-marker-shadow)"
            />
            <text
              :x="facility.x"
              :y="toSvgY(facility.y) + 0.32"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="1.95"
              font-weight="900"
              :fill="getMapFacilityStyle(facility).text"
            >
              {{ getMapFacilityShortLabel(facility.type) }}
            </text>
          </g>

          <g
            v-for="point in points"
            :key="point.id"
            class="cursor-pointer outline-none transition-transform"
            role="button"
            tabindex="0"
            :aria-label="point.label"
            @click="emit('select', point)"
            @keydown="selectFromKeyboard($event, point)"
          >
            <circle
              :cx="point.x"
              :cy="toSvgY(point.y)"
              r="6.4"
              fill="transparent"
            />
            <circle
              :cx="point.x"
              :cy="toSvgY(point.y)"
              :r="props.selectedId === point.id ? 4.2 : 3.3"
              :fill="markerStyle(point).fill"
              :stroke="markerStyle(point).stroke"
              :stroke-width="props.selectedId === point.id ? 1.4 : 0.9"
              filter="url(#map-marker-shadow)"
            />
            <text
              :x="point.x"
              :y="toSvgY(point.y) + 0.35"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="2.45"
              font-weight="800"
              :fill="markerStyle(point).text"
              pointer-events="none"
            >
              {{ getMapPointLabel(point) }}
            </text>
          </g>

          <defs>
            <filter id="map-marker-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.3" flood-color="#062523" flood-opacity="0.36" />
            </filter>
          </defs>
        </svg>
      </div>

      <aside class="border-border bg-muted/50 border-t p-4 lg:border-t-0 lg:border-l">
        <div v-if="selectedPeg" class="space-y-4">
          <div>
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-foreground text-lg font-bold">{{ selectedPeg.label }}</h3>
              <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
            </div>
            <p class="text-foreground-muted mt-2 text-sm">{{ selectedPeg.notes }}</p>
            <p v-if="selectedAvailabilityReason" class="text-primary-800 mt-2 text-xs font-semibold">
              {{ selectedAvailabilityReason }}
            </p>
            <p v-if="selectedPeg.requiresCabinReservation" class="text-primary-800 mt-2 text-xs font-semibold">
              Rezervácia miesta je viazaná na chatu.
            </p>
          </div>
          <dl class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-md bg-white p-3">
              <dt class="text-foreground-muted text-xs">Typ</dt>
              <dd class="font-semibold">{{ selectedPeg.type === 'cabin' ? 'chata' : 'breh' }}</dd>
            </div>
            <div class="rounded-md bg-white p-3">
              <dt class="text-foreground-muted text-xs">Kapacita</dt>
              <dd class="font-semibold">{{ selectedPeg.capacity }} osoby</dd>
            </div>
          </dl>
          <UButton
            :to="reservationTarget(selectedPeg)"
            icon="i-heroicons-calendar-days"
            block
          >
            Rezervovať miesto
          </UButton>
        </div>
      </aside>
    </div>
  </div>
</template>
