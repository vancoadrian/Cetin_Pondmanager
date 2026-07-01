<script setup lang="ts">
import type { FishObservation } from '~/services/fishRegistryService'

const props = withDefaults(
  defineProps<{
    observations?: FishObservation[]
    metric: 'lengthCm' | 'weightKg'
  }>(),
  {
    observations: () => [],
  },
)

const width = 640
const height = 220
const padding = {
  bottom: 34,
  left: 48,
  right: 18,
  top: 18,
}

const sortedObservations = computed(() =>
  [...props.observations].sort((first, second) =>
    Date.parse(first.observedAt) - Date.parse(second.observedAt),
  ),
)

const metricLabel = computed(() => props.metric === 'weightKg' ? 'Váha' : 'Dĺžka')
const unit = computed(() => props.metric === 'weightKg' ? 'kg' : 'cm')
const stroke = computed(() => props.metric === 'weightKg' ? '#0f766e' : '#ca8a04')

function measurementCountLabel(count: number) {
  if (count === 1) return '1 meranie'
  if (count >= 2 && count <= 4) return `${count} merania`
  return `${count} meraní`
}

const chart = computed(() => {
  const values = sortedObservations.value.map((item) => item[props.metric])
  if (values.length === 0) {
    return {
      labels: [] as { date: string, x: number }[],
      points: '',
      circles: [] as { date: string, value: number, x: number, y: number }[],
      yTicks: [] as { label: string, y: number }[],
    }
  }

  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const spread = Math.max(rawMax - rawMin, props.metric === 'weightKg' ? 1 : 4)
  const minValue = Math.max(0, rawMin - spread * 0.2)
  const maxValue = rawMax + spread * 0.2
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const circles = sortedObservations.value.map((observation, index) => {
    const x = padding.left + (sortedObservations.value.length === 1
      ? plotWidth / 2
      : index / (sortedObservations.value.length - 1) * plotWidth)
    const value = observation[props.metric]
    const y = padding.top + (1 - (value - minValue) / (maxValue - minValue)) * plotHeight

    return {
      date: new Intl.DateTimeFormat('sk-SK', {
        month: 'short',
        year: 'numeric',
      }).format(new Date(observation.observedAt)),
      value,
      x,
      y,
    }
  })

  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3
    const value = maxValue - ratio * (maxValue - minValue)
    return {
      label: `${value.toFixed(props.metric === 'weightKg' ? 1 : 0)} ${unit.value}`,
      y: padding.top + ratio * plotHeight,
    }
  })

  return {
    circles,
    labels: circles.filter((_, index) =>
      circles.length <= 4 || index === 0 || index === circles.length - 1,
    ),
    points: circles.map((point) => `${point.x},${point.y}`).join(' '),
    yTicks,
  }
})
</script>

<template>
  <div class="min-w-0 rounded-md border border-border bg-white p-4">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <p class="font-bold">{{ metricLabel }}</p>
        <p class="text-xs text-foreground-muted">{{ measurementCountLabel(observations.length) }} v čase</p>
      </div>
      <StatusBadge
        :icon="metric === 'weightKg' ? 'i-heroicons-scale' : 'i-heroicons-arrows-up-down'"
        :label="unit"
        tone="neutral"
        size="xs"
      />
    </div>

    <div v-if="observations.length" class="aspect-[16/6] min-h-44 w-full overflow-hidden">
      <svg
        :viewBox="`0 0 ${width} ${height}`"
        class="h-full w-full"
        role="img"
        :aria-label="`${metricLabel} ryby v čase`"
      >
        <g v-for="tick in chart.yTicks" :key="tick.y">
          <line
            :x1="padding.left"
            :x2="width - padding.right"
            :y1="tick.y"
            :y2="tick.y"
            stroke="#e5e7eb"
            stroke-width="1"
          />
          <text
            x="2"
            :y="tick.y + 4"
            fill="#6b7280"
            font-size="11"
          >
            {{ tick.label }}
          </text>
        </g>

        <polyline
          v-if="chart.circles.length > 1"
          :points="chart.points"
          fill="none"
          :stroke="stroke"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="4"
        />

        <g v-for="point in chart.circles" :key="`${point.x}-${point.y}`">
          <circle
            :cx="point.x"
            :cy="point.y"
            r="6"
            fill="white"
            :stroke="stroke"
            stroke-width="4"
          >
            <title>{{ point.date }}: {{ point.value }} {{ unit }}</title>
          </circle>
        </g>

        <text
          v-for="label in chart.labels"
          :key="`${label.date}-${label.x}`"
          :x="label.x"
          :y="height - 8"
          fill="#6b7280"
          font-size="11"
          text-anchor="middle"
        >
          {{ label.date }}
        </text>
      </svg>
    </div>

    <AppState
      v-else
      compact
      title="Bez meraní"
      description="Graf sa zobrazí po prvom zázname váhy a dĺžky."
      icon="i-heroicons-chart-bar"
    />
  </div>
</template>
