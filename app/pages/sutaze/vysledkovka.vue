<script setup lang="ts">
import type { Sponsor, SponsorLogoVariant } from '~/data/pond'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import type { TournamentLeaderboardFeed, TournamentLeaderboardRow } from '~/utils/tournamentLeaderboard'
import { createTournamentLeaderboardFeed } from '~/utils/tournamentLeaderboard'

definePageMeta({
  layout: false,
})

useHead({ title: 'Priebežné výsledky' })

const route = useRoute()

const {
  getLakeName,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
} = usePondData()
const { activeSponsors } = await useSponsorState({ key: 'public-scoreboard-sponsor-state' })

const fallbackTournamentState = (): TournamentStateResponse =>
  createPublicTournamentStateResponse({
    tournamentCatches: seedTournamentCatches,
    tournamentMarshals: seedTournamentMarshals,
    tournamentPenalties: seedTournamentPenalties,
    tournamentRequests: seedTournamentRequests,
    tournamentRuleChecks: seedTournamentRuleChecks,
    tournamentTeamRegistrations: seedTournamentTeamRegistrations,
    tournaments: seedTournaments,
  }, 'seed')

const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'public-scoreboard-tournament-state',
  () => $fetch<TournamentStateResponse>('/api/tournaments'),
  {
    default: fallbackTournamentState,
  },
)

const liveTournaments = computed(() => tournamentState.value?.tournaments ?? seedTournaments)
const liveTournamentCatches = computed(() => tournamentState.value?.tournamentCatches ?? seedTournamentCatches)
const requestedTournamentId = computed(() =>
  Array.isArray(route.query.turnaj) ? route.query.turnaj[0] : route.query.turnaj,
)
const activeTournament = computed(() =>
  liveTournaments.value.find((tournament) => tournament.id === requestedTournamentId.value)
  ?? liveTournaments.value.find((tournament) => tournament.status === 'live')
  ?? liveTournaments.value[0]
  ?? seedTournaments[0]!,
)
const activeTournamentId = computed(() => activeTournament.value.id)
const selectedTournamentId = computed({
  get: () => activeTournamentId.value,
  set: (tournamentId: string) => {
    void navigateTo(
      {
        path: route.path,
        query: {
          ...route.query,
          turnaj: tournamentId,
        },
      },
      { replace: true },
    )
  },
})

const leaderboardFeedFallback = (): TournamentLeaderboardFeed =>
  createTournamentLeaderboardFeed(activeTournament.value, liveTournamentCatches.value)

const {
  data: leaderboardFeed,
  error: leaderboardError,
  refresh: refreshLeaderboard,
} = await useAsyncData<TournamentLeaderboardFeed>(
  'public-scoreboard-leaderboard-feed',
  () => $fetch<TournamentLeaderboardFeed>(`/api/tournaments/${activeTournamentId.value}/leaderboard`),
  {
    default: leaderboardFeedFallback,
    watch: [activeTournamentId],
  },
)

const refreshIntervalSeconds = 30
const isRefreshing = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined

const rows = computed(() => leaderboardFeed.value.rows)
const stats = computed(() => leaderboardFeed.value.stats)
const topRows = computed(() => rows.value.slice(0, 3))
const remainingRows = computed(() => rows.value.slice(3))
const teamCount = computed(() =>
  activeTournament.value.sectors.filter((sector) => Boolean(sector.team)).length,
)
const largestCatchRow = computed(() =>
  [...rows.value].sort((first, second) => second.largestCatchKg - first.largestCatchKg)[0],
)
const publicCompetitionUrl = computed(() => `/sutaze?turnaj=${encodeURIComponent(activeTournamentId.value)}`)
const tournamentOptions = computed(() =>
  liveTournaments.value.map((tournament) => ({
    id: tournament.id,
    label: `${tournament.name} · ${getLakeName(tournament.lake)}`,
  })),
)
const scoreboardSponsors = computed(() =>
  getSponsorsForPlacementWithFallback(
    activeSponsors.value,
    {
      placementType: 'scoreboard',
      tournamentId: activeTournamentId.value,
    },
    [{
      placementType: 'tournament',
      tournamentId: activeTournamentId.value,
    }],
  ),
)
const leaderGapLabel = computed(() => {
  const leader = rows.value[0]
  const runnerUp = rows.value[1]

  if (!leader || !runnerUp) {
    return 'bez porovnania'
  }

  return `${formatWeight(Number((leader.scoreWeightKg - runnerUp.scoreWeightKg).toFixed(1)))} kg`
})

const statusLabels = {
  closed: 'uzavreté',
  live: 'prebieha',
  planned: 'plánované',
} as const

const sponsorLogo = (sponsor: Sponsor, placementType: SponsorLogoVariant['placementType']) =>
  getSponsorLogo(sponsor, placementType)

const formatWeight = (value: number) =>
  value.toLocaleString('sk-SK', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  })

