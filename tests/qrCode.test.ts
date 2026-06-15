import { describe, expect, it } from 'vitest'
import {
  createQrCodeDataUrl,
  qrCodeDefaultOptions,
} from '~/app/utils/qrCode'

describe('qrCode helpers', () => {
  it('generates a png data url for scan cards', async () => {
    const dataUrl = await createQrCodeDataUrl('https://rybolov.test/sutaze/tim?kod=ECCJ-2026-A2')

    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('keeps a readable app color default', () => {
    expect(qrCodeDefaultOptions.color.dark).toBe('#062523')
  })
})
