<script setup lang="ts">
import type { CatchAdminView } from '~/composables/useAdminCatchModeration'
import { formatFishManagerAvailability } from '~/services/fishRegistrySettingsService'

useHead({ title: 'Admin úlovky' })

const {
  catches: seedCatches,
  catchPhotos: seedCatchPhotos,
  getLakeName,
  getPegLabel,
  lakes,
  pegs,
  tripLogbookEntries: seedTripLogbookEntries,
  tripLogbookModeLabels,
  tripLogbooks: seedTripLogbooks,
  tripLogbookStatusLabels,
} = usePondData()

const route = useRoute()
const router = useRouter()
const activeCatchAdminView = ref<CatchAdminView>(parseCatchAdminView(route.query.sekcia))

const {
  canManageCatches,
  catchAccessLabel,
  catchDetailElement,
  catchReadOnlyMessage,
  catchStats,
  catchesReadOnly,
  compatibleCorrectionLogbooks,
  correctionForm,
  correctionNoticeTitle,
  correctionNoticeTone,
  correctionPegs,
  correctionReady,
  correctionSubmitMessage,
  correctionSubmitStatus,
  correctionValidationMessages,
  decisionMode,
  decisionNoticeTitle,
  decisionNoticeTone,
  decisionSubmitMessage,
  decisionSubmitStatus,
  filteredCatches,
  formatCatchTime,
  formatFileSize,
  formatLogbookSummary,
  formatMetric,
  formatPressureTrend,
  formatTemperature,
  liveCatches,
  logbookLinkOptions,
  reviewNote,
  saveCorrection,
  saveDecision,
  selectedCatch,
  selectedCatchFishCandidate,
  selectedCatchId,
  selectedCatchLargeFishRule,
  selectedCatchManagerAvailability,
  selectedCatchNeedsChipWorkflow,
  selectedCatchPhoto,
  selectedLogbook,
  selectedLogbookEntry,
  statusFilterModel,
  statusFilters,
  statusMeta,
} = await useAdminCatchModeration({
  activeCatchAdminView,
  pegs,
  seedCatchPhotos,
  seedCatches,
  seedTripLogbookEntries,
  seedTripLogbooks,
  tripLogbookStatusLabels,
})

const {
  analyticsFilter,
  analyticsFilterActive,
  analyticsFilterLabel,
  analyticsFilteredCatches,
  analyticsGroups,
  analyticsSpeciesOptions,
  applySeasonWindow,
  approvedCatchCount,
  catchAnalytics,
  catchMonthlyTrend,
  catchReportAudienceLabels,
  catchReportCadenceLabels,
  catchReportDeliveryLabels,
  catchReportDeliveryProviderLabels,
  catchSeasonComparison,
  catchSeasonWindowOptions,
  catchSpeciesPegTrend,
  catchSpeciesTrend,
  catchTrendSignalRows,
  exportAnalyticsCsv,
  exportTrendSignalsCsv,
  formatDeliveryLog,
  formatEmailDraftAttachments,
  formatPeriodRange,
  formatReportGeneratedAt,
  formatReportPayload,
  formatReportRecipients,
  formatSavedReportFilter,
  formatSchedulerAction,
  formatSchedulerRowMeta,
  formatSeasonWindowOption,
  formatSignedMetric,
  formatSignedPercent,
  formatSignedWeight,
  formatWeight,
  generateReportMessage,
  generateReportNoticeTitle,
  generateReportNoticeTone,
  generateSavedCatchReport,
  generatedCatchReport,
  generatingReportId,
  getGroupWidth,
  getSchedulerActionIcon,
  getSchedulerActionTone,
  getSpeciesPegTrendWeightWidth,
  getSpeciesTrendWeightWidth,
  getTrendDeltaClass,
  getTrendWeightWidth,
  markCustomSeasonWindow,
  prepareSavedCatchReportEmail,
  preparingEmailReportId,
  reportEmailDraft,
  reportEmailDraftMessage,
  reportEmailDraftNoticeTitle,
  reportEmailDraftNoticeTone,
  reportForm,
  reportSubmitMessage,
  reportSubmitNoticeTitle,
  reportSubmitNoticeTone,
  reportSubmitStatus,
  resetAnalyticsFilter,
  runCatchReportScheduler,
  savedCatchReports,
  savedReportStatusIcon,
  savedReportStatusTone,
  saveCurrentCatchReport,
  scheduledCatchReports,
  schedulerRunMessage,
  schedulerRunNoticeTitle,
  schedulerRunNoticeTone,
  schedulerRunRows,
  schedulerRunStatus,
  schedulerRunSummary,
  selectedSeasonWindow,
  visibleMonthlyTrendMonths,
  visibleSpeciesPegTrendRows,
  visibleSpeciesTrendRows,
} = await useAdminCatchAnalyticsReports({
  canManageCatches,
  catchReadOnlyMessage,
  getLakeName,
  getPegLabel,
  liveCatches,
})

const catchAdminViewTabs = computed(() => [
  {
    count: catchStats.value.pending,
    icon: 'i-heroicons-clipboard-document-check',
    label: 'Moderácia',
    value: 'moderacia' as const,
  },
  {
    count: approvedCatchCount.value,
    icon: 'i-heroicons-chart-bar-square',
    label: 'Analytika',
    value: 'analytika' as const,
  },
  {
    count: savedCatchReports.value.length,
    icon: 'i-heroicons-document-chart-bar',
    label: 'Reporty',
    value: 'reporty' as const,
  },
])

function parseCatchAdminView(value: unknown): CatchAdminView {
  const normalizedValue = Array.isArray(value) ? value[0] : value

  if (normalizedValue === 'analytika' || normalizedValue === 'reporty') return normalizedValue

  return 'moderacia'
}

function catchAdminTabClass(isActive: boolean) {
  return isActive
    ? 'border-primary-700 text-primary-900 dark:text-primary-100'
    : 'border-transparent text-foreground-muted hover:border-border hover:text-foreground'
}

function selectCatchAdminView(view: CatchAdminView) {
  activeCatchAdminView.value = view
  const query = { ...route.query }

  if (view === 'moderacia') delete query.sekcia
  else {
    query.sekcia = view
    delete query.catchId
  }

  void router.replace({ query })
}

