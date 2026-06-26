import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import {
  fishRegistrySettingsInputSchema,
  type FishRegistrySettingsMutationSuccess,
} from '~/services/fishRegistryService'
import { requireAdminAccess } from '../../../utils/adminAccessGuard'
import { resolveAuditActor } from '../../../utils/auditActor'
import { appendLocalAuditEvent } from '../../../utils/localAuditLogStore'
import {
  readLocalFishRegistryState,
  writeLocalFishRegistryState,
} from '../../../utils/localFishRegistryStore'

export default defineEventHandler(async (event): Promise<FishRegistrySettingsMutationSuccess> => {
  requireAdminAccess(event, { moduleId: 'fish', mode: 'full' })
  const parsed = fishRegistrySettingsInputSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    throw createError({
      data: { messages: parsed.error.issues.map((issue) => issue.message) },
      statusCode: 422,
      statusMessage: 'Fish registry settings validation failed',
    })
  }

  const state = await readLocalFishRegistryState()
  const storedState = await writeLocalFishRegistryState({
    fish: state.fish,
    observations: state.observations,
    settings: parsed.data,
  })

  await appendLocalAuditEvent({
    ...resolveAuditActor(event),
    action: 'fish.settings.updated',
    area: 'fish',
    details: {
      largeCatchRules: storedState.settings.largeCatchRules.map((rule) =>
        `${rule.lake}:${rule.enabled ? 'on' : 'off'}:${rule.thresholdKg}kg:${rule.contactMode}:${rule.availabilityWindows.length}windows`,
      ),
    },
    entityId: 'fish-registry-settings',
    entityLabel: 'Pravidlá veľkých rýb',
    entityType: 'fish_registry_settings',
    summary: 'Boli upravené pravidlá privolania správcu pri veľkej rybe.',
  })

  setResponseStatus(event, 200)
  return {
    message: 'Pravidlá veľkých rýb boli uložené.',
    ok: true,
    settings: storedState.settings,
    statusCode: 200,
    updatedAt: storedState.updatedAt,
  }
})