const formatTime = (value?: string) => {
  if (!value) return 'teraz'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleTimeString('sk-SK', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const statusClass = (status: string) => {
  switch (status) {
    case 'live':
      return 'bg-success-500 text-white'
    case 'planned':
      return 'bg-accent-400 text-primary-950'
    case 'closed':
      return 'bg-white/15 text-white'
    default:
      return 'bg-white/15 text-white'
  }
}

const podiumClass = (row: TournamentLeaderboardRow) => {
  if (row.rank === 1 && row.scoreWeightKg > 0) {
    return 'border-accent-300 bg-accent-300 text-primary-950'
  }

  if (row.rank === 2 && row.scoreWeightKg > 0) {
    return 'border-water-200 bg-water-100 text-primary-950'
  }

  if (row.rank === 3 && row.scoreWeightKg > 0) {
    return 'border-white/45 bg-white/15 text-white'
  }

  return 'border-white/20 bg-white/10 text-white'
}

const rowBadgeClass = (row: TournamentLeaderboardRow) =>
  row.rank === 1 && row.scoreWeightKg > 0
    ? 'bg-accent-300 text-primary-950'
    : 'bg-white/10 text-white'

async function refreshScoreboard() {
  isRefreshing.value = true

  try {
    await refreshTournamentState()
    await refreshLeaderboard()
  }
  finally {
    isRefreshing.value = false
  }
}

onMounted(() => {
  refreshTimer = setInterval(() => {
    void refreshScoreboard()
  }, refreshIntervalSeconds * 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<template>
  <main class="min-h-screen bg-primary-950 text-white">
    <div class="mx-auto flex min-h-screen max-w-[1800px] flex-col px-4 py-4 sm:px-6 lg:px-8">
      <header class="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex min-w-0 items-center gap-4">
          <NuxtLink
            to="/sutaze"
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white text-primary-950"
            aria-label="Rybolov Cetín"
          >
            <img src="/logo.svg" alt="" class="h-9 w-9">
          </NuxtLink>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-md px-2.5 py-1 text-xs font-black"
                :class="statusClass(activeTournament.status)"
              >
                {{ statusLabels[activeTournament.status] }}
              </span>
              <span class="rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold text-white/80">
                {{ getLakeName(activeTournament.lake) }}
              </span>
              <span class="rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold text-white/80">
                {{ activeTournament.dateRange }}
              </span>
            </div>
            <h1 class="mt-2 truncate text-2xl font-black sm:text-3xl lg:text-4xl">
              {{ activeTournament.name }}
            </h1>
          </div>
        </div>

        <div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:min-w-[520px]">
          <label class="block min-w-0">
            <span class="sr-only">Súťaž</span>
            <select
              v-model="selectedTournamentId"
              class="h-11 min-w-0 max-w-full w-full rounded-md border border-white/15 bg-white/10 px-3 text-sm font-bold text-white"
            >
              <option
                v-for="option in tournamentOptions"
                :key="option.id"
                :value="option.id"
                class="text-primary-950"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent-400 px-3 text-sm font-black text-primary-950 transition-colors hover:bg-accent-300 disabled:opacity-60"
            :disabled="isRefreshing"
            @click="refreshScoreboard"
          >
            <UIcon name="i-heroicons-arrow-path" class="h-4 w-4" :class="{ 'animate-spin': isRefreshing }" />
            Obnoviť
          </button>
        </div>
      </header>

      <section
        v-if="scoreboardSponsors.length > 0"
        class="border-b border-white/10 py-4"
      >
        <div class="flex items-center gap-3 overflow-x-auto pb-1">
          <div
            v-for="sponsor in scoreboardSponsors"
            :key="sponsor.id"
            class="flex h-14 min-w-52 items-center gap-3 rounded-md border border-white/10 bg-white px-3 text-primary-950"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
              <img
                v-if="sponsorLogo(sponsor, 'scoreboard').url"
                :src="sponsorLogo(sponsor, 'scoreboard').url"
                :alt="sponsorLogo(sponsor, 'scoreboard').alt"
                class="h-full w-full bg-white object-contain p-1"
              >
              <span v-else>{{ sponsorLogo(sponsor, 'scoreboard').text }}</span>
            </span>
            <span class="truncate text-sm font-black">{{ sponsor.name }}</span>
          </div>
        </div>
      </section>

      <section class="grid flex-1 gap-5 py-5 xl:grid-cols-[1fr_380px]">
        <div class="space-y-5">
          <div class="grid gap-4 lg:grid-cols-3">
            <article
              v-for="row in topRows"
              :key="row.sectorId"
              class="rounded-card border p-5"
              :class="podiumClass(row)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-sm font-black opacity-80">#{{ row.rank }} · {{ row.sectorLabel }}</p>
                  <h2 class="mt-2 truncate text-2xl font-black">{{ row.team }}</h2>
                </div>
                <span class="flex h-12 min-w-12 items-center justify-center rounded-md bg-primary-950 px-2 text-lg font-black text-white">
                  {{ row.rank }}.
                </span>
              </div>
              <p class="mt-6 text-5xl font-black leading-none">
                {{ formatWeight(row.scoreWeightKg) }} kg
              </p>
              <div class="mt-5 grid grid-cols-2 gap-2 text-sm">
                <div class="rounded-md bg-primary-950/10 p-2">
                  <p class="font-bold opacity-70">overené</p>
                  <p class="text-lg font-black">{{ row.verifiedCatchCount }}</p>
                </div>
                <div class="rounded-md bg-primary-950/10 p-2">
                  <p class="font-bold opacity-70">max</p>
                  <p class="text-lg font-black">{{ formatWeight(row.largestCatchKg) }}</p>
                </div>
              </div>
            </article>
          </div>

          <div class="overflow-hidden rounded-card border border-white/10 bg-white text-primary-950">
            <div class="grid grid-cols-[72px_1fr_110px] gap-3 border-b border-border bg-muted px-4 py-3 text-xs font-black text-foreground-muted sm:grid-cols-[80px_120px_1fr_120px_120px_130px]">
              <span>Poradie</span>
              <span class="hidden sm:block">Sektor</span>
              <span>Tím</span>
              <span class="text-right">Skóre</span>
              <span class="hidden text-right sm:block">Overené</span>
              <span class="hidden text-right sm:block">Najväčšia</span>
            </div>
            <div
              v-for="row in remainingRows"
              :key="row.sectorId"
              class="grid grid-cols-[72px_1fr_110px] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[80px_120px_1fr_120px_120px_130px]"
            >
              <span
                class="flex h-9 min-w-9 items-center justify-center rounded-md text-sm font-black"
                :class="rowBadgeClass(row)"
              >
                {{ row.rank }}.
              </span>
              <span class="hidden text-sm font-black sm:block">{{ row.sectorLabel }}</span>
              <div class="min-w-0">
                <p class="truncate font-black">{{ row.team }}</p>
                <p class="mt-0.5 text-xs font-semibold text-foreground-muted sm:hidden">
                  {{ row.sectorLabel }} · overené {{ row.verifiedCatchCount }} · max {{ formatWeight(row.largestCatchKg) }} kg
                </p>
              </div>
              <p class="text-right text-xl font-black">{{ formatWeight(row.scoreWeightKg) }} kg</p>
              <p class="hidden text-right text-sm font-bold text-success-700 sm:block">
                {{ row.verifiedCatchCount }} / {{ formatWeight(row.verifiedWeightKg) }} kg
              </p>
              <p class="hidden text-right text-sm font-bold sm:block">
                {{ formatWeight(row.largestCatchKg) }} kg
              </p>
            </div>
          </div>
        </div>

        <aside class="space-y-4">
          <div class="rounded-card border border-white/10 bg-white/10 p-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-white/70">Posledná obnova</p>
                <p class="mt-1 text-2xl font-black">{{ formatTime(leaderboardFeed.generatedAt) }}</p>
              </div>
              <span class="rounded-md bg-white px-3 py-1 text-xs font-black text-primary-950">
                {{ refreshIntervalSeconds }} s
              </span>
            </div>
            <p v-if="leaderboardError" class="mt-3 rounded-md bg-error-500 px-3 py-2 text-sm font-bold text-white">
              Výsledky sa nepodarilo obnoviť, zobrazujeme posledný dostupný stav.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-card border border-white/10 bg-white/10 p-4">
              <p class="text-sm font-bold text-white/70">Tímy</p>
              <p class="mt-2 text-3xl font-black">{{ teamCount }}</p>
            </div>
            <div class="rounded-card border border-white/10 bg-white/10 p-4">
              <p class="text-sm font-bold text-white/70">Skóre</p>
              <p class="mt-2 text-3xl font-black">{{ formatWeight(stats.totalScoreWeightKg) }}</p>
            </div>
            <div class="rounded-card border border-white/10 bg-white/10 p-4">
              <p class="text-sm font-bold text-white/70">Overené</p>
              <p class="mt-2 text-3xl font-black">{{ stats.totalVerifiedCatchCount }}</p>
            </div>
          </div>

          <div class="rounded-card border border-white/10 bg-white/10 p-5">
            <p class="text-sm font-bold text-white/70">Rozdiel lídra</p>
            <p class="mt-2 text-4xl font-black">{{ leaderGapLabel }}</p>
            <p class="mt-2 text-sm font-semibold text-white/70">
              {{ rows[0]?.team ?? 'bez lídra' }}
            </p>
          </div>

          <div class="rounded-card border border-white/10 bg-white/10 p-5">
            <p class="text-sm font-bold text-white/70">Najväčší úlovok</p>
            <p class="mt-2 text-4xl font-black">
              {{ formatWeight(largestCatchRow?.largestCatchKg ?? 0) }} kg
            </p>
            <p class="mt-2 text-sm font-semibold text-white/70">
              {{ largestCatchRow?.largestCatchSpecies ?? 'bez druhu' }} · {{ largestCatchRow?.team ?? 'bez tímu' }}
            </p>
          </div>

          <NuxtLink
            :to="publicCompetitionUrl"
            class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
          >
            <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
            Detail súťaže
          </NuxtLink>
        </aside>
      </section>
    </div>
  </main>
</template>
