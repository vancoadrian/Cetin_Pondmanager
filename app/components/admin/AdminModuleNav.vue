<script setup lang="ts">
const route = useRoute()

const adminItems = [
  { label: 'Dashboard', to: '/admin', icon: 'i-heroicons-squares-2x2' },
  { label: 'Rezervácie', to: '/admin/rezervacie', icon: 'i-heroicons-calendar-days' },
  { label: 'Úlovky', to: '/admin/ulovky', icon: 'i-heroicons-camera' },
  { label: 'Uzávierky', to: '/admin/uzavierky', icon: 'i-heroicons-no-symbol' },
  { label: 'Mapa', to: '/admin/mapa', icon: 'i-heroicons-map-pin' },
  { label: 'Požičovňa', to: '/admin/pozicovna', icon: 'i-heroicons-archive-box' },
  { label: 'Súťaže', to: '/admin/sutaze', icon: 'i-heroicons-trophy' },
  { label: 'Sponzori', to: '/admin/sponzori', icon: 'i-heroicons-star' },
  { label: 'Audit', to: '/admin/audit', icon: 'i-heroicons-clipboard-document-list' },
]

const isActive = (to: string) => {
  if (to === '/admin') return route.path === '/admin'
  return route.path.startsWith(to)
}
</script>

<template>
  <nav class="mb-6 overflow-x-auto rounded-card border border-border bg-surface p-2">
    <div class="flex min-w-max gap-1">
      <NuxtLink
        v-for="item in adminItems"
        :key="item.to"
        :to="item.to"
        class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
        :class="
          isActive(item.to)
            ? 'bg-primary-900 text-white'
            : 'text-foreground-muted hover:bg-muted hover:text-foreground'
        "
      >
        <UIcon :name="item.icon" class="h-4 w-4" />
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
