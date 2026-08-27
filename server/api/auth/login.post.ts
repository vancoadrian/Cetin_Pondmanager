import { createError, defineEventHandler, readBody } from 'h3'
import { findMockUserByEmail, type PublicMockUser } from '~/composables/useMockAuth'
import { getValidationMessages, loginPayloadSchema } from '~/schemas/pondSchemas'
import { authenticateAppUser } from '../../utils/accountAuthentication'
import { applyAuthSessionCookies, applySessionCookies } from '../../utils/appSession'
import { findLocalRegisteredAccountByEmail, isLocalAccountDeleted } from '../../utils/localAccountStore'
import { createLocalSession } from '../../utils/localSessionStore'

export interface MockLoginResponse {
  ok: true
  user: PublicMockUser
}

export default defineEventHandler(async (event): Promise<MockLoginResponse> => {
  const payload = loginPayloadSchema.safeParse(await readBody(event))
  if (!payload.success) {
    throw createError({
      data: { messages: getValidationMessages(payload) },
      statusCode: 422,
      statusMessage: 'Login validation failed',
    })
  }

  // Account deletion removes the credential override along with the login
  // record, so a deleted account can no longer authenticate at all. Resolve
  // the candidate account id from the email first, so a deleted account
  // still gets a clear 403 instead of a misleading "wrong password" 401.
  const mockUser = findMockUserByEmail(payload.data.email)
  const registeredAccount = mockUser ? undefined : await findLocalRegisteredAccountByEmail(payload.data.email)
  const candidateAccountId = mockUser?.id ?? registeredAccount?.id

  if (candidateAccountId && await isLocalAccountDeleted(candidateAccountId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Tento účet bol zmazaný a už sa nedá použiť na prihlásenie.',
    })
  }

  const authenticated = await authenticateAppUser(payload.data.email, payload.data.password)
  if (!authenticated) {
    throw createError({
      statusCode: 401,
      statusMessage: 'E-mail alebo heslo nie sú správne.',
    })
  }

  const { tokens, user } = authenticated
  if (tokens) {
    // Fáza 2b: session nesú GoTrue JWT cookies; app_sessions ostáva fallback
    applyAuthSessionCookies(event, tokens, user.role)
  }
  else {
    const { token } = await createLocalSession(user.id, user.role)
    applySessionCookies(event, token, user.role)
  }

  return {
    ok: true,
    user,
  }
})
