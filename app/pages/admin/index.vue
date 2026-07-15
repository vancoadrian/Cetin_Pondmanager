<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { placeIssuePriorityLabels } from '~/data/pond'
import type { CatchStateResponse } from '~/services/catchApiService'
import type { LargeFishAssistanceStateResponse } from '~/services/largeFishAssistanceService'
import type { PlaceIssueStateResponse } from '~/services/placeIssueService'
import type { ReservationStateResponse } from '~/services/reservationApiService'
import type { AdminModuleId } from '~/utils/adminAccess'
import { getPegAvailability } from '~/utils/availability'
import type { StatusBadgeTone } from '~/utils/ui'

useHead({ title: 'Admin' })

interface DashboardMetric {
  detail: string
  icon: string
  id: string
  label: string
  to: RouteLocationRaw
  tone: 'error' | 'primary' | 'warning'
  value: number
}

interface DashboardTask {
  icon: string
  id: string
  meta: string
  priority: number
  sortAt: string
  statusLabel: string
  title: string
  to: RouteLocationRaw
  tone: StatusBadgeTone
}

interface DashboardQuickAction {
  icon: string
  label: string
  moduleId: AdminModuleId
  to: RouteLocationRaw
}

const route = useRoute()
const router = useRouter()
const { logout, user } = useMockAuth()
const requestFetch = useRequestFetch()
const {
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  getLakeName,
  getPegLabel,
  pegs,
  placeIssues,
  rentalBookings: seedRentalBookings,
  reservations: seedReservations,
  tournamentRequests,
  tournamentRequestTypeLabels,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbooks: seedTripLogbooks,
} = usePondData()

const { liveClosures } = await useClosureState({ admin: true, key: 'admin-dashboard-closure-state' })

const fallbackReservationState = (): ReservationStateResponse => ({
  ok: true,
  rentalBookings: seedRentalBookings,
  reservations: seedReservations,
  updatedAt: 'seed',
})
const fallbackCatchState = (): CatchStateResponse => ({
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  ok: true,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbooks: seedTripLogbooks,
  updatedAt: 'seed',
})
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

const {
  data: reservationState,
  error: reservationStateError,
  refresh: refreshReservationState,
} = await useAsyncData<ReservationStateResponse>(
  'admin-dashboard-reservation-state',
  () => requestFetch<ReservationStateResponse>('/api/admin/reservations'),
  { default: fallbackReservationState },
)
const {
  data: catchState,
  error: catchStateError,
  refresh: refreshCatchState,
} = await useAsyncData<CatchStateResponse>(
  'admin-dashboard-catch-state',
  () => canAccessAdminPath(user.value?.role, '/admin/ulovky')
    ? requestFetch<CatchStateResponse>('/api/admin/catches')
    : Promise.resolve(fallbackCatchState()),
  { default: fallbackCatchState },
)
const {
  data: placeIssueState,
  error: placeIssueStateError,
  refresh: refreshPlaceIssueState,
} = await useAsyncData<PlaceIssueStateResponse>(
  'admin-dashboard-place-issue-state',
  () => requestFetch<PlaceIssueStateResponse>('/api/admin/place-issues'),
  { default: fallbackPlaceIssueState },
)
const {
  data: assistanceState,
  error: assistanceStateError,
  refresh: refreshAssistanceState,
} = await useAsyncData<LargeFishAssistanceStateResponse>(
  'admin-dashboard-large-fish-assistance',
  () => canAccessAdminPath(user.value?.role, '/admin/ryby')
    ? requestFetch<LargeFishAssistanceStateResponse>('/api/admin/large-fish-assistance')
    : Promise.resolve(fallbackAssistanceState()),
  { default: fallbackAssistanceState },
)

