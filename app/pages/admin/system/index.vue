<script setup lang="ts">
import type {
  AdminSystemHealthResponse,
  ObservedErrorEntry,
  ObservedErrorSeverity,
  SystemHealthResponse,
  SystemHealthCheck,
  SystemHealthStatus,
} from '~/services/observabilityService'
import {
  deploymentEnvironmentLabels,
  type DeploymentEnvironment,
  environmentReadinessCategoryLabels,
  environmentReadinessStatusLabels,
  environmentReadinessSummaryLabels,
  type EnvironmentReadinessItem,
  type EnvironmentReadinessStatus,
  type EnvironmentReadinessSummaryStatus,
} from '~/services/environmentReadinessService'
import type { LocalDataExportAssetPolicy, LocalDataExportPayload } from '~/services/localDataExportService'
import {
  formatLocalDataExportBytes,
  localDataExportAssetPolicyLabels,
} from '~/services/localDataExportService'

useHead({ title: 'Admin systém' })

const fallbackSystemHealth = (): AdminSystemHealthResponse => ({
  checkedAt: 'seed',
  checks: [],
  environment: 'unknown',
  ok: true,
  recentErrorEntries: [],
  recentErrors: {
    critical24h: 0,
    total24h: 0,
    warning24h: 0,
  },
  service: 'Rybolov Cetín',
  status: 'ok',
})

const fallbackLocalDataExport = (): LocalDataExportPayload => ({
  assetPolicy: 'manifest',
  assets: [],
  exportedAt: 'seed',
  exportId: 'seed',
  mode: 'summary',
  service: 'Rybolov Cetín',
  stores: [],
  totals: {
    assetFiles: 0,
    assetSizeBytes: 0,
    records: 0,
    stores: 0,
  },
  version: 1,
})

const { data: systemHealth, refresh: refreshSystemHealth } = await useAsyncData<AdminSystemHealthResponse>(
  'admin-system-health',
  async () => {
    try {
      return await $fetch<AdminSystemHealthResponse>('/api/admin/system')
    }
    catch {
      const publicHealth = await $fetch<SystemHealthResponse>('/api/health')

      return {
        ...publicHealth,
        recentErrorEntries: [],
      }
    }
  },
  {
    default: fallbackSystemHealth,
  },
)

const { data: localDataExportSummary, refresh: refreshLocalDataExportSummary } = await useAsyncData<LocalDataExportPayload>(
  'admin-local-data-export-summary',
  async () => {
    try {
      return await $fetch<LocalDataExportPayload>('/api/admin/data-export', {
        query: {
          assets: 'manifest',
          mode: 'summary',
        },
      })
    }
    catch {
      return fallbackLocalDataExport()
    }
  },
  {
    default: fallbackLocalDataExport,
  },
)

const checks = computed(() => systemHealth.value?.checks ?? [])
const environmentReadiness = computed(() => systemHealth.value?.environmentReadiness)
const environmentReadinessCheck = computed(() => checks.value.find((check) => check.id === 'environment-readiness'))
const readinessItems = computed(() => environmentReadiness.value?.items ?? [])
const highlightedReadinessItems = computed(() =>
  readinessItems.value.filter((item) => item.status === 'missing' || item.status === 'mock'),
)
const recentErrorEntries = computed(() => systemHealth.value?.recentErrorEntries ?? [])
const degradedChecks = computed(() => checks.value.filter((check) => check.status !== 'ok'))
const topLocalDataStores = computed(() =>
  [...(localDataExportSummary.value?.stores ?? [])]
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, 5),
)
const localDataAssetGroups = computed(() =>
  (localDataExportSummary.value?.assets ?? []).filter((asset) => asset.fileCount > 0),
)
const downloadingExportPolicy = ref<LocalDataExportAssetPolicy | null>(null)
const exportActionStatus = ref('')

const statusLabels: Record<SystemHealthStatus, string> = {
  degraded: 'obmedzené',
  down: 'výpadok',
  ok: 'v poriadku',
}

const severityLabels: Record<ObservedErrorSeverity, string> = {
  critical: 'kritické',
  error: 'chyba',
  info: 'info',
  warning: 'pozor',
}

const readinessDisplayStatus = computed<EnvironmentReadinessSummaryStatus>(() => {
  if (environmentReadiness.value) return environmentReadiness.value.status

  return environmentReadinessCheck.value?.status === 'degraded' ? 'attention' : 'ready'
})
const readinessDisplayEnvironment = computed<DeploymentEnvironment | undefined>(() => {
  if (environmentReadiness.value) return environmentReadiness.value.environment

  const value = environmentReadinessCheck.value?.metadata?.environment

  return value === 'development' || value === 'staging' || value === 'production' ? value : undefined
})
const readinessConfiguredCount = computed(() => environmentReadiness.value?.configuredCount ?? 0)
const readinessAttentionCount = computed(() =>
  environmentReadiness.value?.attentionCount ?? Number(environmentReadinessCheck.value?.metadata?.attentionCount ?? 0),
)
const readinessMissingRequiredCount = computed(() =>
  environmentReadiness.value?.missingRequiredCount ?? Number(environmentReadinessCheck.value?.metadata?.missingRequiredCount ?? 0),
)

