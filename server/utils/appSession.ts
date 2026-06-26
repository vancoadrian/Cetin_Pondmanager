import { getCookie, type H3Event } from 'h3'
import {
  AUTH_SESSION_COOKIE,
  findMockUserById,
} from '~/composables/useMockAuth'

export function resolveAppSessionUser(event: H3Event) {
  return findMockUserById(getCookie(event, AUTH_SESSION_COOKIE))
}
