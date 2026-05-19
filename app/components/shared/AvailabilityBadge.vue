<script setup lang="ts">
import type { AvailabilityResult } from '~/utils/availability'

defineProps<{
  availability: AvailabilityResult
}>()
</script>

<template>
  <span
    class="inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-bold leading-none"
    :class="availability.classes"
    :title="availability.description"
  >
    <UIcon :name="availability.icon" class="h-3.5 w-3.5 shrink-0" />
    <span>{{ availability.label }}</span>
  </span>
</template>
