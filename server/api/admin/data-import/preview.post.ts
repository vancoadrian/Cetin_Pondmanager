import { defineEventHandler, readBody } from 'h3'
import type { LocalDataImportPreviewResponse } from '~/services/localDataExportService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import { createLocalDataImportPreview } from '../../../utils/localDataExport'

export default defineEventHandler(async (event): Promise<LocalDataImportPreviewResponse> => {
  requireAdminAccess(event, { mode: 'full', moduleId: 'system' })

  const body: unknown = await readBody(event)
  const preview = await createLocalDataImportPreview(body)
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'system.data_import.previewed',
    area: 'system',
    details: {
      assetFiles: preview.totals.assetFiles,
      assetPolicy: preview.assetPolicy ?? null,
      issues: preview.issues.length,
      mode: preview.mode ?? null,
      records: preview.totals.records,
      status: preview.status,
      stores: preview.totals.stores,
    },
    entityId: preview.exportId ?? 'invalid-backup',
    entityLabel: preview.exportId ?? 'Neplatný backup',
    entityType: 'local_data_backup',
    severity: preview.status === 'invalid' ? 'warning' : 'info',
    summary: `Skontrolovaný backup so stavom ${preview.status}.`,
  })

  return preview
})
