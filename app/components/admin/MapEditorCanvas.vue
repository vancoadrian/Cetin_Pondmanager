<script setup lang="ts">
import type { LakeClosure, MapFacility, MapLayerImageSettings, MapShape, Peg, Reservation } from '~/data/pond'
import { getPegAvailability } from '~/utils/availability'
import {
  clampMapPercent,
  fromSvgY,
  getMapLayerImageAttributes,
  getMapFacilityShortLabel,
  getMapFacilityStyle,
  getMapMarkerStyle,
  getMapPointLabel,
  getMapShapePoints,
  getMapShapeStyle,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  normalizeMapLayerImageSettings,
  toSvgY,
} from '~/utils/map'

const props = withDefaults(
  defineProps<{
    closures?: LakeClosure[]
    draftShape?: MapShape
    drawingShape?: boolean
    editable?: boolean
    editingBackground?: boolean
    facilities?: MapFacility[]
    image?: string
    imageSettings?: MapLayerImageSettings
    points: Peg[]
    reservations?: Reservation[]
    selectedFacilityId?: string
    selectedId?: string
    selectedShapeId?: string
    shapes?: MapShape[]
    showGrid?: boolean
    snapSize?: number
    snapToGrid?: boolean
    title: string
  }>(),
  {
    closures: undefined,
    draftShape: undefined,
    drawingShape: false,
    editable: false,
    editingBackground: false,
    facilities: () => [],
    image: '',
    imageSettings: undefined,
    selectedFacilityId: '',
    selectedId: '',
    selectedShapeId: '',
    reservations: undefined,
    shapes: () => [],
    showGrid: false,
    snapSize: 5,
    snapToGrid: false,
  },
)

const emit = defineEmits<{
  select: [peg: Peg]
  selectFacility: [facility: MapFacility]
  selectShape: [shape: MapShape]
  moveFacility: [payload: { id: string, x: number, y: number }]
  movePoint: [payload: { id: string, x: number, y: number }]
  moveShape: [payload: { id: string, dx: number, dy: number }]
  moveShapePoint: [payload: { id: string, pointIndex: number, x: number, y: number }]
  drawShapePoint: [payload: { x: number, y: number }]
  finishDraftShape: []
  moveBackground: [payload: MapLayerImageSettings]
}>()

const { lakeClosures, reservations: seedReservations } = usePondData()
const activeClosures = computed(() => props.closures ?? lakeClosures)
const activeReservations = computed(() => props.reservations ?? seedReservations)

const svgRef = ref<SVGSVGElement | null>(null)
const draggingId = ref<string>()
const draggingFacilityId = ref<string>()
const draggingShapePoint = ref<{ id: string, pointIndex: number }>()
const draggingShape = ref<{ id: string, lastX: number, lastY: number }>()
const draggingBackground = ref<{ lastX: number, lastY: number }>()
const imageAttributes = computed(() => getMapLayerImageAttributes(props.imageSettings))

const gridStep = computed(() => {
  const step = Number.isFinite(props.snapSize) ? props.snapSize : 5
  return Math.min(25, Math.max(1, step))
})
const gridLines = computed(() => {
  const lines: number[] = []

  for (let value = 0; value <= 100; value += gridStep.value) {
    lines.push(clampMapPercent(value))
  }

  if (lines.at(-1) !== 100) lines.push(100)

  return [...new Set(lines)]
})

function isMajorGridLine(value: number) {
  return Math.abs(value - Math.round(value / 10) * 10) < 0.05
}

function snapMapPercent(value: number) {
  if (!props.snapToGrid) return clampMapPercent(value)

  return clampMapPercent(Math.round(value / gridStep.value) * gridStep.value)
}

