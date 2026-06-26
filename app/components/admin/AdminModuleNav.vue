<script setup lang="ts">
const route = useRoute()
const { user } = useMockAuth()

const adminItems = computed(() => getAdminNavigationItemsForRole(user.value?.role))

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
