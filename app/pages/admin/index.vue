<script setup lang="ts">
import { placeIssuePriorityLabels } from '~/data/pond'
import type { LargeFishAssistanceStateResponse } from '~/services/largeFishAssistanceService'
import type { PlaceIssueStateResponse } from '~/services/placeIssueService'
import { getPegAvailability } from '~/utils/availability'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Admin' })

const route = useRoute()
const {
  getLakeName,
  lakes,
  placeIssues,
  pegs,
  reservations,
  tournamentPenalties,
  tournamentRequests,
  tournamentRequestTypeLabels,
} = usePondData()
const { liveClosures } = await useClosureState({ admin: true, key: 'admin-dashboard-closure-state' })
const { activeRentalItems } = await useRentalCatalogState({ admin: true, key: 'admin-dashboard-rental-catalog-state' })
const { liveSponsors } = await useSponsorState({ admin: true, key: 'admin-dashboard-sponsor-state' })

const { logout, user } = useMockAuth()
const requestFetch = useRequestFetch()
const fallbackPlaceIssueState = (): PlaceIssueStateResponse => ({
  ok: true,
  placeIssues,
  updatedAt: 'seed',
})
const fallbackAssistanceState = (): LargeFishAssistanceStateResponse => ({
  ok: true,
  requests: [],
  updatedAt: 'seed',
})
const { data: placeIssueState } = await useAsyncData<PlaceIssueStateResponse>(
  'admin-dashboard-place-issue-state',
  () => requestFetch<PlaceIssueStateResponse>('/api/admin/place-issues'),
  {
    default: fallbackPlaceIssueState,
  },
)
const { data: assistanceState } = await useAsyncData<LargeFishAssistanceStateResponse>(
  'admin-dashboard-large-fish-assistance',
  () => canAccessAdminPath(user.value?.role, '/admin/ryby')
    ? requestFetch<LargeFishAssistanceStateResponse>('/api/admin/large-fish-assistance')
    : Promise.resolve(fallbackAssistanceState()),
  {
    default: fallbackAssistanceState,
  },
)

const allowedAdminModules = computed(() => getAdminModulesForRole(user.value?.role))
const deniedModuleLabel = computed(() => typeof route.query.denied === 'string' ? route.query.denied : '')
const pendingReservations = computed(() =>
  reservations.filter((reservation) => reservation.status === 'pending'),
)
const blockedReservations = computed(() =>
  reservations.filter((reservation) => reservation.status === 'blocked'),
)
const internalClosures = computed(() =>
  liveClosures.value.filter((closure) => closure.visibility === 'internal' || closure.affectsReservations),
)
const activeSponsors = computed(() => liveSponsors.value.filter((sponsor) => sponsor.active))
const activeTournamentRequests = computed(() =>
  tournamentRequests.filter((request) => request.status !== 'resolved'),
)
const activeTournamentPenalties = computed(() =>
  tournamentPenalties.filter((penalty) => penalty.status === 'active'),
)
const activePlaceIssues = computed(() =>
  (placeIssueState.value?.placeIssues ?? placeIssues).filter((issue) =>
    issue.status !== 'resolved' && issue.status !== 'rejected',
  ),
)
const activeFishAssistance = computed(() =>
  assistanceState.value.requests
    .filter((request) => ['waiting', 'on-route'].includes(request.status))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
)
const firstActiveFishAssistance = computed(() => activeFishAssistance.value[0])
const blockedPegs = computed(() =>
  pegs.filter((peg) => !getPegAvailability(peg, { closures: liveClosures.value, reservations }).reservable),
)

async function signOut() {
  logout()
  await navigateTo('/login')
}

async function goToLogin() {
  await navigateTo('/login')
}

function dashboardSponsorLogo(sponsor: (typeof liveSponsors.value)[number]) {
  return getSponsorLogo(sponsor, sponsor.placementType ?? 'sponsors')
}

function formatAssistanceTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}

function assistanceStatusLabel(status: string) {
  if (status === 'on-route') return 'správca ide'
  return 'čaká na odpoveď'
}

function assistanceStatusTone(status: string): StatusBadgeTone {
  if (status === 'on-route') return 'success'
  return 'warning'
}

function reservationStatusLabel(status: string) {
  if (status === 'pending') return 'čaká'
  if (status === 'blocked') return 'blokované'

  return status
}