const readinessSeverityLabels = {
  optional: 'voliteľné',
  recommended: 'odporúčané',
  required: 'povinné',
}

function statusClass(status: SystemHealthStatus) {
  if (status === 'down') return 'bg-error-500/10 text-error-700'
  if (status === 'degraded') return 'bg-warning-500/10 text-warning-700'

  return 'bg-success-500/10 text-success-700'
}

function readinessSummaryClass(status?: EnvironmentReadinessSummaryStatus) {
  if (status === 'blocked') return 'bg-error-500/10 text-error-700'
  if (status === 'attention') return 'bg-warning-500/10 text-warning-700'

  return 'bg-success-500/10 text-success-700'
}

function readinessStatusClass(status: EnvironmentReadinessStatus) {
  if (status === 'missing') return 'bg-error-500/10 text-error-700'
  if (status === 'mock') return 'bg-warning-500/10 text-warning-700'
  if (status === 'not-applicable') return 'bg-muted text-foreground-muted'

  return 'bg-success-500/10 text-success-700'
}

function statusIcon(status: SystemHealthStatus) {
  if (status === 'down') return 'i-heroicons-x-circle'
  if (status === 'degraded') return 'i-heroicons-exclamation-triangle'

  return 'i-heroicons-check-circle'
}

function readinessItemKey(item: EnvironmentReadinessItem) {
  return `${item.category}-${item.key}`
}

function severityClass(severity: ObservedErrorSeverity) {
  if (severity === 'critical') return 'bg-error-500/10 text-error-700'
  if (severity === 'error') return 'bg-error-500/10 text-error-700'
  if (severity === 'warning') return 'bg-warning-500/10 text-warning-700'

  return 'bg-info-500/10 text-info-700'
}

function formatDate(value?: string) {
  if (!value || value === 'seed') return 'zatiaľ bez dát'

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value

  return new Date(parsed).toLocaleString('sk-SK', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Bratislava',
  })
}

function metadataEntries(check: SystemHealthCheck) {
  return Object.entries(check.metadata ?? {}).map(([key, value]) => ({
    key,
    value: String(value),
  }))
}

function errorContextEntries(error: ObservedErrorEntry) {
  return Object.entries(error.context)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => ({
      key,
      value: String(value),
    }))
}

async function refreshSystem() {
  await Promise.all([
    refreshSystemHealth(),
    refreshLocalDataExportSummary(),
  ])
}

function getExportFileName(response: Response, policy: LocalDataExportAssetPolicy) {
  const disposition = response.headers.get('content-disposition') ?? ''
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1]

  return fileName ?? `rybolov-cetin-backup-${new Date().toISOString().slice(0, 10)}-${policy}.json`
}

