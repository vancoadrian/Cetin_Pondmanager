import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import {
  findMockUserByEmail,
  type MockRegistrationResponse,
} from '~/composables/useMockAuth'
import { getValidationMessages, accountRegistrationPayloadSchema } from '~/schemas/pondSchemas'
import { findMockAnglerAccountByEmail } from '~/services/anglerAccountService'
import { createPasswordHash, toPublicRegisteredUser } from '../../utils/accountAuthentication'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import {
  addLocalRegisteredAccount,
  findLocalRegisteredAccountByEmail,
  type LocalRegisteredAnglerAccount,
} from '../../utils/localAccountStore'

export default defineEventHandler(async (event): Promise<MockRegistrationResponse> => {
  const payload = accountRegistrationPayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Account registration validation failed',
    })
  }

  const email = payload.data.email.toLocaleLowerCase('sk')
  const existingAccount = findMockUserByEmail(email)
    ?? findMockAnglerAccountByEmail(email)
    ?? await findLocalRegisteredAccountByEmail(email)
  if (existingAccount) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Účet s týmto e-mailom už existuje. Prihláste sa alebo kontaktujte správcu.',
    })
  }

  const account: LocalRegisteredAnglerAccount = {
    createdAt: new Date().toISOString(),
    email,
    id: `angler-${randomUUID()}`,
    name: payload.data.name,
    passwordHash: await createPasswordHash(payload.data.password),
  }
  await addLocalRegisteredAccount(account)
  await appendLocalAuditEvent({
    action: 'account.created',
    actorId: account.id,
    actorLabel: 'Rybársky účet',
    actorRole: 'angler',
    area: 'accounts',
    entityId: account.id,
    entityLabel: 'Rybársky účet',
    entityType: 'user_account',
    severity: 'info',
    summary: 'Rybár si vytvoril nový používateľský účet.',
  })

  return {
    ok: true,
    user: toPublicRegisteredUser(account),
  }
})
