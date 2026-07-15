export const responsiveImageWidths: Record<string, readonly number[]> = {
  'home-img-0999': [640, 960, 1440, 1920],
  'kocka-slide-2': [320, 640, 1080],
  'kocka-slide-3': [320, 640, 1080],
  'kocka-slide-4': [320, 640, 1080],
  'kocka-slide-5': [320, 640, 1080],
  'strkovisko-kocka': [320, 500],
  'velky-cetin-card': [320, 500],
  'velky-cetin-map-original': [960, 1600],
  'velky-cetin-slide-a1': [320, 640, 1080],
  'velky-cetin-slide-a2': [320, 640, 1080],
  'velky-cetin-slide-a3': [320, 640, 1080],
  'velky-cetin-slide-a4': [320, 640, 1080],
}

interface ResponsiveMapBackgroundVariant {
  height: number
  width: number
}

interface ResponsiveMapBackgroundDefinition {
  desktop: ResponsiveMapBackgroundVariant
  mobile: ResponsiveMapBackgroundVariant
  source: ResponsiveMapBackgroundVariant
}

export const responsiveMapBackgrounds: Record<string, ResponsiveMapBackgroundDefinition> = {
  '/images/source-web/velky-cetin-map-original.jpg': {
    desktop: { height: 880, width: 1600 },
    mobile: { height: 528, width: 960 },
    source: { height: 1100, width: 2000 },
  },
}

export function getResponsiveMapBackgroundSources(source: string | undefined) {
  if (!source) return undefined

  const definition = responsiveMapBackgrounds[source]
  const fileName = source.split('/').pop()?.replace(/\.[^.]+$/, '')

  if (!definition || !fileName) return undefined

  const optimizedBase = `/images/optimized/${fileName}`

  return {
    definition,
    desktop: {
      avif: `${optimizedBase}-${definition.desktop.width}.avif`,
      webp: `${optimizedBase}-${definition.desktop.width}.webp`,
    },
    mobile: {
      avif: `${optimizedBase}-${definition.mobile.width}.avif`,
      webp: `${optimizedBase}-${definition.mobile.width}.webp`,
    },
  }
}

export function getOptimizedImageSrcset(
  source: string,
  widths: readonly number[],
  format: 'avif' | 'webp' = 'avif',
) {
  const fileName = source.split('/').pop()?.replace(/\.[^.]+$/, '')

  if (!fileName) return ''
  const availableWidths = responsiveImageWidths[fileName]
  if (!availableWidths) return ''

  return widths
    .filter((width) => availableWidths.includes(width))
    .map((width) => `/images/optimized/${fileName}-${width}.${format} ${width}w`)
    .join(', ')
}
