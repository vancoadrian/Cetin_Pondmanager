import { defineEventHandler } from 'h3'
import type { CabinCatalogStateResponse } from '~/services/cabinCatalogService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalCabinCatalogState } from '../../utils/localCabinCatalogStore'

export default defineEventHandler(async (event): Promise<CabinCatalogStateResponse> => {
  requireAdminAccess(event, { moduleId: 'map' })

  const state = await readLocalCabinCatalogState()

  return {
    cabinProducts: state.cabinProducts,
    ok: true,
    updatedAt: state.updatedAt,
  }
})
