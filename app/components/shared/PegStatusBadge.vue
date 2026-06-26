<script setup lang="ts">
import type { Peg } from '~/data/pond'

const props = defineProps<{
  status: Peg['status']
}>()

const { occupancyLegend } = usePondData()

const badge = computed(() => {
  switch (props.status) {
    case 'free':
      return {
        icon: 'i-heroicons-check-circle',
        title: 'Miesto je dostupné na rezerváciu',
        tone: 'success',
      }
    case 'reserved':
      return {
        icon: 'i-heroicons-lock-closed',
        title: 'Miesto je obsadené',
        tone: 'error',
      }
    case 'weekend-free':
      return {
        icon: 'i-heroicons-sparkles',
        title: 'Miesto má voľný najbližší víkend',
        tone: 'warning',
      }
    case 'maintenance':
      return {
        icon: 'i-heroicons-wrench-screwdriver',
        title: 'Miesto je dočasne mimo rezervácie',
        tone: 'muted',
      }
    default:
      return {
        icon: 'i-heroicons-question-mark-circle',
        title: 'Neznámy stav miesta',
        tone: 'neutral',
      }
  }
})
</script>

<template>
  <StatusBadge
    :icon="badge.icon"
    :label="occupancyLegend[status]"
    :tone="badge.tone"
    :title="badge.title"
  />
</template>
