import { defineEventHandler } from 'h3'
import type { LocalDataSafetyBackupArchiveResponse } from '~/services/localDataExportService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { listLocalDataSafetyBackups, resolveLocalDataSafetyBackupDirectory } from '../../../utils/localDataExport'

export default defineEventHandler(async (event): Promise<LocalDataSafetyBackupArchiveResponse> => {
  requireAdminAccess(event, { mode: 'full', moduleId: 'system' })

  const backups = await listLocalDataSafetyBackups({ limit: 12 })

  return {
    backups,
    directory: resolveLocalDataSafetyBackupDirectory(),
    ok: true,
    updatedAt: new Date().toISOString(),
  }
})
