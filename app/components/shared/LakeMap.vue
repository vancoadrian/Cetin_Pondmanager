<script setup lang="ts">
import type { LakeClosure, MapFacility, MapLayerImageSettings, MapShape, Peg, Reservation } from '~/data/pond'
import { getPegAvailability } from '~/utils/availability'
import { formatAvailabilityDateRange } from '~/utils/availabilityDateRange'
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
import { getResponsiveMapBackgroundSources } from '~/utils/responsiveImage'

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
const responsiveImageSources = computed(() => getResponsiveMapBackgroundSources(props.image))
const imageObjectFit = computed(() => {
  if (imageAttributes.value.preserveAspectRatio === 'none') return 'fill'

  return imageAttributes.value.preserveAspectRatio.endsWith(' meet') ? 'contain' : 'cover'
})
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
const selectedRangeLabel = computed(() =>
  props.dateFrom && props.dateTo
    ? formatAvailabilityDateRange(props.dateFrom, props.dateTo)
    : 'zvolený termín',
)
const selectedCanReserve = computed(() => Boolean(selectedAvailability.value?.reservable))
const selectedPegTypeLabel = computed(() => {
  if (!selectedPeg.value) return 'miesto'

  return selectedPeg.value.type === 'cabin' ? 'miesto s chatou' : 'lovné miesto'
})
const reservationActionLabel = computed(() => {
  if (!selectedPeg.value) return 'Vyberte miesto na mape'
  if (!selectedCanReserve.value) return 'Miesto teraz nie je dostupné'

  return 'Rezervovať vybrané miesto'
})
const reservationHint = computed(() => {
  if (!selectedPeg.value) return 'Kliknite na bod v mape alebo vyberte miesto zo zoznamu pod mapou.'
  if (!selectedAvailability.value) return 'Dostupnosť sa načíta podľa zvoleného termínu.'
  if (!selectedAvailability.value.reservable) {
    return selectedAvailabilityReason.value || selectedAvailability.value.description
  }
  if (selectedPeg.value.requiresCabinReservation) {
    return 'Toto miesto sa rezervuje spolu s chatou. Rezervačný formulár s tým bude počítať.'
  }

  return selectedAvailabilityReason.value || 'Miesto je pripravené na odoslanie žiadosti.'
})
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

function pointAvailability(point: Peg) {
  return getPegAvailability(point, {
    closures: activeClosures.value,
    dateFrom: props.dateFrom,
    dateTo: props.dateTo,
    reservations: activeReservations.value,
  })
}

function markerStyle(point: Peg) {
  return getMapMarkerStyle(pointAvailability(point).status)
}

function markerAccessibleLabel(point: Peg) {
  return `${getMapPointLabel(point)}, ${point.label}, ${pointAvailability(point).label}`
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
          role="group"
          :aria-label="title"
        >
          <foreignObject
            v-if="image && responsiveImageSources"
            :x="imageAttributes.x"
            :y="imageAttributes.y"
            :width="imageAttributes.width"
            :height="imageAttributes.height"
            :opacity="imageAttributes.opacity"
            aria-hidden="true"
          >
            <picture xmlns="http://www.w3.org/1999/xhtml" class="block h-full w-full">
              <source
                media="(min-width: 1024px)"
                type="image/avif"
                :srcset="responsiveImageSources.desktop.avif"
              >
              <source
                type="image/avif"
                :srcset="responsiveImageSources.mobile.avif"
              >
              <source
                media="(min-width: 1024px)"
                type="image/webp"
                :srcset="responsiveImageSources.desktop.webp"
              >
              <source
                type="image/webp"
                :srcset="responsiveImageSources.mobile.webp"
              >
              <img
                :src="image"
                alt=""
                class="block h-full w-full"
                :style="{ objectFit: imageObjectFit }"
                draggable="false"
              >
            </picture>
          </foreignObject>
          <image
            v-else-if="image"
            :href="image"
            aria-hidden="true"
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
            class="lake-map-point cursor-pointer transition-transform"
            role="button"
            tabindex="0"
            :aria-label="markerAccessibleLabel(point)"
            :aria-pressed="props.selectedId === point.id"
            @click="emit('select', point)"
            @keydown="selectFromKeyboard($event, point)"
          >
            <circle
              class="lake-map-focus-ring"
              :cx="point.x"
              :cy="toSvgY(point.y)"
              r="5.4"
              fill="none"
              stroke="#ffc247"
              stroke-width="1.2"
              pointer-events="none"
            />
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
          <div class="rounded-md border border-border bg-white p-4">
            <p class="text-foreground-muted text-xs font-semibold uppercase">Váš výber</p>
            <div class="flex items-center justify-between gap-3">
              <p class="text-foreground mt-1 text-xl font-black">{{ selectedPeg.label }}</p>
              <AvailabilityBadge v-if="selectedAvailability" :availability="selectedAvailability" />
            </div>
            <div class="mt-4 space-y-3 text-sm">
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-calendar-days" class="text-primary-700 mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p class="text-foreground-muted text-xs">Termín</p>
                  <p class="font-semibold">{{ selectedRangeLabel }}</p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <UIcon name="i-heroicons-map-pin" class="text-primary-700 mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p class="text-foreground-muted text-xs">Typ miesta</p>
                  <p class="font-semibold">{{ selectedPegTypeLabel }}</p>
                </div>
              </div>
            </div>
            <p class="text-foreground-muted mt-4 text-sm">{{ selectedPeg.notes }}</p>
            <p class="text-primary-800 mt-3 text-sm font-semibold">
              {{ reservationHint }}
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
            :to="selectedCanReserve ? reservationTarget(selectedPeg) : undefined"
            icon="i-heroicons-calendar-days"
            color="warning"
            block
            :disabled="!selectedCanReserve"
          >
            {{ reservationActionLabel }}
          </UButton>
        </div>
        <AppState
          v-else
          title="Vyberte miesto"
          description="Kliknite na bod v mape alebo zmeňte filter dostupnosti."
          icon="i-heroicons-map-pin"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.lake-map-point:focus {
  outline: none;
}

.lake-map-focus-ring {
  opacity: 0;
  transition: opacity 150ms ease;
}

.lake-map-point:focus-visible .lake-map-focus-ring {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .lake-map-focus-ring {
    transition: none;
  }
}
</style>
