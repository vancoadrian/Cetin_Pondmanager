<script setup lang="ts">
import type { StatusBadgeTone } from '~/utils/ui'

const props = withDefaults(
  defineProps<{
    icon?: string
    label: string
    size?: 'sm' | 'xs'
    /** 'dark' pre badge položený na tmavom podklade (napr. bg-primary-900) */
    surface?: 'dark' | 'light'
    title?: string
    tone?: StatusBadgeTone
  }>(),
  {
    icon: '',
    size: 'sm',
    surface: 'light',
    title: '',
    tone: 'muted',
  },
)

const toneClasses = computed(() => {
  if (props.surface === 'dark') {
    switch (props.tone) {
      case 'error':
        return 'border-error-300/40 bg-error-400/15 text-error-200'
      case 'success':
        return 'border-success-300/40 bg-success-400/15 text-success-200'
      case 'warning':
        return 'border-warning-300/40 bg-warning-400/15 text-warning-200'
      default:
        return 'border-white/25 bg-white/10 text-white'
    }
  }

  switch (props.tone) {
    case 'accent':
      return 'border-accent-500/30 bg-accent-100 text-accent-800'
    case 'error':
      return 'border-error-500/30 bg-error-500/10 text-error-800'
    case 'info':
      return 'border-info-500/30 bg-info-500/10 text-info-800'
    case 'primary':
      return 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 text-primary-900 dark:text-primary-100'
    case 'success':
      return 'border-success-500/30 bg-success-500/10 text-success-800'
    case 'warning':
      return 'border-warning-500/30 bg-warning-500/10 text-warning-900'
    case 'neutral':
      return 'border-border bg-surface text-foreground'
    default:
      return 'border-border bg-muted text-foreground-muted'
  }
})

const sizeClasses = computed(() =>
  props.size === 'xs'
    ? 'min-h-6 gap-1.5 px-2 py-1 text-[11px]'
    : 'min-h-7 gap-1.5 px-2.5 py-1.5 text-xs',
)

const iconClasses = computed(() => (props.size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'))
</script>

<template>
  <span
    class="inline-flex min-w-0 max-w-full select-none items-center whitespace-nowrap rounded-md border font-semibold leading-none tracking-normal"
    :class="[toneClasses, sizeClasses]"
    :title="title || label"
  >
    <UIcon v-if="icon" :name="icon" class="shrink-0" :class="iconClasses" />
    <span class="min-w-0 truncate leading-tight">{{ label }}</span>
  </span>
</template>
