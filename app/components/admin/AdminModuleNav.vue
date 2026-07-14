<script setup lang="ts">
const route = useRoute()
const { user } = useMockAuth()
const navigationElement = ref<HTMLElement | null>(null)

const adminItems = computed(() => getAdminNavigationItemsForRole(user.value?.role))

const isActive = (to: string) => {
  if (to === '/admin') return route.path === '/admin'
  return route.path.startsWith(to)
}

async function revealActiveItem(behavior: ScrollBehavior = 'auto') {
  if (!import.meta.client) return

  await nextTick()
  const navigation = navigationElement.value
  const activeItem = navigation?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!navigation || !activeItem) return

  const centeredLeft = activeItem.offsetLeft - (navigation.clientWidth - activeItem.offsetWidth) / 2
  navigation.scrollTo({ behavior, left: Math.max(0, centeredLeft) })
}

onMounted(() => {
  void revealActiveItem()
})

watch(
  [() => route.path, adminItems],
  () => void revealActiveItem('smooth'),
  { flush: 'post' },
)
</script>

<template>
  <nav ref="navigationElement" class="mb-6 overflow-x-auto rounded-card border border-border bg-surface p-2">
    <div class="flex min-w-max gap-1">
      <NuxtLink
        v-for="item in adminItems"
        :key="item.to"
        :to="item.to"
        :aria-current="isActive(item.to) ? 'page' : undefined"
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
