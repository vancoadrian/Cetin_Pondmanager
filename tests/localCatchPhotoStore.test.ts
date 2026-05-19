import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CatchPhoto } from '~/app/data/pond'
import {
  readLocalCatchPhotoFile,
  resolveCatchPhotoFilePath,
  writeLocalCatchPhotoFile,
} from '~/server/utils/localCatchPhotoStore'

const tempDirs: string[] = []

async function createPhotoDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-catch-photos-'))
  tempDirs.push(dir)

  return dir
}

const photo = (): CatchPhoto => ({
  aiNotes: 'Test.',
  aiStatus: 'queued',
  catchId: 'catch-1',
  fileName: 'kapor.png',
  id: 'photo-catch-1',
  label: 'kapor.png',
  mimeType: 'image/png',
  publicUrl: '/api/catch-photos/photo-catch-1',
  sizeBytes: 16,
  status: 'uploaded',
  storagePath: 'catch-photos/photo-catch-1.png',
  uploadedAt: '2026-05-18T07:00:00.000Z',
})

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localCatchPhotoStore', () => {
  it('writes and reads uploaded catch photo bytes', async () => {
    const dir = await createPhotoDir()
    const catchPhoto = photo()

    await writeLocalCatchPhotoFile(
      catchPhoto,
      {
        dataUrl: 'data:image/png;base64,aGVsbG8=',
        fileName: 'kapor.png',
        mimeType: 'image/png',
        sizeBytes: 5,
      },
      dir,
    )

    await expect(readLocalCatchPhotoFile(catchPhoto, dir)).resolves.toEqual(Buffer.from('hello'))
    expect(resolveCatchPhotoFilePath(catchPhoto, dir)).toBe(join(dir, 'photo-catch-1.png'))
  })
})
