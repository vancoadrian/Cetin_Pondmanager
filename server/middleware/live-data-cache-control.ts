import { defineEventHandler, getMethod, getRequestURL, setResponseHeader } from 'h3'

const livePublicApiPattern = /^\/api\/(?:notifications|closures|reservations|tournaments)(?:\/|$)/

export default defineEventHandler((event) => {
  if (getMethod(event) !== 'GET') return
  if (!livePublicApiPattern.test(getRequestURL(event).pathname)) return

  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
})
