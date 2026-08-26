<script setup lang="ts">
import type { Tournament } from '~/data/pond'
import type { MapStateResponse } from '~/services/mapApiService'
import type { TournamentStateResponse } from '~/services/tournamentApiService'
import { tournamentOperationsModeOptions } from '~/utils/tournamentOperations'

useHead({ title: 'Admin súťaže' })

const route = useRoute()
const router = useRouter()

const tournamentStatusLabels: Record<Tournament['status'], string> = {
  closed: 'ukončená',
  live: 'prebieha',
  planned: 'plánovaná',
}

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
const { activeSponsors } = await useSponsorState({ key: 'admin-tournament-sponsor-preview-state' })

const fallbackTournamentState = (): TournamentStateResponse => ({
  ok: true,
  tournamentCatches: seedTournamentCatches,
  tournamentMarshals: seedTournamentMarshals,
  tournamentPenalties: seedTournamentPenalties,
  tournamentRequests: seedTournamentRequests,
  tournamentRuleChecks: seedTournamentRuleChecks,
  tournamentTeamRegistrations: seedTournamentTeamRegistrations,
  tournaments: seedTournaments,
  updatedAt: 'seed',
})
const requestFetch = useRequestFetch()
const { data: tournamentState, refresh: refreshTournamentState } = await useAsyncData<TournamentStateResponse>(
  'admin-tournament-state',
  () => requestFetch<TournamentStateResponse>('/api/admin/tournaments'),
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
  'admin-tournament-map-state',
  async () => {
    try {
      return await requestFetch<MapStateResponse>('/api/admin/map')
    }
    catch {
      return await $fetch<MapStateResponse>('/api/map')
    }
  },
  {
    default: fallbackMapState,
  },
)
const {
  canOperate: canOperateTournaments,
  isReadOnly: tournamentsReadOnly,
  label: tournamentAccessLabel,
  readOnlyMessage: tournamentReadOnlyMessage,
} = useAdminModuleAccess('tournaments')

