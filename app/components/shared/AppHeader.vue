<script setup lang="ts">
interface NavItem {
  label: string
  to: string
  icon: string
}

const primaryNav: NavItem[] = [
  { label: 'Revíry', to: '/reviry', icon: 'i-heroicons-map' },
  { label: 'Mapa', to: '/mapa', icon: 'i-heroicons-map-pin' },
  { label: 'Rezervácie', to: '/rezervacie', icon: 'i-heroicons-calendar-days' },
  { label: 'Úlovky', to: '/ulovky', icon: 'i-heroicons-camera' },
  { label: 'Súťaže', to: '/sutaze', icon: 'i-heroicons-trophy' },
  { label: 'Pravidlá', to: '/info', icon: 'i-heroicons-information-circle' },
]

const secondaryNav: NavItem[] = [
  { label: 'Sponzori', to: '/sponzori', icon: 'i-heroicons-building-storefront' },
]

const route = useRoute()
const config = useRuntimeConfig()
const mobileOpen = ref(false)
const { isLoggedIn, logout, user } = useMockAuth()
const { total: offlineQueueTotal } = useOfflineQueueSummary()
const accountAction = computed(() => {
  if (!user.value) {
    return {
      icon: 'i-heroicons-arrow-right-on-rectangle',
      label: 'Prihlásiť',
      to: '/login',
    }
  }

  const actions: Partial<Record<MockRole, { icon: string, label: string, to: string }>> = {
    accountant: { icon: 'i-heroicons-calculator', label: 'Interný prehľad', to: '/admin/rezervacie' },
    angler: { icon: 'i-heroicons-user-circle', label: 'Môj účet', to: '/konto' },
    manager: { icon: 'i-heroicons-wrench-screwdriver', label: 'Správa revíru', to: '/admin' },
    marshal: { icon: 'i-heroicons-scale', label: 'Panel kontrolóra', to: '/admin/sutaze/kontrolor' },
    organizer: { icon: 'i-heroicons-trophy', label: 'Organizácia súťaže', to: '/admin/sutaze' },
    owner: { icon: 'i-heroicons-shield-check', label: 'Správa revíru', to: '/admin' },
    team: { icon: 'i-heroicons-user-group', label: 'Tímový panel', to: '/sutaze/tim' },
    worker: { icon: 'i-heroicons-clipboard-document-check', label: 'Prevádzka', to: '/admin/hlasenia' },
  }

  return actions[user.value.role] ?? {
    icon: 'i-heroicons-user-circle',
    label: 'Môj účet',
    to: getAuthenticatedHome(user.value.role),
  }
})

const offlineQueueLabel = computed(() =>
  offlineQueueTotal.value === 1
    ? '1 položka čaká na odoslanie'
    : `${offlineQueueTotal.value} položiek čaká na odoslanie`,
)
const accountStatusLabel = computed(() =>
  user.value ? `${user.value.name} · ${user.value.roleLabel}` : 'Neprihlásený používateľ',
)
const allMobileNav = computed(() => [...primaryNav, ...secondaryNav])
const isSecondaryActive = computed(() => secondaryNav.some((item) => isActive(item.to)))

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

async function signOut() {
  logout()
  mobileOpen.value = false
  await navigateTo('/')
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
          v-for="item in primaryNav"
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
        <UDropdownMenu
          :items="secondaryNav"
          :content="{ align: 'end', sideOffset: 8 }"
        >
          <UButton
            color="neutral"
            variant="ghost"
            trailing-icon="i-heroicons-chevron-down"
            class="text-white hover:bg-white/10"
            :class="isSecondaryActive ? 'bg-accent-400 text-primary-950 hover:bg-accent-300' : 'text-white/80'"
          >
            Viac
          </UButton>
        </UDropdownMenu>
      </nav>

      <div class="flex items-center gap-2">
        <UButton
          to="/notifikacie"
          icon="i-heroicons-bell-alert"
          color="neutral"
          variant="ghost"
          class="hidden text-white hover:bg-white/10 sm:inline-flex"
          aria-label="Výstrahy a oznamy"
        />
        <UButton
          to="/kontakt"
          icon="i-heroicons-phone"
          color="neutral"
          variant="ghost"
          class="hidden text-white hover:bg-white/10 sm:inline-flex"
          aria-label="Kontakt na správcu"
        />
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
        <div v-if="isLoggedIn" class="hidden items-center gap-1 rounded-md bg-white/5 p-1 lg:flex">
          <UButton
            :to="accountAction.to"
            :icon="accountAction.icon"
            color="neutral"
            variant="ghost"
            class="max-w-48 text-white hover:bg-white/10"
            :aria-label="`${accountStatusLabel}: ${accountAction.label}`"
            :title="accountStatusLabel"
          >
            <span class="truncate">{{ accountAction.label }}</span>
          </UButton>
          <UButton
            icon="i-heroicons-arrow-left-on-rectangle"
            color="neutral"
            variant="ghost"
            class="text-white hover:bg-white/10"
            :aria-label="`Odhlásiť: ${accountStatusLabel}`"
            @click="signOut"
          />
        </div>
        <UButton
          v-else
          :to="accountAction.to"
          :icon="accountAction.icon"
          color="neutral"
          variant="ghost"
          class="hidden text-white hover:bg-white/10 lg:inline-flex"
          :aria-label="accountAction.label"
        >
          {{ accountAction.label }}
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
            Čaká na odoslanie
          </span>
          <span class="rounded-full bg-error-600 px-2 py-0.5 text-xs font-black text-white">
            {{ offlineQueueTotal }}
          </span>
        </NuxtLink>
        <nav class="flex flex-col gap-1">
          <NuxtLink
            to="/"
            class="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium"
            :class="route.path === '/' ? 'bg-primary-50 text-primary-900' : 'text-foreground hover:bg-muted'"
            @click="mobileOpen = false"
          >
            <UIcon name="i-heroicons-home" class="h-5 w-5" />
            Domov
          </NuxtLink>
          <NuxtLink
            v-for="item in allMobileNav"
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
          <NuxtLink
            to="/notifikacie"
            class="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium"
            :class="isActive('/notifikacie') ? 'bg-primary-50 text-primary-900' : 'text-foreground hover:bg-muted'"
            @click="mobileOpen = false"
          >
            <UIcon name="i-heroicons-bell-alert" class="h-5 w-5" />
            Výstrahy a oznamy
          </NuxtLink>
          <NuxtLink
            to="/kontakt"
            class="flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium"
            :class="isActive('/kontakt') ? 'bg-primary-50 text-primary-900' : 'text-foreground hover:bg-muted'"
            @click="mobileOpen = false"
          >
            <UIcon name="i-heroicons-phone" class="h-5 w-5" />
            Kontakt
          </NuxtLink>
        </nav>
        <NuxtLink
          :to="accountAction.to"
          class="mt-3 flex items-center gap-3 border-t border-border px-3 pt-4 text-base font-medium text-foreground"
          @click="mobileOpen = false"
        >
          <UIcon :name="accountAction.icon" class="h-5 w-5" />
          {{ accountAction.label }}
        </NuxtLink>
        <button
          v-if="isLoggedIn"
          type="button"
          class="mt-3 flex w-full items-center gap-3 px-3 py-3 text-left text-base font-medium text-foreground-muted hover:text-foreground"
          @click="signOut"
        >
          <UIcon name="i-heroicons-arrow-left-on-rectangle" class="h-5 w-5" />
          Odhlásiť
        </button>
      </template>
    </USlideover>
  </header>
</template>
