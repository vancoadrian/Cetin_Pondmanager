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
        classes: 'bg-success-500/10 text-success-700 border-success-500/25',
      }
    case 'reserved':
      return {
        icon: 'i-heroicons-lock-closed',
        title: 'Miesto je obsadené',
        classes: 'bg-error-500/10 text-error-700 border-error-500/25',
      }
    case 'weekend-free':
      return {
        icon: 'i-heroicons-sparkles',
        title: 'Miesto má voľný najbližší víkend',
        classes: 'bg-warning-500/10 text-warning-700 border-warning-500/25',
      }
    case 'maintenance':
      return {
        icon: 'i-heroicons-wrench-screwdriver',
        title: 'Miesto je dočasne mimo rezervácie',
        classes: 'bg-foreground-muted/10 text-foreground-muted border-border',
      }
    default:
      return {
        icon: 'i-heroicons-question-mark-circle',
        title: 'Neznámy stav miesta',
        classes: 'bg-muted text-foreground-muted border-border',
      }
  }
})
</script>

<template>
  <span
    class="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold leading-none"
    :class="badge.classes"
    :title="badge.title"
  >
    <UIcon :name="badge.icon" class="h-3.5 w-3.5 shrink-0" />
    <span>{{ occupancyLegend[status] }}</span>
  </span>
</template>