const {
  actionMessage,
  actionNoticeTitle,
  actionNoticeTone,
  actionStatus,
  activeActionId,
  activePenalties,
  activeRequests,
  activeTournament,
  activeTournamentAdminView,
  activeTournamentAdminViewOption,
  activeTournamentSectorShapes,
  approvedTeamRegistrations,
  canUseTournamentDispatch,
  catchStatusIcon,
  catchStatusLabel,
  catchStatusTone,
  copyTeamAccessRows,
  discardOfflineAdminAction,
  downloadTeamAccessCsv,
  expandedTournamentSectorId,
  formatDateTime,
  formatWeight,
  getOfflineAdminActionLabel,
  getOfflineAdminActionTarget,
  handleTournamentAdminTabsKeydown,
  isOnline,
  leaderboardExportUrl,
  leaderboardFeedUrl,
  leaderboardKioskUrl,
  leaderboardStats,
  liveTournamentMarshals,
  liveTournaments,
  mapSourceSummary,
  mapSourceSummaryIcon,
  mapSourceSummaryTone,
  marshalName,
  marshalsForSector,
  marshalStatusIcon,
  marshalStatusTone,
  offlineAdminActionCount,
  offlineAdminActionQueue,
  offlineAdminNoticeDescription,
  offlineAdminNoticeIcon,
  offlineAdminNoticeTitle,
  offlineAdminNoticeTone,
  offlineAdminSyncMessage,
  offlineAdminSyncStatus,
  operationsModeIcon,
  operationsModeMessage,
  operationsModeNoticeTitle,
  operationsModeNoticeTone,
  operationsModeStatus,
  operationsModeTone,
  organizerExportUrl,
  penaltyForm,
  penaltyTypeOptions,
  penaltyValidation,
  penaltyValidationMessages,
  registrationDecisionDraft,
  registrationStatusIcon,
  registrationStatusTone,
  requestStatusIcon,
  requestStatusTone,
  ruleCheckForm,
  ruleCheckResultOptions,
  ruleCheckValidation,
  ruleCheckValidationMessages,
  saveSectorSettings,
  saveTournamentOperationsMode,
  sectorDraft,
  sectorLabel,
  sectorMapCoverage,
  sectorMapRowIcon,
  sectorMapRows,
  sectorMapRowTone,
  sectorMapStatus,
  sectorOptionLabel,
  sectorSettingsMessage,
  sectorSettingsNoticeTitle,
  sectorSettingsNoticeTone,
  sectorSettingsStatus,
  sectorSettingsValidation,
  sectorSettingsValidationMessages,
  selectTournamentAdminView,
  setRegistrationDecisionNote,
  setRegistrationDecisionSector,
  sponsorLogo,
  submitPenalty,
  submitRequestAction,
  submitRuleCheck,
  submittedTeamRegistrations,
  submitTeamRegistrationDecision,
  syncOfflineAdminActionQueue,
  teamAccessRows,
  teamAccessShareMessage,
  teamAccessShareNoticeTitle,
  teamAccessShareNoticeTone,
  toggleTournamentSector,
  tournamentAdminTabsRef,
  tournamentAdminViewOptions,
  tournamentCapabilities,
  tournamentCatches,
  tournamentDispatchAttentionCount,
  tournamentLeaderboard,
  tournamentMapEditorUrl,
  tournamentMarshalAccessUrl,
  tournamentPenalties,
  tournamentRequests,
  tournamentRuleChecks,
  tournamentSectorMapEditorUrl,
  tournamentSponsorSlots,
  tournamentTeamAccessUrl,
  tournamentTeamRegistrations,
  updateActiveTournament,
  verifyCatch,
  waitingCatches,
  waitlistedTeamRegistrations,
} = useAdminTournamentDispatch({
  activeSponsors,
  canOperateTournaments,
  mapState,
  refreshTournamentState,
  route,
  router,
  tournamentReadOnlyMessage,
  tournamentState,
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Správa súťaží"
      description="Tímy, sektory, výsledky a živá prevádzka pretekov na jednom mieste."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="tournamentsReadOnly"
        class="mb-5"
        :description="tournamentReadOnlyMessage"
        icon="i-heroicons-lock-closed"
        :title="`Režim prístupu: ${tournamentAccessLabel}`"
        tone="info"
      />

      <div
        v-if="!isOnline || offlineAdminActionCount > 0 || offlineAdminSyncMessage"
        class="mb-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <DataStatusNotice
            class="min-w-0 flex-1"
            :description="offlineAdminNoticeDescription"
            :icon="offlineAdminNoticeIcon"
            :loading="offlineAdminSyncStatus === 'syncing'"
            :title="offlineAdminNoticeTitle"
            :tone="offlineAdminNoticeTone"
          />
          <UButton
            v-if="offlineAdminActionCount > 0"
            icon="i-heroicons-cloud-arrow-up"
            size="sm"
            :disabled="!isOnline || offlineAdminSyncStatus === 'syncing'"
            :loading="offlineAdminSyncStatus === 'syncing'"
            @click="syncOfflineAdminActionQueue()"
          >
            Odoslať {{ offlineAdminActionCount }}
          </UButton>
        </div>

        <div v-if="offlineAdminActionQueue.length > 0" class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="item in offlineAdminActionQueue"
            :key="item.id"
            class="rounded-md border border-white/70 bg-white/80 p-3 text-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-bold">{{ getOfflineAdminActionLabel(item) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ getOfflineAdminActionTarget(item) }} · {{ formatDateTime(item.createdAt) }}
                </p>
              </div>
              <button
                type="button"
                class="text-error-700 hover:text-error-900"
                aria-label="Odstrániť kontrolórsky offline úkon"
                @click="discardOfflineAdminAction(item.id)"
              >
                <UIcon name="i-heroicons-trash" class="h-4 w-4" />
              </button>
            </div>
            <DataStatusNotice
              v-if="item.lastError"
              class="mt-3"
              description="Skontroluj súťažný stav, sektor, kontrolóra alebo konkrétny úlovok."
              icon="i-heroicons-exclamation-triangle"
              :title="item.lastError"
              tone="error"
            />
          </div>
        </div>
      </div>

      <div class="mb-6 border-b border-border pb-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="min-w-0 flex-1">
            <label for="active-tournament" class="text-xs font-bold uppercase text-foreground-muted">
              Aktívna súťaž
            </label>
            <select
              id="active-tournament"
              :value="activeTournament.id"
              class="mt-1 h-11 w-full max-w-xl rounded-md border border-border bg-surface px-3 text-sm font-bold"
              @change="updateActiveTournament"
            >
              <option v-for="tournament in liveTournaments" :key="tournament.id" :value="tournament.id">
                {{ tournament.name }}
              </option>
            </select>
            <div class="text-foreground-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-heroicons-map-pin" class="h-4 w-4" />
                {{ getLakeName(activeTournament.lake) }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-heroicons-calendar-days" class="h-4 w-4" />
                {{ activeTournament.dateRange }}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <UIcon name="i-heroicons-signal" class="h-4 w-4" />
                {{ tournamentStatusLabels[activeTournament.status] }}
              </span>
            </div>
          </div>
          <UButton
            v-if="activeTournamentAdminView !== 'dispecing' && tournamentDispatchAttentionCount > 0"
            icon="i-heroicons-radio"
            size="sm"
            variant="soft"
            @click="selectTournamentAdminView('dispecing')"
          >
            Otvoriť dispečing ({{ tournamentDispatchAttentionCount }})
          </UButton>
          <UButton
            v-else-if="activeTournamentAdminView !== 'prihlasky' && submittedTeamRegistrations.length > 0"
            icon="i-heroicons-inbox-arrow-down"
            size="sm"
            variant="soft"
            @click="selectTournamentAdminView('prihlasky')"
          >
            Nové prihlášky ({{ submittedTeamRegistrations.length }})
          </UButton>
        </div>

        <div
          ref="tournamentAdminTabsRef"
          class="mt-5 flex snap-x gap-1 overflow-x-auto rounded-md bg-muted p-1"
          role="tablist"
          aria-label="Sekcie správy súťaže"
          @keydown="handleTournamentAdminTabsKeydown"
        >
          <button
            v-for="option in tournamentAdminViewOptions"
            :key="option.id"
            type="button"
            role="tab"
            class="flex h-10 shrink-0 snap-center items-center justify-center gap-2 rounded px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="activeTournamentAdminView === option.id
              ? 'bg-surface text-primary-900 dark:text-primary-100 shadow-sm'
              : 'text-foreground-muted hover:bg-white/70 hover:text-foreground'"
            :aria-selected="activeTournamentAdminView === option.id"
            :tabindex="activeTournamentAdminView === option.id ? 0 : -1"
            :data-tournament-admin-view="option.id"
            @click="selectTournamentAdminView(option.id)"
          >
            <UIcon :name="option.icon" class="h-4 w-4" />
            {{ option.label }}
          </button>
        </div>
        <p class="text-foreground-muted mt-2 text-sm" aria-live="polite">
          {{ activeTournamentAdminViewOption.description }}
        </p>
      </div>

      <div
        v-if="activeTournamentAdminView === 'prehlad'"
        class="mb-5 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Režim používania súťaže</h2>
            <p class="text-foreground-muted mt-1 text-sm">{{ tournamentCapabilities.description }}</p>
          </div>
          <StatusBadge
            class="w-fit"
            :icon="operationsModeIcon(tournamentCapabilities.mode)"
            :label="tournamentCapabilities.label"
            :tone="operationsModeTone(tournamentCapabilities.mode)"
          />
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <button
            v-for="option in tournamentOperationsModeOptions"
            :key="option.value"
            type="button"
            class="rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            :class="option.value === tournamentCapabilities.mode
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/50 text-primary-950 dark:text-primary-100'
              : 'border-border bg-surface hover:border-primary-300'"
            :disabled="!canOperateTournaments || operationsModeStatus === 'saving'"
            @click="saveTournamentOperationsMode(option.value)"
          >
            <span class="block text-sm font-black">{{ option.label }}</span>
            <span class="text-foreground-muted mt-1 block text-xs">{{ option.description }}</span>
          </button>
        </div>

        <DataStatusNotice
          v-if="operationsModeMessage"
          class="mt-4"
          :description="operationsModeMessage"
          :title="operationsModeNoticeTitle"
          :tone="operationsModeNoticeTone"
        />
      </div>

      <div v-if="activeTournamentAdminView === 'prehlad'" class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Aktívne hlásenia</p>
          <p class="mt-2 text-2xl font-bold">{{ activeRequests.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Nové prihlášky</p>
          <p class="mt-2 text-2xl font-bold">{{ submittedTeamRegistrations.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Čaká na váženie</p>
          <p class="mt-2 text-2xl font-bold">{{ waitingCatches.length }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Aktívne tresty</p>
          <p class="mt-2 text-2xl font-bold">{{ activePenalties.length }}</p>
        </div>
        <div class="col-span-2 rounded-card border border-border bg-surface p-3 sm:p-4 lg:col-span-1">
          <p class="text-foreground-muted text-sm">Kontrolóri</p>
          <p class="mt-2 text-2xl font-bold">{{ liveTournamentMarshals.length }}</p>
        </div>
      </div>

      <div v-if="activeTournamentAdminView === 'prehlad'" class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Live výsledkovka</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Operačné poradie tímov podľa uložených sektorových váh a overovacích stavov úlovkov.
            </p>
          </div>
          <div class="flex flex-col gap-3">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">skóre</p>
                <p class="font-black">{{ formatWeight(leaderboardStats.totalScoreWeightKg) }} kg</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">aktívne</p>
                <p class="font-black">{{ leaderboardStats.activeTeamCount }}</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xs font-semibold text-foreground-muted">čaká</p>
                <p class="font-black">{{ leaderboardStats.pendingReviewCatchCount }}</p>
              </div>
            </div>
            <div class="flex flex-wrap justify-start gap-2 lg:justify-end">
              <a
                :href="leaderboardExportUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-50 dark:bg-primary-950/50 px-3 text-sm font-bold text-primary-800 dark:text-primary-200 transition-colors hover:bg-primary-100"
              >
                <UIcon name="i-heroicons-arrow-down-tray" class="h-4 w-4" />
                Stiahnuť výsledkovku
              </a>
              <a
                :href="organizerExportUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-900 px-3 text-sm font-bold text-white transition-colors hover:bg-primary-800"
              >
                <UIcon name="i-heroicons-document-arrow-down" class="h-4 w-4" />
                Podklady pre organizátora
              </a>
              <a
                :href="leaderboardFeedUrl"
                target="_blank"
                rel="noopener"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-sm font-bold text-foreground transition-colors hover:bg-border"
              >
                <UIcon name="i-heroicons-rss" class="h-4 w-4" />
                Zdroj výsledkov
              </a>
              <NuxtLink
                :to="leaderboardKioskUrl"
                class="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-100 px-3 text-sm font-bold text-accent-700 transition-colors hover:bg-accent-200"
              >
                <UIcon name="i-heroicons-presentation-chart-bar" class="h-4 w-4" />
                Kiosk
              </NuxtLink>
            </div>
          </div>
        </div>

        <p
          v-if="tournamentLeaderboard.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Poradie sa zobrazí po pridaní sektorov a prvých súťažných výsledkov.
        </p>
        <div v-else class="mt-4 overflow-hidden rounded-md border border-border">
          <div
            v-for="row in tournamentLeaderboard"
            :key="row.sectorId"
            class="grid gap-3 border-b border-border bg-surface p-3 last:border-b-0 sm:grid-cols-[auto_1fr_auto_auto]"
            :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-50' : ''"
          >
            <span
              class="flex h-9 min-w-9 items-center justify-center rounded-md text-sm font-black"
              :class="row.rank === 1 && row.scoreWeightKg > 0 ? 'bg-accent-400 text-primary-950 dark:text-primary-100' : 'bg-muted text-foreground-muted'"
            >
              {{ row.rank }}.
            </span>
            <div class="min-w-0">
              <p class="truncate font-bold">{{ row.team }}</p>
              <p class="text-foreground-muted mt-0.5 truncate text-xs">
                {{ row.sectorLabel }} · najväčšia {{ formatWeight(row.largestCatchKg) }} kg
              </p>
            </div>
            <div class="flex flex-wrap gap-1.5 sm:justify-end">
              <StatusBadge
                icon="i-heroicons-check-circle"
                :label="`overené ${row.verifiedCatchCount}`"
                size="xs"
                tone="success"
              />
              <StatusBadge
                icon="i-heroicons-clock"
                :label="`čaká ${row.pendingCatchCount + row.disputedCatchCount}`"
                size="xs"
                tone="warning"
              />
            </div>
            <div class="text-right">
              <p class="text-lg font-black">{{ formatWeight(row.scoreWeightKg) }} kg</p>
              <p class="text-foreground-muted text-xs">úlovky {{ formatWeight(row.catchDerivedWeightKg) }} kg</p>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'prihlasky'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Prihlášky tímov</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Kontakty tímov, preferované sektory a rozhodnutie organizátora na jednom mieste.
            </p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-xs font-semibold text-foreground-muted">nové</p>
              <p class="font-black">{{ submittedTeamRegistrations.length }}</p>
            </div>
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-xs font-semibold text-foreground-muted">schválené</p>
              <p class="font-black">{{ approvedTeamRegistrations.length }}</p>
            </div>
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-xs font-semibold text-foreground-muted">poradovník</p>
              <p class="font-black">{{ waitlistedTeamRegistrations.length }}</p>
            </div>
          </div>
        </div>

        <DataStatusNotice
          v-if="tournamentTeamRegistrations.length === 0"
          class="mt-4"
          description="Keď tím odošle prihlášku, objaví sa tu na posúdenie organizátorom."
          icon="i-heroicons-inbox"
          title="Zatiaľ bez prihlášok"
          tone="info"
        />

        <div v-else class="mt-4 grid gap-3 xl:grid-cols-2">
          <div
            v-for="registration in tournamentTeamRegistrations"
            :key="registration.id"
            class="rounded-md border border-border bg-surface p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-base font-bold">{{ registration.teamName }}</h3>
                  <StatusBadge
                    class="w-fit"
                    :icon="registrationStatusIcon(registration.status)"
                    :label="tournamentTeamRegistrationStatusLabels[registration.status]"
                    :tone="registrationStatusTone(registration.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ registration.contactName }} · {{ registration.contactPhone }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ registration.contactEmail || 'bez e-mailu' }} · {{ registration.city || 'bez mesta' }} ·
                  {{ registration.memberCount }} členovia
                </p>
              </div>
              <div class="text-left text-xs text-foreground-muted sm:text-right">
                <p class="font-semibold text-foreground">Preferencia</p>
                <p>{{ sectorOptionLabel(registration.preferredSectorId) }}</p>
                <p v-if="registration.assignedSectorId" class="mt-1 font-semibold text-success-700">
                  {{ sectorOptionLabel(registration.assignedSectorId) }}
                </p>
              </div>
            </div>

            <p v-if="registration.note" class="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground-muted">
              {{ registration.note }}
            </p>

            <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <label class="block">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Schváliť do sektora</span>
                <select
                  :value="registrationDecisionDraft(registration.id).assignedSectorId"
                  :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  @change="setRegistrationDecisionSector(registration.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">Vybrať sektor</option>
                  <option
                    v-for="sector in activeTournament.sectors"
                    :key="sector.id"
                    :value="sector.id"
                  >
                    {{ sector.label }} · {{ sector.team || 'voľný' }}
                  </option>
                </select>
              </label>
              <label class="block">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Poznámka pre rozhodnutie</span>
                <input
                  :value="registrationDecisionDraft(registration.id).reviewNote"
                  :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                  maxlength="500"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  placeholder="voliteľné"
                  @input="setRegistrationDecisionNote(registration.id, ($event.target as HTMLInputElement).value)"
                >
              </label>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                size="sm"
                icon="i-heroicons-check"
                variant="soft"
                :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                :loading="activeActionId === `${registration.id}:approve`"
                @click="submitTeamRegistrationDecision(registration, 'approve')"
              >
                Schváliť
              </UButton>
              <UButton
                size="sm"
                icon="i-heroicons-clock"
                color="neutral"
                variant="soft"
                :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                :loading="activeActionId === `${registration.id}:waitlist`"
                @click="submitTeamRegistrationDecision(registration, 'waitlist')"
              >
                Poradovník
              </UButton>
              <UButton
                size="sm"
                icon="i-heroicons-x-mark"
                color="error"
                variant="soft"
                :disabled="!canOperateTournaments || actionStatus === 'submitting'"
                :loading="activeActionId === `${registration.id}:reject`"
                @click="submitTeamRegistrationDecision(registration, 'reject')"
              >
                Zamietnuť
              </UButton>
            </div>

            <p v-if="registration.reviewNote" class="text-foreground-muted mt-3 text-xs">
              Posledná poznámka: {{ registration.reviewNote }}
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'sektory'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Mapové pokrytie sektorov</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Sektorové plochy sú prepojené s mapou revíru. Nepublikované úpravy vidí iba organizátor.
            </p>
            <p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <StatusBadge
                :icon="mapSourceSummaryIcon(mapSourceSummary.tone)"
                :label="mapSourceSummary.label"
                :tone="mapSourceSummaryTone(mapSourceSummary.tone)"
              />
              <span>{{ mapSourceSummary.description }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <StatusBadge
              icon="i-heroicons-squares-2x2"
              :label="`${sectorMapCoverage.mappedSectorCount}/${sectorMapCoverage.totalSectorCount}`"
              tone="primary"
            />
            <UButton :to="tournamentMapEditorUrl" icon="i-heroicons-map" variant="soft" size="sm">
              Editor mapy
            </UButton>
          </div>
        </div>
        <p
          v-if="sectorMapRows.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Súťaž zatiaľ nemá vytvorené sektory. Pridajte ich pred kreslením polygonov v mape.
        </p>
        <div v-else class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="row in sectorMapRows"
            :key="row.sector.id"
            class="rounded-md border border-border bg-surface px-3 py-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-bold">{{ row.sector.label }}</p>
              <StatusBadge
                class="shrink-0"
                :icon="sectorMapRowIcon(row.mapped)"
                :label="row.mapped ? 'polygon' : 'iba bod'"
                size="xs"
                :tone="sectorMapRowTone(row.mapped)"
              />
            </div>
            <p class="text-foreground-muted mt-1 truncate text-xs">
              {{ row.shape?.label ?? row.sector.team ?? 'bez mapového polygonu' }}
            </p>
            <NuxtLink
              :to="tournamentSectorMapEditorUrl(row.sector.id)"
              class="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/80 px-2 py-1 text-xs font-bold text-primary-800 dark:text-primary-200 transition-colors hover:bg-surface"
            >
              <UIcon :name="row.mapped ? 'i-heroicons-pencil-square' : 'i-heroicons-plus-circle'" class="h-4 w-4" />
              {{ row.mapped ? 'Upraviť polygon' : 'Vytvoriť polygon' }}
            </NuxtLink>
          </div>
        </div>
        <p class="text-foreground-muted mt-3 text-xs">
          Aktívne sektorové polygony v mape: {{ activeTournamentSectorShapes.length }}.
        </p>
      </div>

      <div
        v-if="activeTournamentAdminView === 'prihlasky'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Tímové odkazy a kódy</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Pošli tímu odkaz alebo krátky kód na otvorenie mobilného panelu.
            </p>
          </div>
          <div class="flex flex-wrap gap-2 lg:justify-end">
            <UButton
              icon="i-heroicons-clipboard-document-list"
              variant="soft"
              @click="copyTeamAccessRows"
            >
              Kopírovať všetko
            </UButton>
            <UButton
              icon="i-heroicons-arrow-down-tray"
              variant="soft"
              @click="downloadTeamAccessCsv"
            >
              Stiahnuť zoznam
            </UButton>
          </div>
        </div>

        <DataStatusNotice
          v-if="teamAccessShareMessage"
          class="mt-4"
          :description="teamAccessShareMessage"
          :title="teamAccessShareNoticeTitle"
          :tone="teamAccessShareNoticeTone"
        />

        <p
          v-if="teamAccessRows.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Tímové odkazy vzniknú automaticky po vytvorení súťažných sektorov.
        </p>
        <div v-else class="mt-4 grid gap-3 lg:grid-cols-2">
          <div
            v-for="row in teamAccessRows"
            :key="row.sectorId"
            class="rounded-md border border-border bg-surface p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-md bg-primary-900 px-2 py-1 text-xs font-black text-accent-300">
                    {{ row.sectorLabel }}
                  </span>
                  <p class="truncate text-sm font-bold">{{ row.teamName }}</p>
                </div>
                <p class="mt-2 break-all rounded-md bg-primary-50 dark:bg-primary-950/50 px-3 py-2 text-sm font-black text-primary-950 dark:text-primary-100">
                  {{ row.code }}
                </p>
              </div>
              <NuxtLink
                :to="row.codeUrl"
                class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary-50 dark:bg-primary-950/50 px-2.5 text-xs font-bold text-primary-800 dark:text-primary-200 transition-colors hover:bg-primary-100"
              >
                <UIcon name="i-heroicons-device-phone-mobile" class="h-4 w-4" />
                Otvoriť
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'sektory'"
        class="mt-6 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">Sektory a tímy</h2>
            <p class="text-foreground-muted mt-1 text-sm">
              Operačné nastavenia pre výsledkovku, tímové hlásenia a bodové pozície sektorov.
            </p>
          </div>
          <UButton
            icon="i-heroicons-arrow-down-tray"
            :disabled="!canOperateTournaments || !sectorSettingsValidation.success || sectorSettingsStatus === 'saving'"
            :loading="sectorSettingsStatus === 'saving'"
            @click="saveSectorSettings"
          >
            Uložiť sektory
          </UButton>
        </div>

        <ValidationSummary
          class="mt-4"
          :messages="sectorSettingsValidationMessages"
          valid-title="Sektory sú pripravené"
          valid-description="ID sektorov ostávajú stabilné, hodnoty sa dajú bezpečne uložiť do súťažného stavu."
        />

        <DataStatusNotice
          v-if="sectorSettingsMessage"
          class="mt-4"
          :description="sectorSettingsMessage"
          :title="sectorSettingsNoticeTitle"
          :tone="sectorSettingsNoticeTone"
        />

        <p
          v-if="sectorDraft.length === 0"
          class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
        >
          Táto súťaž zatiaľ nemá žiadne sektory.
        </p>
        <div v-else class="mt-4 grid gap-3 xl:grid-cols-2">
          <div
            v-for="sector in sectorDraft"
            :key="sector.id"
            class="rounded-md border border-border bg-surface p-4"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-bold">Sektor {{ sector.label || sector.id.toUpperCase() }}</p>
                <p class="text-foreground-muted mt-1 flex items-center gap-1.5 text-xs">
                  <UIcon
                    :name="sectorMapRows.find((row) => row.sector.id === sector.id)?.mapped ? 'i-heroicons-squares-2x2' : 'i-heroicons-map-pin'"
                    class="h-4 w-4"
                  />
                  {{ sectorMapStatus(sector.id) }}
                </p>
              </div>
              <div class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <span class="text-foreground-muted text-xs font-semibold uppercase tracking-wide">
                  {{ sector.id }}
                </span>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-border lg:hidden"
                  :aria-controls="`tournament-sector-fields-${sector.id}`"
                  :aria-expanded="expandedTournamentSectorId === sector.id"
                  @click="toggleTournamentSector(sector.id)"
                >
                  <UIcon
                    :name="expandedTournamentSectorId === sector.id ? 'i-heroicons-chevron-up' : 'i-heroicons-pencil-square'"
                    class="h-4 w-4"
                  />
                  {{ expandedTournamentSectorId === sector.id ? 'Zavrieť' : 'Upraviť' }}
                </button>
                <NuxtLink
                  :to="tournamentTeamAccessUrl(sector.id)"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-50 dark:bg-primary-950/50 px-2.5 text-xs font-bold text-primary-800 dark:text-primary-200 transition-colors hover:bg-primary-100"
                >
                  <UIcon name="i-heroicons-device-phone-mobile" class="h-4 w-4" />
                  Tímový odkaz
                </NuxtLink>
                <NuxtLink
                  :to="tournamentSectorMapEditorUrl(sector.id)"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-50 dark:bg-primary-950/50 px-2.5 text-xs font-bold text-primary-800 dark:text-primary-200 transition-colors hover:bg-primary-100"
                >
                  <UIcon name="i-heroicons-map" class="h-4 w-4" />
                  Mapa
                </NuxtLink>
              </div>
            </div>

            <div
              :id="`tournament-sector-fields-${sector.id}`"
              class="mt-4 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-5"
              :class="expandedTournamentSectorId === sector.id ? 'grid' : 'hidden'"
            >
              <label class="block lg:col-span-1">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Označenie</span>
                <input
                  v-model="sector.label"
                  :disabled="!canOperateTournaments"
                  maxlength="16"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-semibold"
                >
              </label>
              <label class="block sm:col-span-2 lg:col-span-2">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Tím</span>
                <input
                  v-model="sector.team"
                  :disabled="!canOperateTournaments"
                  maxlength="120"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  placeholder="Voľný sektor"
                >
              </label>
              <label class="block">
                <span class="text-xs font-semibold uppercase text-foreground-muted">Váha kg</span>
                <input
                  v-model.number="sector.weightKg"
                  type="number"
                  min="0"
                  step="0.1"
                  :disabled="!canOperateTournaments"
                  class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                >
              </label>
              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="text-xs font-semibold uppercase text-foreground-muted">X</span>
                  <input
                    v-model.number="sector.x"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                </label>
                <label class="block">
                  <span class="text-xs font-semibold uppercase text-foreground-muted">Y</span>
                  <input
                    v-model.number="sector.y"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    :disabled="!canOperateTournaments"
                    class="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DataStatusNotice
        v-if="actionMessage"
        class="mt-4"
        :description="actionMessage"
        :title="actionNoticeTitle"
        :tone="actionNoticeTone"
      />

      <div v-if="activeTournamentAdminView === 'prehlad'" class="mt-6 grid gap-4 lg:grid-cols-3">
        <div
          v-for="slot in tournamentSponsorSlots"
          :key="slot.placementType"
          class="rounded-card border border-border bg-surface p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase text-primary-700">{{ slot.label }}</p>
              <p class="text-foreground-muted mt-1 text-sm">{{ slot.description }}</p>
            </div>
            <StatusBadge
              icon="i-heroicons-building-storefront"
              :label="`${slot.sponsors.length}`"
              size="xs"
              tone="primary"
            />
          </div>
          <div v-if="slot.sponsors.length > 0" class="mt-4 space-y-2">
            <div
              v-for="sponsor in slot.sponsors"
              :key="`${slot.placementType}-${sponsor.id}`"
              class="flex items-center gap-3 rounded-md bg-muted p-2"
            >
              <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary-900 text-xs font-black text-accent-300">
                <img
                  v-if="sponsorLogo(sponsor, slot.placementType).url"
                  :src="sponsorLogo(sponsor, slot.placementType).url"
                  :alt="sponsorLogo(sponsor, slot.placementType).alt"
                  class="h-full w-full bg-surface object-contain p-1"
                >
                <span v-else>{{ sponsorLogo(sponsor, slot.placementType).text }}</span>
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-bold">{{ sponsor.name }}</p>
                <p class="text-foreground-muted truncate text-xs">
                  {{ sponsor.sectorId ? `sektor ${sectorLabel(sponsor.sectorId)}` : sponsor.placement }}
                </p>
              </div>
            </div>
          </div>
          <p v-else class="text-foreground-muted mt-4 text-sm">
            Toto umiestnenie zatiaľ nemá aktívneho partnera.
          </p>
        </div>
      </div>

      <div
        v-if="activeTournamentAdminView === 'dispecing' || activeTournamentAdminView === 'pravidla'"
        class="mt-6"
        :class="activeTournamentAdminView === 'dispecing' ? 'grid gap-6 lg:grid-cols-[1fr_0.9fr]' : ''"
      >
        <div v-if="activeTournamentAdminView === 'dispecing'" class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Front hlásení</h2>
            <p
              v-if="tournamentRequests.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              Tímy zatiaľ neposlali žiadne hlásenie ani požiadavku na kontrolóra.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="request in tournamentRequests" :key="request.id" class="rounded-md border border-border bg-surface p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ request.team }} · {{ sectorLabel(request.sectorId) }}</p>
                    <p class="text-primary-800 dark:text-primary-200 text-sm font-semibold">{{ tournamentRequestTypeLabels[request.type] }}</p>
                  </div>
                  <StatusBadge
                    class="w-fit"
                    :icon="requestStatusIcon(request.status)"
                    :label="tournamentRequestStatusLabels[request.status]"
                    :tone="requestStatusTone(request.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-3 text-sm">{{ request.description }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    icon="i-heroicons-user-plus"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || request.status === 'resolved' || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:assign`"
                    @click="submitRequestAction(request.id, 'assign')"
                  >
                    Priradiť kontrolóra
                  </UButton>
                  <UButton
                    size="sm"
                    icon="i-heroicons-check"
                    color="neutral"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || request.status === 'resolved' || actionStatus === 'submitting'"
                    :loading="activeActionId === `${request.id}:resolve`"
                    @click="submitRequestAction(request.id, 'resolve')"
                  >
                    Uzavrieť
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-card border border-border bg-surface p-5">
            <h2 class="text-lg font-bold">Váženia úlovkov</h2>
            <p
              v-if="tournamentCatches.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              K tejto súťaži zatiaľ nie je evidované žiadne váženie.
            </p>
            <div v-else class="mt-4 overflow-hidden rounded-md border border-border">
              <div v-for="catchItem in tournamentCatches" :key="catchItem.id" class="border-b border-border bg-surface p-4 last:border-b-0">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p class="font-bold">{{ catchItem.team }} · {{ sectorLabel(catchItem.sectorId) }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ catchItem.species }} · {{ catchItem.weightKg }} kg · {{ catchItem.lengthCm }} cm
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit"
                    :icon="catchStatusIcon(catchItem.status)"
                    :label="catchStatusLabel(catchItem.status)"
                    :tone="catchStatusTone(catchItem.status)"
                  />
                </div>
                <p class="text-foreground-muted mt-2 text-sm">
                  Kontrolór: {{ marshalName(catchItem.verifiedByMarshalId) }} · {{ catchItem.notes }}
                </p>
                <div v-if="catchItem.status === 'waiting'" class="mt-4">
                  <UButton
                    size="sm"
                    icon="i-heroicons-scale"
                    variant="soft"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch || actionStatus === 'submitting'"
                    :loading="activeActionId === `${catchItem.id}:verify`"
                    @click="verifyCatch(catchItem.id)"
                  >
                    Overiť váženie
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div :class="activeTournamentAdminView === 'pravidla' ? 'grid gap-6 lg:grid-cols-2' : 'space-y-6'">
          <div
            v-if="activeTournamentAdminView === 'dispecing'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Kontrolóri</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Priame panely pre dozor, hlásenia tímov, váženia, tresty a kontroly.
                </p>
              </div>
            </div>
            <p
              v-if="liveTournamentMarshals.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              Pred spustením dispečingu priraďte súťaži kontrolórov.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="marshal in liveTournamentMarshals" :key="marshal.id" class="rounded-md bg-muted p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold">{{ marshal.name }}</p>
                    <p class="text-foreground-muted text-sm">
                      {{ marshal.assignedSectorIds.map(sectorLabel).join(', ') }}
                    </p>
                  </div>
                  <StatusBadge
                    class="w-fit shrink-0"
                    :icon="marshalStatusIcon(marshal.status)"
                    :label="tournamentMarshalStatusLabels[marshal.status]"
                    :tone="marshalStatusTone(marshal.status)"
                  />
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <UButton
                    :to="tournamentMarshalAccessUrl(marshal.id)"
                    size="sm"
                    icon="i-heroicons-device-phone-mobile"
                    variant="soft"
                  >
                    Panel kontrolóra
                  </UButton>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Zapísať trest</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitPenalty">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="penaltyForm.sectorId"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="penaltyForm.marshalId"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option v-for="marshal in marshalsForSector(penaltyForm.sectorId)" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Typ trestu</span>
                <select
                  v-model="penaltyForm.type"
                  :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option v-for="[value, label] in penaltyTypeOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <div
                v-if="penaltyForm.type === 'fishing-pause' || penaltyForm.type === 'rod-reduction'"
                class="grid gap-3 sm:grid-cols-2"
              >
                <label class="block">
                  <span class="text-sm font-semibold">Trvanie h</span>
                  <input
                    v-model.number="penaltyForm.durationHours"
                    type="number"
                    min="1"
                    max="24"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                </label>
                <label v-if="penaltyForm.type === 'rod-reduction'" class="block">
                  <span class="text-sm font-semibold">O koľko prútov</span>
                  <input
                    v-model.number="penaltyForm.rodsLess"
                    type="number"
                    min="1"
                    max="4"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Dôvod</span>
                <textarea
                  v-model="penaltyForm.reason"
                  rows="3"
                  :readonly="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="penaltyValidationMessages"
                valid-title="Trest je pripravený"
                valid-description="Sektor, kontrolór, typ a dôvod sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-no-symbol"
                block
                :disabled="!canOperateTournaments || !canUseTournamentDispatch || !penaltyValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'penalty:create'"
              >
                Uložiť trest
              </UButton>
            </form>
          </div>

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Zapísať kontrolu</h2>
            <form class="mt-4 space-y-4" @submit.prevent="submitRuleCheck">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Sektor</span>
                  <select
                    v-model="ruleCheckForm.sectorId"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option v-for="sector in activeTournament.sectors" :key="sector.id" :value="sector.id">
                      {{ sector.label }} · {{ sector.team }}
                    </option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Kontrolór</span>
                  <select
                    v-model="ruleCheckForm.marshalId"
                    :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option v-for="marshal in marshalsForSector(ruleCheckForm.sectorId)" :key="marshal.id" :value="marshal.id">
                      {{ marshal.name }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-sm font-semibold">Výsledok</span>
                <select
                  v-model="ruleCheckForm.result"
                  :disabled="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option v-for="[value, label] in ruleCheckResultOptions" :key="value" :value="value">
                    {{ label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-sm font-semibold">Poznámka</span>
                <textarea
                  v-model="ruleCheckForm.note"
                  rows="3"
                  :readonly="!canOperateTournaments || !canUseTournamentDispatch"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>

              <ValidationSummary
                :messages="ruleCheckValidationMessages"
                valid-title="Kontrola je pripravená"
                valid-description="Kontrolór, sektor, výsledok a poznámka sú pripravené na uloženie."
              />

              <UButton
                type="submit"
                icon="i-heroicons-clipboard-document-check"
                block
                :disabled="!canOperateTournaments || !canUseTournamentDispatch || !ruleCheckValidation.success || actionStatus === 'submitting'"
                :loading="activeActionId === 'rule-check:create'"
              >
                Uložiť kontrolu
              </UButton>
            </form>
          </div>

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Tresty</h2>
            <p
              v-if="tournamentPenalties.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              V tejto súťaži zatiaľ nebol uložený žiadny trest.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="penalty in tournamentPenalties" :key="penalty.id" class="rounded-md border border-border bg-surface p-4">
                <p class="font-bold">{{ penalty.team }} · {{ sectorLabel(penalty.sectorId) }}</p>
                <StatusBadge
                  class="mt-1"
                  icon="i-heroicons-no-symbol"
                  :label="tournamentPenaltyTypeLabels[penalty.type]"
                  size="xs"
                  tone="error"
                />
                <p class="text-foreground-muted mt-2 text-sm">{{ penalty.reason }}</p>
              </div>
            </div>
          </div>

          <div
            v-if="activeTournamentAdminView === 'pravidla'"
            class="rounded-card border border-border bg-surface p-5"
          >
            <h2 class="text-lg font-bold">Kontroly sektorov</h2>
            <p
              v-if="tournamentRuleChecks.length === 0"
              class="text-foreground-muted mt-4 rounded-md bg-muted p-4 text-sm"
            >
              Prvá vykonaná kontrola sektora sa zobrazí v tejto histórii.
            </p>
            <div v-else class="mt-4 space-y-3">
              <div v-for="check in tournamentRuleChecks" :key="check.id" class="rounded-md bg-muted p-4">
                <p class="font-semibold">{{ sectorLabel(check.sectorId) }} · {{ marshalName(check.marshalId) }}</p>
                <p class="text-foreground-muted mt-1 text-sm">{{ check.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
