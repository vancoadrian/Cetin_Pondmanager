import { defineEventHandler, getCookie } from 'h3'
import { AUTH_SESSION_COOKIE } from '~/composables/useMockAuth'
import { clearSessionCookies } from '../../utils/appSession'
import { destroyLocalSession } from '../../utils/localSessionStore'

export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await destroyLocalSession(getCookie(event, AUTH_SESSION_COOKIE))
  clearSessionCookies(event)

  return { ok: true }
})
