<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    compact?: boolean
    description?: string
    icon?: string
    title: string
    type?: 'empty' | 'error' | 'loading'
  }>(),
  {
    compact: false,
    description: '',
    icon: '',
    type: 'empty',
  },
)

const stateIcon = computed(() => {
  if (props.icon) return props.icon
  if (props.type === 'error') return 'i-heroicons-exclamation-triangle'
  if (props.type === 'loading') return 'i-heroicons-arrow-path'
  return 'i-heroicons-inbox'
})

const stateClasses = computed(() => {
  if (props.type === 'error') return 'bg-error-500/10 text-error-700 ring-1 ring-error-200'
  if (props.type === 'loading') return 'bg-primary-50 text-primary-800 ring-1 ring-primary-100'
  return 'bg-muted text-foreground-muted ring-1 ring-border'
})

const iconClasses = computed(() => (props.type === 'loading' ? 'animate-spin' : ''))
const stateRole = computed(() => (props.type === 'error' ? 'alert' : 'status'))
const ariaLive = computed(() => (props.type === 'error' ? 'assertive' : 'polite'))
</script>

<template>
  <div
    class="rounded-card border border-dashed border-border bg-white text-center"
    :class="compact ? 'p-4' : 'p-6'"
    :role="stateRole"
    :aria-live="ariaLive"
  >
    <div
      class="mx-auto flex items-center justify-center rounded-full"
      :class="[compact ? 'h-9 w-9' : 'h-11 w-11', stateClasses]"
    >
      <UIcon :name="stateIcon" class="h-5 w-5" :class="iconClasses" />
    </div>
    <h3 class="font-bold" :class="compact ? 'mt-3 text-sm' : 'mt-4'">{{ title }}</h3>
    <p v-if="description" class="text-foreground-muted mx-auto mt-2 max-w-md text-sm">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
