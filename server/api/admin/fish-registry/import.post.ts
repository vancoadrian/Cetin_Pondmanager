import { createError, defineEventHandler, readBody } from 'h3'
import {
  fishRegistryImportInputSchema,
  importFishRegistryCsv,
  type FishRegistryImportSuccess,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '../../../utils/localFishRegistryStore'
import { readLocalMapState } from '../../../utils/localMapStore'

export default defineEventHandler(async (event): Promise<FishRegistryImportSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'full' })
  const payload = fishRegistryImportInputSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: payload.error.issues.map((issue) => issue.message) },
      statusCode: 400,
      statusMessage: 'Fish registry CSV payload invalid',
    })
  }

  const [state, mapState] = await Promise.all([
    readLocalFishRegistryState(),
    readLocalMapState(),
  ])
  const result = importFishRegistryCsv(payload.data.csv, state, mapState.pegs)

  if (!result.ok) {
    throw createError({
      data: { messages: result.messages },
      statusCode: result.statusCode,
      statusMessage: 'Fish registry CSV import failed',
    })
  }

  const storedState = await writeLocalFishRegistryState({
    ...result,
    settings: state.settings,
  })
  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'fish.csv.imported',
    area: 'fish',
    details: {
      createdFishCount: result.createdFishCount,
      importedObservationCount: result.importedObservationCount,
      skippedObservationCount: result.skippedObservationCount,
      updatedFishCount: result.updatedFishCount,
    },
    entityId: 'fish-registry',
    entityLabel: 'Register čipovaných rýb',
    entityType: 'fish_registry',
    severity: result.createdFishCount > 20 ? 'warning' : 'info',
    summary: `CSV import spracoval ${result.createdFishCount} nových rýb a ${result.importedObservationCount} meraní.`,
  })

  return {
    ...result,
    fish: storedState.fish,
    observations: storedState.observations,
    settings: storedState.settings,
    updatedAt: storedState.updatedAt,
  }
})
