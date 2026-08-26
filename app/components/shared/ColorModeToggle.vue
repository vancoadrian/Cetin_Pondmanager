<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** 'header' = ikonové tlačidlo v tmavej hlavičke, 'menu' = riadok v mobilnom menu */
    variant?: 'header' | 'menu'
  }>(),
  {
    variant: 'header',
  },
)

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const label = computed(() => (isDark.value ? 'Prepnúť na denný režim' : 'Prepnúť na nočný režim'))
const icon = computed(() => (isDark.value ? 'i-heroicons-sun' : 'i-heroicons-moon'))

function toggle() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <ClientOnly>
    <UButton
      v-if="props.variant === 'header'"
      :icon="icon"
      color="neutral"
      variant="ghost"
      class="text-white hover:bg-white/10"
      :aria-label="label"
      @click="toggle"
    />
    <button
      v-else
      type="button"
      class="text-foreground hover:bg-muted flex w-full items-center gap-3 rounded-md px-3 py-3 text-base font-medium"
      @click="toggle"
    >
      <UIcon :name="icon" class="h-5 w-5" />
      {{ isDark ? 'Denný režim' : 'Nočný režim' }}
    </button>

    <template #fallback>
      <UButton
        v-if="props.variant === 'header'"
        icon="i-heroicons-moon"
        color="neutral"
        variant="ghost"
        class="text-white hover:bg-white/10"
        aria-label="Prepnúť nočný režim"
        disabled
      />
      <button
        v-else
        type="button"
        class="text-foreground flex w-full items-center gap-3 rounded-md px-3 py-3 text-base font-medium"
        disabled
      >
        <UIcon name="i-heroicons-moon" class="h-5 w-5" />
        Nočný režim
      </button>
    </template>
  </ClientOnly>
</template>
