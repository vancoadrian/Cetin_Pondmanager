export const PASSWORD_RESET_REQUEST_MESSAGE = 'Ak účet s týmto e-mailom existuje, poslali sme naň odkaz na obnovu hesla.'
export const PASSWORD_RESET_TTL_MINUTES = 30

export interface PasswordResetRequestResponse {
  message: string
  ok: true
}

export interface PasswordResetConfirmResponse {
  message: string
  ok: true
}

export type PasswordResetDeliveryProvider = 'disabled' | 'mock' | 'resend'
export type PasswordResetDeliveryStatus = 'failed' | 'prepared' | 'sent' | 'skipped'

export interface PasswordResetDeliveryResult {
  externalId?: string
  message: string
  provider: PasswordResetDeliveryProvider
  status: PasswordResetDeliveryStatus
}
