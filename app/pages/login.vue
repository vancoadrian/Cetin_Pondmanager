<script setup lang="ts">
useHead({ title: 'Mock login' })

const route = useRoute()
const { login, mockUsers, user } = useMockAuth()
const selectedUserId = ref(user.value?.id ?? mockUsers[0]?.id ?? 'owner')

const selectedUser = computed(() =>
  mockUsers.find((mockUser) => mockUser.id === selectedUserId.value) ?? mockUsers[0]!,
)

async function submit() {
  login(selectedUserId.value)
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/admin'
  await navigateTo(redirect)
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interný prístup"
      title="Mock login pre admin a súťažné role"
      description="Dočasné prihlásenie bez hesla. Slúži na návrh práv, obrazoviek a toku práce pred napojením na reálnu autentifikáciu."
    />

    <section class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
      <div class="border-border bg-primary-900 rounded-card border p-6 text-white">
        <p class="text-accent-300 text-sm font-semibold">Mock režim</p>
        <h2 class="mt-3 text-3xl font-bold">Vyber rolu a vstúp do internej zóny.</h2>
        <p class="mt-4 text-sm text-white/75">
          Public stránky zostávajú dostupné každému. Interná zóna je zatiaľ chránená cookie
          session, ktorú neskôr nahradí Supabase auth alebo iný identity provider.
        </p>

        <div class="mt-6 rounded-md bg-white/10 p-4">
          <p class="text-sm font-bold">{{ selectedUser.name }}</p>
          <p class="mt-1 text-sm text-white/75">{{ selectedUser.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="permission in selectedUser.permissions"
              :key="permission"
              class="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
            >
              {{ permission }}
            </span>
          </div>
        </div>
      </div>

      <form class="border-border bg-surface rounded-card border p-5" @submit.prevent="submit">
        <h2 class="text-xl font-bold">Rola</h2>
        <div class="mt-5 grid gap-3">
          <label
            v-for="mockUser in mockUsers"
            :key="mockUser.id"
            class="cursor-pointer rounded-md border p-4 transition-colors hover:bg-muted"
            :class="
              selectedUserId === mockUser.id
                ? 'border-primary-600 bg-primary-50'
                : 'border-border bg-white'
            "
          >
            <div class="flex items-start gap-3">
              <input
                v-model="selectedUserId"
                type="radio"
                name="mock-user"
                :value="mockUser.id"
                class="mt-1 h-4 w-4 accent-primary-700"
              >
              <span class="min-w-0">
                <span class="block font-bold">{{ mockUser.name }}</span>
                <span class="text-foreground-muted mt-1 block text-sm">{{ mockUser.description }}</span>
              </span>
            </div>
          </label>
        </div>

        <UButton type="submit" icon="i-heroicons-arrow-right-on-rectangle" block class="mt-6">
          Vstúpiť do adminu
        </UButton>
      </form>
    </section>
  </div>
</template>
