<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    actionLabel?: string
    actionLoading?: boolean
    description: string
    icon?: string
    loading?: boolean
    title: string
    tone?: 'error' | 'info' | 'warning'
  }>(),
  {
    actionLabel: '',
    actionLoading: false,
    icon: '',
    loading: false,
    tone: 'info',
  },
)

const emit = defineEmits<{
  action: []
}>()

const noticeIcon = computed(() => {
  if (props.icon) return props.icon
  if (props.tone === 'error' || props.tone === 'warning') return 'i-heroicons-exclamation-triangle'
  return 'i-heroicons-arrow-path'
})

const noticeClasses = computed(() => {
  if (props.tone === 'error') return 'border-error-200 bg-error-500/10 text-error-950'
  if (props.tone === 'warning') return 'border-warning-200 bg-warning-500/10 text-warning-950'
  return 'border-primary-200 bg-primary-50 text-primary-950'
})

const shouldSpin = computed(() => props.loading && props.tone === 'info' && !props.icon)
const noticeRole = computed(() => (props.tone === 'error' || props.tone === 'warning' ? 'alert' : 'status'))
const ariaLive = computed(() => (props.tone === 'error' || props.tone === 'warning' ? 'assertive' : 'polite'))
</script>

<template>
  <div
    class="rounded-md border px-4 py-3"
    :class="noticeClasses"
    :role="noticeRole"
    :aria-live="ariaLive"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <UIcon
          :name="noticeIcon"
          class="mt-0.5 h-5 w-5 shrink-0"
          :class="{ 'animate-spin': shouldSpin }"
        />
        <div>
          <p class="text-sm font-bold">{{ title }}</p>
          <p class="mt-1 text-sm opacity-80">{{ description }}</p>
        </div>
      </div>
      <UButton
        v-if="actionLabel"
        icon="i-heroicons-arrow-path"
        size="sm"
        variant="soft"
        :loading="actionLoading"
        @click="emit('action')"
      >
        {{ actionLabel }}
      </UButton>
    </div>
  </div>
</template>
