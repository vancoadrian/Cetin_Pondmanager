<script setup lang="ts">
import { auditSeverityLabels } from '~/services/auditLogService'
import {
  deploymentEnvironmentLabels,
  environmentReadinessCategoryLabels,
  environmentReadinessStatusLabels,
  environmentReadinessSummaryLabels,
} from '~/services/environmentReadinessService'
import {
  formatLocalDataExportBytes,
  LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION,
  LOCAL_DATA_RESTORE_CONFIRMATION,
  localDataExportAssetPolicyLabels,
  localDataImportPreviewStatusLabels,
} from '~/services/localDataExportService'

useHead({ title: 'Admin systém' })

const {
  activeSystemAdminView,
  activeSystemAdminViewOption,
  auditDetailValue,
  auditEventLabel,
  auditSeverityClass,
  canRestoreImportPreview,
  checks,
  degradedChecks,
  downloadLocalDataExport,
  downloadSafetyBackup,
  downloadingExportPolicy,
  downloadingSafetyBackupId,
  environmentReadiness,
  errorContextEntries,
  exportActionStatus,
  formatAuditEntityLabel,
  formatAuditSummary,
  formatDate,
  formatSystemEnvironment,
  handleImportBackupChange,
  handleSystemAdminTabsKeydown,
  hasSystemFetchError,
  highlightedReadinessItems,
  importBackupInput,
  importPreview,
  importPreviewFileName,
  importPreviewIntegrityIcon,
  importPreviewIntegrityStatusLabels,
  importPreviewIntegrityTone,
  importPreviewIssueClass,
  importPreviewPending,
  importPreviewStatusIcon,
  importPreviewStatusMessage,
  importPreviewStatusTone,
  importPreviewStoreRows,
  importPreviewStoreStatusIcon,
  importPreviewStoreStatusLabels,
  importPreviewStoreStatusTone,
  isSystemFetchLoading,
  localDataAssetGroups,
  localDataBackupAuditEvents,
  localDataExportSummary,
  localDataOpsStepClass,
  localDataOpsStepIconClass,
  localDataOpsStepTone,
  localDataOpsSteps,
  metadataEntries,
  openImportBackupPicker,
  previewSafetyBackup,
  previewSafetyBackupCleanup,
  previewingSafetyBackupId,
  readinessAttentionCount,
  readinessConfiguredCount,
  readinessDisplayEnvironment,
  readinessDisplayStatus,
  readinessItemKey,
  readinessMissingRequiredCount,
  readinessSeverityLabels,
  readinessStatusIcon,
  readinessStatusTone,
  readinessSummaryIcon,
  readinessSummaryTone,
  recentErrorEntries,
  refreshSystem,
  restoreConfirmPhrase,
  restoreConfirmationMatches,
  restoreImportedBackup,
  restorePending,
  restoreStatusMessage,
  runSafetyBackupCleanup,
  safetyBackupCleanupConfirmPhrase,
  safetyBackupCleanupConfirmationMatches,
  safetyBackupCleanupIcon,
  safetyBackupCleanupKeepRecent,
  safetyBackupCleanupPending,
  safetyBackupCleanupPreview,
  safetyBackupCleanupRemovableBackups,
  safetyBackupCleanupStatusMessage,
  safetyBackupCleanupTone,
  safetyBackups,
  selectSystemAdminView,
  severityClass,
  severityLabels,
  shortChecksum,
  statusIcon,
  statusLabels,
  statusTone,
  systemAdminTabsRef,
  systemAdminViewOptions,
  systemHealth,
  topLocalDataStores,
} = await useAdminSystemStatus()
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Systém"
      description="Kontroly stavu, záznam chýb, zálohy a pripravenosť prevádzky."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="flex flex-col gap-4 rounded-card border border-border bg-primary-900 p-5 text-white lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-sm font-semibold text-accent-300">{{ systemHealth?.service }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="text-2xl font-bold">Stav systému</h2>
            <StatusBadge
              :icon="statusIcon(systemHealth?.status ?? 'ok')"
              :label="statusLabels[systemHealth?.status ?? 'ok']"
              :tone="statusTone(systemHealth?.status ?? 'ok')"
              surface="dark"
            />
          </div>
          <p class="mt-2 text-sm text-white/75">
            Posledná kontrola {{ formatDate(systemHealth?.checkedAt) }} · prostredie {{ formatSystemEnvironment(systemHealth?.environment) }}
          </p>
        </div>
        <UButton icon="i-heroicons-arrow-path" color="neutral" variant="outline" class="border-white/30 bg-white/10 text-white hover:bg-white/15" @click="refreshSystem">
          Obnoviť
        </UButton>
      </div>

      <DataStatusNotice
        v-if="isSystemFetchLoading || hasSystemFetchError"
        class="mt-6"
        :title="hasSystemFetchError ? 'Časť systémových dát sa nepodarilo načítať' : 'Načítavam systémové dáta'"
        :description="hasSystemFetchError ? 'Zobrazujeme posledný dostupný alebo predvolený stav. Skús obnoviť dáta alebo skontroluj záznam servera.' : 'Kontrolujeme stav systému, dátové úložiská, zálohy a audit.'"
        :tone="hasSystemFetchError ? 'warning' : 'info'"
        :loading="isSystemFetchLoading && !hasSystemFetchError"
        :action-label="hasSystemFetchError ? 'Skúsiť znova' : ''"
        :action-loading="isSystemFetchLoading"
        @action="refreshSystem"
      />

      <div class="mt-6 border-b border-border pb-5">
        <div
          ref="systemAdminTabsRef"
          class="flex gap-1 overflow-x-auto rounded-md bg-muted p-1"
          role="tablist"
          aria-label="Sekcie systémovej administrácie"
          @keydown="handleSystemAdminTabsKeydown"
        >
          <button
            v-for="option in systemAdminViewOptions"
            :key="option.id"
            type="button"
            role="tab"
            class="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="activeSystemAdminView === option.id
              ? 'bg-white text-primary-900 shadow-sm'
              : 'text-foreground-muted hover:bg-white/70 hover:text-foreground'"
            :aria-selected="activeSystemAdminView === option.id"
            :tabindex="activeSystemAdminView === option.id ? 0 : -1"
            :data-system-admin-view="option.id"
            @click="selectSystemAdminView(option.id)"
          >
            <UIcon :name="option.icon" class="h-4 w-4 shrink-0" />
            {{ option.label }}
          </button>
        </div>
        <div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-foreground-muted text-sm" aria-live="polite">
            {{ activeSystemAdminViewOption.description }}
          </p>
          <UButton
            v-if="activeSystemAdminView !== 'chyby' && (systemHealth?.recentErrors.total24h ?? 0) > 0"
            icon="i-heroicons-exclamation-triangle"
            color="error"
            size="sm"
            variant="soft"
            @click="selectSystemAdminView('chyby')"
          >
            Chyby za 24 h ({{ systemHealth?.recentErrors.total24h ?? 0 }})
          </UButton>
          <UButton
            v-else-if="activeSystemAdminView !== 'prehlad' && readinessAttentionCount > 0"
            icon="i-heroicons-wrench-screwdriver"
            size="sm"
            variant="soft"
            @click="selectSystemAdminView('prehlad')"
          >
            Pripravenosť ({{ readinessAttentionCount }})
          </UButton>
        </div>
      </div>

      <div v-if="activeSystemAdminView === 'prehlad'" class="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Kontroly</p>
          <p class="mt-2 text-2xl font-bold">{{ checks.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">server, dáta, notifikácie</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Na pozornosť</p>
          <p class="mt-2 text-2xl font-bold">{{ degradedChecks.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">obmedzené alebo výpadok</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Chyby 24h</p>
          <p class="mt-2 text-2xl font-bold">{{ systemHealth?.recentErrors.total24h ?? 0 }}</p>
          <p class="text-foreground-muted mt-1 text-sm">záznamy aplikácie a servera</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-3 sm:p-4">
          <p class="text-foreground-muted text-sm">Kritické 24h</p>
          <p class="mt-2 text-2xl font-bold">{{ systemHealth?.recentErrors.critical24h ?? 0 }}</p>
          <p class="text-foreground-muted mt-1 text-sm">zvyšujú stav na pozor</p>
        </div>
      </div>

      <div
        v-if="activeSystemAdminView === 'prehlad'"
        class="mt-6 min-w-0 rounded-card border border-border bg-surface p-5"
      >
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold">Pripravenosť prostredia</h2>
              <StatusBadge
                :icon="readinessSummaryIcon(readinessDisplayStatus)"
                :label="environmentReadinessSummaryLabels[readinessDisplayStatus]"
                :tone="readinessSummaryTone(readinessDisplayStatus)"
              />
            </div>
            <p class="text-foreground-muted mt-1 text-sm">
              Profil {{ readinessDisplayEnvironment ? deploymentEnvironmentLabels[readinessDisplayEnvironment] : 'nezistený' }} kontroluje nastavenia pre URL, úložisko, notifikácie, reporty a počasie.
            </p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center sm:min-w-80">
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-2xl font-bold">{{ readinessConfiguredCount }}</p>
              <p class="text-foreground-muted text-xs font-semibold">nastavené</p>
            </div>
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-2xl font-bold">{{ readinessAttentionCount }}</p>
              <p class="text-foreground-muted text-xs font-semibold">pozor</p>
            </div>
            <div class="rounded-md bg-muted px-3 py-2">
              <p class="text-2xl font-bold">{{ readinessMissingRequiredCount }}</p>
              <p class="text-foreground-muted text-xs font-semibold">povinné</p>
            </div>
          </div>
        </div>

        <div class="mt-5 grid gap-3 lg:grid-cols-2">
          <article
            v-for="item in highlightedReadinessItems"
            :key="readinessItemKey(item)"
            class="min-w-0 rounded-md border border-border bg-white p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-bold">{{ item.label }}</h3>
                  <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground-muted">
                    {{ environmentReadinessCategoryLabels[item.category] }}
                  </span>
                  <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground-muted">
                    {{ readinessSeverityLabels[item.severity] }}
                  </span>
                </div>
                <p class="text-foreground-muted mt-2 text-sm">{{ item.description }}</p>
                <p class="mt-2 break-all text-xs font-semibold text-foreground-muted">{{ item.key }}</p>
                <p class="mt-2 text-sm">{{ item.message }}</p>
              </div>
              <StatusBadge
                class="w-fit shrink-0"
                :icon="readinessStatusIcon(item.status)"
                :label="environmentReadinessStatusLabels[item.status]"
                :tone="readinessStatusTone(item.status)"
              />
            </div>
          </article>

          <p
            v-if="highlightedReadinessItems.length === 0"
            class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted lg:col-span-2"
          >
            {{ environmentReadiness ? 'Pre aktuálne prostredie nie sú evidované žiadne chýbajúce alebo testovacie nastavenia.' : 'Detail položiek je dostupný po úspešnom načítaní stavu systému.' }}
          </p>
        </div>
      </div>

      <div v-if="activeSystemAdminView === 'prehlad'" class="mt-6 min-w-0">
        <div class="min-w-0">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Kontroly stavu</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Kontroly dostupnosti aplikácie, úložiska a dôležitých služieb.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ checks.length }} kontrol
              </span>
            </div>

            <div class="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
              <article
                v-for="check in checks"
                :key="check.id"
                class="min-w-0 rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <UIcon :name="statusIcon(check.status)" class="h-5 w-5" :class="check.status === 'ok' ? 'text-success-700' : 'text-warning-700'" />
                      <h3 class="font-bold">{{ check.label }}</h3>
                    </div>
                    <p class="text-foreground-muted mt-2 text-sm">{{ check.detail }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">{{ formatDate(check.checkedAt) }}</p>
                  </div>
                  <StatusBadge
                    class="w-fit shrink-0"
                    :icon="statusIcon(check.status)"
                    :label="statusLabels[check.status]"
                    :tone="statusTone(check.status)"
                  />
                </div>

                <div v-if="metadataEntries(check).length" class="mt-4 flex flex-wrap gap-2">
                  <span
                    v-for="entry in metadataEntries(check)"
                    :key="`${check.id}-${entry.key}`"
                    class="max-w-full break-all rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
                  >
                    {{ entry.key }}: {{ entry.value }}
                  </span>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="activeSystemAdminView === 'data' || activeSystemAdminView === 'chyby'"
        class="mt-6 min-w-0"
      >
          <div
            v-if="activeSystemAdminView === 'data'"
            class="min-w-0 rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Lokálne dáta</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Prevádzkové dáta a súbory zahrnuté v zálohe systému.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ localDataExportSummary?.totals.stores ?? 0 }} úložísk
              </span>
            </div>
            <p class="text-foreground-muted mt-2 text-sm">
              Stav dátového úložiska, posledných chýb a pripravenosti prevádzkových služieb.
            </p>
            <p class="mt-4 break-all rounded-md bg-muted p-3 text-xs font-semibold text-foreground-muted">
              {{ systemHealth?.dataDirectory ?? 'bez cesty' }}
            </p>

            <div class="mt-4 border-y border-border py-3">
              <div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div
                  v-for="step in localDataOpsSteps"
                  :key="step.id"
                  class="flex min-w-0 gap-3 rounded-md border p-3"
                  :class="localDataOpsStepClass(step.status)"
                >
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" :class="localDataOpsStepIconClass(step.status)">
                    <UIcon :name="step.icon" class="h-5 w-5" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-semibold">{{ step.label }}</p>
                      <StatusBadge
                        :icon="step.icon"
                        :label="step.statusLabel"
                        size="xs"
                        :tone="localDataOpsStepTone(step.status)"
                      />
                    </div>
                    <p class="text-foreground-muted mt-1 break-words text-xs">
                      {{ step.detail }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xl font-bold">{{ localDataExportSummary?.totals.records ?? 0 }}</p>
                <p class="text-foreground-muted text-xs font-semibold">záznamov</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xl font-bold">{{ localDataExportSummary?.totals.assetFiles ?? 0 }}</p>
                <p class="text-foreground-muted text-xs font-semibold">súborov</p>
              </div>
              <div class="rounded-md bg-muted px-3 py-2">
                <p class="text-xl font-bold">{{ formatLocalDataExportBytes(localDataExportSummary?.totals.assetSizeBytes ?? 0) }}</p>
                <p class="text-foreground-muted text-xs font-semibold">súborov</p>
              </div>
            </div>

            <div class="mt-4 flex flex-col gap-2 sm:flex-row">
              <UButton
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                :loading="downloadingExportPolicy === 'manifest'"
                @click="downloadLocalDataExport('manifest')"
              >
                Stiahnuť dáta
              </UButton>
              <UButton
                icon="i-heroicons-archive-box-arrow-down"
                color="neutral"
                variant="soft"
                :loading="downloadingExportPolicy === 'inline'"
                @click="downloadLocalDataExport('inline')"
              >
                Plná záloha
              </UButton>
            </div>

            <p v-if="exportActionStatus" class="mt-3 rounded-md bg-muted p-3 text-sm text-foreground-muted">
              {{ exportActionStatus }}
            </p>

            <div class="mt-5 border-t border-border pt-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="font-bold">Ochranné zálohy</h3>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Automatické zálohy aktuálneho stavu, ktoré vzniknú tesne pred ostrou obnovou dát.
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  {{ safetyBackups.length }} súborov
                </span>
              </div>
              <p class="mt-3 rounded-md bg-muted p-3 text-xs font-semibold text-foreground-muted">
                Interný archív ochranných záloh
              </p>

              <div v-if="safetyBackups.length" class="mt-4 space-y-3">
                <article
                  v-for="backup in safetyBackups"
                  :key="backup.id"
                  class="rounded-md border border-border bg-white p-4"
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="font-semibold">Ochranná záloha {{ formatDate(backup.createdAt) }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">
                        {{ formatDate(backup.createdAt) }} · {{ formatLocalDataExportBytes(backup.sizeBytes) }}
                      </p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <UButton
                        icon="i-heroicons-document-magnifying-glass"
                        color="primary"
                        variant="soft"
                        size="sm"
                        :loading="previewingSafetyBackupId === backup.id"
                        @click="previewSafetyBackup(backup)"
                      >
                        Skontrolovať
                      </UButton>
                      <UButton
                        icon="i-heroicons-arrow-down-tray"
                        color="neutral"
                        variant="soft"
                        size="sm"
                        :loading="downloadingSafetyBackupId === backup.id"
                        @click="downloadSafetyBackup(backup)"
                      >
                        Stiahnuť
                      </UButton>
                    </div>
                  </div>

                  <div class="mt-3 flex flex-wrap gap-2">
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      úložiská: {{ backup.stores }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      záznamy: {{ backup.records }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      súbory: {{ backup.assetFiles }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      typ: {{ localDataExportAssetPolicyLabels[backup.assetPolicy] }}
                    </span>
                  </div>
                </article>
              </div>

              <p
                v-else
                class="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted"
              >
                Ochranná záloha sa vytvorí automaticky pri prvej ostrej obnove aplikačných dát.
              </p>

              <div class="mt-4 rounded-md border border-border bg-muted/50 p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 class="font-bold">Retencia archívu</h4>
                    <p class="text-foreground-muted mt-1 text-sm">
                      Skontroluje staršie ochranné zálohy a odstráni ich až po potvrdení frázy.
                    </p>
                  </div>
                  <span class="w-fit rounded-md bg-white px-2.5 py-1 text-xs font-bold text-foreground-muted">
                    ponechať {{ safetyBackupCleanupKeepRecent }}
                  </span>
                </div>

                <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,12rem)_auto] sm:items-end">
                  <label class="block">
                    <span class="text-sm font-semibold">Ponechať najnovšie</span>
                    <input
                      v-model.number="safetyBackupCleanupKeepRecent"
                      type="number"
                      min="2"
                      max="50"
                      class="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                    >
                  </label>
                  <UButton
                    icon="i-heroicons-calculator"
                    color="neutral"
                    variant="outline"
                    :loading="safetyBackupCleanupPending"
                    @click="previewSafetyBackupCleanup"
                  >
                    Prepočítať čistenie
                  </UButton>
                </div>

                <div v-if="safetyBackupCleanupPreview" class="mt-4 rounded-md border border-border bg-white p-3">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="font-semibold">
                        {{ safetyBackupCleanupRemovableBackups.length }} z {{ safetyBackupCleanupPreview.candidateCount }} súborov na odstránenie
                      </p>
                      <p class="text-foreground-muted mt-1 text-sm">
                        Uvoľní približne {{ formatLocalDataExportBytes(safetyBackupCleanupPreview.removableSizeBytes) }}. Najnovšie ponechané: {{ safetyBackupCleanupPreview.retainedBackups.length }}.
                      </p>
                    </div>
                    <StatusBadge
                      class="w-fit shrink-0"
                      :icon="safetyBackupCleanupIcon(safetyBackupCleanupRemovableBackups.length > 0)"
                      :label="safetyBackupCleanupRemovableBackups.length ? 'vyžaduje potvrdenie' : 'bez mazania'"
                      :tone="safetyBackupCleanupTone(safetyBackupCleanupRemovableBackups.length > 0)"
                    />
                  </div>

                  <div v-if="safetyBackupCleanupRemovableBackups.length" class="mt-3 space-y-2">
                    <div
                      v-for="backup in safetyBackupCleanupRemovableBackups.slice(0, 4)"
                      :key="backup.id"
                      class="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span class="font-semibold">Ochranná záloha {{ formatDate(backup.createdAt) }}</span>
                      <span>{{ formatLocalDataExportBytes(backup.sizeBytes) }}</span>
                    </div>
                    <p v-if="safetyBackupCleanupRemovableBackups.length > 4" class="text-xs font-semibold text-foreground-muted">
                      + ďalších {{ safetyBackupCleanupRemovableBackups.length - 4 }} súborov
                    </p>

                    <div class="mt-4 rounded-md border border-warning-500/30 bg-warning-500/10 p-3">
                      <p class="text-xs font-semibold text-warning-800/80">
                        Pre zmazanie prepíš: <span class="font-bold">{{ LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION }}</span>
                      </p>
                      <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                        <UInput
                          v-model="safetyBackupCleanupConfirmPhrase"
                          class="min-w-0 flex-1"
                          placeholder="Potvrdzovacia fráza"
                        />
                        <UButton
                          color="warning"
                          icon="i-heroicons-trash"
                          :disabled="!safetyBackupCleanupConfirmationMatches"
                          :loading="safetyBackupCleanupPending"
                          @click="runSafetyBackupCleanup"
                        >
                          Vyčistiť staré
                        </UButton>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-if="safetyBackupCleanupStatusMessage" class="mt-3 rounded-md bg-white px-3 py-2 text-sm text-foreground-muted">
                  {{ safetyBackupCleanupStatusMessage }}
                </p>
              </div>
            </div>

            <div class="mt-5 border-t border-border pt-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="font-bold">História záloh</h3>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Posledné exporty, kontroly importu a ostré obnovy aplikačných dát.
                  </p>
                </div>
                <UButton
                  icon="i-heroicons-clipboard-document-list"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  to="/admin/audit"
                >
                  Audit
                </UButton>
              </div>

              <div v-if="localDataBackupAuditEvents.length" class="mt-4 divide-y divide-border">
                <div
                  v-for="event in localDataBackupAuditEvents"
                  :key="event.id"
                  class="py-3 first:pt-0 last:pb-0"
                >
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="font-semibold">{{ auditEventLabel(event) }}</p>
                        <span class="w-fit rounded-md px-2 py-0.5 text-xs font-bold" :class="auditSeverityClass(event.severity)">
                          {{ auditSeverityLabels[event.severity] }}
                        </span>
                      </div>
                      <p class="text-foreground-muted mt-1 text-sm">{{ formatAuditSummary(event.summary) }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">
                        {{ event.actorLabel }} · {{ formatDate(event.createdAt) }}
                      </p>
                    </div>
                    <span class="max-w-full break-all rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground-muted">
                      {{ formatAuditEntityLabel(event) }}
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-if="auditDetailValue(event, 'mode')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      režim: {{ auditDetailValue(event, 'mode') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'assetPolicy')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      typ súborov: {{ auditDetailValue(event, 'assetPolicy') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'stores')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      úložiská: {{ auditDetailValue(event, 'stores') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'records')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      záznamy: {{ auditDetailValue(event, 'records') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'issues')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      upozornenia: {{ auditDetailValue(event, 'issues') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'safetyBackupPath')"
                      class="max-w-full break-all rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      ochranná záloha: {{ auditDetailValue(event, 'safetyBackupPath') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'keepRecent')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      ponechané: {{ auditDetailValue(event, 'keepRecent') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'removedCount')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      zmazané: {{ auditDetailValue(event, 'removedCount') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'removedSizeBytes')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      veľkosť: {{ formatLocalDataExportBytes(Number(auditDetailValue(event, 'removedSizeBytes'))) }}
                    </span>
                  </div>
                </div>
              </div>

              <p
                v-else
                class="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted"
              >
                Zatiaľ tu nie je žiadny export, kontrola zálohy ani obnova.
              </p>
            </div>

            <div class="mt-5 border-t border-border pt-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="font-bold">Kontrola zálohy</h3>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Nahratá záloha sa iba skontroluje. Lokálne dáta sa týmto krokom nemenia.
                  </p>
                </div>
                <UButton
                  icon="i-heroicons-document-magnifying-glass"
                  color="neutral"
                  variant="outline"
                  :loading="importPreviewPending"
                  @click="openImportBackupPicker"
                >
                  Skontrolovať zálohu
                </UButton>
                <input
                  ref="importBackupInput"
                  accept="application/json,.json"
                  class="hidden"
                  type="file"
                  @change="handleImportBackupChange"
                >
              </div>

              <div v-if="importPreview" class="mt-4 rounded-md border border-border bg-white p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-bold">{{ importPreviewFileName || 'Záloha' }}</p>
                      <StatusBadge
                        :icon="importPreviewStatusIcon(importPreview.status)"
                        :label="localDataImportPreviewStatusLabels[importPreview.status]"
                        :tone="importPreviewStatusTone(importPreview.status)"
                      />
                    </div>
                    <p class="text-foreground-muted mt-2 text-sm">
                      {{ importPreviewStatusMessage }}
                    </p>
                    <p class="text-foreground-muted mt-1 break-all text-xs">
                      {{ importPreview.exportId ?? 'bez export ID' }} · {{ formatDate(importPreview.exportedAt) }}
                    </p>
                    <div v-if="importPreview.integrity" class="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        :icon="importPreviewIntegrityIcon(importPreview.integrity.status)"
                        :label="importPreviewIntegrityStatusLabels[importPreview.integrity.status]"
                        :tone="importPreviewIntegrityTone(importPreview.integrity.status)"
                      />
                      <span class="break-all rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                        odtlačok: {{ shortChecksum(importPreview.integrity.checksum) }}
                      </span>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-2 text-center sm:min-w-64">
                    <div class="rounded-md bg-muted px-2 py-2">
                      <p class="text-lg font-bold">{{ importPreview.totals.records }}</p>
                      <p class="text-foreground-muted text-xs font-semibold">záznamov</p>
                    </div>
                    <div class="rounded-md bg-muted px-2 py-2">
                      <p class="text-lg font-bold">{{ importPreview.totals.stores }}</p>
                      <p class="text-foreground-muted text-xs font-semibold">úložísk</p>
                    </div>
                    <div class="rounded-md bg-muted px-2 py-2">
                      <p class="text-lg font-bold">{{ importPreview.totals.assetFiles }}</p>
                      <p class="text-foreground-muted text-xs font-semibold">súborov</p>
                    </div>
                  </div>
                </div>

                <div v-if="importPreview.issues.length" class="mt-4 space-y-2">
                  <div
                    v-for="issue in importPreview.issues"
                    :key="issue.code"
                    class="rounded-md px-3 py-2 text-sm"
                    :class="importPreviewIssueClass(issue.severity)"
                  >
                    {{ issue.message }}
                  </div>
                </div>

                <div v-if="importPreviewStoreRows.length" class="mt-4 space-y-2">
                  <div
                    v-for="store in importPreviewStoreRows"
                    :key="store.id"
                    class="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"
                  >
                    <div class="min-w-0">
                      <p class="font-semibold">{{ store.label }}</p>
                      <p class="text-foreground-muted text-xs">
                        Aktuálne {{ store.currentRecordCount ?? 0 }} · v zálohe {{ store.incomingRecordCount }}
                      </p>
                    </div>
                    <StatusBadge
                      class="shrink-0"
                      :icon="importPreviewStoreStatusIcon(store.status)"
                      :label="importPreviewStoreStatusLabels[store.status]"
                      size="xs"
                      :tone="importPreviewStoreStatusTone(store.status)"
                    />
                  </div>
                </div>

                <div v-if="canRestoreImportPreview" class="mt-4 rounded-md border border-warning-500/30 bg-warning-500/10 p-4">
                  <h4 class="font-bold text-warning-800">Bezpečná obnova aplikačných dát</h4>
                  <p class="mt-1 text-sm text-warning-800/80">
                    Pred zápisom sa automaticky uloží ochranná záloha aktuálneho stavu. Obnova prepíše známe dátové úložiská z nahratého súboru.
                  </p>
                  <p class="mt-3 text-xs font-semibold text-warning-800/80">
                    Pre potvrdenie prepíš: <span class="font-bold">{{ LOCAL_DATA_RESTORE_CONFIRMATION }}</span>
                  </p>
                  <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                    <UInput
                      v-model="restoreConfirmPhrase"
                      class="min-w-0 flex-1"
                      placeholder="Potvrdzovacia fráza"
                    />
                    <UButton
                      color="warning"
                      icon="i-heroicons-arrow-path-rounded-square"
                      :disabled="!restoreConfirmationMatches"
                      :loading="restorePending"
                      @click="restoreImportedBackup"
                    >
                      Obnoviť dáta
                    </UButton>
                  </div>
                  <p v-if="restoreStatusMessage" class="mt-3 break-words text-sm text-warning-900">
                    {{ restoreStatusMessage }}
                  </p>
                </div>
              </div>
            </div>

            <div v-if="topLocalDataStores.length" class="mt-5 space-y-2">
              <div
                v-for="store in topLocalDataStores"
                :key="store.id"
                class="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm"
              >
                <span class="font-semibold">{{ store.label }}</span>
                <span class="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground-muted">
                  {{ store.recordCount }}
                </span>
              </div>
            </div>

            <div v-if="localDataAssetGroups.length" class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="asset in localDataAssetGroups"
                :key="asset.id"
                class="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
              >
                {{ asset.label }}: {{ asset.fileCount }} / {{ formatLocalDataExportBytes(asset.totalSizeBytes) }}
              </span>
            </div>
          </div>

          <div
            v-if="activeSystemAdminView === 'chyby'"
            class="min-w-0 rounded-card border border-border bg-surface p-5"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Posledné chyby</h2>
                <p class="text-foreground-muted mt-1 text-sm">Zachytené klientské a serverové incidenty.</p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ recentErrorEntries.length }}
              </span>
            </div>

            <div class="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
              <article
                v-for="error in recentErrorEntries"
                :key="error.id"
                class="min-w-0 rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <p class="break-words font-bold">{{ error.message }}</p>
                    <p class="text-foreground-muted mt-1 text-xs">
                      {{ error.source }} · {{ formatDate(error.createdAt) }}
                    </p>
                    <p v-if="error.route" class="text-foreground-muted mt-2 break-all text-xs">{{ error.route }}</p>
                  </div>
                  <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="severityClass(error.severity)">
                    {{ severityLabels[error.severity] }}
                  </span>
                </div>

                <div v-if="errorContextEntries(error).length" class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="entry in errorContextEntries(error)"
                    :key="`${error.id}-${entry.key}`"
                    class="max-w-full break-all rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
                  >
                    {{ entry.key }}: {{ entry.value }}
                  </span>
                </div>
              </article>

              <p
                v-if="recentErrorEntries.length === 0"
                class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted"
              >
                Zatiaľ nie je uložená žiadna chyba.
              </p>
            </div>
          </div>
      </div>
    </section>
  </div>
</template>
