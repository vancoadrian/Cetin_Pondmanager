import { defineEventHandler } from 'h3'
import type { FishLargeCatchRulesResponse } from '~/services/fishRegistryService'
import { readLocalFishRegistryState } from '../../utils/localFishRegistryStore'

export default defineEventHandler(async (): Promise<FishLargeCatchRulesResponse> => {
  const state = await readLocalFishRegistryState()

  return {
    ok: true,
    rules: state.settings.largeCatchRules.filter((rule) => rule.enabled),
    updatedAt: state.updatedAt,
  }
})
