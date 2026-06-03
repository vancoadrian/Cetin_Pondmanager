import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { z } from 'zod'
import type { mapBackgroundUploadSchema } from '~/schemas/pondSchemas'

export type MapBackgroundUpload = z.infer<typeof mapBackgroundUploadSchema>

export function resolveLocalMapAssetDir() {
  return process.env.RYBOLOV_LOCAL_MAP_ASSET_DIR
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'map-assets')
}

export function extensionForMapBackgroundMimeType(mimeType: MapBackgroundUpload['mimeType']) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'

  return 'jpg'
}

export function decodeMapBackgroundDataUrl(upload: MapBackgroundUpload) {
  const prefix = `data:${upload.mimeType};base64,`
  if (!upload.dataUrl.startsWith(prefix)) {
    throw new Error('Podklad mapy nemá platný dátový formát.')
  }

  return Buffer.from(upload.dataUrl.slice(prefix.length), 'base64')
}

export function resolveMapAssetFilePath(assetId: string, dir = resolveLocalMapAssetDir()) {
  return join(dir, basename(assetId))
}

export async function writeLocalMapAssetFile(
  assetId: string,
  upload: MapBackgroundUpload,
  dir = resolveLocalMapAssetDir(),
) {
  const buffer = decodeMapBackgroundDataUrl(upload)
  await mkdir(dir, { recursive: true })
  await writeFile(resolveMapAssetFilePath(assetId, dir), buffer)
}

export async function readLocalMapAssetFile(assetId: string, dir = resolveLocalMapAssetDir()) {
  return readFile(resolveMapAssetFilePath(assetId, dir))
}

export function getMapAssetMimeType(assetId: string) {
  if (assetId.endsWith('.png')) return 'image/png'
  if (assetId.endsWith('.webp')) return 'image/webp'

  return 'image/jpeg'
}
