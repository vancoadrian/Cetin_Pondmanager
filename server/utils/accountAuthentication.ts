import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import {
  findMockUserByEmail,
  type PublicMockUser,
} from '~/composables/useMockAuth'
import type { MockAnglerAccount } from '~/services/anglerAccountService'
import {
  type LocalAccountProfileOverride,
  findLocalCredentialOverride,
  findLocalAccountProfileOverride,
  findLocalRegisteredAccountByEmail,
  findLocalRegisteredAccountById,
  type LocalRegisteredAnglerAccount,
} from './localAccountStore'
import { verifyPasswordWithAuthMigration } from './supabaseAuthIdentity'

const scrypt = promisify(nodeScrypt)
const HASH_BYTES = 64

export function toPublicRegisteredUser(
  account: LocalRegisteredAnglerAccount,
  profile?: LocalAccountProfileOverride,
): PublicMockUser {
  return {
    description: 'Osobný účet pre rezervácie, výpravy, zápisníky a históriu úlovkov.',
    email: account.email,
    id: account.id,
    name: profile?.name ?? account.name,
    permissions: ['moje výpravy', 'zápisníky', 'úlovky'],
    phone: profile?.phone,
    role: 'angler',
    roleLabel: 'rybár',
  }
}

export function toRegisteredAnglerAccount(
  account: LocalRegisteredAnglerAccount,
  profile?: LocalAccountProfileOverride,
): MockAnglerAccount {
  return {
    email: account.email,
    id: account.id,
    name: profile?.name ?? account.name,
    nameAliases: profile?.previousNames,
    phone: profile?.phone,
  }
}

export function applyLocalProfileToAnglerAccount(
  account: MockAnglerAccount,
  profile?: LocalAccountProfileOverride,
): MockAnglerAccount {
  if (!profile) return account

  return {
    ...account,
    name: profile.name,
    nameAliases: profile.previousNames,
    phone: profile.phone,
  }
}

export async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, HASH_BYTES) as Buffer
  return `scrypt:${salt}:${derived.toString('hex')}`
}

export async function verifyPasswordHash(password: string, encodedHash: string) {
  const [algorithm, salt, expectedHex] = encodedHash.split(':')
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false

  const expected = Buffer.from(expectedHex, 'hex')
  if (expected.length !== HASH_BYTES) return false

  const actual = await scrypt(password, salt, expected.length) as Buffer
  return timingSafeEqual(actual, expected)
}

export async function authenticateAppUser(email: string, password: string): Promise<PublicMockUser | undefined> {
  const mockUser = findMockUserByEmail(email)
  if (mockUser) {
    // Every seed account (owner/manager/marshal/... and the demo angler) must
    // have its own credential — there is no shared fallback password. In the
    // Supabase driver GoTrue is authoritative and a valid legacy credential
    // override (scripts/generate-seed-credentials.ts) migrates lazily on the
    // first successful login.
    const passwordMatches = await verifyPasswordWithAuthMigration(
      { accountId: mockUser.id, email: mockUser.email, role: mockUser.role },
      password,
      async () => {
        const credentialOverride = await findLocalCredentialOverride(mockUser.id)
        return credentialOverride
          ? verifyPasswordHash(password, credentialOverride.passwordHash)
          : false
      },
    )
    if (!passwordMatches) return undefined

    const profile = await findLocalAccountProfileOverride(mockUser.id)
    return {
      ...mockUser,
      name: profile?.name ?? mockUser.name,
      phone: profile?.phone,
    }
  }

  const registeredAccount = await findLocalRegisteredAccountByEmail(email)
  if (!registeredAccount) return undefined

  const passwordMatches = await verifyPasswordWithAuthMigration(
    { accountId: registeredAccount.id, email: registeredAccount.email, role: 'angler' },
    password,
    () => verifyPasswordHash(password, registeredAccount.passwordHash),
  )
  if (!passwordMatches) return undefined

  const profile = await findLocalAccountProfileOverride(registeredAccount.id)
  return toPublicRegisteredUser(registeredAccount, profile)
}

export async function verifyAppUserPassword(accountId: string, email: string, password: string) {
  const mockUser = findMockUserByEmail(email)
  if (mockUser?.id === accountId) {
    return verifyPasswordWithAuthMigration(
      { accountId: mockUser.id, email: mockUser.email, role: mockUser.role },
      password,
      async () => {
        const credentialOverride = await findLocalCredentialOverride(accountId)
        return credentialOverride
          ? verifyPasswordHash(password, credentialOverride.passwordHash)
          : false
      },
    )
  }

  const registeredAccount = await findLocalRegisteredAccountById(accountId)
  if (!registeredAccount || registeredAccount.email !== email.trim().toLocaleLowerCase('sk')) {
    return false
  }

  return verifyPasswordWithAuthMigration(
    { accountId: registeredAccount.id, email: registeredAccount.email, role: 'angler' },
    password,
    () => verifyPasswordHash(password, registeredAccount.passwordHash),
  )
}
