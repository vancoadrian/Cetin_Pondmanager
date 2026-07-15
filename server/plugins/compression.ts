import { Buffer } from 'node:buffer'
import { appendResponseHeader, getRequestHeader, getRequestURL } from 'h3'
import { useBrotliCompression, useGZipCompression } from 'h3-compression'

const MIN_COMPRESSION_BYTES = 1024

function encodingQuality(header: string, encoding: 'br' | 'gzip') {
  const entry = header
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.split(';', 1)[0]?.trim().toLowerCase() === encoding)

  if (!entry) return 0
  const qualityParameter = entry
    .split(';')
    .slice(1)
    .map((part) => part.trim())
    .find((part) => part.startsWith('q='))
  if (!qualityParameter) return 1

  const quality = Number(qualityParameter.slice(2))
  return Number.isFinite(quality) ? Math.min(Math.max(quality, 0), 1) : 0
}

function preferredEncoding(header: string) {
  const brotliQuality = encodingQuality(header, 'br')
  const gzipQuality = encodingQuality(header, 'gzip')

  if (brotliQuality <= 0 && gzipQuality <= 0) return undefined
  return brotliQuality >= gzipQuality ? 'br' : 'gzip'
}

function bodyByteLength(body: unknown) {
  if (typeof body === 'string') return Buffer.byteLength(body)
  if (body instanceof Uint8Array) return body.byteLength
  if (body instanceof ArrayBuffer) return body.byteLength
  return 0
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:response', async (response, { event }) => {
    const pathname = getRequestURL(event).pathname
    if (pathname.startsWith('/_nuxt') || pathname.startsWith('/__nuxt')) return
    if (!response.headers?.['content-type']?.startsWith('text/html')) return
    if (bodyByteLength(response.body) < MIN_COMPRESSION_BYTES) return

    const encoding = preferredEncoding(getRequestHeader(event, 'accept-encoding') ?? '')
    if (!encoding) return

    appendResponseHeader(event, 'Vary', 'Accept-Encoding')
    if (encoding === 'br') await useBrotliCompression(event, response)
    else await useGZipCompression(event, response)
  })
})
