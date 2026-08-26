<script setup lang="ts">
import type { MapStateResponse } from '~/services/mapApiService'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import {
  getMapShapePoints,
  getMapShapeStyle,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
} from '~/utils/map'

usePublicSeo({
  title: 'Súťaže',
  description: 'Rybárske súťaže, sektory, priebežné výsledky, registrácia tímu a organizačné informácie pre Veľký Cetín a Štrkovisko Kocka.',
})

const route = useRoute()
const { user } = useMockAuth()
const canViewCompetitionOperations = false

const {
  getLakeName,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  tournaments: seedTournaments,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentMarshalStatusLabels,
  tournamentPenalties: seedTournamentPenalties,
  tournamentPenaltyTypeLabels,
  tournamentRequests: seedTournamentRequests,
  tournamentRequestStatusLabels,
  tournamentRequestTypeLabels,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  tournamentTeamRegistrationStatusLabels,
} = usePondData()
const { activeSponsors } = await useSponsorState({ key: 'public-tournament-sponsor-state' })

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
  'public-tournament-state',
  () => $fetch<TournamentStateResponse>('/api/tournaments'),
  {
    default: fallbackTournamentState,
  },
)
const fallbackMapState = (): MapStateResponse => ({
  ok: true,
  mapFacilities,
  mapLayers,
  mapShapes,
  pegs,
  updatedAt: 'seed',
})
const { data: mapState } = await useAsyncData<MapStateResponse>(
  'public-tournament-map-state',
  () => $fetch<MapStateResponse>('/api/map'),
  {
    default: fallbackMapState,
  },
)

