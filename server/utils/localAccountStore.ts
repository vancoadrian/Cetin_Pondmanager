import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AccountDeletionSummary } from '~/services/accountDeletionService'

export interface LocalAccountDeletionRecord {
  accountId: string
  deletedAt: string
  summary: AccountDeletionSummary
}

export interface LocalRegisteredAnglerAccount {
  createdAt: string
  email: string
  id: string
  name: string
  passwordHash: string
}

export interface LocalCredentialOverride {
  accountId: string
  passwordHash: string
  updatedAt: string
}

export interface LocalPasswordResetRecord {
  accountId: string
  createdAt: string
  expiresAt: string
  id: string
  tokenHash: string
}

export interface LocalAccountState {
  credentialOverrides: LocalCredentialOverride[]
  deletions: LocalAccountDeletionRecord[]
  passwordResets: LocalPasswordResetRecord[]
  registeredAccounts: LocalRegisteredAnglerAccount[]
  updatedAt: string
  version: 1
}

export function resolveLocalAccountStorePath() {
  return process.env.RYBOLOV_LOCAL_ACCOUNT_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'account-state.json')
}

export function createSeedAccountState(updatedAt = new Date(0).toISOString()): LocalAccountState {
  return {
    credentialOverrides: [],
    deletions: [],
    passwordResets: [],
    registeredAccounts: [],
    updatedAt,
    version: 1,
  }
}

function isLocalAccountState(value: unknown): value is LocalAccountState {
  const candidate = value as Partial<LocalAccountState>

  return candidate.version === 1
    && typeof candidate.updatedAt === 'string'
    && Array.isArray(candidate.deletions)
}

export async function readLocalAccountState(
  filePath = resolveLocalAccountStorePath(),
): Promise<LocalAccountState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isLocalAccountState(parsed)) {
      return {
        ...parsed,
        credentialOverrides: Array.isArray(parsed.credentialOverrides)
          ? parsed.credentialOverrides.map((credential) => ({ ...credential }))
          : [],
        passwordResets: Array.isArray(parsed.passwordResets)
          ? parsed.passwordResets.map((reset) => ({ ...reset }))
          : [],
        registeredAccounts: Array.isArray(parsed.registeredAccounts)
          ? parsed.registeredAccounts.map((account) => ({ ...account }))
          : [],
      }
    }
  }
  catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException
    if (maybeNodeError.code !== 'ENOENT') {
      console.warn(`Nepodarilo sa načítať lokálny stav účtov: ${maybeNodeError.message}`)
    }
  }

  const seedState = createSeedAccountState()
  await writeLocalAccountState(seedState, filePath)
  return seedState
}

