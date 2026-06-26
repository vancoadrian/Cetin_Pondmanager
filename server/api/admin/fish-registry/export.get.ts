import { defineEventHandler, setHeader } from 'h3'
import { exportFishRegistryCsv } from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { readLocalFishRegistryState } from '../../../utils/localFishRegistryStore'

export default defineEventHandler(async (event) => {
  requireAdminAccess(event, { moduleId: 'fish' })
  const state = await readLocalFishRegistryState()
  const date = new Date().toISOString().slice(0, 10)

  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="register-cipovanych-ryb-${date}.csv"`)

  return exportFishRegistryCsv(state)
})
