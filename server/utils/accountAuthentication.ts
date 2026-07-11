import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import {
  authenticateMockUser,
  type PublicMockUser,
} from '~/composables/useMockAuth'
import type { MockAnglerAccount } from '~/services/anglerAccountService'
import {
  findLocalRegisteredAccountByEmail,
  findLocalRegisteredAccountById,
  type LocalRegisteredAnglerAccount,
} from './localAccountStore'

const scrypt = promisify(nodeScrypt)
const HASH_BYTES = 64

export function toPublicRegisteredUser(account: LocalRegisteredAnglerAccount): PublicMockUser {
  return {
    description: 'Osobný účet pre rezervácie, výpravy, zápisníky a históriu úlovkov.',
    email: account.email,
    id: account.id,
    name: account.name,
    permissions: ['moje výpravy', 'zápisníky', 'úlovky'],
    role: 'angler',
    roleLabel: 'rybár',
  }
}

export function toRegisteredAnglerAccount(account: LocalRegisteredAnglerAccount): MockAnglerAccount {
  return {
    email: account.email,
    id: account.id,
    name: account.name,
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
  const mockUser = authenticateMockUser(email, password)
  if (mockUser) {
    const { password: _password, ...publicUser } = mockUser
    return publicUser
  }

  const registeredAccount = await findLocalRegisteredAccountByEmail(email)
  if (!registeredAccount || !await verifyPasswordHash(password, registeredAccount.passwordHash)) {
    return undefined
  }

  return toPublicRegisteredUser(registeredAccount)
}

export async function verifyAppUserPassword(accountId: string, email: string, password: string) {
  const mockUser = authenticateMockUser(email, password)
  if (mockUser?.id === accountId) return true

  const registeredAccount = await findLocalRegisteredAccountById(accountId)
  return Boolean(
    registeredAccount
    && registeredAccount.email === email.trim().toLocaleLowerCase('sk')
    && await verifyPasswordHash(password, registeredAccount.passwordHash),
  )
}