function pointerToMapPoint(event: MouseEvent | PointerEvent) {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return undefined

  const x = snapMapPercent(((event.clientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH)
  const svgY = ((event.clientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT
  const y = snapMapPercent(fromSvgY(svgY))

  return { x, y }
}

function pointerToSvgPoint(event: PointerEvent) {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return undefined

  return {
    x: Math.min(MAP_VIEWBOX_WIDTH, Math.max(0, ((event.clientX - rect.left) / rect.width) * MAP_VIEWBOX_WIDTH)),
    y: Math.min(MAP_VIEWBOX_HEIGHT, Math.max(0, ((event.clientY - rect.top) / rect.height) * MAP_VIEWBOX_HEIGHT)),
  }
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

function moveFacilityFromEvent(id: string, event: PointerEvent) {
  const point = pointerToMapPoint(event)
  if (!point) return
  emit('moveFacility', { id, ...point })
}

function moveShapePointFromEvent(id: string, pointIndex: number, event: PointerEvent) {
  const point = pointerToMapPoint(event)
  if (!point) return
  emit('moveShapePoint', { id, pointIndex, ...point })
}

function moveShapeFromEvent(event: PointerEvent) {
  const activeShape = draggingShape.value
  const point = pointerToMapPoint(event)
  if (!activeShape || !point) return

  const dx = Number((point.x - activeShape.lastX).toFixed(1))
  const dy = Number((point.y - activeShape.lastY).toFixed(1))
  if (dx === 0 && dy === 0) return

  emit('moveShape', { id: activeShape.id, dx, dy })
  draggingShape.value = { id: activeShape.id, lastX: point.x, lastY: point.y }
}

function moveBackgroundFromEvent(event: PointerEvent) {
  const activeBackground = draggingBackground.value
  const point = pointerToSvgPoint(event)
  if (!activeBackground || !point) return

  const dx = Number((point.x - activeBackground.lastX).toFixed(1))
  const dy = Number((point.y - activeBackground.lastY).toFixed(1))
  if (dx === 0 && dy === 0) return

  const settings = normalizeMapLayerImageSettings(props.imageSettings)
  emit('moveBackground', normalizeMapLayerImageSettings({
    ...settings,
    offsetX: Number((settings.offsetX + dx).toFixed(1)),
    offsetY: Number((settings.offsetY + dy).toFixed(1)),
  }))
  draggingBackground.value = { lastX: point.x, lastY: point.y }
}

function startBackgroundDrag(event: PointerEvent) {
  if (!props.editable || !props.editingBackground || !props.image) return

  const point = pointerToSvgPoint(event)
  if (!point) return
  draggingBackground.value = { lastX: point.x, lastY: point.y }
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
}

function startDrag(event: PointerEvent, point: Peg) {
  emit('select', point)

  if (!props.editable) return

  draggingId.value = point.id
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
  movePointFromEvent(point.id, event)
}

function startFacilityDrag(event: PointerEvent, facility: MapFacility) {
  emit('selectFacility', facility)

  if (!props.editable) return

  draggingFacilityId.value = facility.id
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
  moveFacilityFromEvent(facility.id, event)
}

function startShapeDrag(event: PointerEvent, shape: MapShape) {
  emit('selectShape', shape)

  if (!props.editable) return

  const point = pointerToMapPoint(event)
  if (!point) return
  draggingShape.value = { id: shape.id, lastX: point.x, lastY: point.y }
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
}

function startShapePointDrag(event: PointerEvent, shape: MapShape, pointIndex: number) {
  emit('selectShape', shape)

  if (!props.editable) return

  draggingShapePoint.value = { id: shape.id, pointIndex }
  ;(event.currentTarget as SVGElement).setPointerCapture?.(event.pointerId)
  moveShapePointFromEvent(shape.id, pointIndex, event)
}

function addDraftShapePoint(event: MouseEvent) {
  if (!props.editable || !props.drawingShape) return
  if (event.detail > 1) return

  const point = pointerToMapPoint(event)
  if (!point) return
  emit('drawShapePoint', point)
}

function finishDraftShape() {
  if (!props.editable || !props.drawingShape) return
  emit('finishDraftShape')
}

function moveDrag(event: PointerEvent) {
  if (draggingBackground.value) {
    moveBackgroundFromEvent(event)
    return
  }

  if (draggingId.value) {
    movePointFromEvent(draggingId.value, event)
    return
  }

  if (draggingFacilityId.value) {
    moveFacilityFromEvent(draggingFacilityId.value, event)
    return
  }

  if (draggingShapePoint.value) {
    moveShapePointFromEvent(
      draggingShapePoint.value.id,
      draggingShapePoint.value.pointIndex,
      event,
    )
    return
  }

  moveShapeFromEvent(event)
}

function stopDrag() {
  draggingId.value = undefined
  draggingFacilityId.value = undefined
  draggingShapePoint.value = undefined
  draggingShape.value = undefined
  draggingBackground.value = undefined
}

function shapeCenter(shape: MapShape) {
  const pointCount = Math.max(1, shape.points.length)
  const sum = shape.points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  )

  return { x: sum.x / pointCount, y: sum.y / pointCount }
}
</script>

<template>
  <div class="overflow-hidden rounded-card border border-border bg-surface">
    <div class="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <p class="font-bold">{{ title }}</p>
        <p class="text-foreground-muted text-xs">
          {{ editingBackground ? 'Potiahnutím mapy posuniete podkladový obrázok.' : drawingShape ? 'Kliknutím do mapy pridáte vrchol kreslenej plochy.' : editable ? 'Potiahnutím bodu upravíte pozíciu v SVG vrstve.' : 'Náhľad SVG vrstiev.' }}
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
          :x="imageAttributes.x"
          :y="imageAttributes.y"
          :width="imageAttributes.width"
          :height="imageAttributes.height"
          :preserveAspectRatio="imageAttributes.preserveAspectRatio"
          :opacity="imageAttributes.opacity"
        />
        <g v-else>
          <rect width="100" height="75" fill="#d7f1ff" />
          <ellipse cx="50" cy="37.5" rx="40" ry="22" fill="#48b9f5" opacity="0.75" />
          <ellipse cx="50" cy="37.5" rx="19" ry="9" fill="#116199" opacity="0.22" />
        </g>

        <g v-if="showGrid" pointer-events="none">
          <line
            v-for="line in gridLines"
            :key="`grid-x-${line}`"
            :x1="line"
            y1="0"
            :x2="line"
            :y2="MAP_VIEWBOX_HEIGHT"
            :stroke="isMajorGridLine(line) ? 'rgba(255, 255, 255, 0.48)' : 'rgba(255, 255, 255, 0.22)'"
            :stroke-width="isMajorGridLine(line) ? 0.22 : 0.12"
          />
          <line
            v-for="line in gridLines"
            :key="`grid-y-${line}`"
            x1="0"
            :y1="toSvgY(line)"
            :x2="MAP_VIEWBOX_WIDTH"
            :y2="toSvgY(line)"
            :stroke="isMajorGridLine(line) ? 'rgba(255, 255, 255, 0.48)' : 'rgba(255, 255, 255, 0.22)'"
            :stroke-width="isMajorGridLine(line) ? 0.22 : 0.12"
          />
        </g>

        <polygon
          v-for="shape in shapes"
          :key="shape.id"
          :points="getMapShapePoints(shape)"
          :fill="getMapShapeStyle(shape.tone).fill"
          :stroke="getMapShapeStyle(shape.tone).stroke"
          :stroke-width="selectedShapeId === shape.id ? 1.1 : 0.65"
          :stroke-dasharray="shape.type === 'sector' || shape.type === 'zone' ? '1.4 1.1' : undefined"
          class="cursor-move"
          @pointerdown.prevent="startShapeDrag($event, shape)"
          @click="emit('selectShape', shape)"
        />

        <g
          v-for="shape in shapes"
          :key="`${shape.id}-label`"
          pointer-events="none"
        >
          <text
            :x="shapeCenter(shape).x"
            :y="toSvgY(shapeCenter(shape).y)"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="2.1"
            font-weight="800"
            fill="#062523"
            paint-order="stroke"
            stroke="#ffffff"
            stroke-width="0.5"
          >
            {{ shape.label }}
          </text>
        </g>

        <g
          v-for="shape in shapes.filter((item) => item.id === selectedShapeId)"
          :key="`${shape.id}-points`"
        >
          <g
            v-for="(point, pointIndex) in shape.points"
            :key="`${shape.id}-${pointIndex}`"
            class="cursor-grab active:cursor-grabbing"
            @pointerdown.stop.prevent="startShapePointDrag($event, shape, pointIndex)"
          >
            <circle
              :cx="point.x"
              :cy="toSvgY(point.y)"
              r="2"
              fill="#ffffff"
              :stroke="getMapShapeStyle(shape.tone).stroke"
              stroke-width="0.8"
            />
            <text
              :x="point.x"
              :y="toSvgY(point.y) + 0.15"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="1.5"
              font-weight="900"
              :fill="getMapShapeStyle(shape.tone).stroke"
              pointer-events="none"
            >
              {{ pointIndex + 1 }}
            </text>
          </g>
        </g>

        <g v-if="draftShape && draftShape.points.length > 0">
          <polygon
            v-if="draftShape.points.length >= 3"
            :points="getMapShapePoints(draftShape)"
            :fill="getMapShapeStyle(draftShape.tone).fill"
            :stroke="getMapShapeStyle(draftShape.tone).stroke"
            stroke-width="1"
            stroke-dasharray="1.4 1.1"
          />
          <polyline
            v-if="draftShape.points.length >= 2"
            :points="getMapShapePoints(draftShape)"
            fill="none"
            :stroke="getMapShapeStyle(draftShape.tone).stroke"
            stroke-width="1.05"
            stroke-dasharray="1.4 1.1"
          />
          <g
            v-for="(point, pointIndex) in draftShape.points"
            :key="`draft-${pointIndex}`"
            pointer-events="none"
          >
            <circle
              :cx="point.x"
              :cy="toSvgY(point.y)"
              r="2.1"
              fill="#ffffff"
              :stroke="getMapShapeStyle(draftShape.tone).stroke"
              stroke-width="0.85"
            />
            <text
              :x="point.x"
              :y="toSvgY(point.y) + 0.15"
              text-anchor="middle"
              dominant-baseline="middle"
              font-size="1.5"
              font-weight="900"
              :fill="getMapShapeStyle(draftShape.tone).stroke"
            >
              {{ pointIndex + 1 }}
            </text>
          </g>
        </g>

        <g
          v-for="facility in facilities"
          :key="facility.id"
          class="cursor-grab outline-none active:cursor-grabbing"
          role="button"
          tabindex="0"
          :aria-label="`Upraviť ${facility.label}`"
          @pointerdown.prevent="startFacilityDrag($event, facility)"
          @click="emit('selectFacility', facility)"
        >
          <rect
            :x="facility.x - 5"
            :y="toSvgY(facility.y) - 5"
            width="10"
            height="10"
            rx="2.6"
            fill="transparent"
          />
          <rect
            :x="facility.x - (selectedFacilityId === facility.id ? 3.9 : 3.3)"
            :y="toSvgY(facility.y) - (selectedFacilityId === facility.id ? 3.9 : 3.3)"
            :width="selectedFacilityId === facility.id ? 7.8 : 6.6"
            :height="selectedFacilityId === facility.id ? 7.8 : 6.6"
            rx="1.7"
            :fill="getMapFacilityStyle(facility).fill"
            :stroke="getMapFacilityStyle(facility).stroke"
            :stroke-width="selectedFacilityId === facility.id ? 1.4 : 0.9"
            filter="url(#admin-map-marker-shadow)"
          />
          <text
            :x="facility.x"
            :y="toSvgY(facility.y) + 0.35"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="2.05"
            font-weight="900"
            :fill="getMapFacilityStyle(facility).text"
            pointer-events="none"
          >
            {{ getMapFacilityShortLabel(facility.type) }}
          </text>
        </g>

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

        <rect
          v-if="editingBackground && image"
          width="100"
          height="75"
          fill="transparent"
          class="cursor-move"
          @pointerdown.prevent="startBackgroundDrag"
        />

        <rect
          v-if="drawingShape"
          width="100"
          height="75"
          fill="transparent"
          class="cursor-crosshair"
          @click.prevent="addDraftShapePoint"
          @dblclick.prevent.stop="finishDraftShape"
        />

        <defs>
          <filter id="admin-map-marker-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.3" flood-color="#062523" flood-opacity="0.36" />
          </filter>
        </defs>
      </svg>
    </div>
  </div>
</template>
