import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  PASSWORD_RESET_TTL_MINUTES,
  type PasswordResetDeliveryProvider,
  type PasswordResetDeliveryResult,
} from '~/services/accountPasswordResetService'
import type { LocalPasswordResetRecord, LocalRegisteredAnglerAccount } from './localAccountStore'

export interface PasswordResetProviderConfig {
  apiKey?: string
  endpoint: string
  from: string
  provider: PasswordResetDeliveryProvider
  replyTo?: string
}

function envValue(env: Record<string, string | undefined>, key: string) {
  return env[key]?.trim() || undefined
}

export function readPasswordResetProviderConfig(
  env: Record<string, string | undefined> = process.env,
): PasswordResetProviderConfig {
  const configuredProvider = envValue(env, 'RYBOLOV_AUTH_DELIVERY_PROVIDER')
  const provider: PasswordResetDeliveryProvider = configuredProvider === 'disabled'
    || configuredProvider === 'resend'
    || configuredProvider === 'mock'
    ? configuredProvider
    : 'mock'

  return {
    apiKey: envValue(env, 'RYBOLOV_RESEND_API_KEY'),
    endpoint: envValue(env, 'RYBOLOV_RESEND_API_ENDPOINT') ?? 'https://api.resend.com/emails',
    from: envValue(env, 'RYBOLOV_AUTH_EMAIL_FROM') ?? 'Rybolov Cetín <ucet@rybolov-cetin.local>',
    provider,
    replyTo: envValue(env, 'RYBOLOV_AUTH_EMAIL_REPLY_TO'),
  }
}

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function createPasswordResetToken(
  accountId: string,
  now = new Date(),
  ttlMinutes = PASSWORD_RESET_TTL_MINUTES,
) {
  const token = randomBytes(32).toString('base64url')
  const reset: LocalPasswordResetRecord = {
    accountId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
    id: `password-reset-${randomUUID()}`,
    tokenHash: hashPasswordResetToken(token),
  }

  return { reset, token }
}

export function createPasswordResetUrl(siteUrl: string, token: string) {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '')
  return `${normalizedSiteUrl}/obnova-hesla?token=${encodeURIComponent(token)}`
}

export async function deliverPasswordResetEmail(
  account: Pick<LocalRegisteredAnglerAccount, 'email' | 'name'>,
  resetUrl: string,
  resetId: string,
  providerConfig = readPasswordResetProviderConfig(),
  fetcher: typeof fetch = fetch,
): Promise<PasswordResetDeliveryResult> {
  if (providerConfig.provider === 'disabled') {
    return {
      message: 'Odosielanie e-mailov k účtom je vypnuté.',
      provider: 'disabled',
      status: 'skipped',
    }
  }

  if (providerConfig.provider === 'mock') {
    return {
      message: 'Mock režim pripravil obnovu bez zverejnenia reset odkazu.',
      provider: 'mock',
      status: 'prepared',
    }
  }

  if (!providerConfig.apiKey) {
    return {
      message: 'Chýba RYBOLOV_RESEND_API_KEY, e-mail na obnovu hesla nebol odoslaný.',
      provider: 'resend',
      status: 'failed',
    }
  }

  const subject = 'Rybolov Cetín: obnova hesla'
  const text = [
    `Dobrý deň, ${account.name},`,
    '',
    `o obnovu hesla môžete požiadať cez tento jednorazový odkaz: ${resetUrl}`,
    '',
    `Odkaz platí ${PASSWORD_RESET_TTL_MINUTES} minút. Ak ste o obnovu nežiadali, správu ignorujte.`,
  ].join('\n')

  try {
    const response = await fetcher(providerConfig.endpoint, {
      body: JSON.stringify({
        from: providerConfig.from,
        html: `<p>Dobrý deň, ${escapeHtml(account.name)},</p><p>Heslo si obnovíte cez tento jednorazový odkaz:</p><p><a href="${escapeHtml(resetUrl)}">Obnoviť heslo</a></p><p>Odkaz platí ${PASSWORD_RESET_TTL_MINUTES} minút. Ak ste o obnovu nežiadali, správu ignorujte.</p>`,
        reply_to: providerConfig.replyTo,
        subject,
        tags: [
          { name: 'category', value: 'password_reset' },
          { name: 'password_reset_id', value: resetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256) },
        ],
        text,
        to: [account.email],
      }),
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': resetId,
      },
      method: 'POST',
    })
    const payload = await response.json().catch(() => undefined) as { id?: string, message?: string } | undefined
    if (!response.ok) {
      return {
        externalId: payload?.id,
        message: payload?.message ?? `Resend vrátil HTTP ${response.status}.`,
        provider: 'resend',
        status: 'failed',
      }
    }

    return {
      externalId: payload?.id,
      message: 'E-mail na obnovu hesla bol odoslaný cez Resend.',
      provider: 'resend',
      status: 'sent',
    }
  }
  catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Resend požiadavka zlyhala.',
      provider: 'resend',
      status: 'failed',
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}
