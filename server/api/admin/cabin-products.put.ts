import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  updateCabinCatalogSettings,
  type CabinCatalogMutationSuccess,
} from '~/services/cabinCatalogService'
import { requireAdminAccess } from '../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../utils/auditActor'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import {
  readLocalCabinCatalogState,
  writeLocalCabinCatalogState,
} from '../../utils/localCabinCatalogStore'
import { readLocalMapState } from '../../utils/localMapStore'
import { readLocalReservationState } from '../../utils/localReservationStore'

export default defineEventHandler(async (event): Promise<CabinCatalogMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'map', mode: 'full' })

  const [state, mapState, reservationState] = await Promise.all([
    readLocalCabinCatalogState(),
    readLocalMapState(),
    readLocalReservationState(),
  ])
  const result = updateCabinCatalogSettings(await readBody(event), {
    cabinProducts: state.cabinProducts,
    pegs: mapState.pegs,
    reservations: reservationState.reservations,
  })

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Cabin catalog validation failed',
    })
  }

  const storedState = await writeLocalCabinCatalogState({
    cabinProducts: result.cabinProducts,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event, {
      actorId: 'admin',
      actorLabel: 'Admin',
      actorRole: 'manager',
    }),
    action: 'cabin_catalog.updated',
    area: 'map',
    details: {
      cabinCount: storedState.cabinProducts.length,
      linkedPegIds: storedState.cabinProducts.flatMap((cabin) => cabin.pegIds),
    },
    entityId: 'cabin-products',
    entityLabel: 'Cenníkové chaty',
    entityType: 'cabin_catalog',
    severity: 'info',
    summary: 'Správca upravil väzby cenníkových chát na lovné miesta.',
  })
  setResponseStatus(event, result.statusCode)

  return {
    ...result,
    cabinProducts: storedState.cabinProducts,
    updatedAt: storedState.updatedAt,
  }
})
