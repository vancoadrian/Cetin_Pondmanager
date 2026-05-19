<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    description?: string
    icon?: string
    title: string
    type?: 'empty' | 'error' | 'loading'
  }>(),
  {
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
  if (props.type === 'error') return 'bg-error-500/10 text-error-700'
  if (props.type === 'loading') return 'bg-primary-50 text-primary-800'
  return 'bg-muted text-foreground-muted'
})

const iconClasses = computed(() => (props.type === 'loading' ? 'animate-spin' : ''))
</script>

<template>
  <div class="rounded-card border border-dashed border-border bg-white p-6 text-center">
    <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-full" :class="stateClasses">
      <UIcon :name="stateIcon" class="h-5 w-5" :class="iconClasses" />
    </div>
    <h3 class="mt-4 font-bold">{{ title }}</h3>
    <p v-if="description" class="text-foreground-muted mx-auto mt-2 max-w-md text-sm">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="mt-4">
      <slot />
    </div>
  </div>
</template>
