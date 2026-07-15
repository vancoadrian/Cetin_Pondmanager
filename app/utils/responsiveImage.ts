export const responsiveImageWidths: Record<string, readonly number[]> = {
  'home-img-0999': [640, 960, 1440, 1920],
  'kocka-slide-2': [320, 640, 1080],
  'kocka-slide-3': [320, 640, 1080],
  'kocka-slide-4': [320, 640, 1080],
  'kocka-slide-5': [320, 640, 1080],
  'strkovisko-kocka': [320, 500],
  'velky-cetin-card': [320, 500],
  'velky-cetin-slide-a1': [320, 640, 1080],
  'velky-cetin-slide-a2': [320, 640, 1080],
  'velky-cetin-slide-a3': [320, 640, 1080],
  'velky-cetin-slide-a4': [320, 640, 1080],
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
