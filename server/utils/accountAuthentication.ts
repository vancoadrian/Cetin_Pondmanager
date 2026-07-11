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
    const credentialOverride = await findLocalCredentialOverride(mockUser.id)
    const passwordMatches = credentialOverride
      ? await verifyPasswordHash(password, credentialOverride.passwordHash)
      : mockUser.password === password
    if (!passwordMatches) return undefined

    const profile = await findLocalAccountProfileOverride(mockUser.id)
    const { password: _password, ...publicUser } = mockUser
    return {
      ...publicUser,
      name: profile?.name ?? publicUser.name,
      phone: profile?.phone,
    }
  }

  const registeredAccount = await findLocalRegisteredAccountByEmail(email)
  if (!registeredAccount || !await verifyPasswordHash(password, registeredAccount.passwordHash)) {
    return undefined
  }

  const profile = await findLocalAccountProfileOverride(registeredAccount.id)
  return toPublicRegisteredUser(registeredAccount, profile)
}

export async function verifyAppUserPassword(accountId: string, email: string, password: string) {
  const mockUser = findMockUserByEmail(email)
  if (mockUser?.id === accountId) {
    const credentialOverride = await findLocalCredentialOverride(accountId)
    return credentialOverride
      ? verifyPasswordHash(password, credentialOverride.passwordHash)
      : mockUser.password === password
  }

  const registeredAccount = await findLocalRegisteredAccountById(accountId)
  return Boolean(
    registeredAccount
    && registeredAccount.email === email.trim().toLocaleLowerCase('sk')
    && await verifyPasswordHash(password, registeredAccount.passwordHash),
  )
}
