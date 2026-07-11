import { createError, defineEventHandler, readBody } from 'h3'
import type { PublicMockUser } from '~/composables/useMockAuth'
import { getValidationMessages, loginPayloadSchema } from '~/schemas/pondSchemas'
import { authenticateAppUser } from '../../utils/accountAuthentication'
import { isLocalAccountDeleted } from '../../utils/localAccountStore'

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

  const user = await authenticateAppUser(payload.data.email, payload.data.password)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'E-mail alebo heslo nie sú správne.',
    })
  }

  if (user.role === 'angler' && await isLocalAccountDeleted(user.id)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Tento účet bol zmazaný a už sa nedá použiť na prihlásenie.',
    })
  }

  return {
    ok: true,
    user,
  }
})
