import type { AuditEvent } from '~/data/pond'
import {
  auditActionLabels,
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
  LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION,
  LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT,
  LOCAL_DATA_RESTORE_CONFIRMATION,
  localDataExportAssetPolicyLabels,
  localDataImportPreviewStatusLabels,
} from '~/services/localDataExportService'
import type { StatusBadgeTone } from '~/utils/ui'

type SystemAdminView = 'chyby' | 'data' | 'prehlad'

/**
 * Owns health checks, environment readiness, local data export/import/backup
 * state and the error log for the admin ops/monitoring screen. Extracted
 * from app/pages/admin/system/index.vue so the page only wires template
 * bindings. Preserves the error-surfacing behaviour (isSystemFetchLoading /
 * hasSystemFetchError feeding DataStatusNotice) exactly as implemented.
 */
export async function useAdminSystemStatus() {
  const route = useRoute()
  const router = useRouter()

  const systemAdminViewOptions: Array<{
    description: string
    icon: string
    id: SystemAdminView
    label: string
  }> = [
    {
      description: 'Stav služieb, konfigurácia prostredia a jednotlivé prevádzkové kontroly.',
      icon: 'i-heroicons-command-line',
      id: 'prehlad',
      label: 'Prehľad',
    },
    {
      description: 'Exporty, ochranné zálohy, kontrola importu, obnova a retencia dát.',
      icon: 'i-heroicons-circle-stack',
      id: 'data',
      label: 'Dáta',
    },
    {
      description: 'Zachytené klientské a serverové incidenty s prevádzkovým kontextom.',
      icon: 'i-heroicons-exclamation-triangle',
      id: 'chyby',
      label: 'Chyby',
    },
  ]

  const getRouteQueryValue = (value: unknown) => {
    const singleValue = Array.isArray(value) ? value[0] : value

    return typeof singleValue === 'string' && singleValue.trim() ? singleValue : undefined
  }

  function normalizeSystemAdminView(value: unknown): SystemAdminView {
    const requestedView = getRouteQueryValue(value)

    return systemAdminViewOptions.some((option) => option.id === requestedView)
      ? requestedView as SystemAdminView
      : 'prehlad'
  }

  const activeSystemAdminView = ref<SystemAdminView>(normalizeSystemAdminView(route.query.sekcia))
  const systemAdminTabsRef = ref<HTMLElement | null>(null)
  const activeSystemAdminViewOption = computed(() =>
    systemAdminViewOptions.find((option) => option.id === activeSystemAdminView.value)
    ?? systemAdminViewOptions[0]!,
  )

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

  const {
    data: systemHealth,
    error: systemHealthError,
    refresh: refreshSystemHealth,
    status: systemHealthStatus,
  } = await useAsyncData<AdminSystemHealthResponse>(
    'admin-system-health',
    async () => {
      try {
        return await requestFetch<AdminSystemHealthResponse>('/api/admin/system')
      }
      catch {
        // The admin-only health check failed (e.g. permissions or a transient
        // error) — fall back to the public health endpoint so we can still show
        // real degraded-mode data instead of immediately surfacing an error.
        // If this fallback fetch also fails, the error propagates to
        // useAsyncData below so it is not silently swallowed.
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

  const {
    data: localDataExportSummary,
    error: localDataExportSummaryError,
    refresh: refreshLocalDataExportSummary,
    status: localDataExportSummaryStatus,
  } = await useAsyncData<LocalDataExportPayload>(
    'admin-local-data-export-summary',
    () => requestFetch<LocalDataExportPayload>('/api/admin/data-export', {
      query: {
        assets: 'manifest',
        mode: 'summary',
      },
    }),
    {
      default: fallbackLocalDataExport,
    },
  )

  const {
    data: backupAuditLog,
    error: backupAuditLogError,
    refresh: refreshBackupAuditLog,
    status: backupAuditLogStatus,
  } = await useAsyncData<AuditLogResponse>(
    'admin-system-backup-audit',
    () => requestFetch<AuditLogResponse>('/api/admin/audit', {
      query: {
        area: 'system',
        limit: 40,
      },
    }),
    {
      default: fallbackAuditLog,
    },
  )

  const {
    data: safetyBackupArchive,
    error: safetyBackupArchiveError,
    refresh: refreshSafetyBackupArchive,
    status: safetyBackupArchiveStatus,
  } = await useAsyncData<LocalDataSafetyBackupArchiveResponse>(
    'admin-system-safety-backups',
    () => requestFetch<LocalDataSafetyBackupArchiveResponse>('/api/admin/data-backups'),
    {
      default: fallbackSafetyBackupArchive,
    },
  )

  const isSystemFetchLoading = computed(() =>
    systemHealthStatus.value === 'pending'
    || localDataExportSummaryStatus.value === 'pending'
    || backupAuditLogStatus.value === 'pending'
    || safetyBackupArchiveStatus.value === 'pending',
  )
  const hasSystemFetchError = computed(() =>
    Boolean(systemHealthError.value)
    || Boolean(localDataExportSummaryError.value)
    || Boolean(backupAuditLogError.value)
    || Boolean(safetyBackupArchiveError.value),
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

  const importPreviewStoreStatusLabels: Record<LocalDataImportPreviewResponse['stores'][number]['status'], string> = {
    extra: 'navyše',
    matched: 'sedí',
    missing: 'chýba',
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
          : 'rýchla alebo plná záloha',
        icon: 'i-heroicons-arrow-down-tray',
        id: 'export',
        label: 'Export',
        status: latestExport ? 'done' : 'waiting',
        statusLabel: latestExport ? 'hotové' : 'čaká',
      },
      {
        detail: importPreview.value
          ? `${importPreviewFileName.value || 'záloha'} · ${localDataImportPreviewStatusLabels[importPreview.value.status]}`
          : latestPreview
            ? `Posledná kontrola ${formatDate(latestPreview.createdAt)}`
            : 'bez skontrolovanej zálohy',
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
            ? 'platná plná záloha pripravená'
            : 'čaká na platnú plnú zálohu',
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
            ? `${safetyBackupCount} ochranných záloh · najnovšia ${formatDate(newestSafetyBackup?.createdAt)}`
            : latestCleanup
              ? `Retencia ${formatDate(latestCleanup.createdAt)}`
              : 'bez ochrannej zálohy',
        icon: 'i-heroicons-archive-box',
        id: 'archive',
        label: 'Archív',
        status: removableCleanupCount > 0 ? 'attention' : safetyBackupCount > 0 || latestCleanup ? 'done' : 'waiting',
        statusLabel: removableCleanupCount > 0 ? 'retencia' : safetyBackupCount > 0 || latestCleanup ? 'chránené' : 'čaká',
      },
    ]
  })

  function statusTone(status: SystemHealthStatus): StatusBadgeTone {
    if (status === 'down') return 'error'
    if (status === 'degraded') return 'warning'

    return 'success'
  }

  function readinessSummaryTone(status?: EnvironmentReadinessSummaryStatus): StatusBadgeTone {
    if (status === 'blocked') return 'error'
    if (status === 'attention') return 'warning'

    return 'success'
  }

  function readinessStatusTone(status: EnvironmentReadinessStatus): StatusBadgeTone {
    if (status === 'missing') return 'error'
    if (status === 'mock') return 'warning'
    if (status === 'not-applicable') return 'muted'

    return 'success'
  }

  function statusIcon(status: SystemHealthStatus) {
    if (status === 'down') return 'i-heroicons-x-circle'
    if (status === 'degraded') return 'i-heroicons-exclamation-triangle'

    return 'i-heroicons-check-circle'
  }

  function readinessSummaryIcon(status?: EnvironmentReadinessSummaryStatus) {
    if (status === 'blocked') return 'i-heroicons-x-circle'
    if (status === 'attention') return 'i-heroicons-exclamation-triangle'

    return 'i-heroicons-check-circle'
  }

  function readinessStatusIcon(status: EnvironmentReadinessStatus) {
    if (status === 'missing') return 'i-heroicons-x-circle'
    if (status === 'mock') return 'i-heroicons-beaker'
    if (status === 'not-applicable') return 'i-heroicons-minus-circle'

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

  function importPreviewIssueClass(severity: LocalDataImportPreviewIssueSeverity) {
    if (severity === 'error') return 'bg-error-500/10 text-error-700'
    if (severity === 'warning') return 'bg-warning-500/10 text-warning-700'

    return 'bg-info-500/10 text-info-700'
  }

  function localDataOpsStepClass(status: LocalDataOpsStepStatus) {
    if (status === 'attention') return 'border-warning-500/30 bg-warning-500/10'
    if (status === 'done') return 'border-success-500/30 bg-success-500/10'
    if (status === 'ready') return 'border-info-500/30 bg-info-500/10'

    return 'border-border bg-white'
  }

  function localDataOpsStepTone(status: LocalDataOpsStepStatus): StatusBadgeTone {
    if (status === 'attention') return 'warning'
    if (status === 'done') return 'success'
    if (status === 'ready') return 'info'

    return 'muted'
  }

  function localDataOpsStepIconClass(status: LocalDataOpsStepStatus) {
    if (status === 'attention') return 'bg-warning-500/15 text-warning-700'
    if (status === 'done') return 'bg-success-500/15 text-success-700'
    if (status === 'ready') return 'bg-info-500/15 text-info-700'

    return 'bg-muted text-foreground-muted'
  }

  function importPreviewStatusTone(status?: LocalDataImportPreviewStatus): StatusBadgeTone {
    if (status === 'invalid') return 'error'
    if (status === 'warning') return 'warning'

    return 'success'
  }

  function importPreviewStatusIcon(status?: LocalDataImportPreviewStatus) {
    if (status === 'invalid') return 'i-heroicons-x-circle'
    if (status === 'warning') return 'i-heroicons-exclamation-triangle'

    return 'i-heroicons-check-circle'
  }

  function importPreviewIntegrityTone(status?: ImportPreviewIntegrityStatus): StatusBadgeTone {
    if (status === 'mismatch') return 'error'
    if (status === 'missing') return 'warning'

    return 'success'
  }

  function importPreviewIntegrityIcon(status?: ImportPreviewIntegrityStatus) {
    if (status === 'mismatch') return 'i-heroicons-shield-exclamation'
    if (status === 'missing') return 'i-heroicons-question-mark-circle'

    return 'i-heroicons-shield-check'
  }

  function importPreviewStoreStatusTone(status: LocalDataImportPreviewResponse['stores'][number]['status']): StatusBadgeTone {
    if (status === 'missing') return 'warning'
    if (status === 'extra') return 'info'

    return 'success'
  }

  function importPreviewStoreStatusIcon(status: LocalDataImportPreviewResponse['stores'][number]['status']) {
    if (status === 'missing') return 'i-heroicons-exclamation-triangle'
    if (status === 'extra') return 'i-heroicons-plus-circle'

    return 'i-heroicons-check-circle'
  }

  function safetyBackupCleanupTone(hasRemovableBackups: boolean): StatusBadgeTone {
    return hasRemovableBackups ? 'warning' : 'success'
  }

  function safetyBackupCleanupIcon(hasRemovableBackups: boolean) {
    return hasRemovableBackups ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-check-circle'
  }

  function auditSeverityClass(severity: AuditEvent['severity']) {
    if (severity === 'critical') return 'bg-error-500/10 text-error-700'
    if (severity === 'warning') return 'bg-warning-500/10 text-warning-700'

    return 'bg-info-500/10 text-info-700'
  }

  function auditEventLabel(event: AuditEvent) {
    return auditActionLabels[event.action] ?? event.action
  }

  const diagnosticValueLabels: Record<string, string> = {
    disabled: 'vypnuté',
    full: 'plná záloha',
    inline: 'dáta s vloženými súbormi',
    invalid: 'neplatné',
    manifest: 'dáta so zoznamom súborov',
    mock: 'skúšobné',
    prepared: 'pripravené',
    resend: 'Resend',
    sent: 'odoslané',
    skipped: 'preskočené',
    summary: 'prehľad',
    warning: 'na kontrolu',
    'web-push': 'push cez prehliadač',
  }

  const diagnosticKeyLabels: Record<string, string> = {
    attentionCount: 'na pozornosť',
    'asset files': 'súbory',
    configuredCount: 'nastavené',
    critical24h: 'kritické 24h',
    directory: 'priečinok',
    environment: 'prostredie',
    missingConfigKeys: 'chýba konfigurácia',
    missingRequiredCount: 'povinné chýba',
    mode: 'režim',
    nodeVersion: 'Node.js',
    'notification delivery provider': 'doručovanie notifikácie',
    'notification delivery status': 'stav doručenia',
    provider: 'doručovanie',
    recentErrors: 'chyby',
    requiredCount: 'povinné',
    status: 'stav',
    store: 'úložisko',
    stores: 'úložiská',
    total24h: 'chyby 24h',
    version: 'verzia',
    warning24h: 'upozornenia 24h',
    webPushReady: 'push pripravený',
  }

  function formatDiagnosticValue(value: unknown): string {
    if (Array.isArray(value)) return value.map(formatDiagnosticValue).join(', ')
    if (typeof value === 'boolean') return value ? 'áno' : 'nie'
    const stringValue = String(value)

    return diagnosticValueLabels[stringValue] ?? stringValue
  }

  function formatDiagnosticKey(key: string) {
    if (diagnosticKeyLabels[key]) return diagnosticKeyLabels[key]

    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .toLocaleLowerCase('sk-SK')
  }

  function formatSystemEnvironment(value?: string) {
    if (value === 'development' || value === 'staging' || value === 'production') {
      return deploymentEnvironmentLabels[value]
    }

    if (value === 'unknown' || !value) return 'nezistené'

    return value
  }

  function auditDetailValue(event: AuditEvent, key: string) {
    const value = event.details[key]

    if (value === undefined || value === null || value === '') return null

    return formatDiagnosticValue(value)
  }

  function formatAuditSummary(summary: string) {
    return summary
      .replace(/Safety backup/gu, 'Ochranná záloha')
      .replace(/safety backup/gu, 'ochranná záloha')
      .replace(/Backup/gu, 'Záloha')
      .replace(/backup/gu, 'záloha')
      .replace(/\((\d+) store, (\d+) záznamov\)/gu, '($1 úložísk, $2 záznamov)')
      .replace(/Stiahnutý lokálny záloha/gu, 'Stiahnutá lokálna záloha')
      .replace(/Skontrolovaný záloha/gu, 'Skontrolovaná záloha')
      .replace(/stavom invalid/gu, 'stavom neplatné')
      .replace(/stavom warning/gu, 'stavom na kontrolu')
  }

  function formatAuditEntityLabel(event: AuditEvent) {
    const label = event.entityLabel

    if (event.area === 'system' && (label.includes('backup') || label.endsWith('.json'))) {
      return 'Záloha dát'
    }

    return label
      .replace(/Safety backup/gu, 'Ochranná záloha')
      .replace(/backup/gu, 'záloha')
      .replace(/\.json$/u, '')
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
      key: formatDiagnosticKey(key),
      value: formatDiagnosticValue(value),
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
      exportActionStatus.value = 'Export sa nepodarilo pripraviť. Skontroluj admin prihlásenie alebo záznam servera.'
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
        throw new Error(`Ochrannú zálohu sa nepodarilo stiahnuť so stavom ${response.status}.`)
      }

      await downloadResponseBlob(response, backup.fileName)
      exportActionStatus.value = `Ochranná záloha ${backup.fileName} je pripravená na stiahnutie.`
      await refreshBackupAuditLog()
    }
    catch {
      exportActionStatus.value = 'Ochrannú zálohu sa nepodarilo stiahnuť. Skontroluj admin prihlásenie alebo záznam servera.'
    }
    finally {
      downloadingSafetyBackupId.value = null
    }
  }

  async function previewSafetyBackup(backup: LocalDataSafetyBackupSummary) {
    previewingSafetyBackupId.value = backup.id
    importPreview.value = null
    importPreviewFileName.value = `Ochranná záloha ${formatDate(backup.createdAt)}`
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
      importPreviewStatusMessage.value = 'Ochranná záloha bola načítaná do kontroly bez zmeny aplikačných dát.'
      await refreshBackupAuditLog()
    }
    catch {
      importBackupPayload.value = null
      importPreviewStatusMessage.value = 'Ochrannú zálohu sa nepodarilo načítať do kontroly.'
      importPreview.value = {
        assets: [],
        issues: [
          {
            code: 'client_safety_backup_load_failed',
            message: 'Ochrannú zálohu sa nepodarilo načítať z admin archívu.',
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
        ? `Na vyčistenie je pripravených ${result.cleanup.removableBackups.length} starších ochranných záloh.`
        : 'Archív je v poriadku, podľa nastavenej retencie netreba nič mazať.'
    }
    catch {
      safetyBackupCleanupStatusMessage.value = 'Čistenie ochranných záloh sa nepodarilo skontrolovať.'
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
      safetyBackupCleanupStatusMessage.value = `Vyčistené: ${removedCount} ochranných záloh, ponechané posledné ${result.cleanup.keepRecent}.`
      await Promise.all([
        refreshBackupAuditLog(),
        refreshSafetyBackupArchive(),
      ])
    }
    catch {
      safetyBackupCleanupStatusMessage.value = 'Čistenie ochranných záloh bolo odmietnuté alebo zlyhalo.'
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
      importPreviewStatusMessage.value = 'Záloha bola skontrolovaná bez zmeny aplikačných dát.'
      await refreshBackupAuditLog()
    }
    catch {
      importPreviewStatusMessage.value = 'Súbor sa nepodarilo načítať ako zálohu.'
      importBackupPayload.value = null
      importPreview.value = {
        assets: [],
        issues: [
          {
            code: 'client_invalid_json',
            message: 'Vybraný súbor nie je platná záloha alebo ho prehliadač nevie prečítať.',
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

      restoreStatusMessage.value = `Obnova prebehla. Dátové úložiská: ${result.restoredStores.length}, súbory: ${result.restoredAssets.length}. Ochranná záloha: ${result.safetyBackupPath}`
      restoreConfirmPhrase.value = ''
      await Promise.all([
        refreshBackupAuditLog(),
        refreshSafetyBackupArchive(),
        refreshLocalDataExportSummary(),
        refreshSystemHealth(),
      ])
    }
    catch {
      restoreStatusMessage.value = 'Obnova bola odmietnutá. Skontroluj potvrdzovaciu frázu, upozornenia alebo záznam servera.'
    }
    finally {
      restorePending.value = false
    }
  }

  async function centerActiveSystemAdminTab(smooth = true) {
    await nextTick()

    const container = systemAdminTabsRef.value
    const activeTab = container?.querySelector<HTMLElement>(
      `[data-system-admin-view="${activeSystemAdminView.value}"]`,
    )
    if (!container || !activeTab) return

    container.scrollTo({
      behavior: smooth ? 'smooth' : 'auto',
      left: activeTab.offsetLeft - container.clientWidth / 2 + activeTab.clientWidth / 2,
    })
  }

  async function selectSystemAdminView(
    view: SystemAdminView,
    options: { focus?: boolean } = {},
  ) {
    activeSystemAdminView.value = view

    const query = { ...route.query }
    if (view === 'prehlad') {
      delete query.sekcia
    }
    else {
      query.sekcia = view
    }

    await router.replace({ query })
    await centerActiveSystemAdminTab()

    if (options.focus) {
      systemAdminTabsRef.value
        ?.querySelector<HTMLElement>(`[data-system-admin-view="${view}"]`)
        ?.focus()
    }
  }

  function handleSystemAdminTabsKeydown(event: KeyboardEvent) {
    const currentIndex = systemAdminViewOptions.findIndex(
      (option) => option.id === activeSystemAdminView.value,
    )
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % systemAdminViewOptions.length
    else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + systemAdminViewOptions.length) % systemAdminViewOptions.length
    }
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = systemAdminViewOptions.length - 1
    else return

    event.preventDefault()
    const nextView = systemAdminViewOptions[nextIndex]?.id
    if (nextView) void selectSystemAdminView(nextView, { focus: true })
  }

  watch(
    () => route.query.sekcia,
    (view) => {
      activeSystemAdminView.value = normalizeSystemAdminView(view)
      void centerActiveSystemAdminTab(false)
    },
  )

  onMounted(() => {
    void centerActiveSystemAdminTab(false)
  })

  return {
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
  }
}
