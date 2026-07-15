import { defineEventHandler, getRequestURL, setResponseHeader } from 'h3'

const privatePathPatterns = [
  /^\/admin(?:\/|$)/,
  /^\/konto(?:\/|$)/,
  /^\/sutaze\/tim(?:\/|$)/,
  /^\/(?:login|registracia|zabudnute-heslo|obnova-hesla|offline)(?:\/|$)/,
]

const privateResponsePatterns = [
  ...privatePathPatterns,
  /^\/api\/(?:account|admin)(?:\/|$)/,
]

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (privateResponsePatterns.some((pattern) => pattern.test(pathname))) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  }

  if (!privatePathPatterns.some((pattern) => pattern.test(pathname))) return

  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow, noarchive')
})
