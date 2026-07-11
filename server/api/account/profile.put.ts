import { createError, defineEventHandler, readBody } from 'h3'
import { accountProfilePayloadSchema, getValidationMessages } from '~/schemas/pondSchemas'
import type { AccountProfileUpdateResponse } from '~/services/accountProfileService'
import { requireMockAnglerAccount } from '../../utils/anglerSession'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import { updateLocalAccountProfile } from '../../utils/localAccountStore'

export default defineEventHandler(async (event): Promise<AccountProfileUpdateResponse> => {
  const account = await requireMockAnglerAccount(event)
  const payload = accountProfilePayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Account profile validation failed',
    })
  }

  const phone = payload.data.phone || undefined
  const changedName = account.name !== payload.data.name
  const changedPhone = account.phone !== phone
  if (changedName || changedPhone) {
    await updateLocalAccountProfile(account.id, account.name, {
      name: payload.data.name,
      phone,
    })
    await appendLocalAuditEvent({
      action: 'account.profile_updated',
      actorId: account.id,
      actorLabel: 'Rybársky účet',
      actorRole: 'angler',
      area: 'accounts',
      details: { changedName, changedPhone },
      entityId: account.id,
      entityLabel: 'Rybársky účet',
      entityType: 'user_account',
      severity: 'info',
      summary: 'Používateľ upravil osobné údaje svojho účtu.',
    })
  }

  return {
    account: {
      email: account.email,
      id: account.id,
      name: payload.data.name,
      phone,
    },
    message: changedName || changedPhone ? 'Osobné údaje boli uložené.' : 'Osobné údaje sú aktuálne.',
    ok: true,
  }
})
