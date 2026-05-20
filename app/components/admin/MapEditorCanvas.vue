<script setup lang="ts">
import type { LakeClosure, MapShape, Peg, Reservation } from '~/data/pond'
import { getPegAvailability } from '~/utils/availability'
import {
  clampMapPercent,
  fromSvgY,
  getMapMarkerStyle,
  getMapPointLabel,
  getMapShapePoints,
  getMapShapeStyle,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  toSvgY,
} from '~/utils/map'

const props = withDefaults(
  defineProps<{
    closures?: LakeClosure[]
    editable?: boolean
    image?: string
    points: Peg[]
    reservations?: Reservation[]
    selectedId?: string
    shapes?: MapShape[]
    title: string
  }>(),
  {
    closures: undefined,
    editable: false,
    image: '',
    selectedId: '',
    reservations: undefined,
    shapes: () => [],
  },
)

const emit = defineEmits<{
  select: [peg: Peg]
  movePoint: [payload: { id: string, x: number, y: number }]
}>()

const { lakeClosures, reservations: seedReservations } = usePondData()
const activeClosures = computed(() => props.closures ?? lakeClosures)
const activeReservations = computed(() => props.reservations ?? seedReservations)

const svgRef = ref<SVGSVGElement | null>(null)
const draggingId = ref<string>()

function pointerToMapPoint(event: PointerEvent) {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return undefined

  const x = clampMapPercent(((event.clientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH)
  const svgY = ((event.clientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT
  const y = fromSvgY(svgY)

  return { x, y }
}

function markerStyle(point: Peg) {
  const availability = getPegAvailability(point, { closures: activeClosures.value, reservations: activeReservations.value })
  return getMapMarkerStyle(availability.status)
}

function movePointFromEvent(id: string, event: PointerEvent) {
  const point = pointerToMapPoint(event)
  if (!point) return
  emit('movePoint', { id, ...point })
}

function startDrag(event: PointerEvent, point: Peg) {
  emit('select', point)

  if (!props.editable) return

  draggingId.value = point.id
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
  movePointFromEvent(point.id, event)
}

function moveDrag(event: PointerEvent) {
  if (!draggingId.value) return
  movePointFromEvent(draggingId.value, event)
}

function stopDrag() {
  draggingId.value = undefined
}
</script>

<template>
  <div class="overflow-hidden rounded-card border border-border bg-surface">
    <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <p class="font-bold">{{ title }}</p>
        <p class="text-foreground-muted text-xs">
          {{ editable ? 'Potiahnutím bodu upravíte pozíciu v SVG vrstve.' : 'Náhľad SVG vrstiev.' }}
        </p>
      </div>
      <span class="rounded-md bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-800">
        viewBox 100 x 75
      </span>
    </div>

    <div class="relative aspect-[4/3] bg-primary-950">
      <svg
        ref="svgRef"
        class="absolute inset-0 h-full w-full touch-none"
        :viewBox="`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`"
        role="img"
        :aria-label="title"
        @pointermove="moveDrag"
        @pointerup="stopDrag"
        @pointerleave="stopDrag"
      >
        <image
          v-if="image"
          :href="image"
          x="0"
          y="0"
          :width="MAP_VIEWBOX_WIDTH"
          :height="MAP_VIEWBOX_HEIGHT"
          preserveAspectRatio="xMidYMid slice"
          opacity="0.88"
        />
        <g v-else>
          <rect width="100" height="75" fill="#d7f1ff" />
          <ellipse cx="50" cy="37.5" rx="40" ry="22" fill="#48b9f5" opacity="0.75" />
          <ellipse cx="50" cy="37.5" rx="19" ry="9" fill="#116199" opacity="0.22" />
        </g>

        <polygon
          v-for="shape in shapes"
          :key="shape.id"
          :points="getMapShapePoints(shape)"
          :fill="getMapShapeStyle(shape.tone).fill"
          :stroke="getMapShapeStyle(shape.tone).stroke"
          stroke-width="0.65"
          stroke-dasharray="1.4 1.1"
        />

        <g
          v-for="point in points"
          :key="point.id"
          class="cursor-grab outline-none active:cursor-grabbing"
          role="button"
          tabindex="0"
          :aria-label="`Upraviť ${point.label}`"
          @pointerdown.prevent="startDrag($event, point)"
          @click="emit('select', point)"
        >
          <circle
            :cx="point.x"
            :cy="toSvgY(point.y)"
            r="6.6"
            fill="transparent"
          />
          <circle
            :cx="point.x"
            :cy="toSvgY(point.y)"
            :r="selectedId === point.id ? 4.4 : 3.4"
            :fill="markerStyle(point).fill"
            :stroke="markerStyle(point).stroke"
            :stroke-width="selectedId === point.id ? 1.6 : 0.9"
            filter="url(#admin-map-marker-shadow)"
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
          <filter id="admin-map-marker-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.3" flood-color="#062523" flood-opacity="0.36" />
          </filter>
        </defs>
      </svg>
    </div>
  </div>
</template>
