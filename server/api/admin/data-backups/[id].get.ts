import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import type { LocalDataExportPayload } from '~/services/localDataExportService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { readLocalDataSafetyBackup } from '../../../utils/localDataExport'

export default defineEventHandler(async (event): Promise<LocalDataExportPayload | string> => {
  requireAdminAccess(event, { mode: 'full', moduleId: 'system' })

  const id = getRouterParam(event, 'id') ?? ''
  const query = getQuery(event)
  const isDownload = query.download === '1' || query.download === 'true'

  try {
    const backup = await readLocalDataSafetyBackup(id)

    await appendLocalAuditEvent({
      ...resolveAuditActor(event),
      action: isDownload ? 'system.data_backup.downloaded' : 'system.data_backup.loaded',
      area: 'system',
      details: {
        assetFiles: backup.summary.assetFiles,
        assetPolicy: backup.summary.assetPolicy,
        records: backup.summary.records,
        sizeBytes: backup.summary.sizeBytes,
        stores: backup.summary.stores,
      },
      entityId: backup.summary.id,
      entityLabel: backup.fileName,
      entityType: 'local_data_safety_backup',
      severity: 'info',
      summary: isDownload
        ? `Stiahnutý safety backup (${backup.summary.stores} store, ${backup.summary.records} záznamov).`
        : `Safety backup načítaný do kontroly (${backup.summary.stores} store, ${backup.summary.records} záznamov).`,
    })
    setHeader(event, 'cache-control', 'private, no-store')

    if (isDownload) {
      setHeader(event, 'content-disposition', `attachment; filename="${backup.fileName}"`)
      setHeader(event, 'content-type', 'application/json;charset=utf-8')

      return `${JSON.stringify(backup.payload, null, 2)}\n`
    }

    return backup.payload
  }
  catch (error) {
    const maybeError = error as Error

    throw createError({
      data: {
        message: maybeError.message,
      },
      statusCode: 404,
      statusMessage: 'Safety backup not found',
    })
  }
})
