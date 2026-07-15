import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getResponsiveMapBackgroundSources,
  responsiveImageWidths,
  responsiveMapBackgrounds,
} from '~/app/utils/responsiveImage'

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

  it('keeps map background variants on the exact source aspect ratio', () => {
    for (const [source, definition] of Object.entries(responsiveMapBackgrounds)) {
      const sourceRatio = definition.source.width / definition.source.height

      expect(definition.mobile.width / definition.mobile.height).toBe(sourceRatio)
      expect(definition.desktop.width / definition.desktop.height).toBe(sourceRatio)
      expect(getResponsiveMapBackgroundSources(source)).toMatchObject({
        desktop: {
          avif: expect.stringContaining(`-${definition.desktop.width}.avif`),
          webp: expect.stringContaining(`-${definition.desktop.width}.webp`),
        },
        mobile: {
          avif: expect.stringContaining(`-${definition.mobile.width}.avif`),
          webp: expect.stringContaining(`-${definition.mobile.width}.webp`),
        },
      })
    }
  })

  it('uses the original source for dynamic map uploads without declared variants', () => {
    expect(getResponsiveMapBackgroundSources('/api/map/assets/custom-background.webp')).toBeUndefined()
  })
})
