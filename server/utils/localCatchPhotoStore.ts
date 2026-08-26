import { basename, join } from 'node:path'
import type { CatchPhoto } from '~/data/pond'
import type { CatchPhotoUpload } from '~/services/catchApiService'
import {
  readAssetObject,
  resolveAssetBucketFileDirectory,
  writeAssetObject,
} from './assetObjectStore'

export const CATCH_PHOTO_BUCKET = 'catch-photos'

/** File-driver directory (dev/test adapter); Supabase driver uses the catch-photos bucket. */
export function resolveLocalCatchPhotoDir() {
  return resolveAssetBucketFileDirectory(CATCH_PHOTO_BUCKET)
}

export function decodeCatchPhotoDataUrl(upload: CatchPhotoUpload) {
  const prefix = `data:${upload.mimeType};base64,`
  if (!upload.dataUrl.startsWith(prefix)) {
    throw new Error('Fotka nemá platný dátový formát.')
  }

  return Buffer.from(upload.dataUrl.slice(prefix.length), 'base64')
}

export function resolveCatchPhotoObjectName(photo: Pick<CatchPhoto, 'storagePath'>) {
  return basename(photo.storagePath)
}

export function resolveCatchPhotoFilePath(photo: Pick<CatchPhoto, 'storagePath'>, dir = resolveLocalCatchPhotoDir()) {
  return join(dir, resolveCatchPhotoObjectName(photo))
}

export async function writeLocalCatchPhotoFile(
  photo: CatchPhoto,
  upload: CatchPhotoUpload,
  dir = resolveLocalCatchPhotoDir(),
) {
  const buffer = decodeCatchPhotoDataUrl(upload)
  await writeAssetObject(CATCH_PHOTO_BUCKET, resolveCatchPhotoObjectName(photo), buffer, upload.mimeType, {
    fileDirectory: dir,
  })
}

export async function readLocalCatchPhotoFile(
  photo: Pick<CatchPhoto, 'storagePath'>,
  dir = resolveLocalCatchPhotoDir(),
) {
  const { data } = await readAssetObject(CATCH_PHOTO_BUCKET, resolveCatchPhotoObjectName(photo), {
    fileDirectory: dir,
  })

  return data
}
