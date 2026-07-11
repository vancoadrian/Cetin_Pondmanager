import { findMockAnglerAccountById, mockAnglerAccounts } from '~/services/anglerAccountService'

export function useMockAnglerAuth() {
  const { logout: logoutUser, user } = useMockAuth()
  const account = computed(() => {
    if (user.value?.role !== 'angler') return null

    return findMockAnglerAccountById(user.value.id) ?? {
      email: user.value.email,
      id: user.value.id,
      name: user.value.name,
    }
  })
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
