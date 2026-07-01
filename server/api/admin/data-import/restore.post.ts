import { createError, defineEventHandler, readBody } from 'h3'
import type { LocalDataRestoreRequest, LocalDataRestoreResponse } from '~/services/localDataExportService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { restoreLocalDataBackup } from '../../../utils/localDataExport'

export default defineEventHandler(async (event): Promise<LocalDataRestoreResponse> => {
  requireAdminAccess(event, { mode: 'full', moduleId: 'system' })

  const body = await readBody<LocalDataRestoreRequest>(event)

  try {
    const result = await restoreLocalDataBackup(body?.backup, {
      allowWarnings: body?.allowWarnings,
      confirmPhrase: body?.confirmPhrase,
      restoreAssets: body?.restoreAssets,
    })
    await appendLocalAuditEvent({
      ...resolveAuditActor(event),
      action: 'system.data_import.restored',
      area: 'system',
      details: {
        assetGroups: result.restoredAssets.length,
        assetPolicy: result.preview.assetPolicy ?? null,
        issues: result.preview.issues.length,
        records: result.preview.totals.records,
        restoredAt: result.restoredAt,
        safetyBackupPath: result.safetyBackupPath,
        storeIds: result.restoredStores.map((store) => store.id).join(','),
        stores: result.restoredStores.length,
      },
      entityId: result.preview.exportId ?? 'local-data-restore',
      entityLabel: result.preview.exportId ?? 'Obnova aplikačných dát',
      entityType: 'local_data_restore',
      severity: 'critical',
      summary: `Obnovený runtime backup: ${result.restoredStores.length} store, safety backup ${result.safetyBackupPath}.`,
    })

    return result
  }
  catch (error) {
    const maybeError = error as Error

    throw createError({
      data: {
        message: maybeError.message,
      },
      statusCode: 422,
      statusMessage: 'Local data restore rejected',
    })
  }
})
