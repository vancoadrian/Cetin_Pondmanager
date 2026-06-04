import { defineEventHandler, getQuery, setHeader } from 'h3'
import type { LocalDataExportPayload } from '~/services/localDataExportService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import {
  createLocalDataExportFileName,
  createLocalDataExportPayload,
  normalizeLocalDataExportAssetPolicy,
  normalizeLocalDataExportMode,
} from '../../utils/localDataExport'

export default defineEventHandler(async (event): Promise<LocalDataExportPayload | string> => {
  requireAdminAccess(event, { mode: 'full', moduleId: 'system' })

  const query = getQuery(event)
  const mode = normalizeLocalDataExportMode(query.mode)
  const assetPolicy = normalizeLocalDataExportAssetPolicy(query.assets)
  const payload = await createLocalDataExportPayload({
    assetPolicy,
    includeData: mode === 'full',
    mode,
  })

  if (query.download === '1' || query.download === 'true') {
    setHeader(event, 'content-disposition', `attachment; filename="${createLocalDataExportFileName(payload)}"`)
    setHeader(event, 'content-type', 'application/json;charset=utf-8')
    setHeader(event, 'cache-control', 'private, no-store')

    return `${JSON.stringify(payload, null, 2)}\n`
  }

  return payload
})
