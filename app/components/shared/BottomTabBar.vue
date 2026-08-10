<script setup lang="ts">
interface TabItem {
  label: string
  to: string
  icon: string
}

const tabs: TabItem[] = [
  { label: 'Domov', to: '/', icon: 'i-heroicons-home' },
  { label: 'Mapa', to: '/mapa', icon: 'i-heroicons-map-pin' },
  { label: 'Rezervácie', to: '/rezervacie', icon: 'i-heroicons-calendar-days' },
  { label: 'Úlovky', to: '/ulovky', icon: 'i-heroicons-camera' },
]

const route = useRoute()
const mobileOpen = useMobileNavState()
const { total: offlineQueueTotal } = useOfflineQueueSummary()

const visible = computed(() => isBottomTabBarRoute(route.path))

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}

const isMoreActive = computed(() =>
  mobileOpen.value || (!tabs.some((tab) => isActive(tab.to)) && route.path !== '/'),
)
</script>

<template>
  <nav
    v-if="visible"
    class="border-border bg-surface fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(6,37,35,0.08)] lg:hidden"
    aria-label="Hlavná mobilná navigácia"
  >
    <div class="grid grid-cols-5">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors"
        :class="isActive(tab.to) ? 'text-primary-700' : 'text-foreground-muted hover:text-foreground'"
        :aria-current="isActive(tab.to) ? 'page' : undefined"
      >
        <UIcon :name="tab.icon" class="h-6 w-6" />
        {{ tab.label }}
      </NuxtLink>

      <button
        type="button"
        class="relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors"
        :class="isMoreActive ? 'text-primary-700' : 'text-foreground-muted hover:text-foreground'"
        :aria-expanded="mobileOpen"
        aria-label="Viac možností a účet"
        @click="mobileOpen = true"
      >
        <span class="relative">
          <UIcon name="i-heroicons-bars-3" class="h-6 w-6" />
          <span
            v-if="offlineQueueTotal > 0"
            class="bg-error-600 absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-none font-black text-white"
          >
            {{ offlineQueueTotal > 9 ? '9+' : offlineQueueTotal }}
          </span>
        </span>
        Viac
      </button>
    </div>
  </nav>
</template>
