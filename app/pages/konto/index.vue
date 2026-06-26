<script setup lang="ts">
import type { AnglerLogbooksResponse } from '~/services/catchApiService'

useHead({ title: 'Moje zápisníky' })

const { getLakeName, getPegLabel } = usePondData()
const { account } = useMockAnglerAuth()
const { logout } = useMockAuth()
const requestFetch = useRequestFetch()

const emptyState = (): AnglerLogbooksResponse => ({
  account: account.value ?? { email: '', id: '', name: '' },
  ok: true,
  tripLogbookEntries: [],
  tripLogbooks: [],
  updatedAt: '',
})

const { data: accountState, status } = await useAsyncData<AnglerLogbooksResponse>(
  'angler-account-logbooks',
  () => account.value
    ? requestFetch<AnglerLogbooksResponse>('/api/account/logbooks')
    : Promise.resolve(emptyState()),
  {
    default: emptyState,
    watch: [account],
  },
)

const activeLogbooks = computed(() =>
  accountState.value.tripLogbooks.filter((logbook) => logbook.status !== 'closed'),
)
const closedLogbooks = computed(() =>
  accountState.value.tripLogbooks.filter((logbook) => logbook.status === 'closed'),
)
const totalWeight = computed(() =>
  accountState.value.tripLogbookEntries.reduce((sum, entry) => sum + entry.weightKg, 0),
)

function entriesFor(logbookId: string) {
  return accountState.value.tripLogbookEntries.filter((entry) => entry.logbookId === logbookId)
}

function entryCountLabel(count: number) {
  if (count === 1) return '1 úlovok'
  if (count >= 2 && count <= 4) return `${count} úlovky`
  return `${count} úlovkov`
}

function formatDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${formatter.format(new Date(from))} – ${formatter.format(new Date(to))}`
}

async function submitLogout() {
  logout()
  accountState.value = emptyState()
  await navigateTo('/')
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Rybársky účet"
      title="Moje zápisníky"
      description="Aktívne aj ukončené výpravy uložené k účtu. Kód zostáva jednoduchým vstupom pre ostatných členov partie."
    />

    <section class="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 border-y border-primary-200 bg-primary-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-bold">{{ account?.name }}</p>
            <p class="mt-1 text-sm text-foreground-muted">{{ account?.email }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton to="/ulovky" icon="i-heroicons-plus" color="warning">Nový zápisník</UButton>
            <UButton icon="i-heroicons-arrow-right-on-rectangle" variant="ghost" @click="submitLogout">
              Odhlásiť
            </UButton>
          </div>
        </div>

      <div class="mt-6 grid gap-4 sm:grid-cols-3">
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Zápisníky</p>
            <p class="mt-2 text-3xl font-bold">{{ accountState.tripLogbooks.length }}</p>
          </div>
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Úlovky vo výpravách</p>
            <p class="mt-2 text-3xl font-bold">{{ accountState.tripLogbookEntries.length }}</p>
          </div>
          <div class="rounded-card border border-border bg-surface p-4">
            <p class="text-sm text-foreground-muted">Spoločná váha</p>
            <p class="mt-2 text-3xl font-bold">{{ totalWeight.toFixed(1) }} kg</p>
          </div>
        </div>

      <section class="mt-8">
          <div>
            <h2 class="text-xl font-bold">Aktívne výpravy</h2>
            <p class="mt-1 text-sm text-foreground-muted">Vlastné zápisníky aj výpravy, ku ktorým je účet priradený.</p>
          </div>

          <div v-if="activeLogbooks.length" class="mt-4 grid gap-4 lg:grid-cols-2">
            <article
              v-for="logbook in activeLogbooks"
              :key="logbook.id"
              class="rounded-card border border-border bg-surface p-5"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold text-primary-800">{{ getLakeName(logbook.lake) }}</p>
                  <h3 class="mt-1 text-xl font-bold">{{ logbook.title }}</h3>
                </div>
                <StatusBadge :label="logbook.status === 'active' ? 'aktívny' : 'rozpracovaný'" :tone="logbook.status === 'active' ? 'success' : 'warning'" size="xs" />
              </div>
              <p class="mt-3 text-sm text-foreground-muted">
                {{ formatDateRange(logbook.from, logbook.to) }} ·
                {{ logbook.pegIds.map((pegId) => getPegLabel(pegId)).join(', ') }}
              </p>
              <div class="mt-4 flex flex-wrap gap-2 text-sm">
                <span class="rounded-md bg-muted px-2.5 py-1 font-semibold">
                  {{ entryCountLabel(entriesFor(logbook.id).length) }}
                </span>
                <span class="rounded-md bg-muted px-2.5 py-1 font-mono font-semibold">{{ logbook.shareCode }}</span>
              </div>
              <UButton
                :to="{ path: '/ulovky', query: { zapisnik: logbook.shareCode } }"
                icon="i-heroicons-book-open"
                variant="soft"
                class="mt-5"
              >
                Otvoriť zápisník
              </UButton>
            </article>
          </div>
          <AppState
            v-else-if="status !== 'pending'"
            title="Zatiaľ bez aktívnej výpravy"
            description="Nový zápisník vytvorený po prihlásení sa tu zobrazí automaticky."
            icon="i-heroicons-book-open"
          />
        </section>

      <section v-if="closedLogbooks.length" class="mt-10">
          <h2 class="text-xl font-bold">Ukončené výpravy</h2>
          <div class="mt-4 divide-y divide-border border-y border-border">
            <div
              v-for="logbook in closedLogbooks"
              :key="logbook.id"
              class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="font-bold">{{ logbook.title }}</p>
                <p class="mt-1 text-sm text-foreground-muted">{{ formatDateRange(logbook.from, logbook.to) }}</p>
              </div>
              <UButton :to="{ path: '/ulovky', query: { zapisnik: logbook.shareCode } }" variant="ghost">
                História
              </UButton>
            </div>
          </div>
      </section>
    </section>
  </div>
</template>
