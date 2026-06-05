<script setup lang="ts">
import type { AuditEvent } from '~/data/pond'
import {
  auditActionLabels,
  auditSeverityLabels,
  type AuditLogResponse,
} from '~/services/auditLogService'
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
import type {
  LocalDataExportAssetPolicy,
  LocalDataExportPayload,
  LocalDataImportPreviewIssueSeverity,
  LocalDataImportPreviewResponse,
  LocalDataImportPreviewStatus,
  LocalDataRestoreResponse,
  LocalDataSafetyBackupArchiveResponse,
  LocalDataSafetyBackupCleanupResponse,
  LocalDataSafetyBackupSummary,
} from '~/services/localDataExportService'
import {
  formatLocalDataExportBytes,
  LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION,
  LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT,
  LOCAL_DATA_RESTORE_CONFIRMATION,
  localDataExportAssetPolicyLabels,
  localDataImportPreviewStatusLabels,
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

const fallbackAuditLog = (): AuditLogResponse => ({
  events: [],
  ok: true,
  updatedAt: 'seed',
})

const fallbackSafetyBackupArchive = (): LocalDataSafetyBackupArchiveResponse => ({
  backups: [],
  directory: '.data/rybolov-cetin/backups',
  ok: true,
  updatedAt: 'seed',
})

const requestFetch = useRequestFetch()

const { data: systemHealth, refresh: refreshSystemHealth } = await useAsyncData<AdminSystemHealthResponse>(
  'admin-system-health',
  async () => {
    try {
      return await requestFetch<AdminSystemHealthResponse>('/api/admin/system')
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
      return await requestFetch<LocalDataExportPayload>('/api/admin/data-export', {
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

const { data: backupAuditLog, refresh: refreshBackupAuditLog } = await useAsyncData<AuditLogResponse>(
  'admin-system-backup-audit',
  async () => {
    try {
      return await requestFetch<AuditLogResponse>('/api/admin/audit', {
        query: {
          area: 'system',
          limit: 40,
        },
      })
    }
    catch {
      return fallbackAuditLog()
    }
  },
  {
    default: fallbackAuditLog,
  },
)

const { data: safetyBackupArchive, refresh: refreshSafetyBackupArchive } = await useAsyncData<LocalDataSafetyBackupArchiveResponse>(
  'admin-system-safety-backups',
  async () => {
    try {
      return await requestFetch<LocalDataSafetyBackupArchiveResponse>('/api/admin/data-backups')
    }
    catch {
      return fallbackSafetyBackupArchive()
    }
  },
  {
    default: fallbackSafetyBackupArchive,
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
const safetyBackups = computed(() => safetyBackupArchive.value?.backups ?? [])
const downloadingExportPolicy = ref<LocalDataExportAssetPolicy | null>(null)
const downloadingSafetyBackupId = ref<string | null>(null)
const previewingSafetyBackupId = ref<string | null>(null)
const safetyBackupCleanupConfirmPhrase = ref('')
const safetyBackupCleanupKeepRecent = ref(LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT)
const safetyBackupCleanupPending = ref(false)
const safetyBackupCleanupPreview = ref<LocalDataSafetyBackupCleanupResponse['cleanup'] | null>(null)
const safetyBackupCleanupStatusMessage = ref('')
const safetyBackupCleanupRemovableBackups = computed(() => safetyBackupCleanupPreview.value?.removableBackups ?? [])
const exportActionStatus = ref('')
const importBackupInput = ref<HTMLInputElement | null>(null)
const importBackupPayload = ref<Record<string, unknown> | null>(null)
const importPreview = ref<LocalDataImportPreviewResponse | null>(null)
const importPreviewFileName = ref('')
const importPreviewPending = ref(false)
const importPreviewStatusMessage = ref('')
const restoreConfirmPhrase = ref('')
const restorePending = ref(false)
const restoreStatusMessage = ref('')
const localDataBackupAuditActions = new Set([
  'system.data_backup.cleanup',
  'system.data_backup.downloaded',
  'system.data_backup.loaded',
  'system.data_export.downloaded',
  'system.data_import.previewed',
  'system.data_import.restored',
])

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

const importPreviewStoreRows = computed(() =>
  [...(importPreview.value?.stores ?? [])]
    .sort((a, b) => {
      const statusOrder = { extra: 1, missing: 0, matched: 2 }
      const statusDifference = statusOrder[a.status] - statusOrder[b.status]
      if (statusDifference !== 0) return statusDifference

      return b.incomingRecordCount - a.incomingRecordCount
    })
    .slice(0, 6),
)
const canRestoreImportPreview = computed(() =>
  Boolean(importPreview.value && importBackupPayload.value && importPreview.value.status !== 'invalid' && importPreview.value.mode === 'full'),
)
const restoreConfirmationMatches = computed(() => restoreConfirmPhrase.value.trim() === LOCAL_DATA_RESTORE_CONFIRMATION)
const safetyBackupCleanupConfirmationMatches = computed(() => safetyBackupCleanupConfirmPhrase.value.trim() === LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION)
const localDataBackupAuditEvents = computed(() =>
  (backupAuditLog.value?.events ?? [])
    .filter((event) => localDataBackupAuditActions.has(event.action))
    .slice(0, 5),
)

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

type ImportPreviewIntegrityStatus = NonNullable<LocalDataImportPreviewResponse['integrity']>['status']

type LocalDataOpsStepStatus = 'attention' | 'done' | 'ready' | 'waiting'

interface LocalDataOpsStep {
  detail: string
  icon: string
  id: string
  label: string
  status: LocalDataOpsStepStatus
  statusLabel: string
}

const importPreviewIntegrityStatusLabels: Record<ImportPreviewIntegrityStatus, string> = {
  mismatch: 'integrita nesedí',
  missing: 'bez odtlačku',
  verified: 'integrita overená',
}

function latestAuditEventByAction(action: string) {
  return (backupAuditLog.value?.events ?? []).find((event) => event.action === action)
}

const localDataOpsSteps = computed<LocalDataOpsStep[]>(() => {
  const latestExport = latestAuditEventByAction('system.data_export.downloaded')
  const latestPreview = latestAuditEventByAction('system.data_import.previewed')
  const latestRestore = latestAuditEventByAction('system.data_import.restored')
  const latestCleanup = latestAuditEventByAction('system.data_backup.cleanup')
  const importStatus = importPreview.value?.status
  const removableCleanupCount = safetyBackupCleanupPreview.value?.removableBackups.length ?? 0
  const safetyBackupCount = safetyBackups.value.length
  const newestSafetyBackup = safetyBackups.value[0]

  return [
    {
      detail: `${localDataExportSummary.value?.totals.records ?? 0} záznamov · ${localDataExportSummary.value?.totals.assetFiles ?? 0} súborov`,
      icon: 'i-heroicons-circle-stack',
      id: 'snapshot',
      label: 'Aktuálny stav',
      status: 'ready',
      statusLabel: 'načítané',
    },
    {
      detail: latestExport
        ? `Posledný export ${formatDate(latestExport.createdAt)}`
        : 'Manifest alebo plná JSON záloha',
      icon: 'i-heroicons-arrow-down-tray',
      id: 'export',
      label: 'Export',
      status: latestExport ? 'done' : 'waiting',
      statusLabel: latestExport ? 'hotové' : 'čaká',
    },
    {
      detail: importPreview.value
        ? `${importPreviewFileName.value || 'backup'} · ${localDataImportPreviewStatusLabels[importPreview.value.status]}`
        : latestPreview
          ? `Posledná kontrola ${formatDate(latestPreview.createdAt)}`
          : 'bez skontrolovaného backupu',
      icon: 'i-heroicons-document-magnifying-glass',
      id: 'preview',
      label: 'Kontrola',
      status: importStatus === 'invalid' ? 'attention' : importPreview.value || latestPreview ? 'done' : 'waiting',
      statusLabel: importStatus === 'invalid' ? 'pozor' : importPreview.value || latestPreview ? 'overené' : 'čaká',
    },
    {
      detail: latestRestore
        ? `Posledná obnova ${formatDate(latestRestore.createdAt)}`
        : canRestoreImportPreview.value
          ? 'platný full backup pripravený'
          : 'čaká na platný full backup',
      icon: 'i-heroicons-arrow-path-rounded-square',
      id: 'restore',
      label: 'Obnova',
      status: latestRestore ? 'done' : canRestoreImportPreview.value ? 'ready' : 'waiting',
      statusLabel: latestRestore ? 'auditované' : canRestoreImportPreview.value ? 'pripravené' : 'zamknuté',
    },
    {
      detail: removableCleanupCount > 0
        ? `${removableCleanupCount} starších súborov na retenciu`
        : safetyBackupCount > 0
          ? `${safetyBackupCount} safety backupov · najnovší ${formatDate(newestSafetyBackup?.createdAt)}`
          : latestCleanup
            ? `Retencia ${formatDate(latestCleanup.createdAt)}`
            : 'bez safety backupu',
      icon: 'i-heroicons-archive-box',
      id: 'archive',
      label: 'Archív',
      status: removableCleanupCount > 0 ? 'attention' : safetyBackupCount > 0 || latestCleanup ? 'done' : 'waiting',
      statusLabel: removableCleanupCount > 0 ? 'retencia' : safetyBackupCount > 0 || latestCleanup ? 'chránené' : 'čaká',
    },
  ]
})

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

function importPreviewStatusClass(status?: LocalDataImportPreviewStatus) {
  if (status === 'invalid') return 'bg-error-500/10 text-error-700'
  if (status === 'warning') return 'bg-warning-500/10 text-warning-700'

  return 'bg-success-500/10 text-success-700'
}

function importPreviewIssueClass(severity: LocalDataImportPreviewIssueSeverity) {
  if (severity === 'error') return 'bg-error-500/10 text-error-700'
  if (severity === 'warning') return 'bg-warning-500/10 text-warning-700'

  return 'bg-info-500/10 text-info-700'
}

function importPreviewIntegrityClass(status?: ImportPreviewIntegrityStatus) {
  if (status === 'mismatch') return 'bg-error-500/10 text-error-700'
  if (status === 'missing') return 'bg-warning-500/10 text-warning-700'

  return 'bg-success-500/10 text-success-700'
}

function localDataOpsStepClass(status: LocalDataOpsStepStatus) {
  if (status === 'attention') return 'border-warning-500/30 bg-warning-500/10'
  if (status === 'done') return 'border-success-500/30 bg-success-500/10'
  if (status === 'ready') return 'border-info-500/30 bg-info-500/10'

  return 'border-border bg-white'
}

function localDataOpsStepBadgeClass(status: LocalDataOpsStepStatus) {
  if (status === 'attention') return 'bg-warning-500/10 text-warning-700'
  if (status === 'done') return 'bg-success-500/10 text-success-700'
  if (status === 'ready') return 'bg-info-500/10 text-info-700'

  return 'bg-muted text-foreground-muted'
}

function localDataOpsStepIconClass(status: LocalDataOpsStepStatus) {
  if (status === 'attention') return 'bg-warning-500/15 text-warning-700'
  if (status === 'done') return 'bg-success-500/15 text-success-700'
  if (status === 'ready') return 'bg-info-500/15 text-info-700'

  return 'bg-muted text-foreground-muted'
}

function importPreviewStoreStatusClass(status: LocalDataImportPreviewResponse['stores'][number]['status']) {
  if (status === 'missing') return 'bg-warning-500/10 text-warning-700'
  if (status === 'extra') return 'bg-info-500/10 text-info-700'

  return 'bg-success-500/10 text-success-700'
}

function auditSeverityClass(severity: AuditEvent['severity']) {
  if (severity === 'critical') return 'bg-error-500/10 text-error-700'
  if (severity === 'warning') return 'bg-warning-500/10 text-warning-700'

  return 'bg-info-500/10 text-info-700'
}

function auditEventLabel(event: AuditEvent) {
  return auditActionLabels[event.action] ?? event.action
}

function auditDetailValue(event: AuditEvent, key: string) {
  const value = event.details[key]

  if (value === undefined || value === null || value === '') return null

  return Array.isArray(value) ? value.join(', ') : String(value)
}

function shortChecksum(value?: string) {
  if (!value) return 'bez odtlačku'
  if (value.length <= 24) return value

  return `${value.slice(0, 12)}…${value.slice(-8)}`
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
    refreshBackupAuditLog(),
    refreshSafetyBackupArchive(),
    refreshSystemHealth(),
    refreshLocalDataExportSummary(),
  ])
}

function getResponseFileName(response: Response, fallbackFileName: string) {
  const disposition = response.headers.get('content-disposition') ?? ''
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1]

  return fileName ?? fallbackFileName
}

async function downloadResponseBlob(response: Response, fallbackFileName: string) {
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = getResponseFileName(response, fallbackFileName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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

    await downloadResponseBlob(response, `rybolov-cetin-backup-${new Date().toISOString().slice(0, 10)}-${policy}.json`)
    exportActionStatus.value = `Export ${localDataExportAssetPolicyLabels[policy].toLowerCase()} je pripravený.`
    await Promise.all([
      refreshBackupAuditLog(),
      refreshLocalDataExportSummary(),
    ])
  }
  catch {
    exportActionStatus.value = 'Export sa nepodarilo pripraviť. Skontroluj admin prihlásenie alebo server log.'
  }
  finally {
    downloadingExportPolicy.value = null
  }
}

async function downloadSafetyBackup(backup: LocalDataSafetyBackupSummary) {
  if (import.meta.server) return

  downloadingSafetyBackupId.value = backup.id
  exportActionStatus.value = ''

  try {
    const response = await fetch(`/api/admin/data-backups/${encodeURIComponent(backup.id)}?download=1`, {
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Safety backup sa nepodarilo stiahnuť so stavom ${response.status}.`)
    }

    await downloadResponseBlob(response, backup.fileName)
    exportActionStatus.value = `Safety backup ${backup.fileName} je pripravený na stiahnutie.`
    await refreshBackupAuditLog()
  }
  catch {
    exportActionStatus.value = 'Safety backup sa nepodarilo stiahnuť. Skontroluj admin prihlásenie alebo server log.'
  }
  finally {
    downloadingSafetyBackupId.value = null
  }
}

async function previewSafetyBackup(backup: LocalDataSafetyBackupSummary) {
  previewingSafetyBackupId.value = backup.id
  importPreview.value = null
  importPreviewFileName.value = backup.fileName
  importPreviewPending.value = true
  importPreviewStatusMessage.value = ''
  restoreConfirmPhrase.value = ''
  restoreStatusMessage.value = ''

  try {
    const payload = await $fetch<Record<string, unknown>>(`/api/admin/data-backups/${encodeURIComponent(backup.id)}`)
    importBackupPayload.value = payload
    importPreview.value = await $fetch<LocalDataImportPreviewResponse>('/api/admin/data-import/preview', {
      body: payload,
      method: 'POST',
    })
    importPreviewStatusMessage.value = 'Safety backup bol načítaný do kontroly bez zmeny lokálnych dát.'
    await refreshBackupAuditLog()
  }
  catch {
    importBackupPayload.value = null
    importPreviewStatusMessage.value = 'Safety backup sa nepodarilo načítať do kontroly.'
    importPreview.value = {
      assets: [],
      issues: [
        {
          code: 'client_safety_backup_load_failed',
          message: 'Safety backup sa nepodarilo načítať z admin archívu.',
          severity: 'error',
        },
      ],
      status: 'invalid',
      stores: [],
      totals: {
        assetFiles: 0,
        assetSizeBytes: 0,
        records: 0,
        stores: 0,
      },
    }
  }
  finally {
    importPreviewPending.value = false
    previewingSafetyBackupId.value = null
  }
}

function normalizeSafetyBackupCleanupKeepRecentInput() {
  const parsed = Number(safetyBackupCleanupKeepRecent.value)

  if (!Number.isFinite(parsed)) {
    safetyBackupCleanupKeepRecent.value = LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT

    return safetyBackupCleanupKeepRecent.value
  }

  safetyBackupCleanupKeepRecent.value = Math.max(2, Math.trunc(parsed))

  return safetyBackupCleanupKeepRecent.value
}

async function previewSafetyBackupCleanup() {
  safetyBackupCleanupPending.value = true
  safetyBackupCleanupStatusMessage.value = ''

  try {
    const result = await $fetch<LocalDataSafetyBackupCleanupResponse>('/api/admin/data-backups/cleanup', {
      body: {
        dryRun: true,
        keepRecent: normalizeSafetyBackupCleanupKeepRecentInput(),
      },
      method: 'POST',
    })

    safetyBackupCleanupPreview.value = result.cleanup
    safetyBackupCleanupConfirmPhrase.value = ''
    safetyBackupCleanupStatusMessage.value = result.cleanup.removableBackups.length
      ? `Na vyčistenie je pripravených ${result.cleanup.removableBackups.length} starších safety backupov.`
      : 'Archív je v poriadku, podľa nastavenej retencie netreba nič mazať.'
  }
  catch {
    safetyBackupCleanupStatusMessage.value = 'Retenciu safety backupov sa nepodarilo skontrolovať.'
  }
  finally {
    safetyBackupCleanupPending.value = false
  }
}

async function runSafetyBackupCleanup() {
  if (!safetyBackupCleanupConfirmationMatches.value) return

  safetyBackupCleanupPending.value = true
  safetyBackupCleanupStatusMessage.value = ''

  try {
    const result = await $fetch<LocalDataSafetyBackupCleanupResponse>('/api/admin/data-backups/cleanup', {
      body: {
        confirmPhrase: safetyBackupCleanupConfirmPhrase.value.trim(),
        dryRun: false,
        keepRecent: normalizeSafetyBackupCleanupKeepRecentInput(),
      },
      method: 'POST',
    })

    const removedCount = result.cleanup.removedBackups?.length ?? result.cleanup.removableBackups.length

    safetyBackupCleanupPreview.value = result.cleanup
    safetyBackupCleanupConfirmPhrase.value = ''
    safetyBackupCleanupStatusMessage.value = `Vyčistené: ${removedCount} safety backupov, ponechané posledné ${result.cleanup.keepRecent}.`
    await Promise.all([
      refreshBackupAuditLog(),
      refreshSafetyBackupArchive(),
    ])
  }
  catch {
    safetyBackupCleanupStatusMessage.value = 'Čistenie safety backupov bolo odmietnuté alebo zlyhalo.'
  }
  finally {
    safetyBackupCleanupPending.value = false
  }
}

function openImportBackupPicker() {
  importBackupInput.value?.click()
}

function readTextFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Súbor sa nepodarilo načítať.')))
    reader.readAsText(file)
  })
}

async function previewImportBackupFile(file?: File) {
  if (!file) return

  importPreviewPending.value = true
    importPreview.value = null
    importPreviewFileName.value = file.name
    importPreviewStatusMessage.value = ''
    restoreConfirmPhrase.value = ''
    restoreStatusMessage.value = ''

  try {
    const raw = await readTextFile(file)
    const parsed = JSON.parse(raw) as Record<string, unknown>
    importBackupPayload.value = parsed
    importPreview.value = await $fetch<LocalDataImportPreviewResponse>('/api/admin/data-import/preview', {
      body: parsed,
      method: 'POST',
    })
    importPreviewStatusMessage.value = 'Backup bol skontrolovaný bez zmeny lokálnych dát.'
    await refreshBackupAuditLog()
  }
  catch {
    importPreviewStatusMessage.value = 'Súbor sa nepodarilo načítať ako JSON backup.'
    importBackupPayload.value = null
    importPreview.value = {
      assets: [],
      issues: [
        {
          code: 'client_invalid_json',
          message: 'Vybraný súbor nie je platný JSON alebo ho browser nevie prečítať.',
          severity: 'error',
        },
      ],
      status: 'invalid',
      stores: [],
      totals: {
        assetFiles: 0,
        assetSizeBytes: 0,
        records: 0,
        stores: 0,
      },
    }
  }
  finally {
    importPreviewPending.value = false
    if (importBackupInput.value) {
      importBackupInput.value.value = ''
    }
  }
}

function handleImportBackupChange(event: Event) {
  const input = event.target as HTMLInputElement
  void previewImportBackupFile(input.files?.[0])
}

async function restoreImportedBackup() {
  if (!importBackupPayload.value || !importPreview.value || !restoreConfirmationMatches.value) return

  restorePending.value = true
  restoreStatusMessage.value = ''

  try {
    const result = await $fetch<LocalDataRestoreResponse>('/api/admin/data-import/restore', {
      body: {
        allowWarnings: importPreview.value.status === 'warning',
        backup: importBackupPayload.value,
        confirmPhrase: restoreConfirmPhrase.value.trim(),
        restoreAssets: importPreview.value.assetPolicy === 'inline',
      },
      method: 'POST',
    })

    restoreStatusMessage.value = `Obnova prebehla. Store: ${result.restoredStores.length}, asset skupiny: ${result.restoredAssets.length}. Safety backup: ${result.safetyBackupPath}`
    restoreConfirmPhrase.value = ''
    await Promise.all([
      refreshBackupAuditLog(),
      refreshSafetyBackupArchive(),
      refreshLocalDataExportSummary(),
      refreshSystemHealth(),
    ])
  }
  catch {
    restoreStatusMessage.value = 'Obnova bola odmietnutá. Skontroluj potvrdzovaciu frázu, upozornenia alebo server log.'
  }
  finally {
    restorePending.value = false
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

            <div class="mt-4 border-y border-border py-3">
              <div class="grid gap-2 sm:grid-cols-2">
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
                      <span class="rounded-md px-2 py-0.5 text-xs font-bold" :class="localDataOpsStepBadgeClass(step.status)">
                        {{ step.statusLabel }}
                      </span>
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

            <div class="mt-5 border-t border-border pt-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="font-bold">Safety backupy</h3>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Automatické zálohy aktuálneho stavu, ktoré vzniknú tesne pred ostrou obnovou dát.
                  </p>
                </div>
                <span class="w-fit rounded-md bg-muted px-2.5 py-1 text-xs font-bold text-foreground-muted">
                  {{ safetyBackups.length }} súborov
                </span>
              </div>
              <p class="mt-3 break-all rounded-md bg-muted p-3 text-xs font-semibold text-foreground-muted">
                {{ safetyBackupArchive?.directory ?? '.data/rybolov-cetin/backups' }}
              </p>

              <div v-if="safetyBackups.length" class="mt-4 space-y-3">
                <article
                  v-for="backup in safetyBackups"
                  :key="backup.id"
                  class="rounded-md border border-border bg-white p-4"
                >
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="min-w-0">
                      <p class="break-all font-semibold">{{ backup.fileName }}</p>
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
                      store: {{ backup.stores }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      záznamy: {{ backup.records }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      súbory: {{ backup.assetFiles }}
                    </span>
                    <span class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                      assety: {{ localDataExportAssetPolicyLabels[backup.assetPolicy] }}
                    </span>
                  </div>
                </article>
              </div>

              <p
                v-else
                class="mt-4 rounded-md border border-dashed border-border p-4 text-sm text-foreground-muted"
              >
                Safety backup sa vytvorí automaticky pri prvej ostrej obnove lokálnych dát.
              </p>

              <div class="mt-4 rounded-md border border-border bg-muted/50 p-4">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 class="font-bold">Retencia archívu</h4>
                    <p class="text-foreground-muted mt-1 text-sm">
                      Skontroluje staršie safety backupy a odstráni ich až po potvrdení frázy.
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
                    <span
                      class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                      :class="safetyBackupCleanupRemovableBackups.length ? 'bg-warning-500/10 text-warning-700' : 'bg-success-500/10 text-success-700'"
                    >
                      {{ safetyBackupCleanupRemovableBackups.length ? 'vyžaduje potvrdenie' : 'bez mazania' }}
                    </span>
                  </div>

                  <div v-if="safetyBackupCleanupRemovableBackups.length" class="mt-3 space-y-2">
                    <div
                      v-for="backup in safetyBackupCleanupRemovableBackups.slice(0, 4)"
                      :key="backup.id"
                      class="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-xs text-foreground-muted sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span class="break-all font-semibold">{{ backup.fileName }}</span>
                      <span>{{ formatDate(backup.createdAt) }} · {{ formatLocalDataExportBytes(backup.sizeBytes) }}</span>
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
                    Posledné exporty, kontroly importu a ostré obnovy lokálnych dát.
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
                      <p class="text-foreground-muted mt-1 text-sm">{{ event.summary }}</p>
                      <p class="text-foreground-muted mt-1 text-xs">
                        {{ event.actorLabel }} · {{ formatDate(event.createdAt) }}
                      </p>
                    </div>
                    <span class="max-w-full break-all rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground-muted">
                      {{ event.entityLabel }}
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
                      assety: {{ auditDetailValue(event, 'assetPolicy') }}
                    </span>
                    <span
                      v-if="auditDetailValue(event, 'stores')"
                      class="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted"
                    >
                      store: {{ auditDetailValue(event, 'stores') }}
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
                      safety: {{ auditDetailValue(event, 'safetyBackupPath') }}
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
                Zatiaľ tu nie je žiadny export, kontrola backupu ani obnova.
              </p>
            </div>

            <div class="mt-5 border-t border-border pt-4">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="font-bold">Kontrola backupu</h3>
                  <p class="text-foreground-muted mt-1 text-sm">
                    Nahratý JSON sa iba skontroluje. Lokálne dáta sa týmto krokom nemenia.
                  </p>
                </div>
                <UButton
                  icon="i-heroicons-document-magnifying-glass"
                  color="neutral"
                  variant="outline"
                  :loading="importPreviewPending"
                  @click="openImportBackupPicker"
                >
                  Skontrolovať backup
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
                      <p class="font-bold">{{ importPreviewFileName || 'Backup' }}</p>
                      <span
                        class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                        :class="importPreviewStatusClass(importPreview.status)"
                      >
                        {{ localDataImportPreviewStatusLabels[importPreview.status] }}
                      </span>
                    </div>
                    <p class="text-foreground-muted mt-2 text-sm">
                      {{ importPreviewStatusMessage }}
                    </p>
                    <p class="text-foreground-muted mt-1 break-all text-xs">
                      {{ importPreview.exportId ?? 'bez export ID' }} · {{ formatDate(importPreview.exportedAt) }}
                    </p>
                    <div v-if="importPreview.integrity" class="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        class="w-fit rounded-md px-2.5 py-1 text-xs font-bold"
                        :class="importPreviewIntegrityClass(importPreview.integrity.status)"
                      >
                        {{ importPreviewIntegrityStatusLabels[importPreview.integrity.status] }}
                      </span>
                      <span class="break-all rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground-muted">
                        sha256: {{ shortChecksum(importPreview.integrity.checksum) }}
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
                      <p class="text-foreground-muted text-xs font-semibold">store</p>
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
                        Aktuálne {{ store.currentRecordCount ?? 0 }} · backup {{ store.incomingRecordCount }}
                      </p>
                    </div>
                    <span class="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold" :class="importPreviewStoreStatusClass(store.status)">
                      {{ store.status === 'matched' ? 'sedí' : store.status === 'missing' ? 'chýba' : 'navyše' }}
                    </span>
                  </div>
                </div>

                <div v-if="canRestoreImportPreview" class="mt-4 rounded-md border border-warning-500/30 bg-warning-500/10 p-4">
                  <h4 class="font-bold text-warning-800">Bezpečná obnova lokálnych dát</h4>
                  <p class="mt-1 text-sm text-warning-800/80">
                    Pred zápisom sa automaticky uloží safety backup aktuálneho stavu. Obnova prepíše známe JSON store z nahratého súboru.
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
                      Obnoviť lokálne dáta
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
