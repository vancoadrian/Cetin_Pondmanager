import { findMockAnglerAccountById, mockAnglerAccounts } from '~/services/anglerAccountService'

export function useMockAnglerAuth() {
  const { logout: logoutUser, user } = useMockAuth()
  const account = computed(() =>
    findMockAnglerAccountById(user.value?.role === 'angler' ? user.value.id : null) ?? null,
  )
  const isLoggedIn = computed(() => account.value !== null)

  function logout() {
    logoutUser()
  }

  return {
    account,
    isLoggedIn,
    logout,
    mockAnglerAccounts,
  }
}
