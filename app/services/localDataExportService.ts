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

export interface LocalDataExportPayload {
  assetPolicy: LocalDataExportAssetPolicy
  assets: LocalDataExportAssetSummary[]
  data?: Record<string, unknown>
  exportedAt: string
  exportId: string
  mode: LocalDataExportMode
  service: 'Rybolov Cetín'
  stores: LocalDataExportStoreSummary[]
  totals: LocalDataExportTotals
  version: 1
}

export const localDataExportAssetPolicyLabels: Record<LocalDataExportAssetPolicy, string> = {
  inline: 'JSON + vložené súbory',
  manifest: 'JSON + zoznam súborov',
  none: 'iba JSON dáta',
}

export function formatLocalDataExportBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kB`

  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
