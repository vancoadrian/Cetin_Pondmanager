import { findMockAnglerAccountById, mockAnglerAccounts } from '~/services/anglerAccountService'

export function useMockAnglerAuth() {
  const { logout: logoutUser, user } = useMockAuth()
  const account = computed(() => {
    if (user.value?.role !== 'angler') return null

    const seedAccount = findMockAnglerAccountById(user.value.id)
    return {
      ...seedAccount,
      email: user.value.email,
      id: user.value.id,
      name: user.value.name,
      phone: user.value.phone,
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
