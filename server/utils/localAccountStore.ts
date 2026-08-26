import { join } from 'node:path'
import type { AccountDeletionSummary } from '~/services/accountDeletionService'
import {
  guardCorruptRuntimeState,
  mutateRuntimeDocument,
  readRuntimeDocument,
  writeRuntimeDocument,
} from './runtimeStateStore'

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

export interface LocalAccountProfileOverride {
  accountId: string
  name: string
  phone?: string
  previousNames: string[]
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
  profileOverrides: LocalAccountProfileOverride[]
  registeredAccounts: LocalRegisteredAnglerAccount[]
  updatedAt: string
  version: 1
}

type WritableAccountState = Pick<
  LocalAccountState,
  'credentialOverrides' | 'deletions' | 'passwordResets' | 'profileOverrides' | 'registeredAccounts'
>

const STORE_KEY = 'account-state'

export function resolveLocalAccountStorePath() {
  return process.env.RYBOLOV_LOCAL_ACCOUNT_STORE
    ?? join(process.cwd(), '.data', 'rybolov-cetin', 'account-state.json')
}

export function createSeedAccountState(updatedAt = new Date(0).toISOString()): LocalAccountState {
  return {
    credentialOverrides: [],
    deletions: [],
    passwordResets: [],
    profileOverrides: [],
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

function parseLocalAccountState(payload: unknown): LocalAccountState | undefined {
  if (!isLocalAccountState(payload)) return undefined

  return {
    ...payload,
    credentialOverrides: Array.isArray(payload.credentialOverrides)
      ? payload.credentialOverrides.map((credential) => ({ ...credential }))
      : [],
    passwordResets: Array.isArray(payload.passwordResets)
      ? payload.passwordResets.map((reset) => ({ ...reset }))
      : [],
    profileOverrides: Array.isArray(payload.profileOverrides)
      ? payload.profileOverrides.map((profile) => ({
          ...profile,
          previousNames: Array.isArray(profile.previousNames) ? [...profile.previousNames] : [],
        }))
      : [],
    registeredAccounts: Array.isArray(payload.registeredAccounts)
      ? payload.registeredAccounts.map((account) => ({ ...account }))
      : [],
  }
}

function composeAccountState(state: WritableAccountState): LocalAccountState {
  return {
    credentialOverrides: state.credentialOverrides.map((credential) => ({ ...credential })),
    deletions: state.deletions.map((record) => ({
      ...record,
      summary: { ...record.summary },
    })),
    passwordResets: state.passwordResets.map((reset) => ({ ...reset })),
    profileOverrides: state.profileOverrides.map((profile) => ({
      ...profile,
      previousNames: [...profile.previousNames],
    })),
    registeredAccounts: state.registeredAccounts.map((account) => ({ ...account })),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
}

export async function readLocalAccountState(
  filePath = resolveLocalAccountStorePath(),
): Promise<LocalAccountState> {
  const document = await readRuntimeDocument(STORE_KEY, filePath)

  if (document.found) {
    const parsed = parseLocalAccountState(document.payload)
    if (parsed) return parsed
    guardCorruptRuntimeState(STORE_KEY)
  }

  const seedState = createSeedAccountState()
  await writeLocalAccountState(seedState, filePath)

  return seedState
}

export async function writeLocalAccountState(
  state: WritableAccountState,
  filePath = resolveLocalAccountStorePath(),
): Promise<LocalAccountState> {
  const nextState = composeAccountState(state)
  await writeRuntimeDocument(STORE_KEY, filePath, nextState)

  return nextState
}

/**
 * Shared read-modify-write helper. `mutator` may return no next state to
 * skip the write; the default result is the stamped state that was stored,
 * and `finish` derives a custom result from it.
 */
async function mutateLocalAccountState<T = LocalAccountState>(
  filePath: string,
  mutator: (state: LocalAccountState) => {
    finish?: (composed: LocalAccountState) => T
    next?: WritableAccountState
    result?: T
  },
): Promise<T> {
  return mutateRuntimeDocument(STORE_KEY, filePath, async (document) => {
    let currentState: LocalAccountState | undefined
    if (document.found) {
      currentState = parseLocalAccountState(document.payload)
      if (!currentState) guardCorruptRuntimeState(STORE_KEY)
    }
    currentState ??= createSeedAccountState()

    const outcome = mutator(currentState)
    if (!outcome.next) return { result: outcome.result as T }

    const composed = composeAccountState(outcome.next)

    return {
      payload: composed,
      result: (outcome.finish ? outcome.finish(composed) : composed) as T,
    }
  })
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

export async function findLocalAccountProfileOverride(
  accountId: string,
  filePath = resolveLocalAccountStorePath(),
) {
  const state = await readLocalAccountState(filePath)
  return state.profileOverrides.find((profile) => profile.accountId === accountId)
}

export async function addLocalRegisteredAccount(
  account: LocalRegisteredAnglerAccount,
  filePath = resolveLocalAccountStorePath(),
) {
  return mutateLocalAccountState(filePath, (state) => {
    const next: WritableAccountState = {
      credentialOverrides: state.credentialOverrides,
      deletions: state.deletions,
      passwordResets: state.passwordResets,
      profileOverrides: state.profileOverrides,
      registeredAccounts: [account, ...state.registeredAccounts],
    }

    return { next }
  })
}

export async function saveLocalPasswordReset(
  reset: LocalPasswordResetRecord,
  filePath = resolveLocalAccountStorePath(),
) {
  return mutateLocalAccountState(filePath, (state) => {
    const now = Date.now()
    const next: WritableAccountState = {
      credentialOverrides: state.credentialOverrides,
      deletions: state.deletions,
      passwordResets: [
        reset,
        ...state.passwordResets.filter((item) =>
          item.accountId !== reset.accountId && new Date(item.expiresAt).getTime() > now,
        ),
      ],
      profileOverrides: state.profileOverrides,
      registeredAccounts: state.registeredAccounts,
    }

    return { next }
  })
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
  return mutateLocalAccountState(filePath, (state) => {
    const next: WritableAccountState = {
      credentialOverrides: state.credentialOverrides,
      deletions: state.deletions,
      passwordResets: state.passwordResets.filter((reset) => reset.id !== resetId),
      profileOverrides: state.profileOverrides,
      registeredAccounts: state.registeredAccounts,
    }

    return { next }
  })
}

export async function completeLocalPasswordReset(
  tokenHash: string,
  passwordHash: string,
  now = new Date(),
  filePath = resolveLocalAccountStorePath(),
) {
  return mutateLocalAccountState<{ accountId: string, state: LocalAccountState } | undefined>(
    filePath,
    (state) => {
      const reset = state.passwordResets.find((item) =>
        item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > now.getTime(),
      )
      if (!reset) return { result: undefined }

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

      const next: WritableAccountState = {
        credentialOverrides,
        deletions: state.deletions,
        passwordResets: state.passwordResets.filter((item) => item.id !== reset.id),
        profileOverrides: state.profileOverrides,
        registeredAccounts: state.registeredAccounts.map((item) =>
          item.id === reset.accountId ? { ...item, passwordHash } : item,
        ),
      }
      return {
        finish: (composed) => ({
          accountId: reset.accountId,
          state: composed,
        }),
        next,
      }
    },
  )
}

export async function updateLocalAccountPassword(
  accountId: string,
  passwordHash: string,
  now = new Date(),
  filePath = resolveLocalAccountStorePath(),
) {
  return mutateLocalAccountState(filePath, (state) => {
    const isRegisteredAccount = state.registeredAccounts.some((account) => account.id === accountId)
    const next: WritableAccountState = {
      credentialOverrides: isRegisteredAccount
        ? state.credentialOverrides.filter((credential) => credential.accountId !== accountId)
        : [
            { accountId, passwordHash, updatedAt: now.toISOString() },
            ...state.credentialOverrides.filter((credential) => credential.accountId !== accountId),
          ],
      deletions: state.deletions,
      passwordResets: state.passwordResets.filter((reset) => reset.accountId !== accountId),
      profileOverrides: state.profileOverrides,
      registeredAccounts: state.registeredAccounts.map((account) =>
        account.id === accountId ? { ...account, passwordHash } : account,
      ),
    }

    return { next }
  })
}

export async function updateLocalAccountProfile(
  accountId: string,
  currentName: string,
  profile: { name: string, phone?: string },
  now = new Date(),
  filePath = resolveLocalAccountStorePath(),
) {
  return mutateLocalAccountState(filePath, (state) => {
    const existing = state.profileOverrides.find((item) => item.accountId === accountId)
    const previousNames = [
      ...(existing?.previousNames ?? []),
      ...(currentName !== profile.name ? [currentName] : []),
    ]
      .map((name) => name.trim())
      .filter((name, index, names) => Boolean(name) && name !== profile.name && names.indexOf(name) === index)

    const next: WritableAccountState = {
      credentialOverrides: state.credentialOverrides,
      deletions: state.deletions,
      passwordResets: state.passwordResets,
      profileOverrides: [
        {
          accountId,
          name: profile.name,
          phone: profile.phone,
          previousNames,
          updatedAt: now.toISOString(),
        },
        ...state.profileOverrides.filter((item) => item.accountId !== accountId),
      ],
      registeredAccounts: state.registeredAccounts,
    }

    return { next }
  })
}

export async function markLocalAccountDeleted(
  record: LocalAccountDeletionRecord,
  filePath = resolveLocalAccountStorePath(),
) {
  return mutateLocalAccountState(filePath, (state) => {
    const deletions = [
      record,
      ...state.deletions.filter((item) => item.accountId !== record.accountId),
    ]
    const next: WritableAccountState = {
      credentialOverrides: state.credentialOverrides.filter((credential) => credential.accountId !== record.accountId),
      deletions,
      passwordResets: state.passwordResets.filter((reset) => reset.accountId !== record.accountId),
      profileOverrides: state.profileOverrides.filter((profile) => profile.accountId !== record.accountId),
      registeredAccounts: state.registeredAccounts.filter((account) => account.id !== record.accountId),
    }

    return { next }
  })
}
