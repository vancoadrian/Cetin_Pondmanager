import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeMapBackgroundDataUrl,
  extensionForMapBackgroundMimeType,
  readLocalMapAssetFile,
  writeLocalMapAssetFile,
} from '~/server/utils/localMapAssetStore'

const tempDirs: string[] = []

async function createAssetDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rybolov-map-assets-'))
  tempDirs.push(dir)

  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

describe('localMapAssetStore', () => {
  it('decodes and persists uploaded map background images', async () => {
    const dir = await createAssetDir()
    const upload = {
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      fileName: 'map.png',
      lake: 'velky-cetin' as const,
      mimeType: 'image/png' as const,
      sizeBytes: 5,
    }

    await writeLocalMapAssetFile('map-bg-test.png', upload, dir)

    expect(extensionForMapBackgroundMimeType(upload.mimeType)).toBe('png')
    expect(decodeMapBackgroundDataUrl(upload).toString('utf8')).toBe('hello')
    expect((await readLocalMapAssetFile('map-bg-test.png', dir)).toString('utf8')).toBe('hello')
    expect(await readFile(join(dir, 'map-bg-test.png'), 'utf8')).toBe('hello')
  })
})
