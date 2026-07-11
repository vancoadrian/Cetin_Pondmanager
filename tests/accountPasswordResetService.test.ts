import { describe, expect, it } from 'vitest'
import {
  createPasswordResetToken,
  createPasswordResetUrl,
  deliverPasswordResetEmail,
  hashPasswordResetToken,
  readPasswordResetProviderConfig,
} from '~/server/utils/accountPasswordReset'

describe('account password reset service', () => {
  it('creates a one-time token while retaining only its deterministic hash', () => {
    const now = new Date('2026-07-11T08:00:00.000Z')
    const result = createPasswordResetToken('angler-test', now)

    expect(result.token).toHaveLength(43)
    expect(result.reset).toMatchObject({
      accountId: 'angler-test',
      createdAt: '2026-07-11T08:00:00.000Z',
      expiresAt: '2026-07-11T08:30:00.000Z',
      tokenHash: hashPasswordResetToken(result.token),
    })
    expect(JSON.stringify(result.reset)).not.toContain(result.token)
  })

  it('builds an encoded reset URL and keeps mock delivery private', async () => {
    const resetUrl = createPasswordResetUrl('https://rybolov.example/', 'token s medzerou')
    expect(resetUrl).toBe('https://rybolov.example/obnova-hesla?token=token%20s%20medzerou')

    const delivery = await deliverPasswordResetEmail(
      { email: 'rybar@example.sk', name: 'Rybár' },
      resetUrl,
      'reset-1',
      {
        endpoint: 'https://api.resend.test/emails',
        from: 'Rybolov Cetín <ucet@example.sk>',
        provider: 'mock',
      },
    )
    expect(delivery).toMatchObject({ provider: 'mock', status: 'prepared' })
    expect(delivery.message).not.toContain(resetUrl)
  })

  it('sends a reset email through the Resend adapter without leaking credentials', async () => {
    const requests: Array<{ body: Record<string, unknown>, headers: Headers, url: string }> = []
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: new Headers(init?.headers),
        url: String(input),
      })
      return new Response(JSON.stringify({ id: 'email-reset-1' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }
    const resetUrl = 'https://rybolov.example/obnova-hesla?token=sensitive-token'
    const result = await deliverPasswordResetEmail(
      { email: 'rybar@example.sk', name: 'Ján <Rybár>' },
      resetUrl,
      'password-reset-1',
      {
        apiKey: 're_test',
        endpoint: 'https://api.resend.test/emails',
        from: 'Rybolov Cetín <ucet@example.sk>',
        provider: 'resend',
        replyTo: 'spravca@example.sk',
      },
      fetcher,
    )

    expect(result).toMatchObject({ externalId: 'email-reset-1', provider: 'resend', status: 'sent' })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://api.resend.test/emails')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer re_test')
    expect(requests[0]?.body).toMatchObject({
      subject: 'Rybolov Cetín: obnova hesla',
      to: ['rybar@example.sk'],
    })
    expect(String(requests[0]?.body.html)).toContain('Ján &lt;Rybár&gt;')
    expect(String(requests[0]?.body.text)).toContain(resetUrl)
    expect(JSON.stringify(requests[0]?.body)).not.toContain('re_test')
  })

  it('defaults account email delivery to the private mock provider', () => {
    expect(readPasswordResetProviderConfig({})).toMatchObject({
      endpoint: 'https://api.resend.com/emails',
      provider: 'mock',
    })
  })
})
