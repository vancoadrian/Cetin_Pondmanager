import { randomUUID } from 'node:crypto'
import { createError, defineEventHandler, readBody } from 'h3'
import {
  findMockUserByEmail,
  type MockRegistrationResponse,
} from '~/composables/useMockAuth'
import { getValidationMessages, accountRegistrationPayloadSchema } from '~/schemas/pondSchemas'
import { findMockAnglerAccountByEmail } from '~/services/anglerAccountService'
import { createPasswordHash, toPublicRegisteredUser } from '../../utils/accountAuthentication'
import { applyAuthSessionCookies, applySessionCookies } from '../../utils/appSession'
import { appendLocalAuditEvent } from '../../utils/localAuditLogStore'
import {
  addLocalRegisteredAccount,
  findLocalRegisteredAccountByEmail,
  type LocalRegisteredAnglerAccount,
} from '../../utils/localAccountStore'
import { createLocalSession } from '../../utils/localSessionStore'
import {
  createAuthUserWithPassword,
  deleteAuthUserByEmail,
  isSupabaseAuthEnabled,
  signInForAuthTokens,
} from '../../utils/supabaseAuthIdentity'

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

  // V Supabase režime je autoritou pre prihlasovacie údaje GoTrue — účet sa
  // zakladá najprv tam (vrátane kontroly duplicitného e-mailu naprieč
  // celou identitou), lokálny záznam nesie profil a históriu.
  if (isSupabaseAuthEnabled()) {
    const { duplicate } = await createAuthUserWithPassword(
      { accountId: account.id, email, role: 'angler' },
      payload.data.password,
    )
    if (duplicate) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Účet s týmto e-mailom už existuje. Prihláste sa alebo kontaktujte správcu.',
      })
    }
  }

  try {
    await addLocalRegisteredAccount(account)
  }
  catch (error) {
    if (isSupabaseAuthEnabled()) {
      await deleteAuthUserByEmail(email).catch(() => undefined)
    }
    throw error
  }
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

  const publicUser = toPublicRegisteredUser(account)
  let authTokens
  if (isSupabaseAuthEnabled()) {
    authTokens = await signInForAuthTokens(email, payload.data.password).catch(() => undefined)
  }
  if (authTokens) {
    applyAuthSessionCookies(event, authTokens, publicUser.role)
  }
  else {
    const { token } = await createLocalSession(publicUser.id, publicUser.role)
    applySessionCookies(event, token, publicUser.role)
  }

  return {
    ok: true,
    user: publicUser,
  }
})
