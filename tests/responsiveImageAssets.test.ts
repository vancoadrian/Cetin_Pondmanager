import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { responsiveImageWidths } from '~/app/utils/responsiveImage'

describe('responsive public image assets', () => {
  it('contains every declared AVIF and WebP variant', () => {
    for (const [fileName, widths] of Object.entries(responsiveImageWidths)) {
      for (const width of widths) {
        for (const format of ['avif', 'webp']) {
          const filePath = join(process.cwd(), 'public', 'images', 'optimized', `${fileName}-${width}.${format}`)
          expect(existsSync(filePath), filePath).toBe(true)
        }
      }
    }
  })
})
