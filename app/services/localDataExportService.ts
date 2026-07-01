export type LocalDataExportAssetPolicy = 'inline' | 'manifest' | 'none'

export type LocalDataExportMode = 'full' | 'summary'

export interface LocalDataExportCount {
  key: string
  label: string
  value: number
}

export interface LocalDataExportStoreSummary {
  counts: LocalDataExportCount[]
  id: string
  label: string
  path: string
  recordCount: number
  updatedAt?: string
}

export interface LocalDataExportAssetFile {
  dataBase64?: string
  mimeType: string
  name: string
  path: string
  sizeBytes: number
}

export interface LocalDataExportAssetSummary {
  directory: string
  fileCount: number
  files: LocalDataExportAssetFile[]
  id: string
  label: string
  totalSizeBytes: number
}

export interface LocalDataExportTotals {
  assetFiles: number
  assetSizeBytes: number
  records: number
  stores: number
}

export interface LocalDataExportIntegrity {
  algorithm: 'sha256'
  checksum: string
  generatedAt: string
  scope: 'payload-v1'
}

export interface LocalDataExportPayload {
  assetPolicy: LocalDataExportAssetPolicy
  assets: LocalDataExportAssetSummary[]
  data?: Record<string, unknown>
  exportedAt: string
  exportId: string
  integrity?: LocalDataExportIntegrity
  mode: LocalDataExportMode
  service: 'Rybolov Cetín'
  stores: LocalDataExportStoreSummary[]
  totals: LocalDataExportTotals
  version: 1
}

export type LocalDataImportPreviewIssueSeverity = 'error' | 'info' | 'warning'

export type LocalDataImportPreviewStatus = 'invalid' | 'ready' | 'warning'

export interface LocalDataImportPreviewIssue {
  code: string
  message: string
  severity: LocalDataImportPreviewIssueSeverity
}

export interface LocalDataImportPreviewStore {
  currentRecordCount?: number
  id: string
  incomingRecordCount: number
  label: string
  status: 'extra' | 'matched' | 'missing'
}

export interface LocalDataImportPreviewIntegrity {
  algorithm?: 'sha256'
  checksum?: string
  expectedChecksum?: string
  status: 'mismatch' | 'missing' | 'verified'
}

export interface LocalDataImportPreviewResponse {
  assetPolicy?: LocalDataExportAssetPolicy
  assets: LocalDataExportAssetSummary[]
  exportedAt?: string
  exportId?: string
  integrity?: LocalDataImportPreviewIntegrity
  issues: LocalDataImportPreviewIssue[]
  mode?: LocalDataExportMode
  status: LocalDataImportPreviewStatus
  stores: LocalDataImportPreviewStore[]
  totals: LocalDataExportTotals
  version?: number
}

export interface LocalDataRestoreAssetResult {
  directory: string
  fileCount: number
  id: string
  label: string
  totalSizeBytes: number
}

export interface LocalDataRestoreStoreResult {
  id: string
  label: string
  path: string
  recordCount: number
}

export interface LocalDataRestoreRequest {
  allowWarnings?: boolean
  backup: Record<string, unknown>
  confirmPhrase: string
  restoreAssets?: boolean
}

export interface LocalDataRestoreResponse {
  preview: LocalDataImportPreviewResponse
  restoredAssets: LocalDataRestoreAssetResult[]
  restoredAt: string
  restoredStores: LocalDataRestoreStoreResult[]
  safetyBackupPath: string
}

export interface LocalDataSafetyBackupSummary {
  assetFiles: number
  assetPolicy: LocalDataExportAssetPolicy
  createdAt: string
  exportId: string
  fileName: string
  id: string
  modifiedAt: string
  path: string
  records: number
  sizeBytes: number
  stores: number
}

export interface LocalDataSafetyBackupArchiveResponse {
  backups: LocalDataSafetyBackupSummary[]
  directory: string
  ok: true
  updatedAt: string
}

export interface LocalDataSafetyBackupCleanupPreview {
  candidateCount: number
  keepRecent: number
  removableBackups: LocalDataSafetyBackupSummary[]
  removableSizeBytes: number
  removedBackups?: LocalDataSafetyBackupSummary[]
  removedSizeBytes?: number
  retainedBackups: LocalDataSafetyBackupSummary[]
}

export interface LocalDataSafetyBackupCleanupRequest {
  confirmPhrase?: string
  dryRun?: boolean
  keepRecent?: number
}

export interface LocalDataSafetyBackupCleanupResponse {
  cleanup: LocalDataSafetyBackupCleanupPreview
  ok: true
  updatedAt: string
}

export const LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION = 'VYCISTIT BACKUPY'

export const LOCAL_DATA_BACKUP_CLEANUP_DEFAULT_KEEP_RECENT = 8

export const LOCAL_DATA_BACKUP_CLEANUP_MAX_KEEP_RECENT = 50

export const LOCAL_DATA_BACKUP_CLEANUP_MIN_KEEP_RECENT = 2

export const LOCAL_DATA_RESTORE_CONFIRMATION = 'OBNOVIT DATA'

export const localDataExportAssetPolicyLabels: Record<LocalDataExportAssetPolicy, string> = {
  inline: 'dáta s vloženými súbormi',
  manifest: 'dáta so zoznamom súborov',
  none: 'iba dáta',
}

export const localDataImportPreviewStatusLabels: Record<LocalDataImportPreviewStatus, string> = {
  invalid: 'neplatné',
  ready: 'pripravené',
  warning: 'na kontrolu',
}

export function formatLocalDataExportBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kB`

  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