const deniedModuleLabel = computed(() => typeof route.query.denied === 'string' ? route.query.denied : '')
const liveReservations = computed(() => reservationState.value?.reservations ?? seedReservations)
const liveCatches = computed(() => catchState.value?.catches ?? seedCatches)
const pendingReservations = computed(() =>
  liveReservations.value.filter((reservation) => reservation.status === 'pending'),
)
const pendingCatches = computed(() =>
  liveCatches.value.filter((catchItem) => catchItem.status === 'pending'),
)
const activeTournamentRequests = computed(() =>
  tournamentRequests.filter((request) => request.status !== 'resolved'),
)
const activePlaceIssues = computed(() =>
  (placeIssueState.value?.placeIssues ?? placeIssues)
    .filter((issue) => issue.status !== 'resolved' && issue.status !== 'rejected')
    .sort((first, second) => {
      if (first.priority === second.priority) return first.createdAt.localeCompare(second.createdAt)
      return first.priority === 'urgent' ? -1 : 1
    }),
)
const activeFishAssistance = computed(() =>
  (assistanceState.value?.requests ?? [])
    .filter((request) => ['waiting', 'on-route'].includes(request.status))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
)
const firstActiveFishAssistance = computed(() => activeFishAssistance.value[0])
const blockedPegs = computed(() =>
  pegs.filter((peg) => !getPegAvailability(peg, {
    closures: liveClosures.value,
    reservations: liveReservations.value,
  }).reservable),
)
const dashboardDataError = computed(() =>
  reservationStateError.value
  || catchStateError.value
  || placeIssueStateError.value
  || assistanceStateError.value,
)

const dashboardMetrics = computed<DashboardMetric[]>(() => [
  {
    detail: activeFishAssistance.value.length ? 'rybári čakajú pri úlovku' : 'bez otvoreného privolania',
    icon: 'i-heroicons-bell-alert',
    id: 'assistance',
    label: 'Privolania',
    to: { path: '/admin/ryby', query: { sekcia: 'privolania' } },
    tone: activeFishAssistance.value.length ? 'error' : 'primary',
    value: activeFishAssistance.value.length,
  },
  {
    detail: pendingReservations.value.length ? 'čakajú na potvrdenie' : 'všetko je spracované',
    icon: 'i-heroicons-calendar-days',
    id: 'reservations',
    label: 'Rezervácie',
    to: '/admin/rezervacie',
    tone: pendingReservations.value.length ? 'warning' : 'primary',
    value: pendingReservations.value.length,
  },
  {
    detail: pendingCatches.value.length ? 'čakajú na zverejnenie' : 'bez čakajúcej moderácie',
    icon: 'i-heroicons-camera',
    id: 'catches',
    label: 'Úlovky',
    to: '/admin/ulovky',
    tone: pendingCatches.value.length ? 'warning' : 'primary',
    value: pendingCatches.value.length,
  },
  {
    detail: activePlaceIssues.value.length ? 'otvorené prevádzkové úlohy' : 'bez otvoreného nedostatku',
    icon: 'i-heroicons-wrench-screwdriver',
    id: 'issues',
    label: 'Nedostatky',
    to: '/admin/hlasenia',
    tone: activePlaceIssues.value.some((issue) => issue.priority === 'urgent') ? 'error' : 'primary',
    value: activePlaceIssues.value.length,
  },
])

