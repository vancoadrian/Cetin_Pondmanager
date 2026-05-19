<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    invalidTitle?: string
    messages?: string[]
    validDescription?: string
    validTitle?: string
  }>(),
  {
    invalidTitle: 'Treba doplniť',
    messages: () => [],
    validDescription: '',
    validTitle: 'Vstup je v poriadku',
  },
)

const isValid = computed(() => props.messages.length === 0)
</script>

<template>
  <div
    class="rounded-md border p-3 text-sm"
    :class="isValid ? 'border-success-500/25 bg-success-500/10 text-success-700' : 'border-warning-500/25 bg-warning-500/10 text-warning-700'"
  >
    <div class="flex items-start gap-2">
      <UIcon
        :name="isValid ? 'i-heroicons-check-circle' : 'i-heroicons-exclamation-triangle'"
        class="mt-0.5 h-4 w-4 shrink-0"
      />
      <div>
        <p class="font-bold">{{ isValid ? validTitle : invalidTitle }}</p>
        <p v-if="isValid && validDescription" class="mt-1">{{ validDescription }}</p>
        <ul v-if="!isValid" class="mt-1 space-y-1">
          <li v-for="message in messages" :key="message">{{ message }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
