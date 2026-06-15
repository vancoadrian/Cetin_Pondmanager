import QRCode from 'qrcode'

export interface QrCodeDataUrlOptions {
  margin?: number
  scale?: number
}

export const qrCodeDefaultOptions = {
  color: {
    dark: '#062523',
    light: '#ffffff',
  },
  errorCorrectionLevel: 'M',
  margin: 1,
  scale: 6,
} as const

export async function createQrCodeDataUrl(value: string, options: QrCodeDataUrlOptions = {}) {
  return QRCode.toDataURL(value, {
    ...qrCodeDefaultOptions,
    margin: options.margin ?? qrCodeDefaultOptions.margin,
    scale: options.scale ?? qrCodeDefaultOptions.scale,
  })
}
