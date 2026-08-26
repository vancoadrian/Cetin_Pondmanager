import { basename, join } from 'node:path'
import type { z } from 'zod'
import type { mapBackgroundUploadSchema } from '~/schemas/pondSchemas'
import {
  readAssetObject,
  resolveAssetBucketFileDirectory,
  writeAssetObject,
} from './assetObjectStore'

export type MapBackgroundUpload = z.infer<typeof mapBackgroundUploadSchema>

export const MAP_ASSET_BUCKET = 'map-assets'

/** File-driver directory (dev/test adapter); Supabase driver uses the map-assets bucket. */
export function resolveLocalMapAssetDir() {
  return resolveAssetBucketFileDirectory(MAP_ASSET_BUCKET)
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
  await writeAssetObject(MAP_ASSET_BUCKET, basename(assetId), buffer, upload.mimeType, { fileDirectory: dir })
}

export async function readLocalMapAssetFile(assetId: string, dir = resolveLocalMapAssetDir()) {
  const { data } = await readAssetObject(MAP_ASSET_BUCKET, basename(assetId), { fileDirectory: dir })

  return data
}

export function getMapAssetMimeType(assetId: string) {
  if (assetId.endsWith('.png')) return 'image/png'
  if (assetId.endsWith('.webp')) return 'image/webp'

  return 'image/jpeg'
}
