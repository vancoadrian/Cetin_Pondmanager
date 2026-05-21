import { defineEventHandler } from 'h3'
import type { RentalCatalogStateResponse } from '~/services/rentalCatalogService'
import { readLocalRentalCatalogState } from '../utils/localRentalCatalogStore'

export default defineEventHandler(async (): Promise<RentalCatalogStateResponse> => {
  const state = await readLocalRentalCatalogState()

  return {
    ok: true,
    rentalItems: state.rentalItems.filter((item) => item.active),
    reservationExtras: state.reservationExtras.filter((extra) => extra.active),
    updatedAt: state.updatedAt,
  }
})
