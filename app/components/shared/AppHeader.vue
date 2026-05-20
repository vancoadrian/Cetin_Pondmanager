<script setup lang="ts">
interface NavItem {
  label: string
  to: string
  icon: string
}

const nav: NavItem[] = [
  { label: 'Prehľad', to: '/', icon: 'i-heroicons-squares-2x2' },
  { label: 'Revíry', to: '/reviry', icon: 'i-heroicons-map' },
  { label: 'Mapa', to: '/mapa', icon: 'i-heroicons-map-pin' },
  { label: 'Rezervácie', to: '/rezervacie', icon: 'i-heroicons-calendar-days' },
  { label: 'Úlovky', to: '/ulovky', icon: 'i-heroicons-camera' },
  { label: 'Súťaže', to: '/sutaze', icon: 'i-heroicons-trophy' },
  { label: 'Výstrahy', to: '/notifikacie', icon: 'i-heroicons-bell-alert' },
  { label: 'Info', to: '/info', icon: 'i-heroicons-information-circle' },
  { label: 'Sponzori', to: '/sponzori', icon: 'i-heroicons-star' },
  { label: 'Kontakt', to: '/kontakt', icon: 'i-heroicons-phone' },
]

const route = useRoute()
const config = useRuntimeConfig()
const mobileOpen = ref(false)
const { total: offlineQueueTotal } = useOfflineQueueSummary()

const offlineQueueLabel = computed(() =>
  offlineQueueTotal.value === 1
    ? '1 offline položka čaká na odoslanie'
    : `${offlineQueueTotal.value} offline položiek čaká na odoslanie`,
)

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)

const isActive = (to: string) => {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}
</script>

<template>
  <header class="border-primary-950 bg-primary-900 sticky top-0 z-40 border-b text-white">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <NuxtLink to="/" class="flex min-w-0 items-center gap-3">
        <img
          src="/logo.svg"
          alt="Rybolov Cetín"
          decoding="async"
          class="h-10 w-10 shrink-0 rounded bg-white/5 object-contain"
        >
        <span class="truncate font-semibold">{{ config.public.appName }}</span>
      </NuxtLink>

      <nav class="hidden items-center gap-1 xl:flex">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="rounded-md px-3 py-2 text-sm font-medium transition-colors"
          :class="
            isActive(item.to)
              ? 'bg-accent-400 text-primary-950'
              : 'text-white/80 hover:bg-white/10 hover:text-white'
          "
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-2">
        <NuxtLink
          v-if="offlineQueueTotal > 0"
          to="/offline"
          class="relative inline-flex h-10 w-10 items-center justify-center rounded-md bg-warning-400 text-primary-950 transition-colors hover:bg-warning-300"
          :aria-label="offlineQueueLabel"
        >
          <UIcon name="i-heroicons-cloud-arrow-up" class="h-5 w-5" />
          <span
            class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error-600 px-1 text-[11px] font-black leading-none text-white ring-2 ring-primary-900"
          >
            {{ offlineQueueTotal > 9 ? '9+' : offlineQueueTotal }}
          </span>
        </NuxtLink>
        <UButton
          to="/admin"
          icon="i-heroicons-shield-check"
          color="neutral"
          variant="ghost"
          class="hidden text-white hover:bg-white/10 lg:inline-flex"
        >
          Admin
        </UButton>
        <UButton
          to="/rezervacie"
          icon="i-heroicons-plus"
          color="warning"
          class="hidden sm:inline-flex"
        >
          Rezervovať
        </UButton>
        <UButton
          icon="i-heroicons-bars-3"
          color="neutral"
          variant="ghost"
          size="lg"
          class="text-white hover:bg-white/10 xl:hidden"
          aria-label="Otvoriť menu"
          @click="mobileOpen = true"
        />
      </div>
    </div>

    <USlideover
      v-model:open="mobileOpen"
      side="right"
      title="Menu"
      :ui="{ content: 'max-w-xs' }"
    >
      <template #body>
        <NuxtLink
          v-if="offlineQueueTotal > 0"
          to="/offline"
          class="mb-3 flex items-center justify-between gap-3 rounded-md border border-warning-300 bg-warning-100 px-3 py-3 text-warning-900"
          @click="mobileOpen = false"
        >
          <span class="flex items-center gap-3 font-bold">
            <UIcon name="i-heroicons-cloud-arrow-up" class="h-5 w-5" />
            Offline fronta
          </span>
          <span class="rounded-full bg-error-600 px-2 py-0.5 text-xs font-black text-white">
            {{ offlineQueueTotal }}
          </span>
        </NuxtLink>
        <nav class="flex flex-col gap-1">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium"
            :class="
              isActive(item.to)
                ? 'bg-primary-50 text-primary-900'
                : 'text-foreground hover:bg-muted'
            "
            @click="mobileOpen = false"
          >
            <UIcon :name="item.icon" class="h-5 w-5" />
            {{ item.label }}
          </NuxtLink>
        </nav>
      </template>
    </USlideover>
  </header>
</template>
