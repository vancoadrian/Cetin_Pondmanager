import { defineEventHandler } from 'h3'
import type { CabinCatalogStateResponse } from '~/services/cabinCatalogService'
import { readLocalCabinCatalogState } from '../utils/localCabinCatalogStore'

export default defineEventHandler(async (): Promise<CabinCatalogStateResponse> => {
  const state = await readLocalCabinCatalogState()

  return {
    cabinProducts: state.cabinProducts,
    ok: true,
    updatedAt: state.updatedAt,
  }
})