export async function writeLocalAccountState(
  state: Pick<LocalAccountState, 'credentialOverrides' | 'deletions' | 'passwordResets' | 'registeredAccounts'>,
  filePath = resolveLocalAccountStorePath(),
): Promise<LocalAccountState> {
  const nextState: LocalAccountState = {
    credentialOverrides: state.credentialOverrides.map((credential) => ({ ...credential })),
    deletions: state.deletions.map((record) => ({
      ...record,
      summary: { ...record.summary },
    })),
    passwordResets: state.passwordResets.map((reset) => ({ ...reset })),
    registeredAccounts: state.registeredAccounts.map((account) => ({ ...account })),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')
  return nextState
}

export async function isLocalAccountDeleted(accountId: string) {
  const state = await readLocalAccountState()
  return state.deletions.some((record) => record.accountId === accountId)
}

export async function findLocalRegisteredAccountByEmail(
  email: string,
  filePath = resolveLocalAccountStorePath(),
) {
  const normalizedEmail = email.trim().toLocaleLowerCase('sk')
  const state = await readLocalAccountState(filePath)
  return state.registeredAccounts.find((account) => account.email === normalizedEmail)
}

export async function findLocalRegisteredAccountById(
  accountId: string,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  return state.registeredAccounts.find((account) => account.id === accountId)
}

export async function findLocalCredentialOverride(
  accountId: string,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  return state.credentialOverrides.find((credential) => credential.accountId === accountId)
}

export async function addLocalRegisteredAccount(
  account: LocalRegisteredAnglerAccount,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  return writeLocalAccountState({
    credentialOverrides: state.credentialOverrides,
    deletions: state.deletions,
    passwordResets: state.passwordResets,
    registeredAccounts: [account, ...state.registeredAccounts],
  }, filePath)
}

export async function saveLocalPasswordReset(
  reset: LocalPasswordResetRecord,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  const now = Date.now()
  return writeLocalAccountState({
    credentialOverrides: state.credentialOverrides,
    deletions: state.deletions,
    passwordResets: [
      reset,
      ...state.passwordResets.filter((item) =>
        item.accountId !== reset.accountId && new Date(item.expiresAt).getTime() > now,
      ),
    ],
    registeredAccounts: state.registeredAccounts,
  }, filePath)
}

export async function hasRecentLocalPasswordReset(
  accountId: string,
  now = new Date(),
  cooldownMs = 60_000,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  return state.passwordResets.some((reset) =>
    reset.accountId === accountId
    && new Date(reset.expiresAt).getTime() > now.getTime()
    && now.getTime() - new Date(reset.createdAt).getTime() < cooldownMs,
  )
}

export async function discardLocalPasswordReset(
  resetId: string,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  return writeLocalAccountState({
    credentialOverrides: state.credentialOverrides,
    deletions: state.deletions,
    passwordResets: state.passwordResets.filter((reset) => reset.id !== resetId),
    registeredAccounts: state.registeredAccounts,
  }, filePath)
}

export async function completeLocalPasswordReset(
  tokenHash: string,
  passwordHash: string,
  now = new Date(),
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  const reset = state.passwordResets.find((item) =>
    item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > now.getTime(),
  )
  if (!reset) return undefined

  const account = state.registeredAccounts.find((item) => item.id === reset.accountId)
  const credentialOverrides = account
    ? state.credentialOverrides.filter((credential) => credential.accountId !== reset.accountId)
    : [
        {
          accountId: reset.accountId,
          passwordHash,
          updatedAt: now.toISOString(),
        },
        ...state.credentialOverrides.filter((credential) => credential.accountId !== reset.accountId),
      ]

  const nextState = await writeLocalAccountState({
    credentialOverrides,
    deletions: state.deletions,
    passwordResets: state.passwordResets.filter((item) => item.id !== reset.id),
    registeredAccounts: state.registeredAccounts.map((item) =>
      item.id === account.id ? { ...item, passwordHash } : item,
    ),
  }, filePath)

  return {
    accountId: reset.accountId,
    state: nextState,
  }
}

export async function updateLocalAccountPassword(
  accountId: string,
  passwordHash: string,
  now = new Date(),
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  const isRegisteredAccount = state.registeredAccounts.some((account) => account.id === accountId)

  return writeLocalAccountState({
    credentialOverrides: isRegisteredAccount
      ? state.credentialOverrides.filter((credential) => credential.accountId !== accountId)
      : [
          { accountId, passwordHash, updatedAt: now.toISOString() },
          ...state.credentialOverrides.filter((credential) => credential.accountId !== accountId),
        ],
    deletions: state.deletions,
    passwordResets: state.passwordResets.filter((reset) => reset.accountId !== accountId),
    registeredAccounts: state.registeredAccounts.map((account) =>
      account.id === accountId ? { ...account, passwordHash } : account,
    ),
  }, filePath)
}

export async function markLocalAccountDeleted(
  record: LocalAccountDeletionRecord,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  const deletions = [
    record,
    ...state.deletions.filter((item) => item.accountId !== record.accountId),
  ]

  return writeLocalAccountState({
    credentialOverrides: state.credentialOverrides.filter((credential) => credential.accountId !== record.accountId),
    deletions,
    passwordResets: state.passwordResets.filter((reset) => reset.accountId !== record.accountId),
    registeredAccounts: state.registeredAccounts.filter((account) => account.id !== record.accountId),
  }, filePath)
}