const dashboardTasks = computed<DashboardTask[]>(() => {
  const rows: DashboardTask[] = [
    ...pendingReservations.value.map((reservation) => ({
      icon: 'i-heroicons-calendar-days',
      id: `reservation-${reservation.id}`,
      meta: `${getLakeName(reservation.lake)} · ${getPegLabel(reservation.pegId)} · ${formatDateRange(reservation.from, reservation.to)}`,
      priority: 80,
      sortAt: reservation.from,
      statusLabel: 'čaká na potvrdenie',
      title: reservation.guest,
      to: { path: '/admin/rezervacie', query: { rezervacia: reservation.id } },
      tone: 'warning' as const,
    })),
    ...pendingCatches.value.map((catchItem) => ({
      icon: 'i-heroicons-camera',
      id: `catch-${catchItem.id}`,
      meta: `${getLakeName(catchItem.lake)} · ${getPegLabel(catchItem.pegId)} · ${catchItem.weightKg} kg`,
      priority: 55,
      sortAt: catchItem.caughtAt,
      statusLabel: 'čaká na moderáciu',
      title: `${catchItem.species} · ${catchItem.angler}`,
      to: { path: '/admin/ulovky', query: { catchId: catchItem.id } },
      tone: 'warning' as const,
    })),
    ...activePlaceIssues.value.map((issue) => ({
      icon: issue.priority === 'urgent' ? 'i-heroicons-bell-alert' : 'i-heroicons-wrench-screwdriver',
      id: `issue-${issue.id}`,
      meta: `${getLakeName(issue.lake)} · ${issue.targetLabel}`,
      priority: issue.priority === 'urgent' ? 100 : 65,
      sortAt: issue.createdAt,
      statusLabel: placeIssuePriorityLabels[issue.priority],
      title: issue.title,
      to: { path: '/admin/hlasenia', query: { hlasenie: issue.id } },
      tone: issue.priority === 'urgent' ? 'error' as const : 'warning' as const,
    })),
    ...activeTournamentRequests.value.map((request) => ({
      icon: request.type === 'catch-measurement' ? 'i-heroicons-scale' : 'i-heroicons-trophy',
      id: `tournament-${request.id}`,
      meta: `${request.team} · sektor ${request.sectorId.toUpperCase()} · ${tournamentRequestTypeLabels[request.type]}`,
      priority: request.priority === 'high' ? 90 : 70,
      sortAt: request.createdAt,
      statusLabel: request.status === 'assigned' ? 'priradené' : 'nové hlásenie',
      title: request.description,
      to: { path: '/admin/sutaze', query: { sekcia: 'dispecing', turnaj: request.tournamentId } },
      tone: request.priority === 'high' ? 'error' as const : 'warning' as const,
    })),
  ]

  return rows.sort((first, second) =>
    second.priority - first.priority || first.sortAt.localeCompare(second.sortAt),
  )
})
const visibleDashboardTasks = computed(() => dashboardTasks.value.slice(0, 8))
const remainingDashboardTaskCount = computed(() =>
  Math.max(dashboardTasks.value.length - visibleDashboardTasks.value.length, 0),
)

const today = new Date().toISOString().slice(0, 10)
const upcomingClosures = computed(() =>
  liveClosures.value
    .filter((closure) => (closure.visibility === 'internal' || closure.affectsReservations) && closure.to >= today)
    .sort((first, second) => first.from.localeCompare(second.from))
    .slice(0, 3),
)
const activeClosureCount = computed(() =>
  liveClosures.value.filter((closure) => closure.from <= today && closure.to >= today).length,
)

const quickActions: DashboardQuickAction[] = [
  {
    icon: 'i-heroicons-calendar-days',
    label: 'Nová rezervácia',
    moduleId: 'reservations',
    to: { path: '/admin/rezervacie', query: { sekcia: 'nova' } },
  },
  {
    icon: 'i-heroicons-no-symbol',
    label: 'Spravovať uzávierky',
    moduleId: 'closures',
    to: '/admin/uzavierky',
  },
  {
    icon: 'i-heroicons-map-pin',
    label: 'Upraviť mapu',
    moduleId: 'map',
    to: '/admin/mapa',
  },
  {
    icon: 'i-heroicons-megaphone',
    label: 'Poslať oznam',
    moduleId: 'notifications',
    to: '/admin/notifikacie',
  },
]
const availableQuickActions = computed(() =>
  quickActions.filter((action) => canOperateAdminModule(user.value?.role, action.moduleId)),
)

