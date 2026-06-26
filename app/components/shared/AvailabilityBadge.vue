<script setup lang="ts">
import type { AvailabilityResult } from '~/utils/availability'

const props = defineProps<{
  availability: AvailabilityResult
}>()

const tone = computed(() => {
  switch (props.availability.status) {
    case 'available':
      return 'success'
    case 'blocked':
      return 'muted'
    case 'closed':
    case 'reserved':
      return 'error'
    case 'limited':
      return 'warning'
    case 'requires_approval':
      return 'primary'
    default:
      return 'neutral'
  }
})
</script>

<template>
  <StatusBadge
    :icon="availability.icon"
    :label="availability.label"
    :tone="tone"
    :title="availability.description"
  />
</template>