function reservationStatusTone(status: string): StatusBadgeTone {
  if (status === 'blocked') return 'error'
  if (status === 'pending') return 'warning'

  return 'neutral'
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interná zóna"
      title="Prevádzkový prehľad"
      description="Rezervácie, dostupnosť miest, hlásenia a úlohy revíru podľa vašich oprávnení."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="deniedModuleLabel"
        class="mb-6"
        action-label="Späť na prihlásenie"
        :description="'Zobrazené moduly a povolené akcie sa riadia vašou používateľskou rolou.'"
        icon="i-heroicons-lock-closed"
        :title="`Nemáte prístup do modulu ${deniedModuleLabel}.`"
        tone="warning"
        @action="goToLogin"
      />

      <div class="mb-6 flex flex-col gap-4 rounded-card border border-border bg-primary-900 p-5 text-white lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-sm font-semibold text-accent-300">Prihlásený používateľ</p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <h2 class="text-2xl font-bold">{{ user?.name }}</h2>
            <span class="rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold text-accent-300">
              {{ user?.roleLabel }}
            </span>
          </div>
          <p class="mt-1 text-sm text-white/75">{{ user?.description }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="module in allowedAdminModules"
              :key="module.id"
              class="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
            >
              <UIcon :name="module.icon" class="h-3.5 w-3.5 text-accent-300" />
              {{ module.label }}
              <span class="text-white/55">
                {{ adminAccessModeLabels[getAdminModuleAccess(module, user?.role)!] }}
              </span>
            </span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton to="/" color="neutral" variant="outline" class="border-white/30 bg-white/10 text-white hover:bg-white/15">
            Verejná stránka
          </UButton>
          <UButton color="warning" icon="i-heroicons-arrow-left-on-rectangle" @click="signOut">
            Odhlásiť
          </UButton>
        </div>
      </div>

      <section
        v-if="activeFishAssistance.length"
        class="mb-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <DataStatusNotice
            class="flex-1"
            :description="`${firstActiveFishAssistance?.anglerName} čaká pri ${firstActiveFishAssistance?.weightKg} kg rybe na mieste ${firstActiveFishAssistance?.pegLabel}.`"
            icon="i-heroicons-bell-alert"
            :title="`${activeFishAssistance.length} ${activeFishAssistance.length === 1 ? 'otvorené privolanie' : 'otvorené privolania'} správcu`"
            tone="warning"
          />
          <UButton
            :to="{ path: '/admin/ryby', query: { privolanie: firstActiveFishAssistance?.id } }"
            icon="i-heroicons-bell-alert"
            color="warning"
          >
            Odpovedať
          </UButton>
        </div>

        <div class="mt-4 grid gap-3 lg:grid-cols-3">
          <NuxtLink
            v-for="request in activeFishAssistance.slice(0, 3)"
            :key="request.id"
            :to="{ path: '/admin/ryby', query: { privolanie: request.id } }"
            class="rounded-md border border-border bg-white p-3 transition hover:border-warning-500 hover:bg-warning-50"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold">{{ request.weightKg }} kg · {{ request.species }}</p>
                <p class="mt-1 text-sm text-foreground-muted">{{ request.pegLabel }} · {{ request.anglerName }}</p>
              </div>
              <StatusBadge
                :icon="request.status === 'on-route' ? 'i-heroicons-truck' : 'i-heroicons-clock'"
                :label="assistanceStatusLabel(request.status)"
                :tone="assistanceStatusTone(request.status)"
                size="xs"
              />
            </div>
            <p class="mt-2 text-xs font-semibold text-foreground-muted">
              {{ formatAssistanceTime(request.createdAt) }} · {{ request.phone }}
            </p>
          </NuxtLink>
        </div>
      </section>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Jazerá</p>
          <p class="mt-2 text-3xl font-bold">{{ lakes.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">v tejto prevádzke</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Blokované miesta</p>
          <p class="mt-2 text-3xl font-bold">{{ blockedPegs.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">rezervácie a uzávierky</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Na schválenie</p>
          <p class="mt-2 text-3xl font-bold">{{ pendingReservations.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">rezervácie</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Súťažné hlásenia</p>
          <p class="mt-2 text-3xl font-bold">{{ activeTournamentRequests.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">čakajúce alebo priradené</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Nedostatky</p>
          <p class="mt-2 text-3xl font-bold">{{ activePlaceIssues.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">otvorené hlásenia</p>
        </div>
        <div class="border-border bg-surface rounded-card border p-4">
          <p class="text-foreground-muted text-sm">Sponzori</p>
          <p class="mt-2 text-3xl font-bold">{{ activeSponsors.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">aktívne umiestnenia</p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Uzávierky a interné blokácie</h2>
                <p class="text-foreground-muted text-sm">
                  Jedno miesto pre sezónu, neres, údržbu, mimoriadne stavy a preteky.
                </p>
              </div>
              <UButton to="/admin/uzavierky" icon="i-heroicons-arrow-right" variant="soft">
                Otvoriť uzávierky
              </UButton>
            </div>
            <div class="mt-5 space-y-3">
              <div
                v-for="closure in internalClosures"
                :key="closure.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ closure.title }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} ·
                      {{ closure.from }} až {{ closure.to }}
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit"
                    :icon="closure.visibility === 'public' ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
                    :label="closure.visibility === 'public' ? 'Verejné' : 'Interné'"
                    size="xs"
                    :tone="closure.visibility === 'public' ? 'success' : 'warning'"
                  />
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ closure.notes }}</p>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 class="text-lg font-bold">Rezervácie na spracovanie</h2>
                <UButton to="/admin/rezervacie" icon="i-heroicons-arrow-right" variant="ghost">
                  Všetky rezervácie
                </UButton>
              </div>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div
                v-for="reservation in [...pendingReservations, ...blockedReservations]"
                :key="reservation.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-bold">{{ reservation.guest }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ getLakeName(reservation.lake) }} · {{ reservation.pegId }}
                    </p>
                  </div>
                  <StatusBadge
                    :icon="reservation.status === 'blocked' ? 'i-heroicons-no-symbol' : 'i-heroicons-clock'"
                    :label="reservationStatusLabel(reservation.status)"
                    size="xs"
                    :tone="reservationStatusTone(reservation.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-3 text-sm">
                  {{ reservation.from }} až {{ reservation.to }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Hlásenia nedostatkov</h2>
              <UButton to="/admin/hlasenia" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Hlásenia" />
            </div>
            <div class="mt-4 space-y-3">
              <div v-for="issue in activePlaceIssues.slice(0, 4)" :key="issue.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ issue.title }}</p>
                    <p class="text-foreground-muted text-sm">{{ getLakeName(issue.lake) }} · {{ issue.targetLabel }}</p>
                  </div>
                  <StatusBadge
                    :icon="issue.priority === 'urgent' ? 'i-heroicons-bell-alert' : 'i-heroicons-flag'"
                    :label="placeIssuePriorityLabels[issue.priority]"
                    size="xs"
                    :tone="issue.priority === 'urgent' ? 'error' : 'warning'"
                  />
                </div>
              </div>
              <p v-if="activePlaceIssues.length === 0" class="text-sm text-foreground-muted">
                Nie je otvorené žiadne prevádzkové hlásenie.
              </p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Požičovňa</h2>
              <UButton to="/admin/pozicovna" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Požičovňa" />
            </div>
            <div class="mt-4 space-y-3">
              <div v-for="item in activeRentalItems" :key="item.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ item.label }}</p>
                    <p class="text-foreground-muted text-sm">{{ item.priceLabel }}</p>
                  </div>
                  <span class="text-lg font-bold">{{ item.stock }} ks</span>
                </div>
              </div>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Súťažný dispečing</h2>
              <UButton to="/admin/sutaze" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Súťaže" />
            </div>
            <div class="mt-4 space-y-3">
              <div
                v-for="request in activeTournamentRequests"
                :key="request.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <p class="font-bold">{{ request.team }} · {{ request.sectorId.toUpperCase() }}</p>
                <p class="text-primary-800 text-sm font-semibold">
                  {{ tournamentRequestTypeLabels[request.type] }}
                </p>
                <p class="text-foreground-muted mt-2 text-sm">{{ request.description }}</p>
              </div>
            </div>
            <DataStatusNotice
              v-if="activeTournamentPenalties.length"
              class="mt-4"
              :description="activeTournamentPenalties.length === 1 ? 'Jeden tím má aktívne obmedzenie.' : `${activeTournamentPenalties.length} tímov má aktívne obmedzenie.`"
              icon="i-heroicons-no-symbol"
              title="Aktívny trest v súťaži"
              tone="error"
            />
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold">Sponzori</h2>
              <UButton to="/admin/sponzori" icon="i-heroicons-arrow-right" variant="ghost" aria-label="Sponzori" />
            </div>
            <div class="mt-4 space-y-3">
              <div v-for="sponsor in liveSponsors" :key="sponsor.id" class="flex items-center gap-3 rounded-md bg-muted p-3">
                <div class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-sm font-black text-accent-300">
                  <img
                    v-if="dashboardSponsorLogo(sponsor).url"
                    :src="dashboardSponsorLogo(sponsor).url"
                    :alt="dashboardSponsorLogo(sponsor).alt"
                    class="h-full w-full bg-white object-contain p-1.5"
                  >
                  <span v-else>{{ dashboardSponsorLogo(sponsor).text }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold">{{ sponsor.name }}</p>
                  <p class="text-foreground-muted truncate text-sm">{{ sponsor.placement }}</p>
                </div>
                <StatusBadge
                  :icon="sponsor.active ? 'i-heroicons-check-circle' : 'i-heroicons-pause-circle'"
                  :label="sponsor.active ? 'aktívny' : 'pauza'"
                  size="xs"
                  :tone="sponsor.active ? 'success' : 'muted'"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>