function formatDate(value: string) {
  const parsed = Date.parse(`${value}T12:00:00`)
  if (!Number.isFinite(parsed)) return value

  return new Date(parsed).toLocaleDateString('sk-SK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateRange(from: string, to: string) {
  if (from === to) return formatDate(from)
  return `${formatDate(from)} - ${formatDate(to)}`
}

function formatAssistanceTime(value: string) {
  return new Date(value).toLocaleString('sk-SK', { dateStyle: 'short', timeStyle: 'short' })
}

function closureTimingLabel(from: string, to: string) {
  if (from <= today && to >= today) return `prebieha do ${formatDate(to)}`
  return formatDateRange(from, to)
}

function metricIconClass(tone: DashboardMetric['tone']) {
  if (tone === 'error') return 'bg-error-500/10 text-error-700'
  if (tone === 'warning') return 'bg-warning-500/10 text-warning-800'
  return 'bg-primary-50 text-primary-800'
}

async function signOut() {
  logout()
  await navigateTo('/login')
}

async function dismissDeniedNotice() {
  const query = { ...route.query }
  delete query.denied
  await router.replace({ query })
}

async function openFirstAssistance() {
  if (!firstActiveFishAssistance.value) return
  await navigateTo({
    path: '/admin/ryby',
    query: { privolanie: firstActiveFishAssistance.value.id },
  })
}

async function refreshDashboard() {
  await Promise.all([
    refreshReservationState(),
    refreshCatchState(),
    refreshPlaceIssueState(),
    refreshAssistanceState(),
  ])
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Interná zóna"
      title="Prevádzkový prehľad"
      description="Dnešné úlohy, naliehavé hlásenia a stav revíru na jednom mieste."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="deniedModuleLabel"
        class="mb-6"
        action-label="Zobraziť dostupné moduly"
        description="Zobrazené moduly a povolené akcie sa riadia vašou používateľskou rolou."
        icon="i-heroicons-lock-closed"
        :title="`Nemáte prístup do modulu ${deniedModuleLabel}.`"
        tone="warning"
        @action="dismissDeniedNotice"
      />

      <DataStatusNotice
        v-if="dashboardDataError"
        class="mb-6"
        action-label="Skúsiť znova"
        description="Niektoré živé údaje sa nepodarilo obnoviť. Zobrazený prehľad môže byť neúplný."
        icon="i-heroicons-exclamation-triangle"
        title="Prehľad nie je úplne aktuálny"
        tone="error"
        @action="refreshDashboard"
      />

      <div class="mb-6 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-start gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary-900 text-accent-300">
            <UIcon name="i-heroicons-user" class="h-5 w-5" />
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase text-primary-800">{{ user?.roleLabel }}</p>
            <h2 class="mt-0.5 truncate text-xl font-bold">{{ user?.name }}</h2>
            <p class="mt-1 line-clamp-2 text-sm text-foreground-muted">{{ user?.description }}</p>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton to="/" color="neutral" icon="i-heroicons-globe-alt" variant="outline">
            Verejná stránka
          </UButton>
          <UButton color="warning" icon="i-heroicons-arrow-left-on-rectangle" @click="signOut">
            Odhlásiť
          </UButton>
        </div>
      </div>

      <DataStatusNotice
        v-if="firstActiveFishAssistance"
        class="mb-6"
        action-label="Odpovedať"
        :description="`${firstActiveFishAssistance.anglerName} čaká pri ${firstActiveFishAssistance.weightKg} kg rybe na mieste ${firstActiveFishAssistance.pegLabel}. Hlásenie prišlo ${formatAssistanceTime(firstActiveFishAssistance.createdAt)}.${activeFishAssistance.length > 1 ? ` Ďalšie otvorené: ${activeFishAssistance.length - 1}.` : ''}`"
        icon="i-heroicons-bell-alert"
        title="Rybár čaká na správcu"
        tone="warning"
        @action="openFirstAssistance"
      />

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <NuxtLink
          v-for="metric in dashboardMetrics"
          :key="metric.id"
          :to="metric.to"
          class="group min-w-0 rounded-card border border-border bg-surface p-4 transition hover:border-primary-700 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" :class="metricIconClass(metric.tone)">
              <UIcon :name="metric.icon" class="h-4 w-4" />
            </div>
            <UIcon name="i-heroicons-arrow-up-right" class="h-4 w-4 shrink-0 text-foreground-muted transition group-hover:text-primary-700" />
          </div>
          <p class="mt-3 text-2xl font-bold sm:text-3xl">{{ metric.value }}</p>
          <p class="mt-0.5 text-sm font-bold">{{ metric.label }}</p>
          <p class="mt-1 line-clamp-2 text-xs text-foreground-muted">{{ metric.detail }}</p>
        </NuxtLink>
      </div>

      <div class="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <section class="min-w-0" aria-labelledby="dashboard-tasks-title">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="text-xs font-bold uppercase text-primary-800">Podľa naliehavosti</p>
              <h2 id="dashboard-tasks-title" class="mt-1 text-xl font-bold">Úlohy na spracovanie</h2>
            </div>
            <p class="text-sm font-semibold text-foreground-muted">
              {{ dashboardTasks.length }} otvorených
            </p>
          </div>

          <div v-if="visibleDashboardTasks.length" class="mt-4 space-y-3">
            <NuxtLink
              v-for="task in visibleDashboardTasks"
              :key="task.id"
              :to="task.to"
              class="group flex min-w-0 items-start gap-3 rounded-card border border-border bg-surface p-4 transition hover:border-primary-700 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
            >
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-800">
                <UIcon :name="task.icon" class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <h3 class="min-w-0 break-words font-bold leading-tight">{{ task.title }}</h3>
                  <UIcon name="i-heroicons-chevron-right" class="h-4 w-4 shrink-0 text-foreground-muted transition group-hover:translate-x-0.5 group-hover:text-primary-700" />
                </div>
                <p class="mt-1 break-words text-sm text-foreground-muted">{{ task.meta }}</p>
                <StatusBadge class="mt-2" :icon="task.icon" :label="task.statusLabel" size="xs" :tone="task.tone" />
              </div>
            </NuxtLink>
          </div>

          <DataStatusNotice
            v-else
            class="mt-4"
            description="Momentálne nečaká žiadna rezervácia, moderácia, prevádzkové ani súťažné hlásenie."
            icon="i-heroicons-check-circle"
            title="Všetky úlohy sú spracované"
            tone="success"
          />

          <p v-if="remainingDashboardTaskCount" class="mt-4 text-sm text-foreground-muted">
            Ďalších {{ remainingDashboardTaskCount }} úloh nájdete v príslušných moduloch.
          </p>
        </section>

        <aside class="min-w-0 space-y-8">
          <section aria-labelledby="dashboard-actions-title">
            <p class="text-xs font-bold uppercase text-primary-800">Najčastejšie kroky</p>
            <h2 id="dashboard-actions-title" class="mt-1 text-xl font-bold">Rýchle akcie</h2>
            <div class="mt-4 grid grid-cols-2 gap-3">
              <NuxtLink
                v-for="action in availableQuickActions"
                :key="action.label"
                :to="action.to"
                class="flex min-h-20 min-w-0 flex-col justify-between rounded-card border border-border bg-surface p-3 transition hover:border-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
              >
                <UIcon :name="action.icon" class="h-5 w-5 text-primary-800" />
                <span class="mt-3 break-words text-sm font-bold leading-tight">{{ action.label }}</span>
              </NuxtLink>
            </div>
          </section>

          <section class="border-t border-border pt-6" aria-labelledby="dashboard-closures-title">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase text-primary-800">Dostupnosť</p>
                <h2 id="dashboard-closures-title" class="mt-1 text-xl font-bold">Stav revíru</h2>
              </div>
              <UButton to="/admin/uzavierky" icon="i-heroicons-arrow-right" color="neutral" variant="ghost" aria-label="Otvoriť uzávierky" />
            </div>

            <div class="mt-4 grid grid-cols-2 gap-3 border-y border-border py-4">
              <div class="min-w-0">
                <p class="text-2xl font-bold">{{ blockedPegs.length }}</p>
                <p class="mt-1 text-xs text-foreground-muted">nedostupných miest</p>
              </div>
              <div class="min-w-0 border-l border-border pl-4">
                <p class="text-2xl font-bold">{{ activeClosureCount }}</p>
                <p class="mt-1 text-xs text-foreground-muted">práve platných uzávierok</p>
              </div>
            </div>

            <div v-if="upcomingClosures.length" class="divide-y divide-border">
              <NuxtLink
                v-for="closure in upcomingClosures"
                :key="closure.id"
                to="/admin/uzavierky"
                class="block py-4 transition hover:text-primary-800"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="break-words text-sm font-bold">{{ closure.title }}</p>
                    <p class="mt-1 text-xs text-foreground-muted">
                      {{ closure.lake === 'all' ? 'Všetky jazerá' : getLakeName(closure.lake) }} · {{ closureTimingLabel(closure.from, closure.to) }}
                    </p>
                  </div>
                  <StatusBadge
                    :icon="closure.from <= today && closure.to >= today ? 'i-heroicons-no-symbol' : 'i-heroicons-calendar-days'"
                    :label="closure.from <= today && closure.to >= today ? 'platí' : 'plánované'"
                    size="xs"
                    :tone="closure.from <= today && closure.to >= today ? 'warning' : 'neutral'"
                  />
                </div>
              </NuxtLink>
            </div>

            <p v-else class="mt-4 text-sm text-foreground-muted">
              Nie je naplánovaná žiadna ďalšia uzávierka ani interná blokácia.
            </p>
          </section>
        </aside>
      </div>
    </section>
  </div>
</template>