async function downloadLocalDataExport(policy: LocalDataExportAssetPolicy) {
  if (import.meta.server) return

  downloadingExportPolicy.value = policy
  exportActionStatus.value = ''

  try {
    const query = new URLSearchParams({
      assets: policy,
      download: '1',
      mode: 'full',
    })
    const response = await fetch(`/api/admin/data-export?${query.toString()}`, {
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Export zlyhal so stavom ${response.status}.`)
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = getExportFileName(response, policy)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    exportActionStatus.value = `Export ${localDataExportAssetPolicyLabels[policy].toLowerCase()} je pripravený.`
    await refreshLocalDataExportSummary()
  }
  catch {
    exportActionStatus.value = 'Export sa nepodarilo pripraviť. Skontroluj admin prihlásenie alebo server log.'
  }
  finally {
    downloadingExportPolicy.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Admin"
      title="Systém"
      description="Health checky, lokálny error reporting a prvý monitoring pre produkčnú prípravu."
    />

    <section class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AdminModuleNav />

      <div class="flex flex-col gap-4 rounded-card border border-border bg-primary-900 p-5 text-white lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p class="text-sm font-semibold text-accent-300">{{ systemHealth?.service }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h2 class="text-2xl font-bold">Stav systému</h2>
            <span class="inline-flex w-fit items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold" :class="statusClass(systemHealth?.status ?? 'ok')">
              <UIcon :name="statusIcon(systemHealth?.status ?? 'ok')" class="h-3.5 w-3.5" />
              {{ statusLabels[systemHealth?.status ?? 'ok'] }}
            </span>
          </div>
          <p class="mt-2 text-sm text-white/75">
            Posledná kontrola {{ formatDate(systemHealth?.checkedAt) }} · prostredie {{ systemHealth?.environment }}
          </p>
        </div>
        <UButton icon="i-heroicons-arrow-path" color="neutral" variant="outline" class="border-white/30 bg-white/10 text-white hover:bg-white/15" @click="refreshSystem">
          Obnoviť
        </UButton>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-4">
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Kontroly</p>
          <p class="mt-2 text-3xl font-bold">{{ checks.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">runtime, dáta, notifikácie</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Na pozornosť</p>
          <p class="mt-2 text-3xl font-bold">{{ degradedChecks.length }}</p>
          <p class="text-foreground-muted mt-1 text-sm">degraded alebo down</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Chyby 24h</p>
          <p class="mt-2 text-3xl font-bold">{{ systemHealth?.recentErrors.total24h ?? 0 }}</p>
          <p class="text-foreground-muted mt-1 text-sm">client/server log</p>
        </div>
        <div class="rounded-card border border-border bg-surface p-4">
          <p class="text-foreground-muted text-sm">Kritické 24h</p>
          <p class="mt-2 text-3xl font-bold">{{ systemHealth?.recentErrors.critical24h ?? 0 }}</p>
          <p class="text-foreground-muted mt-1 text-sm">zvyšujú stav na pozor</p>
        </div>
      </div>

      <div class="mt-6 rounded-card border border-border bg-surface p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-bold">Environment pripravenosť</h2>
              <span
                class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                :class="readinessSummaryClass(readinessDisplayStatus)"
              >
                {{ environmentReadinessSummaryLabels[readinessDisplayStatus] }}
              </span>
            </div>
            <p class="text-foreground-muted mt-1 text-sm">
              Profil {{ readinessDisplayEnvironment ? deploymentEnvironmentLabels[readinessDisplayEnvironment] : 'nezistený' }} kontroluje env premenné pre URL, úložisko, push, reporty a počasie.
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
            class="rounded-md border border-border bg-white p-4"
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
              <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="readinessStatusClass(item.status)">
                {{ environmentReadinessStatusLabels[item.status] }}
              </span>
            </div>
          </article>

          <p
            v-if="highlightedReadinessItems.length === 0"
            class="rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted lg:col-span-2"
          >
            {{ environmentReadiness ? 'Pre aktuálny profil nie sú žiadne chýbajúce alebo mock položky na pozornosť.' : 'Detail položiek je dostupný po úspešnom admin health načítaní.' }}
          </p>
        </div>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Health checky</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  Krátke kontroly, ktoré sa dajú neskôr napojiť na hostingový uptime monitor.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ checks.length }} kontrol
              </span>
            </div>

            <div class="mt-5 space-y-3">
              <article
                v-for="check in checks"
                :key="check.id"
                class="rounded-md border border-border bg-white p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <UIcon :name="statusIcon(check.status)" class="h-5 w-5" :class="check.status === 'ok' ? 'text-success-700' : 'text-warning-700'" />
                      <h3 class="font-bold">{{ check.label }}</h3>
                    </div>
                    <p class="text-foreground-muted mt-2 text-sm">{{ check.detail }}</p>
                    <p class="text-foreground-muted mt-2 text-xs">{{ formatDate(check.checkedAt) }}</p>
                  </div>
                  <span class="w-fit rounded-md px-2.5 py-1 text-xs font-bold" :class="statusClass(check.status)">
                    {{ statusLabels[check.status] }}
                  </span>
                </div>

                <div v-if="metadataEntries(check).length" class="mt-4 flex flex-wrap gap-2">
                  <span
                    v-for="entry in metadataEntries(check)"
                    :key="`${check.id}-${entry.key}`"
                    class="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
                  >
                    {{ entry.key }}: {{ entry.value }}
                  </span>
                </div>
              </article>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Lokálne dáta</h2>
                <p class="text-foreground-muted mt-1 text-sm">
                  JSON store a assety, ktoré treba zálohovať pred presunom na Supabase.
                </p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ localDataExportSummary?.totals.stores ?? 0 }} store
              </span>
            </div>
            <p class="text-foreground-muted mt-2 text-sm">
              Prototyp zatiaľ používa lokálne JSON súbory. Produkčne sa tento stav nahradí Supabase a externým monitoringom.
            </p>
            <p class="mt-4 break-all rounded-md bg-muted p-3 text-xs font-semibold text-foreground-muted">
              {{ systemHealth?.dataDirectory ?? 'bez cesty' }}
            </p>

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
                <p class="text-foreground-muted text-xs font-semibold">assetov</p>
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
                Plná JSON záloha
              </UButton>
            </div>

            <p v-if="exportActionStatus" class="mt-3 rounded-md bg-muted p-3 text-sm text-foreground-muted">
              {{ exportActionStatus }}
            </p>

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

          <div class="rounded-card border border-border bg-surface p-5">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 class="text-lg font-bold">Posledné chyby</h2>
                <p class="text-foreground-muted mt-1 text-sm">Zachytené klientské a serverové incidenty.</p>
              </div>
              <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                {{ recentErrorEntries.length }}
              </span>
            </div>

            <div class="mt-5 space-y-3">
              <article
                v-for="error in recentErrorEntries"
                :key="error.id"
                class="rounded-md border border-border bg-white p-4"
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
                    class="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted"
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
        </aside>
      </div>
    </section>
  </div>
</template>
