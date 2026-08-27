import { defineEventHandler, getCookie } from 'h3'
import { AUTH_SESSION_COOKIE } from '~/composables/useMockAuth'
import { clearSessionCookies } from '../../utils/appSession'
import { looksLikeAuthJwt, revokeAuthSession } from '../../utils/authSessionTokens'
import { destroyLocalSession } from '../../utils/localSessionStore'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const token = getCookie(event, AUTH_SESSION_COOKIE)
  if (token && looksLikeAuthJwt(token)) {
    await revokeAuthSession(event)
  }
  else {
    await destroyLocalSession(token)
  }
  clearSessionCookies(event)

  return { ok: true }
})
