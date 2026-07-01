import { getCookie, type H3Event } from 'h3'
import {
  AUTH_SESSION_COOKIE,
  findMockUserBySessionValue,
} from '~/composables/useMockAuth'

export function resolveAppSessionUser(event: H3Event) {
  return findMockUserBySessionValue(getCookie(event, AUTH_SESSION_COOKIE))
}