const {
  activeTeamCount,
  activeTournament,
  activeTournamentBackgroundImage,
  activeTournamentSectorShapes,
  canSubmitTeamRegistration,
  canSubmitTournamentRequest,
  canUseTeamPanel,
  canUseTeamRequestWorkflow,
  catchStatusIcon,
  catchStatusLabel,
  catchStatusTone,
  discardOfflineRequest,
  formatWeight,
  hasActivePenalty,
  hasMapShapeForSector,
  isOnline,
  leaderboardKioskUrl,
  leaderboardStats,
  liveTournamentCatches,
  liveTournamentMarshals,
  liveTournamentPenalties,
  liveTournamentRequests,
  liveTournamentRuleChecks,
  marshalById,
  marshalStatusIcon,
  marshalStatusTone,
  offlineRequestQueue,
  offlineSyncMessage,
  offlineSyncStatus,
  registrationStatusIcon,
  registrationStatusTone,
  requestForm,
  requestStatusIcon,
  requestStatusTone,
  requestSubmitMessage,
  requestSubmitStatus,
  requestTypeOptions,
  requestValidation,
  requestValidationMessages,
  requestsForSector,
  responsiveTournamentMapSources,
  scoreboardSponsors,
  sectorById,
  sectorMapCoverage,
  sectorSponsorEntries,
  selectedMarshal,
  selectedPreferredSector,
  selectedSector,
  sponsorLogo,
  submitRequest,
  submitTeamRegistration,
  syncOfflineRequestQueue,
  teamPanelTarget,
  teamRegistrationForm,
  teamRegistrationMessage,
  teamRegistrationStatus,
  teamRegistrationValidation,
  teamRegistrationValidationMessages,
  teamRequestSectors,
  tournamentLeaderboard,
  tournamentMapImageAttributes,
  tournamentMapObjectFit,
  tournamentSponsors,
  tournamentStatusIcon,
  tournamentStatusLabel,
  tournamentStatusTone,
  tournamentTeamRegistrations,
  teamScopedSector,
} = useTournamentPublic({
  activeSponsors,
  mapState,
  refreshTournamentState,
  route,
  tournamentState,
  user,
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Súťaže"
      title="Rybárske súťaže"
      description="Termíny, sektory, pravidlá, priebežné výsledky a prihlasovanie tímov na podujatia v revíri."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div class="border-border bg-surface overflow-hidden rounded-card border">
          <div class="border-border flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-primary-700 text-sm font-semibold">
                {{ getLakeName(activeTournament.lake) }} · {{ activeTournament.dateRange }}
              </p>
              <h2 class="text-2xl font-bold">{{ activeTournament.name }}</h2>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge
                :icon="tournamentStatusIcon(activeTournament.status)"
                :label="tournamentStatusLabel"
                :tone="tournamentStatusTone(activeTournament.status)"
              />
            </div>
          </div>

          <div class="bg-primary-950 relative aspect-[4/3] overflow-hidden">
            <svg
              class="absolute inset-0 h-full w-full"
              :viewBox="`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`"
              role="img"
              :aria-label="`Súťažná mapa ${activeTournament.name}`"
            >
              <foreignObject
                v-if="activeTournamentBackgroundImage && responsiveTournamentMapSources"
                :x="tournamentMapImageAttributes.x"
                :y="tournamentMapImageAttributes.y"
                :width="tournamentMapImageAttributes.width"
                :height="tournamentMapImageAttributes.height"
                :opacity="tournamentMapImageAttributes.opacity"
                aria-hidden="true"
              >
                <picture xmlns="http://www.w3.org/1999/xhtml" class="block h-full w-full">
                  <source
                    media="(min-width: 1024px)"
                    type="image/avif"
                    :srcset="responsiveTournamentMapSources.desktop.avif"
                  >
                  <source
                    type="image/avif"
                    :srcset="responsiveTournamentMapSources.mobile.avif"
                  >
                  <source
                    media="(min-width: 1024px)"
                    type="image/webp"
                    :srcset="responsiveTournamentMapSources.desktop.webp"
                  >
                  <source
                    type="image/webp"
                    :srcset="responsiveTournamentMapSources.mobile.webp"
                  >
                  <img
                    :src="activeTournamentBackgroundImage"
                    alt=""
                    class="block h-full w-full"
                    :style="{ objectFit: tournamentMapObjectFit }"
                    draggable="false"
                  >
                </picture>
              </foreignObject>
              <image
                v-else-if="activeTournamentBackgroundImage"
                :href="activeTournamentBackgroundImage"
                aria-hidden="true"
                :x="tournamentMapImageAttributes.x"
                :y="tournamentMapImageAttributes.y"
                :width="tournamentMapImageAttributes.width"
                :height="tournamentMapImageAttributes.height"
                :preserveAspectRatio="tournamentMapImageAttributes.preserveAspectRatio"
                :opacity="tournamentMapImageAttributes.opacity"
              />
              <g v-else>
                <rect width="100" height="75" fill="#d7f1ff" />
                <ellipse cx="50" cy="37.5" rx="42" ry="23" fill="#48b9f5" opacity="0.75" />
                <ellipse cx="50" cy="37.5" rx="21" ry="10" fill="#116199" opacity="0.22" />
              </g>

              <polygon
                v-for="shape in activeTournamentSectorShapes"
                :key="shape.id"
                :points="getMapShapePoints(shape)"
                :fill="getMapShapeStyle(shape.tone).fill"
                :stroke="getMapShapeStyle(shape.tone).stroke"
                :stroke-dasharray="shape.sectorId ? undefined : '2 1.4'"
                stroke-width="0.7"
              />

              <rect width="100" height="75" fill="url(#tournament-map-fade)" />
              <defs>
                <linearGradient id="tournament-map-fade" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#062523" stop-opacity="0" />
                  <stop offset="100%" stop-color="#062523" stop-opacity="0.38" />
                </linearGradient>
              </defs>
            </svg>
            <div
              v-for="sector in activeTournament.sectors"
              :key="sector.id"
              class="map-dot-shadow absolute flex h-12 min-w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md px-2 text-sm font-black ring-2 ring-white"
              :class="
                hasActivePenalty(sector.id)
                  ? 'bg-error-500 text-white'
                  : hasMapShapeForSector(sector.id)
                    ? 'bg-accent-400 text-primary-950 dark:text-primary-100'
                    : 'bg-white/90 text-primary-950 dark:text-primary-100'
              "
              :style="{ left: `${sector.x}%`, top: `${sector.y}%` }"
              :aria-label="sector.label"
            >
              {{ sector.label }}
              <span
                v-if="canViewCompetitionOperations && requestsForSector(sector.id).length"
                class="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1 text-xs text-error-700"
              >
                {{ requestsForSector(sector.id).length }}
              </span>
            </div>
            <div class="absolute right-4 bottom-4 rounded-md bg-primary-950/80 px-3 py-2 text-xs font-bold text-white backdrop-blur">
              {{ sectorMapCoverage.mappedSectorCount }}/{{ sectorMapCoverage.totalSectorCount }} sektorov
            </div>
          </div>

          <div
            v-if="tournamentSponsors.length > 0"
            class="border-t border-border bg-surface p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-bold uppercase text-primary-700">Partneri súťaže</p>
                <p class="text-foreground-muted mt-0.5 text-sm">Ďakujeme partnerom za podporu podujatia.</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="sponsor in tournamentSponsors"
                  :key="sponsor.id"
                  class="flex h-12 min-w-28 items-center gap-2 rounded-md border border-border bg-muted px-3"
                >
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
                    <img
                      v-if="sponsorLogo(sponsor, 'tournament').url"
                      :src="sponsorLogo(sponsor, 'tournament').url"
                      :alt="sponsorLogo(sponsor, 'tournament').alt"
                      class="h-full w-full bg-surface object-contain p-1"
                    >
                    <span v-else>{{ sponsorLogo(sponsor, 'tournament').text }}</span>
                  </span>
                  <span class="truncate text-xs font-bold">{{ sponsor.name }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="sectorSponsorEntries.length > 0"
            class="border-t border-border bg-primary-50 dark:bg-primary-950/50 p-4"
          >
            <p class="text-xs font-bold uppercase text-primary-700">Sektoroví partneri</p>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <div
                v-for="entry in sectorSponsorEntries"
                :key="entry.sector.id"
                class="flex items-center gap-2 rounded-md bg-surface px-3 py-2"
              >
                <span class="rounded-md bg-primary-900 px-2 py-1 text-xs font-black text-accent-300">
                  {{ entry.sector.label }}
                </span>
                <span class="truncate text-sm font-semibold">
                  {{ entry.sponsors.map((sponsor) => sponsor.name).join(', ') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Zapojené tímy</p>
              <p class="mt-2 text-3xl font-bold">{{ activeTeamCount }}</p>
            </div>
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Overené úlovky</p>
              <p class="mt-2 text-3xl font-bold">{{ leaderboardStats.totalVerifiedCatchCount }}</p>
            </div>
            <div class="border-border bg-surface rounded-card border p-5">
              <p class="text-foreground-muted text-sm">Priebežná váha</p>
              <p class="mt-2 text-3xl font-bold">{{ formatWeight(leaderboardStats.totalScoreWeightKg) }} kg</p>
            </div>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Priebežné výsledky</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Poradie podľa súťažného skóre zo sektorov.
                </p>
              </div>
              <div class="flex flex-col items-end gap-2">
                <StatusBadge
                  icon="i-heroicons-user-group"
                  :label="`${activeTeamCount} tímov`"
                  tone="success"
                />
                <NuxtLink
                  :to="leaderboardKioskUrl"
                  class="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent-100 px-2 text-xs font-bold text-accent-700 transition-colors hover:bg-accent-200"
                >
                  <UIcon name="i-heroicons-presentation-chart-bar" class="h-3.5 w-3.5" />
                  Celá výsledkovka
                </NuxtLink>
              </div>
            </div>

            <div class="mt-4 overflow-hidden rounded-md border border-border">
              <div
                v-for="row in tournamentLeaderboard"
                :key="row.sectorId"
                class="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border bg-surface px-3 py-3 last:border-b-0"
                :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-50' : ''"
              >
                <span
                  class="flex h-8 min-w-8 items-center justify-center rounded-md text-sm font-black"
                  :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-400 text-primary-950 dark:text-primary-100' : 'bg-muted text-foreground-muted'"
                >
                  {{ row.rank }}.
                </span>
                <div class="min-w-0">
                  <p class="truncate font-bold">{{ row.team }}</p>
                  <p class="text-foreground-muted mt-0.5 truncate text-xs">
                    {{ row.sectorLabel }} · {{ row.verifiedCatchCount }} overených úlovkov
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-black">{{ formatWeight(row.scoreWeightKg) }} kg</p>
                  <p class="text-foreground-muted text-xs">
                    max {{ formatWeight(row.largestCatchKg) }} kg
                  </p>
                </div>
              </div>
            </div>

            <p class="text-foreground-muted mt-3 text-xs">
              Do priebežného poradia sa započítavajú iba úlovky potvrdené kontrolórom.
            </p>
          </div>

          <div class="border-border bg-surface rounded-card border p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-bold">Prihlásiť tím</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Odošlite kontaktné údaje, počet členov a preferovaný sektor.
                </p>
              </div>
            </div>

            <form
              v-if="canSubmitTeamRegistration"
              class="mt-5 space-y-4"
              @submit.prevent="submitTeamRegistration"
            >
              <label class="block">
                <span class="text-sm font-semibold">Názov tímu</span>
                <input
                  v-model="teamRegistrationForm.teamName"
                  maxlength="120"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                  placeholder="Napr. Cetín Carp Juniors"
                >
              </label>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Kontaktná osoba</span>
                  <input
                    v-model="teamRegistrationForm.contactName"
                    maxlength="100"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                    placeholder="Meno a priezvisko"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Telefón</span>
                  <input
                    v-model="teamRegistrationForm.contactPhone"
                    maxlength="32"
                    inputmode="tel"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                    placeholder="+421..."
                  >
                </label>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">E-mail</span>
                  <input
                    v-model="teamRegistrationForm.contactEmail"
                    maxlength="120"
                    inputmode="email"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                    placeholder="voliteľné"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Počet členov</span>
                  <input
                    v-model.number="teamRegistrationForm.memberCount"
                    type="number"
                    min="1"
                    max="8"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                  >
                </label>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Mesto</span>
                  <input
                    v-model="teamRegistrationForm.city"
                    maxlength="80"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                    placeholder="voliteľné"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Preferovaný sektor</span>
                  <select
                    v-model="teamRegistrationForm.preferredSectorId"
                    class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                  >
                    <option value="">Bez preferencie</option>
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team || 'voľný' }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="teamRegistrationForm.note"
                  rows="3"
                  maxlength="500"
                  placeholder="Napr. preferovaný príchod, veková kategória, vybavenie..."
                  class="border-border mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                />
              </label>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">{{ selectedPreferredSector?.label ?? 'Bez preferencie sektora' }}</p>
                <p class="text-foreground-muted mt-1">
                  {{ selectedPreferredSector?.team ? `Aktuálne evidovaný tím: ${selectedPreferredSector.team}` : 'Organizátor sektor potvrdí po kontrole kapacity.' }}
                </p>
              </div>

              <ValidationSummary
                :messages="teamRegistrationValidationMessages"
                valid-title="Prihláška je pripravená"
                valid-description="Po odoslaní ju organizátor skontroluje a ozve sa kontaktnej osobe."
              />

              <DataStatusNotice
                v-if="teamRegistrationMessage"
                :description="teamRegistrationMessage"
                :loading="teamRegistrationStatus === 'submitting'"
                :title="
                  teamRegistrationStatus === 'error'
                    ? 'Prihlášku sa nepodarilo odoslať'
                    : teamRegistrationStatus === 'submitting'
                      ? 'Odosielam prihlášku'
                      : 'Prihláška je odoslaná'
                "
                :tone="
                  teamRegistrationStatus === 'error'
                    ? 'error'
                    : teamRegistrationStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

              <UButton
                type="submit"
                icon="i-heroicons-user-plus"
                block
                :disabled="!canSubmitTeamRegistration || !teamRegistrationValidation.success || teamRegistrationStatus === 'submitting'"
                :loading="teamRegistrationStatus === 'submitting'"
              >
                Odoslať prihlášku tímu
              </UButton>
            </form>

            <DataStatusNotice
              v-else
              class="mt-5"
              description="Informácie o prihlásení tímu vám poskytne organizátor súťaže."
              title="Online prihlásenie tímu nie je momentálne dostupné"
              tone="info"
            />

            <div v-if="canViewCompetitionOperations && tournamentTeamRegistrations.length > 0" class="mt-5 space-y-2">
              <div
                v-for="registration in tournamentTeamRegistrations.slice(0, 3)"
                :key="registration.id"
                class="rounded-md border border-border bg-surface p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-bold">{{ registration.teamName }}</p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ registration.contactName }} · {{ registration.memberCount }} členovia
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit shrink-0"
                    :icon="registrationStatusIcon(registration.status)"
                    :label="tournamentTeamRegistrationStatusLabels[registration.status]"
                    :tone="registrationStatusTone(registration.status)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-if="canUseTeamPanel" class="border-border bg-surface rounded-card border p-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Tímové hlásenie</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Rýchle hlásenie je naviazané na sektor tímového účtu. Plný tok nájdete v tímovom paneli.
                </p>
              </div>
              <UButton :to="teamPanelTarget" icon="i-heroicons-device-phone-mobile" size="sm" variant="soft">
                Otvoriť panel
              </UButton>
            </div>
            <div
              v-if="!isOnline || offlineRequestQueue.length > 0 || offlineSyncMessage"
              class="mt-4 space-y-3"
            >
              <DataStatusNotice
                :action-label="offlineRequestQueue.length > 0 && isOnline ? 'Odoslať' : ''"
                :action-loading="offlineSyncStatus === 'syncing'"
                :description="offlineSyncMessage || 'Pri výpadku signálu podržíme hlásenie v zariadení a odošleme ho hneď po návrate internetu.'"
                :icon="isOnline ? 'i-heroicons-cloud-arrow-up' : 'i-heroicons-signal-slash'"
                :loading="offlineSyncStatus === 'syncing'"
                :title="
                  !isOnline
                    ? 'Bez pripojenia pri sektore'
                    : offlineSyncStatus === 'syncing'
                      ? 'Odosielam offline hlásenia'
                      : 'Offline fronta hlásení'
                "
                :tone="
                  offlineSyncStatus === 'error' || !isOnline
                    ? 'warning'
                    : offlineSyncStatus === 'success'
                      ? 'success'
                      : 'info'
                "
                @action="syncOfflineRequestQueue()"
              />

              <div
                v-if="offlineRequestQueue.length > 0"
                class="space-y-2 rounded-md border border-border bg-muted/50 p-3"
              >
                <div
                  v-for="item in offlineRequestQueue"
                  :key="item.id"
                  class="flex items-start justify-between gap-3 rounded-md bg-white/70 px-3 py-2 text-sm text-foreground"
                >
                  <div class="min-w-0">
                    <p class="truncate font-bold">
                      {{ tournamentRequestTypeLabels[item.payload.type] }} ·
                      {{ sectorById(item.payload.sectorId)?.label ?? item.payload.sectorId }}
                    </p>
                    <p class="text-foreground-muted mt-0.5 text-xs">
                      {{ sectorById(item.payload.sectorId)?.team ?? 'tím čaká na synchronizáciu' }}
                    </p>
                    <p v-if="item.lastError" class="mt-1 text-xs font-semibold text-error-700">
                      {{ item.lastError }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="text-foreground-muted hover:text-error-700 shrink-0 rounded-md p-1"
                    aria-label="Odstrániť offline hlásenie"
                    @click="discardOfflineRequest(item.id)"
                  >
                    <UIcon name="i-heroicons-trash" class="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <form
              v-if="canSubmitTournamentRequest"
              class="mt-5 space-y-4"
              @submit.prevent="submitRequest"
            >
              <label class="block">
                <span class="text-sm font-semibold">Sektor tímu</span>
                <select
                  v-model="requestForm.sectorId"
                  :disabled="Boolean(teamScopedSector)"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                >
                  <option v-for="sector in teamRequestSectors" :key="sector.id" :value="sector.id">
                    {{ sector.label }} · {{ sector.team }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <select
                  v-model="requestForm.type"
                  class="border-border mt-1 h-11 w-full rounded-md border bg-surface px-3 text-sm"
                >
                  <option v-for="[value, label] in requestTypeOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="requestForm.description"
                  rows="3"
                  placeholder="Napr. úlovok pripravený na váženie pri sektore..."
                  class="border-border mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                />
              </label>

              <div class="rounded-md bg-muted p-4 text-sm">
                <p class="font-bold">{{ selectedSector?.team }}</p>
                <p class="text-foreground-muted mt-1">
                  Sektor {{ selectedSector?.label }} · kontrolór
                  {{ selectedMarshal?.name ?? 'bude priradený dispečingom' }}
                </p>
              </div>

              <ValidationSummary
                :messages="requestValidationMessages"
                valid-title="Hlásenie je pripravené"
                valid-description="Dispečing dostane sektor, typ udalosti a prípadnú poznámku."
              />

              <DataStatusNotice
                v-if="requestSubmitMessage"
                :description="requestSubmitMessage"
                :loading="requestSubmitStatus === 'submitting'"
                :title="
                  requestSubmitStatus === 'error'
                    ? 'Hlásenie sa nepodarilo odoslať'
                    : requestSubmitStatus === 'submitting'
                      ? 'Odosielam hlásenie'
                      : 'Hlásenie je odoslané'
                "
                :tone="
                  requestSubmitStatus === 'error'
                    ? 'error'
                    : requestSubmitStatus === 'submitting'
                      ? 'info'
                      : 'success'
                "
              />

              <UButton
                type="submit"
                icon="i-heroicons-paper-airplane"
                block
                :disabled="!canUseTeamRequestWorkflow || !requestValidation.success || requestSubmitStatus === 'submitting'"
                :loading="requestSubmitStatus === 'submitting'"
              >
                Odoslať hlásenie
              </UButton>
            </form>
            <DataStatusNotice
              v-else
              class="mt-5"
              description="Pokyny pre tímy poskytne organizátor pred začiatkom súťaže."
              title="Tímové hlásenia cez aplikáciu nie sú zapnuté"
              tone="info"
            />
          </div>

          <div v-if="canViewCompetitionOperations" class="border-border bg-surface rounded-card border p-5">
            <h2 class="text-lg font-bold">Kontrolóri a sektory</h2>
            <div class="mt-4 space-y-3">
              <div
                v-for="marshal in liveTournamentMarshals"
                :key="marshal.id"
                class="rounded-md border border-border bg-surface p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map((id) => sectorById(id)?.label ?? id).join(', ') }}
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit shrink-0"
                    :icon="marshalStatusIcon(marshal.status)"
                    :label="tournamentMarshalStatusLabels[marshal.status]"
                    :tone="marshalStatusTone(marshal.status)"
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div v-if="canViewCompetitionOperations" class="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Požiadavky tímov</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="request in liveTournamentRequests"
              :key="request.id"
              class="rounded-md border border-border bg-surface p-4"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">
                    {{ sectorById(request.sectorId)?.label }} · {{ request.team }}
                  </p>
                  <p class="text-primary-800 dark:text-primary-200 text-sm font-semibold">
                    {{ tournamentRequestTypeLabels[request.type] }}
                  </p>
                </div>
                <StatusBadge
                  class="w-fit"
                  :icon="requestStatusIcon(request.status)"
                  :label="tournamentRequestStatusLabels[request.status]"
                  :tone="requestStatusTone(request.status)"
                />
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{{ request.createdAt }}</span>
                <span v-if="request.assignedMarshalId">
                  kontrolór {{ marshalById(request.assignedMarshalId)?.name }}
                </span>
                <span v-if="request.priority === 'high'" class="font-bold text-error-700">
                  priorita
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Meranie a evidencia úlovkov</h2>
              <p class="text-foreground-muted mt-1 text-sm">Vo výsledkoch sa zobrazujú iba úlovky potvrdené kontrolórom.</p>
            </div>
            <div
              v-if="scoreboardSponsors.length > 0"
              class="flex flex-wrap gap-2 sm:justify-end"
            >
              <div
                v-for="sponsor in scoreboardSponsors"
                :key="sponsor.id"
                class="flex h-10 min-w-24 items-center gap-2 rounded-md border border-border bg-surface px-2"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-primary-900 text-[10px] font-black text-accent-300">
                  <img
                    v-if="sponsorLogo(sponsor, 'scoreboard').url"
                    :src="sponsorLogo(sponsor, 'scoreboard').url"
                    :alt="sponsorLogo(sponsor, 'scoreboard').alt"
                    class="h-full w-full bg-surface object-contain p-0.5"
                  >
                  <span v-else>{{ sponsorLogo(sponsor, 'scoreboard').text }}</span>
                </span>
                <span class="truncate text-[11px] font-bold">{{ sponsor.name }}</span>
              </div>
            </div>
          </div>
          <div class="mt-4 overflow-hidden rounded-md border border-border">
            <div
              v-for="catchItem in liveTournamentCatches"
              :key="catchItem.id"
              class="grid gap-3 border-b border-border bg-surface p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <p class="font-bold">
                  {{ catchItem.team }} · {{ sectorById(catchItem.sectorId)?.label }}
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
                </p>
                <p class="text-foreground-muted mt-1 text-sm">
                  Chytené {{ catchItem.caughtAt }} · merané {{ catchItem.measuredAt }}
                </p>
                <p class="text-foreground-muted mt-2 text-xs">{{ catchItem.notes }}</p>
              </div>
              <div class="flex flex-row items-center gap-2 md:flex-col md:items-end">
                <StatusBadge
                  class="w-fit"
                  :icon="catchStatusIcon(catchItem.status)"
                  :label="catchStatusLabel(catchItem.status)"
                  :tone="catchStatusTone(catchItem.status)"
                />
                <span class="text-foreground-muted text-xs">
                  {{ marshalById(catchItem.verifiedByMarshalId)?.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="canViewCompetitionOperations" class="mt-8 grid gap-6 lg:grid-cols-2">
        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Tresty a napomenutia</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="penalty in liveTournamentPenalties"
              :key="penalty.id"
              class="rounded-md border border-border bg-surface p-4"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">
                    {{ sectorById(penalty.sectorId)?.label }} · {{ penalty.team }}
                  </p>
                  <p class="text-error-700 text-sm font-semibold">
                    {{ tournamentPenaltyTypeLabels[penalty.type] }}
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold">
                  {{ penalty.status === 'active' ? 'aktívne' : 'uzavreté' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ penalty.reason }}</p>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>{{ penalty.issuedAt }}</span>
                <span>kontrolór {{ marshalById(penalty.issuedByMarshalId)?.name }}</span>
                <span v-if="penalty.durationHours">{{ penalty.durationHours }} h</span>
                <span v-if="penalty.rodsLess">-{{ penalty.rodsLess }} prút</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-border bg-surface rounded-card border p-5">
          <h2 class="text-lg font-bold">Kontroly pravidiel</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="check in liveTournamentRuleChecks"
              :key="check.id"
              class="rounded-md border border-border bg-surface p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-bold">
                    {{ sectorById(check.sectorId)?.label }} · {{ marshalById(check.marshalId)?.name }}
                  </p>
                  <p class="text-foreground-muted text-sm">{{ check.checkedAt }}</p>
                </div>
                <span
                  class="rounded-md px-2.5 py-1 text-xs font-bold"
                  :class="
                    check.result === 'ok'
                      ? 'bg-success-500/10 text-success-700'
                      : check.result === 'warning'
                        ? 'bg-warning-500/10 text-warning-700'
                        : 'bg-error-500/10 text-error-700'
                  "
                >
                  {{ check.result === 'ok' ? 'OK' : check.result === 'warning' ? 'napomenutie' : 'trest' }}
                </span>
              </div>
              <p class="text-foreground-muted mt-3 text-sm">{{ check.note }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