function handleCatchAdminTabKeydown(event: KeyboardEvent, index: number) {
  let targetIndex: number | undefined

  if (event.key === 'ArrowLeft') {
    targetIndex = (index - 1 + catchAdminViewTabs.value.length) % catchAdminViewTabs.value.length
  }
  else if (event.key === 'ArrowRight') {
    targetIndex = (index + 1) % catchAdminViewTabs.value.length
  }
  else if (event.key === 'Home') {
    targetIndex = 0
  }
  else if (event.key === 'End') {
    targetIndex = catchAdminViewTabs.value.length - 1
  }

  if (targetIndex === undefined) return

  event.preventDefault()
  const tabList = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
  const targetView = catchAdminViewTabs.value[targetIndex]?.value
  if (!targetView) return

  selectCatchAdminView(targetView)
  void nextTick(() => {
    const tabs = tabList?.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs?.[targetIndex]?.focus()
  })
}

watch(
  () => route.query.sekcia,
  (view) => {
    if (route.query.catchId) return
    activeCatchAdminView.value = parseCatchAdminView(view)
  },
)
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Správa revíru"
      title="Úlovky"
      description="Kontrola nových záznamov, analytika schválených úlovkov a pravidelné reporty."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <DataStatusNotice
        v-if="catchesReadOnly"
        class="mb-5"
        :description="`${catchReadOnlyMessage} Exporty ostávajú dostupné, schvaľovanie, korekcie a ukladanie reportov sú vypnuté.`"
        icon="i-heroicons-lock-closed"
        :title="`Režim prístupu: ${catchAccessLabel}`"
        tone="info"
      />

      <nav aria-label="Pracovné pohľady úlovkov" class="mt-6 overflow-x-auto border-b border-border">
        <div role="tablist" aria-label="Úlovky" class="flex min-w-max gap-1">
          <button
            v-for="(view, index) in catchAdminViewTabs"
            :id="`catch-admin-tab-${view.value}`"
            :key="view.value"
            type="button"
            role="tab"
            :aria-controls="'catch-admin-panel'"
            :aria-label="`${view.label}: ${view.count}`"
            :aria-selected="activeCatchAdminView === view.value"
            :tabindex="activeCatchAdminView === view.value ? 0 : -1"
            class="flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-bold transition-colors"
            :class="catchAdminTabClass(activeCatchAdminView === view.value)"
            @click="selectCatchAdminView(view.value)"
            @keydown="handleCatchAdminTabKeydown($event, index)"
          >
            <UIcon :name="view.icon" class="h-4 w-4 shrink-0" />
            <span>{{ view.label }}</span>
            <span class="text-xs font-semibold text-foreground-muted">{{ view.count }}</span>
          </button>
        </div>
      </nav>

      <div
        id="catch-admin-panel"
        role="tabpanel"
        :aria-labelledby="`catch-admin-tab-${activeCatchAdminView}`"
      >
      <div v-show="activeCatchAdminView === 'moderacia'" class="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Na schválenie</p>
          <p class="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">{{ catchStats.pending }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Schválené</p>
          <p class="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">{{ catchStats.approved }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Zamietnuté</p>
          <p class="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">{{ catchStats.rejected }}</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Spolu</p>
          <p class="mt-1 text-2xl font-bold sm:mt-2 sm:text-3xl">{{ catchStats.total }}</p>
        </div>
      </div>

      <div v-show="activeCatchAdminView !== 'moderacia'" class="mt-5 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 class="text-lg font-bold">
              {{ activeCatchAdminView === 'analytika' ? 'Filtre analytiky' : 'Zdroj dát reportu' }}
            </h2>
            <p class="text-foreground-muted mt-1 text-sm">
              {{ catchAnalytics.catchCount }} z {{ approvedCatchCount }} schválených ·
              <template v-if="activeCatchAdminView === 'analytika'">
                {{ catchTrendSignalRows.length }} signálov ·
              </template>
              {{ analyticsFilterLabel }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="activeCatchAdminView === 'analytika'"
              class="min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
              icon="i-heroicons-arrow-down-tray"
              variant="soft"
              :disabled="analyticsFilteredCatches.length === 0"
              @click="exportAnalyticsCsv"
            >
              Stiahnuť report
            </UButton>
            <UButton
              v-if="activeCatchAdminView === 'analytika'"
              class="min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
              icon="i-heroicons-chart-bar-square"
              variant="soft"
              :disabled="catchTrendSignalRows.length === 0"
              @click="exportTrendSignalsCsv"
            >
              Stiahnuť signály
            </UButton>
            <UButton
              v-if="analyticsFilterActive"
              class="min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
              icon="i-heroicons-x-mark"
              variant="ghost"
              @click="resetAnalyticsFilter"
            >
              Vyčistiť
            </UButton>
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label class="block">
            <span class="text-sm font-semibold">Sezónne okno</span>
            <select
              v-model="analyticsFilter.seasonWindowId"
              class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
              @change="applySeasonWindow"
            >
              <option value="custom">Vlastný rozsah</option>
              <option
                v-for="window in catchSeasonWindowOptions"
                :key="window.id"
                :value="window.id"
              >
                {{ formatSeasonWindowOption(window) }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Od</span>
            <input
              v-model="analyticsFilter.dateFrom"
              type="date"
              class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
              @change="markCustomSeasonWindow"
            >
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Do</span>
            <input
              v-model="analyticsFilter.dateTo"
              type="date"
              class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
              @change="markCustomSeasonWindow"
            >
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Jazero</span>
            <select
              v-model="analyticsFilter.lake"
              class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
            >
              <option value="all">Všetky jazerá</option>
              <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-semibold">Druh</span>
            <select
              v-model="analyticsFilter.species"
              class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
            >
              <option value="all">Všetky druhy</option>
              <option v-for="species in analyticsSpeciesOptions" :key="species" :value="species">{{ species }}</option>
            </select>
          </label>
        </div>
        <p v-if="selectedSeasonWindow" class="text-foreground-muted mt-3 text-sm">
          {{ selectedSeasonWindow.description }}
        </p>

        <div v-show="activeCatchAdminView === 'reporty'" class="mt-5 grid gap-5 border-t border-border pt-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 class="font-bold">Uložiť report</h3>
                <p class="text-foreground-muted mt-1 text-sm">
                  Aktuálny filter sa uloží ako interný report pre správcu, majiteľa alebo účtovníka.
                </p>
              </div>
              <span class="w-fit rounded-md bg-primary-50 dark:bg-primary-950/50 px-2.5 py-1 text-xs font-bold text-primary-800 dark:text-primary-200">
                bez odosielania
              </span>
            </div>

            <fieldset :disabled="!canManageCatches" class="contents">
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="block">
                  <span class="text-sm font-semibold">Názov</span>
                  <input
                    v-model="reportForm.title"
                    type="text"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Príjemcovia</span>
                  <input
                    v-model="reportForm.recipients"
                    type="text"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    placeholder="emaily oddelené čiarkou"
                  >
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Pre koho</span>
                  <select
                    v-model="reportForm.audience"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                  >
                    <option value="manager">{{ catchReportAudienceLabels.manager }}</option>
                    <option value="owner">{{ catchReportAudienceLabels.owner }}</option>
                    <option value="accountant">{{ catchReportAudienceLabels.accountant }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Periodicita</span>
                  <select
                    v-model="reportForm.cadence"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                  >
                    <option value="manual">{{ catchReportCadenceLabels.manual }}</option>
                    <option value="weekly">{{ catchReportCadenceLabels.weekly }}</option>
                    <option value="monthly">{{ catchReportCadenceLabels.monthly }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Doručenie</span>
                  <select
                    v-model="reportForm.delivery"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                  >
                    <option value="in-app">{{ catchReportDeliveryLabels['in-app'] }}</option>
                    <option value="email-ready">{{ catchReportDeliveryLabels['email-ready'] }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm font-semibold">Popis</span>
                  <input
                    v-model="reportForm.description"
                    type="text"
                    class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    placeholder="voliteľná poznámka"
                  >
                </label>
              </div>

              <div class="mt-3 flex flex-wrap gap-4 text-sm">
                <label class="flex min-h-11 items-center gap-2">
                  <input v-model="reportForm.includeRawCsv" type="checkbox" class="h-5 w-5 accent-primary-700">
                  Zoznam úlovkov
                </label>
                <label class="flex min-h-11 items-center gap-2">
                  <input v-model="reportForm.includeTrendSignals" type="checkbox" class="h-5 w-5 accent-primary-700">
                  Trendové signály
                </label>
                <label class="flex min-h-11 items-center gap-2">
                  <input v-model="reportForm.enabled" type="checkbox" class="h-5 w-5 accent-primary-700">
                  Aktívny report
                </label>
              </div>
            </fieldset>

            <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <UButton
                class="min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
                icon="i-heroicons-bookmark-square"
                :disabled="!canManageCatches"
                :loading="reportSubmitStatus === 'submitting'"
                @click="saveCurrentCatchReport"
              >
                Uložiť aktuálny report
              </UButton>
              <DataStatusNotice
                v-if="reportSubmitMessage"
                class="sm:flex-1"
                :description="reportSubmitMessage"
                :title="reportSubmitNoticeTitle"
                :tone="reportSubmitNoticeTone"
              />
            </div>
          </div>

          <div>
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold">Uložené reporty</h3>
                <p class="text-foreground-muted mt-1 text-sm">
                  Uložené nastavenia pravidelných e-mailových reportov.
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-2">
                <span class="rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  {{ savedCatchReports.length }}
                </span>
                <UButton
                  class="min-h-11 sm:min-h-7"
                  icon="i-heroicons-clock"
                  size="xs"
                  variant="soft"
                  :disabled="!canManageCatches || scheduledCatchReports.length === 0"
                  :loading="schedulerRunStatus === 'submitting'"
                  @click="runCatchReportScheduler"
                >
                  Spustiť plánovač
                </UButton>
              </div>
            </div>

            <div
              v-if="schedulerRunMessage"
              class="mt-4 rounded-md border border-border bg-surface p-3"
            >
              <DataStatusNotice
                :description="schedulerRunMessage"
                icon="i-heroicons-clock"
                :title="schedulerRunNoticeTitle"
                :tone="schedulerRunNoticeTone"
              />
              <div v-if="schedulerRunSummary" class="mt-3 flex flex-wrap gap-2">
                <StatusBadge
                  icon="i-heroicons-server"
                  :label="`Provider: ${catchReportDeliveryProviderLabels[schedulerRunSummary.deliveryProvider]}`"
                  size="xs"
                  tone="neutral"
                />
                <StatusBadge
                  icon="i-heroicons-calendar-days"
                  :label="`Splatné: ${schedulerRunSummary.dueCount}`"
                  size="xs"
                  tone="warning"
                />
                <StatusBadge
                  icon="i-heroicons-paper-airplane"
                  :label="`Odoslané: ${schedulerRunSummary.sentCount}`"
                  size="xs"
                  tone="success"
                />
                <StatusBadge
                  icon="i-heroicons-envelope"
                  :label="`Pripravené: ${schedulerRunSummary.preparedCount}`"
                  size="xs"
                  tone="success"
                />
                <StatusBadge
                  icon="i-heroicons-forward"
                  :label="`Preskočené: ${schedulerRunSummary.skippedCount}`"
                  size="xs"
                  tone="neutral"
                />
                <StatusBadge
                  icon="i-heroicons-exclamation-triangle"
                  :label="`Chyby: ${schedulerRunSummary.failedCount}`"
                  size="xs"
                  tone="error"
                />
              </div>
              <div v-if="schedulerRunRows.length > 0" class="mt-3 grid gap-2">
                <div
                  v-for="row in schedulerRunRows"
                  :key="row.reportId"
                  class="rounded-md border bg-surface p-2"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="text-sm font-semibold">{{ row.title }}</p>
                      <p class="text-foreground-muted mt-0.5 text-xs">{{ row.message }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">{{ formatSchedulerRowMeta(row) }}</p>
                    </div>
                    <StatusBadge
                      class="shrink-0"
                      :icon="getSchedulerActionIcon(row)"
                      :label="formatSchedulerAction(row)"
                      size="xs"
                      :tone="getSchedulerActionTone(row)"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-if="savedCatchReports.length > 0" class="mt-4 space-y-3">
              <article
                v-for="report in savedCatchReports"
                :key="report.id"
                class="rounded-md border border-border bg-surface p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h4 class="font-semibold">{{ report.title }}</h4>
                    <p class="text-foreground-muted mt-1 text-xs">{{ formatSavedReportFilter(report) }}</p>
                  </div>
                  <StatusBadge
                    class="w-fit shrink-0"
                    :icon="savedReportStatusIcon(report.enabled)"
                    :label="report.enabled ? 'aktívny' : 'pozastavený'"
                    size="xs"
                    :tone="savedReportStatusTone(report.enabled)"
                  />
                </div>
                <div class="text-foreground-muted mt-3 grid gap-1 text-xs sm:grid-cols-2">
                  <span>{{ catchReportCadenceLabels[report.cadence] }} · {{ catchReportAudienceLabels[report.audience] }}</span>
                  <span>{{ catchReportDeliveryLabels[report.delivery] }}</span>
                  <span>{{ formatReportPayload(report) }}</span>
                  <span>{{ formatReportRecipients(report) }}</span>
                  <span class="sm:col-span-2">E-mail: {{ formatDeliveryLog(report) }}</span>
                </div>
                <div class="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="text-foreground-muted text-xs">
                    Posledný výstup: {{ formatReportGeneratedAt(report.lastGeneratedAt) }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      class="min-h-11 sm:min-h-7"
                      icon="i-heroicons-play"
                      size="xs"
                      variant="soft"
                      :disabled="!canManageCatches"
                      :loading="generatingReportId === report.id"
                      @click="generateSavedCatchReport(report)"
                    >
                      Vygenerovať
                    </UButton>
                    <UButton
                      class="min-h-11 sm:min-h-7"
                      icon="i-heroicons-envelope"
                      size="xs"
                      variant="soft"
                      :disabled="!canManageCatches || report.delivery !== 'email-ready'"
                      :loading="preparingEmailReportId === report.id"
                      @click="prepareSavedCatchReportEmail(report)"
                    >
                      Pripraviť e-mail
                    </UButton>
                  </div>
                </div>
              </article>
            </div>
            <p v-else class="text-foreground-muted mt-4 rounded-md border border-dashed border-border p-4 text-sm">
              Zatiaľ nie je uložený žiadny report. Nastav filter a ulož prvú šablónu pre správcu.
            </p>
            <DataStatusNotice
              v-if="generateReportMessage"
              class="mt-4"
              :description="generateReportMessage"
              :title="generateReportNoticeTitle"
              :tone="generateReportNoticeTone"
            />
            <div
              v-if="generatedCatchReport"
              class="mt-4 rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 p-3"
            >
              <p class="text-xs font-bold uppercase text-primary-700">Posledný vygenerovaný výstup</p>
              <h4 class="mt-1 font-semibold">
                {{ generatedCatchReport.summary.catchCount }} úlovkov ·
                {{ formatWeight(generatedCatchReport.summary.totalWeightKg) }}
              </h4>
              <div class="text-foreground-muted mt-2 grid gap-1 text-xs sm:grid-cols-2">
                <span>Obdobie: {{ generatedCatchReport.summary.periodLabel }}</span>
                <span>Signály: {{ generatedCatchReport.summary.trendSignalCount }}</span>
                <span>Top druh: {{ generatedCatchReport.summary.topSpeciesLabel }}</span>
                <span>Top miesto: {{ generatedCatchReport.summary.topPegLabel }}</span>
              </div>
            </div>
            <div
              v-if="reportEmailDraft"
              class="mt-4 rounded-md border border-accent-200 bg-accent-50 p-3"
            >
              <p class="text-xs font-bold uppercase text-accent-700">E-mailový draft</p>
              <h4 class="mt-1 font-semibold">{{ reportEmailDraft.subject }}</h4>
              <div class="text-foreground-muted mt-2 grid gap-1 text-xs">
                <span>Príjemcovia: {{ reportEmailDraft.recipients.join(', ') || 'bez príjemcov' }}</span>
                <span>Prílohy: {{ formatEmailDraftAttachments(reportEmailDraft) }}</span>
                <span>{{ reportEmailDraft.previewText }}</span>
              </div>
              <DataStatusNotice
                v-if="reportEmailDraftMessage"
                class="mt-3"
                :description="reportEmailDraftMessage"
                :title="reportEmailDraftNoticeTitle"
                :tone="reportEmailDraftNoticeTone"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeCatchAdminView === 'analytika'" class="contents">
      <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div class="rounded-card bg-primary-950 p-5 text-white">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-sm font-semibold text-accent-300">Report schválených úlovkov</p>
              <h2 class="mt-1 text-2xl font-bold">{{ catchAnalytics.catchCount }} záznamov</h2>
            </div>
            <span class="w-fit rounded-md bg-white/10 px-3 py-1 text-xs font-bold text-white/80">
              bez zamietnutých
            </span>
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-3">
            <div class="rounded-md bg-white/10 p-3">
              <p class="text-xs text-white/65">Spolu váha</p>
              <p class="mt-1 text-xl font-bold">{{ formatWeight(catchAnalytics.totalWeightKg) }}</p>
            </div>
            <div class="rounded-md bg-white/10 p-3">
              <p class="text-xs text-white/65">Priemer</p>
              <p class="mt-1 text-xl font-bold">{{ formatWeight(catchAnalytics.averageWeightKg) }}</p>
            </div>
            <div class="rounded-md bg-white/10 p-3">
              <p class="text-xs text-white/65">Pustené späť</p>
              <p class="mt-1 text-xl font-bold">{{ catchAnalytics.releaseRatePercent }} %</p>
            </div>
          </div>
          <div class="mt-4 rounded-md border border-white/15 p-4">
            <p class="text-xs font-semibold text-white/60">Najväčší úlovok</p>
            <p v-if="catchAnalytics.largestCatch" class="mt-1 font-bold">
              {{ catchAnalytics.largestCatch.species }} {{ formatWeight(catchAnalytics.largestCatch.weightKg) }}
            </p>
            <p v-if="catchAnalytics.largestCatch" class="text-sm text-white/65">
              {{ catchAnalytics.largestCatch.angler }} · {{ getPegLabel(catchAnalytics.largestCatch.pegId) }}
            </p>
            <p v-else class="mt-1 text-sm text-white/65">Zatiaľ bez schválených úlovkov.</p>
          </div>
          <div class="mt-4 rounded-md border border-white/15 p-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-xs font-semibold text-white/60">Sezónne porovnanie</p>
                <p class="mt-1 text-sm text-white/70">
                  {{ formatPeriodRange(catchSeasonComparison.current) }} vs
                  {{ formatPeriodRange(catchSeasonComparison.previous) }}
                </p>
              </div>
              <span
                class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                :class="catchSeasonComparison.hasComparisonPeriod ? 'bg-success-500/15 text-success-100' : 'bg-white/10 text-white/65'"
              >
                {{ catchSeasonComparison.hasComparisonPeriod ? 'porovnateľné' : 'minulý rok bez dát' }}
              </span>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-3">
              <div class="rounded-md bg-white/10 p-3">
                <p class="text-xs text-white/60">Aktuálne obdobie</p>
                <p class="mt-1 text-lg font-bold">{{ catchSeasonComparison.current.catchCount }} ks</p>
                <p class="text-xs text-white/65">{{ formatWeight(catchSeasonComparison.current.totalWeightKg) }}</p>
              </div>
              <div class="rounded-md bg-white/10 p-3">
                <p class="text-xs text-white/60">Minulý rok</p>
                <p class="mt-1 text-lg font-bold">{{ catchSeasonComparison.previous.catchCount }} ks</p>
                <p class="text-xs text-white/65">{{ formatWeight(catchSeasonComparison.previous.totalWeightKg) }}</p>
              </div>
              <div class="rounded-md bg-white/10 p-3">
                <p class="text-xs text-white/60">Rozdiel</p>
                <p class="mt-1 text-lg font-bold">{{ formatSignedMetric(catchSeasonComparison.deltaCatchCount) }} ks</p>
                <p class="text-xs text-white/65">
                  {{ formatSignedWeight(catchSeasonComparison.deltaTotalWeightKg) }} ·
                  {{ formatSignedPercent(catchSeasonComparison.totalWeightChangePercent) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Najsilnejšie signály</h2>
              <p class="text-foreground-muted text-sm">Rýchly prehľad miest, času a nástrah.</p>
            </div>
            <span class="w-fit rounded-md bg-muted px-3 py-1 text-xs font-bold text-foreground-muted">
              interné
            </span>
          </div>
          <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-md border border-border bg-surface p-3">
              <p class="text-foreground-muted text-xs">Miesto</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.topPegs[0]?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.topPegs[0]?.count ?? 0 }} úlovkov</p>
            </div>
            <div class="rounded-md border border-border bg-surface p-3">
              <p class="text-foreground-muted text-xs">Čas</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.busiestHour?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.busiestHour?.count ?? 0 }} úlovkov</p>
            </div>
            <div class="rounded-md border border-border bg-surface p-3">
              <p class="text-foreground-muted text-xs">Nástraha</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.topBaits[0]?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.topBaits[0]?.count ?? 0 }} úlovkov</p>
            </div>
            <div class="rounded-md border border-border bg-surface p-3">
              <p class="text-foreground-muted text-xs">Počasie</p>
              <p class="mt-1 font-bold">{{ catchAnalytics.topConditions[0]?.label ?? 'bez dát' }}</p>
              <p class="text-foreground-muted text-xs">{{ catchAnalytics.weatherSummary.weatherCount }} zápisov s počasím</p>
            </div>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-4">
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Voda</p>
              <p class="font-bold">{{ formatTemperature(catchAnalytics.weatherSummary.averageWaterTempC) }}</p>
            </div>
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Vzduch</p>
              <p class="font-bold">{{ formatTemperature(catchAnalytics.weatherSummary.averageAirTempC) }}</p>
            </div>
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Tlak</p>
              <p class="font-bold">{{ formatMetric(catchAnalytics.weatherSummary.averagePressureHpa) }} hPa</p>
            </div>
            <div class="rounded-md bg-muted p-3">
              <p class="text-foreground-muted text-xs">Vietor</p>
              <p class="font-bold">{{ formatMetric(catchAnalytics.weatherSummary.averageWindKph) }} km/h</p>
            </div>
          </div>
          <div class="mt-4 space-y-3">
            <div v-for="lake in catchAnalytics.lakeSummaries" :key="lake.key">
              <div class="mb-1 flex items-center justify-between text-sm">
                <span class="font-semibold">{{ lake.label }}</span>
                <span class="text-foreground-muted">{{ lake.count }} ks · {{ formatWeight(lake.totalWeightKg) }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary-700" :style="{ width: getGroupWidth(lake.count) }" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Mesačný trend</h2>
            <p class="text-foreground-muted text-sm">
              Mesiace s aktivitou oproti rovnakým mesiacom minulého roka.
            </p>
          </div>
          <span
            class="w-fit rounded-md px-3 py-1 text-xs font-bold"
            :class="catchMonthlyTrend.hasComparisonPeriod ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
          >
            {{ catchMonthlyTrend.hasComparisonPeriod ? 's porovnaním' : 'bez minuloročnej bázy' }}
          </span>
        </div>

        <div v-if="visibleMonthlyTrendMonths.length > 0" class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="month in visibleMonthlyTrendMonths"
            :key="month.key"
            class="rounded-md border border-border bg-surface p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-bold">{{ month.label }}</p>
                <p class="text-foreground-muted text-xs">
                  {{ month.currentCatchCount }} ks teraz · {{ month.previousCatchCount }} ks pred rokom
                </p>
              </div>
              <p class="shrink-0 text-sm font-bold" :class="getTrendDeltaClass(month.deltaTotalWeightKg)">
                {{ formatSignedWeight(month.deltaTotalWeightKg) }}
              </p>
            </div>
            <div class="mt-4 space-y-3">
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Aktuálne</span>
                  <span class="font-semibold">{{ formatWeight(month.currentTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary-700"
                    :style="{ width: getTrendWeightWidth(month.currentTotalWeightKg) }"
                  />
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Minulý rok</span>
                  <span class="font-semibold">{{ formatWeight(month.previousTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-accent-500"
                    :style="{ width: getTrendWeightWidth(month.previousTotalWeightKg) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-else
          class="mt-5"
          title="Bez trendu"
          description="Pre zvolený filter zatiaľ nie je dostupné obdobie na mesačné porovnanie."
        />
      </div>

      <div class="mt-4 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Trend podľa druhu</h2>
            <p class="text-foreground-muted text-sm">
              Ktoré druhy tvoria váhu úlovkov oproti rovnakému obdobiu minulého roka.
            </p>
          </div>
          <span
            class="w-fit rounded-md px-3 py-1 text-xs font-bold"
            :class="catchSpeciesTrend.hasComparisonPeriod ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
          >
            {{ catchSpeciesTrend.hasComparisonPeriod ? 's porovnaním' : 'bez minuloročnej bázy' }}
          </span>
        </div>

        <div v-if="visibleSpeciesTrendRows.length > 0" class="mt-5 divide-y divide-border">
          <div
            v-for="row in visibleSpeciesTrendRows"
            :key="row.key"
            class="py-4 first:pt-0 last:pb-0"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p class="font-bold">{{ row.label }}</p>
                <p class="text-foreground-muted text-xs">
                  {{ row.currentCatchCount }} ks teraz · {{ row.previousCatchCount }} ks pred rokom · priemer
                  {{ formatWeight(row.currentAverageWeightKg) }}
                </p>
              </div>
              <p class="shrink-0 text-sm font-bold" :class="getTrendDeltaClass(row.deltaTotalWeightKg)">
                {{ formatSignedWeight(row.deltaTotalWeightKg) }}
              </p>
            </div>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Aktuálne</span>
                  <span class="font-semibold">{{ formatWeight(row.currentTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary-700"
                    :style="{ width: getSpeciesTrendWeightWidth(row.currentTotalWeightKg) }"
                  />
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Minulý rok</span>
                  <span class="font-semibold">{{ formatWeight(row.previousTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-accent-500"
                    :style="{ width: getSpeciesTrendWeightWidth(row.previousTotalWeightKg) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-else
          class="mt-5"
          title="Bez druhového trendu"
          description="Pre zvolený filter zatiaľ nie sú dostupné druhy rýb na porovnanie."
        />
      </div>

      <div class="mt-4 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">Druh a lovné miesto</h2>
            <p class="text-foreground-muted text-sm">
              Najsilnejšie posuny podľa kombinácie ryby a konkrétneho miesta.
            </p>
          </div>
          <span
            class="w-fit rounded-md px-3 py-1 text-xs font-bold"
            :class="catchSpeciesPegTrend.hasComparisonPeriod ? 'bg-success-500/10 text-success-700' : 'bg-muted text-foreground-muted'"
          >
            {{ catchSpeciesPegTrend.hasComparisonPeriod ? 's porovnaním' : 'bez minuloročnej bázy' }}
          </span>
        </div>

        <div v-if="visibleSpeciesPegTrendRows.length > 0" class="mt-5 grid gap-3 lg:grid-cols-2">
          <div
            v-for="row in visibleSpeciesPegTrendRows"
            :key="row.key"
            class="rounded-md border border-border bg-surface p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="font-bold">{{ row.speciesLabel }}</p>
                <p class="text-foreground-muted text-sm">{{ row.pegLabel }}</p>
                <p class="text-foreground-muted mt-1 text-xs">
                  {{ row.currentCatchCount }} ks teraz · {{ row.previousCatchCount }} ks pred rokom
                </p>
              </div>
              <div class="shrink-0 text-left sm:text-right">
                <p class="text-sm font-bold" :class="getTrendDeltaClass(row.deltaTotalWeightKg)">
                  {{ formatSignedWeight(row.deltaTotalWeightKg) }}
                </p>
                <p class="text-foreground-muted text-xs">{{ formatSignedPercent(row.totalWeightChangePercent) }}</p>
              </div>
            </div>
            <div class="mt-4 space-y-3">
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Aktuálne</span>
                  <span class="font-semibold">{{ formatWeight(row.currentTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary-700"
                    :style="{ width: getSpeciesPegTrendWeightWidth(row.currentTotalWeightKg) }"
                  />
                </div>
              </div>
              <div>
                <div class="mb-1 flex items-center justify-between text-xs">
                  <span class="text-foreground-muted">Minulý rok</span>
                  <span class="font-semibold">{{ formatWeight(row.previousTotalWeightKg) }}</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-accent-500"
                    :style="{ width: getSpeciesPegTrendWeightWidth(row.previousTotalWeightKg) }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <AppState
          v-else
          class="mt-5"
          title="Bez signálov podľa miesta"
          description="Pre zvolený filter zatiaľ nie je dostupná kombinácia ryby a lovného miesta na porovnanie."
        />
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div
          v-for="group in analyticsGroups"
          :key="group.label"
          class="rounded-card border border-border bg-surface p-5"
        >
          <h2 class="text-base font-bold">{{ group.label }}</h2>
          <div class="mt-4 space-y-4">
            <div v-for="row in group.rows" :key="row.key">
              <div class="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p class="font-semibold">{{ row.label }}</p>
                  <p class="text-foreground-muted text-xs">{{ row.count }} ks · priemer {{ formatWeight(row.averageWeightKg) }}</p>
                </div>
                <p class="shrink-0 text-sm font-bold">{{ formatWeight(row.totalWeightKg) }}</p>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-accent-500" :style="{ width: getGroupWidth(row.count) }" />
              </div>
            </div>
            <p v-if="group.rows.length === 0" class="text-foreground-muted text-sm">Bez schválených dát.</p>
          </div>
        </div>
      </div>
      </div>

      <div v-show="activeCatchAdminView === 'moderacia'" class="mt-5 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div class="rounded-card border border-border bg-surface p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-bold">Úlovky</h2>
              <p class="text-foreground-muted text-sm">Nové verejné zápisy zostávajú skryté, kým ich správca neschváli.</p>
            </div>
            <select
              v-model="statusFilterModel"
              aria-label="Filtrovať úlovky podľa stavu"
              class="h-11 rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
            >
              <option v-for="filter in statusFilters" :key="filter.value" :value="filter.value">
                {{ filter.label }}
              </option>
            </select>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="catchItem in filteredCatches"
              :key="catchItem.id"
              type="button"
              class="w-full rounded-md border p-4 text-left transition-colors hover:bg-muted"
              :class="selectedCatchId === catchItem.id ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/50' : 'border-border bg-surface'"
              @click="selectedCatchId = catchItem.id"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="font-bold">{{ catchItem.species }} {{ catchItem.weightKg }} kg</p>
                  <p class="text-foreground-muted text-sm">
                    {{ catchItem.angler }} · {{ getLakeName(catchItem.lake) }} · {{ getPegLabel(catchItem.pegId) }}
                  </p>
                </div>
                <StatusBadge
                  class="w-fit shrink-0"
                  :icon="statusMeta[catchItem.status].icon"
                  :label="statusMeta[catchItem.status].label"
                  :tone="statusMeta[catchItem.status].tone"
                />
              </div>
              <div class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Miera</p>
                  <p class="font-semibold">{{ catchItem.lengthCm }} cm</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Nástraha</p>
                  <p class="font-semibold">{{ catchItem.bait }}</p>
                </div>
                <div class="rounded-md bg-muted p-3">
                  <p class="text-foreground-muted text-xs">Čas</p>
                  <p class="font-semibold">{{ formatCatchTime(catchItem.caughtAt) }}</p>
                </div>
              </div>
            </button>
            <AppState
              v-if="filteredCatches.length === 0"
              compact
              title="Bez úlovkov"
              description="Pre zvolený filter zatiaľ nie je žiadny úlovok."
            />
          </div>
        </div>

        <aside class="space-y-6">
          <div
            v-if="selectedCatch"
            ref="catchDetailElement"
            class="rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Detail úlovku</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedCatch.angler }} · {{ formatCatchTime(selectedCatch.caughtAt) }}
                </p>
              </div>
              <StatusBadge
                class="w-fit shrink-0"
                :icon="statusMeta[selectedCatch.status].icon"
                :label="statusMeta[selectedCatch.status].label"
                :tone="statusMeta[selectedCatch.status].tone"
              />
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Jazero a miesto</p>
                <p class="font-semibold">{{ getLakeName(selectedCatch.lake) }}</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ getPegLabel(selectedCatch.pegId) }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Ryba</p>
                <p class="font-semibold">{{ selectedCatch.species }} · {{ selectedCatch.weightKg }} kg</p>
                <p class="text-foreground-muted mt-1 text-xs">{{ selectedCatch.lengthCm }} cm</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Nástraha</p>
                <p class="font-semibold">{{ selectedCatch.bait }}</p>
              </div>
              <div class="rounded-md bg-muted p-3">
                <p class="text-foreground-muted text-xs">Fotka</p>
                <p class="font-semibold">{{ selectedCatchPhoto?.label ?? selectedCatch.photoLabel }}</p>
                <p v-if="selectedCatchPhoto" class="text-foreground-muted mt-1 text-xs">
                  {{ formatFileSize(selectedCatchPhoto.sizeBytes) }} · {{ selectedCatchPhoto.aiStatus }}
                </p>
              </div>
              <div v-if="selectedCatch.weather" class="rounded-md bg-muted p-3 sm:col-span-2">
                <p class="text-foreground-muted text-xs">Podmienky pri zábere</p>
                <p class="font-semibold">
                  {{ selectedCatch.weather.condition }} · voda {{ formatTemperature(selectedCatch.weather.waterTempC) }}
                </p>
                <p class="text-foreground-muted mt-1 text-xs">
                  vzduch {{ formatTemperature(selectedCatch.weather.airTempC) }} · tlak
                  {{ formatMetric(selectedCatch.weather.pressureHpa) }} hPa {{ formatPressureTrend(selectedCatch.weather.pressureTrend) }} · vietor
                  {{ formatMetric(selectedCatch.weather.windKph) }} km/h {{ selectedCatch.weather.windDirection }}
                </p>
              </div>
            </div>

            <div v-if="selectedCatchPhoto" class="mt-5 overflow-hidden rounded-md border border-border bg-surface">
              <img
                :src="selectedCatchPhoto.publicUrl"
                :alt="`Fotka úlovku ${selectedCatch.species}`"
                class="h-56 w-full object-cover"
              >
              <div class="p-4">
                <p class="text-sm font-bold">AI metadata</p>
                <p class="text-foreground-muted mt-1 text-sm">
                  {{ selectedCatchPhoto.aiNotes }}
                </p>
                <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span class="rounded-md bg-primary-50 dark:bg-primary-950/50 px-2.5 py-1 text-primary-800 dark:text-primary-200">
                    {{ selectedCatchPhoto.status }}
                  </span>
                  <span class="rounded-md bg-muted px-2.5 py-1 text-foreground-muted">
                    {{ selectedCatchPhoto.storagePath }}
                  </span>
                </div>
              </div>
            </div>

            <div
              v-if="selectedCatchNeedsChipWorkflow"
              class="mt-5 rounded-md border p-4"
              :class="selectedCatchFishCandidate
                ? 'border-warning-500/30 bg-warning-500/10'
                : 'border-success-500/30 bg-success-500/10'"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold">
                    {{ selectedCatchFishCandidate ? 'Vyžaduje kontrolu čipu' : 'Kontrola čipu je spracovaná' }}
                  </p>
                  <p class="mt-1 text-sm text-foreground-muted">
                    {{ getLakeName(selectedCatch.lake) }} má nastavený limit
                    {{ selectedCatchLargeFishRule?.thresholdKg }} kg.
                  </p>
                  <p
                    class="mt-2 text-xs font-bold"
                    :class="selectedCatchManagerAvailability?.available ? 'text-success-700' : 'text-warning-800'"
                  >
                    {{ selectedCatchManagerAvailability?.available
                      ? `Úlovok vznikol počas služby: ${selectedCatchManagerAvailability.matchingWindow?.label}`
                      : 'Úlovok vznikol mimo služby správcu' }}
                  </p>
                  <p v-if="selectedCatchLargeFishRule" class="mt-1 text-xs text-foreground-muted">
                    Služba: {{ formatFishManagerAvailability(selectedCatchLargeFishRule) }}
                  </p>
                </div>
                <StatusBadge
                  :icon="selectedCatchFishCandidate ? 'i-heroicons-identification' : 'i-heroicons-check-circle'"
                  :label="selectedCatchFishCandidate ? 'čaká' : 'prepojené'"
                  :tone="selectedCatchFishCandidate ? 'warning' : 'success'"
                  size="xs"
                />
              </div>
              <UButton
                v-if="selectedCatchFishCandidate"
                class="mt-4 min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
                :to="{ path: '/admin/ryby', query: { catchId: selectedCatch.id } }"
                icon="i-heroicons-arrow-top-right-on-square"
                color="warning"
              >
                Spracovať v registri rýb
              </UButton>
              <UButton
                v-else
                class="mt-4 min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
                to="/admin/ryby"
                icon="i-heroicons-tag"
                variant="soft"
              >
                Otvoriť register rýb
              </UButton>
            </div>

            <form class="mt-5 rounded-md border border-border bg-surface p-4" @submit.prevent="saveCorrection">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-sm font-bold">Oprava údajov</p>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Korekcia vie ponechať, presunúť alebo odpojiť väzbu na zápisník výpravy.
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  pred zverejnením
                </span>
              </div>

              <fieldset :disabled="!canManageCatches" class="contents">
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <label class="block">
                    <span class="text-sm font-semibold">Rybár</span>
                    <input
                      v-model="correctionForm.angler"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Druh</span>
                    <input
                      v-model="correctionForm.species"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Jazero</span>
                    <select
                      v-model="correctionForm.lake"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                      <option v-for="lake in lakes" :key="lake.slug" :value="lake.slug">{{ lake.name }}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Miesto</span>
                    <select
                      v-model="correctionForm.pegId"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                      <option v-for="peg in correctionPegs" :key="peg.id" :value="peg.id">{{ peg.label }}</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Váha kg</span>
                    <input
                      v-model.number="correctionForm.weightKg"
                      type="number"
                      min="0"
                      step="0.1"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Miera cm</span>
                    <input
                      v-model.number="correctionForm.lengthCm"
                      type="number"
                      min="0"
                      step="1"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="text-sm font-semibold">Nástraha</span>
                    <input
                      v-model="correctionForm.bait"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                  </label>
                  <label class="block">
                    <span class="text-sm font-semibold">Čas úlovku</span>
                    <input
                      v-model="correctionForm.caughtAt"
                      type="datetime-local"
                      class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                    >
                  </label>
                  <label class="flex items-center gap-2 self-end rounded-md bg-muted p-3 text-sm font-semibold">
                    <input v-model="correctionForm.released" type="checkbox" class="h-4 w-4 accent-primary-700">
                    Ryba pustená späť
                  </label>
                  <label class="block sm:col-span-2">
                    <span class="text-sm font-semibold">Poznámka rybára</span>
                    <textarea
                      v-model="correctionForm.notes"
                      rows="3"
                      class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </label>
                  <div class="sm:col-span-2 rounded-md border border-border bg-muted/40 p-4">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p class="text-sm font-bold">Zápisník výpravy</p>
                        <p class="text-foreground-muted mt-1 text-sm">
                          {{ selectedLogbook ? `${selectedLogbook.title} · ${selectedLogbook.shareCode}` : 'Úlovok zatiaľ nie je v žiadnom zápisníku.' }}
                        </p>
                      </div>
                      <span
                        v-if="selectedLogbook"
                        class="w-fit rounded-md bg-surface px-2.5 py-1 text-xs font-bold text-foreground-muted"
                      >
                        {{ tripLogbookModeLabels[selectedLogbook.mode] }}
                      </span>
                    </div>

                    <div class="mt-4 grid gap-2 sm:grid-cols-3">
                      <button
                        v-for="option in logbookLinkOptions"
                        :key="option.value"
                        type="button"
                        :disabled="!canManageCatches"
                        class="rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        :class="
                          correctionForm.logbookLinkMode === option.value
                            ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/50 text-primary-950 dark:text-primary-100'
                            : 'border-border bg-surface text-foreground hover:bg-muted'
                        "
                        @click="correctionForm.logbookLinkMode = option.value"
                      >
                        <span class="flex items-center gap-2 text-sm font-bold">
                          <UIcon :name="option.icon" class="h-4 w-4 shrink-0" />
                          {{ option.label }}
                        </span>
                        <span class="text-foreground-muted mt-1 block text-xs leading-5">
                          {{ option.description }}
                        </span>
                      </button>
                    </div>

                    <label v-if="correctionForm.logbookLinkMode === 'move'" class="mt-4 block">
                      <span class="text-sm font-semibold">Cieľový zápisník</span>
                      <select
                        v-model="correctionForm.targetLogbookId"
                        class="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm sm:h-10"
                        :disabled="!canManageCatches || compatibleCorrectionLogbooks.length === 0"
                      >
                        <option v-if="compatibleCorrectionLogbooks.length === 0" value="">
                          Žiadny otvorený zápisník pre toto miesto
                        </option>
                        <option
                          v-for="logbook in compatibleCorrectionLogbooks"
                          :key="logbook.id"
                          :value="logbook.id"
                        >
                          {{ formatLogbookSummary(logbook.id) }}
                        </option>
                      </select>
                    </label>
                    <p v-else-if="correctionForm.logbookLinkMode === 'detach'" class="text-foreground-muted mt-4 text-sm">
                      Po uložení nebude tento úlovok patriť do žiadnej skupinovej tabuľky, ale ostane v interných úlovkoch.
                    </p>
                  </div>
                </div>
              </fieldset>

              <ValidationSummary
                class="mt-4"
                :messages="correctionValidationMessages"
                valid-title="Oprava je pripravená"
                valid-description="Údaje majú platné miesto, čas, rozmery aj nástrahu."
              />

              <DataStatusNotice
                v-if="correctionSubmitMessage"
                class="mt-3"
                :description="correctionSubmitMessage"
                :title="correctionNoticeTitle"
                :tone="correctionNoticeTone"
              />

              <UButton
                class="mt-4 min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
                type="submit"
                icon="i-heroicons-pencil-square"
                variant="soft"
                :disabled="!canManageCatches || !correctionReady || correctionSubmitStatus === 'submitting'"
                :loading="correctionSubmitStatus === 'submitting'"
              >
                Uložiť opravu
              </UButton>
            </form>

            <div class="mt-5 rounded-md border border-border bg-surface p-4">
              <p class="text-sm font-bold">Poznámka rybára</p>
              <p class="text-foreground-muted mt-2 text-sm">{{ selectedCatch.notes }}</p>
            </div>

            <div v-if="selectedLogbookEntry && selectedLogbook" class="mt-5 rounded-md border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/50 p-4">
              <p class="text-sm font-bold text-primary-900 dark:text-primary-100">Aktuálny zápisník</p>
              <p class="text-primary-800 dark:text-primary-200 mt-1 text-sm">
                {{ selectedLogbook.title }} · {{ selectedLogbook.shareCode }} · {{ tripLogbookStatusLabels[selectedLogbook.status] }}
              </p>
            </div>

            <div class="mt-5 rounded-md border border-border bg-surface p-4">
              <p class="text-sm font-bold">Rozhodnutie správcu</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  class="min-h-11 rounded-md border px-3 py-2 text-sm font-semibold sm:min-h-10"
                  :disabled="!canManageCatches"
                  :class="decisionMode === 'approve' ? 'border-success-500 bg-success-500/10 text-success-700' : 'border-border bg-surface'"
                  @click="decisionMode = 'approve'"
                >
                  Schváliť
                </button>
                <button
                  type="button"
                  class="min-h-11 rounded-md border px-3 py-2 text-sm font-semibold sm:min-h-10"
                  :disabled="!canManageCatches"
                  :class="decisionMode === 'pending' ? 'border-warning-500 bg-warning-500/10 text-warning-800' : 'border-border bg-surface'"
                  @click="decisionMode = 'pending'"
                >
                  Nechať čakať
                </button>
                <button
                  type="button"
                  class="min-h-11 rounded-md border px-3 py-2 text-sm font-semibold sm:min-h-10"
                  :disabled="!canManageCatches"
                  :class="decisionMode === 'reject' ? 'border-error-500 bg-error-500/10 text-error-700' : 'border-border bg-surface'"
                  @click="decisionMode = 'reject'"
                >
                  Zamietnuť
                </button>
              </div>
              <label class="mt-4 block">
                <span class="text-sm font-semibold">Poznámka ku kontrole</span>
                <textarea
                  v-model="reviewNote"
                  rows="4"
                  :readonly="!canManageCatches"
                  class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
              <UButton
                class="mt-4 min-h-11 w-full justify-center sm:min-h-8 sm:w-auto"
                icon="i-heroicons-check"
                variant="soft"
                :disabled="!canManageCatches || decisionSubmitStatus === 'submitting'"
                :loading="decisionSubmitStatus === 'submitting'"
                @click="saveDecision"
              >
                Uložiť rozhodnutie
              </UButton>
              <DataStatusNotice
                v-if="decisionSubmitMessage"
                class="mt-3"
                :description="decisionSubmitMessage"
                :title="decisionNoticeTitle"
                :tone="decisionNoticeTone"
              />
            </div>
          </div>

          <AppState
            v-else
            compact
            title="Vyberte úlovok"
            description="Detail schvaľovania sa zobrazí po výbere úlovku zo zoznamu."
          />
        </aside>
      </div>
      </div>
    </section>
  </div>
</template>
