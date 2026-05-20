export default defineNuxtRouteMiddleware((to) => {
  if (!to.path.startsWith('/admin')) return

  const { isLoggedIn, user } = useMockAuth()
  if (!isLoggedIn.value) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }

  if (!canAccessAdminPath(user.value?.role, to.path)) {
    const deniedModule = findAdminModuleByPath(to.path)

    return navigateTo({
      path: '/admin',
      query: {
        denied: deniedModule?.label ?? 'modul',
      },
    })
  }
})
