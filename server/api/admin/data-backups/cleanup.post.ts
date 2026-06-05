import { createError, defineEventHandler, readBody } from 'h3'
import type {
  LocalDataSafetyBackupCleanupRequest,
  LocalDataSafetyBackupCleanupResponse,
} from '~/services/localDataExportService'
import { LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION } from '~/services/localDataExportService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  cleanupLocalDataSafetyBackups,
  previewLocalDataSafetyBackupCleanup,
} from '../../../utils/localDataExport'

export default defineEventHandler(async (event): Promise<LocalDataSafetyBackupCleanupResponse> => {
  requireAdminAccess(event, { mode: 'full', moduleId: 'system' })

  const body = await readBody<LocalDataSafetyBackupCleanupRequest>(event)
    .catch((): LocalDataSafetyBackupCleanupRequest => ({}))
  const dryRun = body.dryRun !== false

  if (!dryRun && body.confirmPhrase?.trim() !== LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION) {
    throw createError({
      data: {
        requiredPhrase: LOCAL_DATA_BACKUP_CLEANUP_CONFIRMATION,
      },
      statusCode: 422,
      statusMessage: 'Safety backup cleanup confirmation failed',
    })
  }

  const cleanup = dryRun
    ? await previewLocalDataSafetyBackupCleanup({ keepRecent: body.keepRecent })
    : await cleanupLocalDataSafetyBackups({ keepRecent: body.keepRecent })

  if (!dryRun) {
    const removedCount = cleanup.removedBackups?.length ?? 0
    const removedSizeBytes = cleanup.removedSizeBytes
      ?? cleanup.removedBackups?.reduce((sum, backup) => sum + backup.sizeBytes, 0)
      ?? 0

    await appendLocalAuditEvent({
      ...resolveAuditActor(event),
      action: 'system.data_backup.cleanup',
      area: 'system',
      details: {
        keepRecent: cleanup.keepRecent,
        removedCount,
        removedSizeBytes,
      },
      entityId: 'local-data-safety-backup-cleanup',
      entityLabel: 'Retencia safety backupov',
      entityType: 'local_data_safety_backup',
      severity: 'warning',
      summary: `Správca vyčistil ${removedCount} safety backupov a ponechal ${cleanup.keepRecent} najnovších.`,
    })
  }

  return {
    cleanup,
    ok: true,
    updatedAt: new Date().toISOString(),
  }
})
