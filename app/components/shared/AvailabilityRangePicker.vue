<script setup lang="ts">
import {
  createAvailabilityRangePreset,
  formatAvailabilityDateRange,
  type AvailabilityRangePreset,
} from '~/utils/availabilityDateRange'

const props = defineProps<{
  dateFrom: string
  dateTo: string
}>()

const emit = defineEmits<{
  'update:dateFrom': [value: string]
  'update:dateTo': [value: string]
}>()

const presets: Array<{ label: string, value: AvailabilityRangePreset }> = [
  { label: 'Dnes', value: 'today' },
  { label: 'Víkend', value: 'weekend' },
  { label: '7 dní', value: 'week' },
]

const rangeLabel = computed(() => formatAvailabilityDateRange(props.dateFrom, props.dateTo))

function setDateFrom(value: string) {
  emit('update:dateFrom', value)
  if (value > props.dateTo) emit('update:dateTo', value)
}

function setDateTo(value: string) {
  emit('update:dateTo', value < props.dateFrom ? props.dateFrom : value)
}

function applyPreset(preset: AvailabilityRangePreset) {
  const range = createAvailabilityRangePreset(preset)
  emit('update:dateFrom', range.dateFrom)
  emit('update:dateTo', range.dateTo)
}
</script>

<template>
  <div class="border-y border-primary-200 bg-primary-50 px-4 py-4">
    <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-calendar-days" class="h-5 w-5 text-primary-800" />
          <p class="font-bold">Termín dostupnosti</p>
        </div>
        <p class="mt-1 text-sm text-foreground-muted">{{ rangeLabel }}</p>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="grid grid-cols-3 rounded-md bg-white p-1 shadow-sm">
          <button
            v-for="preset in presets"
            :key="preset.value"
            type="button"
            class="h-9 px-3 text-sm font-semibold text-foreground-muted hover:text-primary-900"
            @click="applyPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">
            <span>Od</span>
            <input
              :value="dateFrom"
              type="date"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3"
              @input="setDateFrom(($event.target as HTMLInputElement).value)"
            >
          </label>
          <label class="text-sm font-semibold">
            <span>Do</span>
            <input
              :value="dateTo"
              :min="dateFrom"
              type="date"
              class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3"
              @input="setDateTo(($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
