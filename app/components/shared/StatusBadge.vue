<script setup lang="ts">
import type { StatusBadgeTone } from '~/utils/ui'

const props = withDefaults(
  defineProps<{
    icon?: string
    label: string
    size?: 'sm' | 'xs'
    title?: string
    tone?: StatusBadgeTone
  }>(),
  {
    icon: '',
    size: 'sm',
    title: '',
    tone: 'muted',
  },
)

const toneClasses = computed(() => {
  switch (props.tone) {
    case 'accent':
      return 'border-accent-500/25 bg-accent-100 text-accent-700'
    case 'error':
      return 'border-error-500/25 bg-error-500/10 text-error-700'
    case 'info':
      return 'border-info-500/25 bg-info-500/10 text-info-700'
    case 'primary':
      return 'border-primary-200 bg-primary-50 text-primary-800'
    case 'success':
      return 'border-success-500/25 bg-success-500/10 text-success-700'
    case 'warning':
      return 'border-warning-500/25 bg-warning-500/10 text-warning-800'
    case 'neutral':
      return 'border-border bg-white text-foreground-muted'
    default:
      return 'border-border bg-muted text-foreground-muted'
  }
})

const sizeClasses = computed(() =>
  props.size === 'xs'
    ? 'min-h-6 gap-1.5 px-2 py-0.5 text-[11px]'
    : 'min-h-7 gap-1.5 px-2.5 py-1 text-xs',
)

const iconClasses = computed(() => (props.size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'))
</script>

<template>
  <span
    class="inline-flex max-w-full select-none items-center whitespace-nowrap rounded-md border font-bold leading-tight tracking-normal shadow-[inset_0_1px_0_rgb(255_255_255_/_0.45)]"
    :class="[toneClasses, sizeClasses]"
    :title="title || label"
  >
    <UIcon v-if="icon" :name="icon" class="shrink-0" :class="iconClasses" />
    <span class="truncate">{{ label }}</span>
  </span>
</template>
