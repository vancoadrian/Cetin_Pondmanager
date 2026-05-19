import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CatchPhoto } from '~/data/pond'
import type { CatchPhotoUpload } from '~/services/catchApiService'

export function resolveLocalCatchPhotoDir() {
  return process.env.RYBOLOV_LOCAL_CATCH_PHOTO_DIR
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'catch-photos')
}

export function decodeCatchPhotoDataUrl(upload: CatchPhotoUpload) {
  const prefix = `data:${upload.mimeType};base64,`
  if (!upload.dataUrl.startsWith(prefix)) {
    throw new Error('Fotka nemá platný dátový formát.')
  }

  return Buffer.from(upload.dataUrl.slice(prefix.length), 'base64')
}

export function resolveCatchPhotoFilePath(photo: Pick<CatchPhoto, 'storagePath'>, dir = resolveLocalCatchPhotoDir()) {
  return join(dir, basename(photo.storagePath))
}

export async function writeLocalCatchPhotoFile(
  photo: CatchPhoto,
  upload: CatchPhotoUpload,
  dir = resolveLocalCatchPhotoDir(),
) {
  const buffer = decodeCatchPhotoDataUrl(upload)
  await mkdir(dir, { recursive: true })
  await writeFile(resolveCatchPhotoFilePath(photo, dir), buffer)
}

export async function readLocalCatchPhotoFile(photo: Pick<CatchPhoto, 'storagePath'>, dir = resolveLocalCatchPhotoDir()) {
  return readFile(resolveCatchPhotoFilePath(photo, dir))
}
