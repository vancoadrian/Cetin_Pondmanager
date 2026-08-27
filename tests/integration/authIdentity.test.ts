import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createAuthUserWithPassword,
  deleteAuthUserByEmail,
  ensureAuthUserWithPassword,
  findAuthUserByEmail,
  verifyAuthUserPassword,
  verifyPasswordWithAuthMigration,
} from '../../server/utils/supabaseAuthIdentity'

/**
 * GoTrue identity gateway proti živému lokálnemu stacku: založenie účtu,
 * overenie hesla, duplicitný e-mail, lazy migrácia legacy hesla a mazanie.
 * Session vrstva (app_sessions) sa tu netestuje — pokrýva ju runtimeStores
 * suite a e2e login flow.
 */

const createdEmails: string[] = []

function throwawayIdentity(prefix: string) {
  const email = `${prefix}-${randomUUID()}@example.test`
  createdEmails.push(email)
  return { accountId: `angler-${randomUUID()}`, email, role: 'angler' }
}

afterAll(async () => {
  for (const email of createdEmails) {
    await deleteAuthUserByEmail(email).catch(() => undefined)
  }
})

describe('supabase auth identity gateway', () => {
  it('creates an auth user and verifies only the right password', async () => {
    const identity = throwawayIdentity('auth-create')
    const password = `Heslo-${randomUUID()}`

    const { duplicate } = await createAuthUserWithPassword(identity, password)
    expect(duplicate).toBe(false)

    await expect(verifyAuthUserPassword(identity.email, password)).resolves.toBe(true)
    await expect(verifyAuthUserPassword(identity.email, 'zle-heslo-123')).resolves.toBe(false)

    const user = await findAuthUserByEmail(identity.email)
    expect(user?.app_metadata?.app_account_id).toBe(identity.accountId)
    expect(user?.app_metadata?.app_role).toBe('angler')
  })

  it('reports a duplicate e-mail instead of overwriting the credential', async () => {
    const identity = throwawayIdentity('auth-duplicate')
    const password = `Heslo-${randomUUID()}`

    await createAuthUserWithPassword(identity, password)
    const second = await createAuthUserWithPassword(
      { ...identity, accountId: `angler-${randomUUID()}` },
      'ine-heslo-456',
    )

    expect(second.duplicate).toBe(true)
    await expect(verifyAuthUserPassword(identity.email, password)).resolves.toBe(true)
  })

  it('lazily migrates a valid legacy password into GoTrue on first login', async () => {
    const identity = throwawayIdentity('auth-lazy')
    const password = `Heslo-${randomUUID()}`

    // Účet v GoTrue ešte neexistuje → prvé overenie prejde cez legacy cestu
    // a heslo sa má zmigrovať.
    const first = await verifyPasswordWithAuthMigration(identity, password, async () => true)
    expect(first).toBe(true)

    // Druhé overenie už musí prejsť priamo cez GoTrue — legacy callback,
    // ktorý by odmietol, sa nesmie dostať k slovu.
    const second = await verifyPasswordWithAuthMigration(identity, password, async () => false)
    expect(second).toBe(true)

    // Nesprávne heslo padá aj so súhlasným legacy callbackom až po tom, čo
    // GoTrue overenie zlyhá a legacy vráti false.
    const wrong = await verifyPasswordWithAuthMigration(identity, 'zle-heslo-789', async () => false)
    expect(wrong).toBe(false)
  })

  it('updates the password via ensure and removes the user on delete', async () => {
    const identity = throwawayIdentity('auth-lifecycle')

    await ensureAuthUserWithPassword(identity, 'prve-Heslo-1')
    await ensureAuthUserWithPassword(identity, 'druhe-Heslo-2')

    await expect(verifyAuthUserPassword(identity.email, 'prve-Heslo-1')).resolves.toBe(false)
    await expect(verifyAuthUserPassword(identity.email, 'druhe-Heslo-2')).resolves.toBe(true)

    await deleteAuthUserByEmail(identity.email)
    await expect(verifyAuthUserPassword(identity.email, 'druhe-Heslo-2')).resolves.toBe(false)
    await expect(findAuthUserByEmail(identity.email)).resolves.toBeUndefined()

    // Mazanie neexistujúceho účtu je no-op.
    await expect(deleteAuthUserByEmail(identity.email)).resolves.toBeUndefined()
  })
})
