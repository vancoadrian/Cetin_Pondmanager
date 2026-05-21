import { defineEventHandler } from 'h3'
import type { RentalCatalogStateResponse } from '~/services/rentalCatalogService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { readLocalRentalCatalogState } from '../../utils/localRentalCatalogStore'

export default defineEventHandler(async (event): Promise<RentalCatalogStateResponse> => {
  requireAdminAccess(event, { moduleId: 'rentals' })
  const state = await readLocalRentalCatalogState()

  return {
    ok: true,
    rentalItems: state.rentalItems,
    reservationExtras: state.reservationExtras,
    updatedAt: state.updatedAt,
  }
})
