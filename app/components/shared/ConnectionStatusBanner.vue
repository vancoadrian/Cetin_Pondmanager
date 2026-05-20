<script setup lang="ts">
const isOnline = ref(true)
const showRestored = ref(false)
let restoredTimer: number | undefined

function handleOnline() {
  setOnlineState(true)
}

function handleOffline() {
  setOnlineState(false)
}

function clearRestoredTimer() {
  if (restoredTimer) {
    window.clearTimeout(restoredTimer)
    restoredTimer = undefined
  }
}

function setOnlineState(nextOnline: boolean) {
  const wasOnline = isOnline.value
  isOnline.value = nextOnline

  if (!wasOnline && nextOnline) {
    showRestored.value = true
    clearRestoredTimer()
    restoredTimer = window.setTimeout(() => {
      showRestored.value = false
      restoredTimer = undefined
    }, 4000)
  }

  if (!nextOnline) {
    showRestored.value = false
    clearRestoredTimer()
  }
}

onMounted(() => {
  setOnlineState(navigator.onLine)
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onBeforeUnmount(() => {
  clearRestoredTimer()
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="-translate-y-full opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-full opacity-0"
  >
    <div
      v-if="!isOnline || showRestored"
      class="fixed inset-x-0 top-0 z-50 border-b px-4 py-2 text-sm font-semibold shadow-sm"
      :class="isOnline ? 'border-success-500/25 bg-success-500 text-white' : 'border-warning-500/25 bg-warning-500 text-primary-950'"
      role="status"
    >
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <UIcon :name="isOnline ? 'i-heroicons-wifi' : 'i-heroicons-signal-slash'" class="h-4 w-4" />
          <span>{{ isOnline ? 'Pripojenie je späť' : 'Offline režim' }}</span>
        </div>
        <NuxtLink
          v-if="!isOnline"
          to="/offline"
          class="rounded-md bg-white/25 px-2 py-1 text-xs hover:bg-white/35"
        >
          Otvoriť offline prehľad
        </NuxtLink>
      </div>
    </div>
  </Transition>
</template>
