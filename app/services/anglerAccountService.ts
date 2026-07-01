export const ANGLER_SESSION_COOKIE = 'rybolov_cetin_mock_angler_session'

export interface MockAnglerAccount {
  email: string
  emailAliases?: string[]
  id: string
  name: string
}

export const mockAnglerAccounts: MockAnglerAccount[] = [
  {
    email: 'marek.horvath@example.test',
    emailAliases: ['marek.h@example.com'],
    id: 'angler-marek',
    name: 'Marek H.',
  },
  {
    email: 'lenka.rybarova@example.test',
    id: 'angler-lenka',
    name: 'Lenka R.',
  },
]

export function findMockAnglerAccountById(accountId?: string | null) {
  return mockAnglerAccounts.find((account) => account.id === accountId)
}

export function getMockAnglerAccountEmails(account: MockAnglerAccount) {
  return [account.email, ...(account.emailAliases ?? [])]
    .map((email) => email.trim().toLocaleLowerCase('sk'))
    .filter(Boolean)
}

export function findMockAnglerAccountByEmail(email: string) {
  const normalizedEmail = email.trim().toLocaleLowerCase('sk')
  return mockAnglerAccounts.find((account) =>
    getMockAnglerAccountEmails(account).includes(normalizedEmail),
  )
}
