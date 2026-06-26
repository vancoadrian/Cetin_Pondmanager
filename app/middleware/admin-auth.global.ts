export default defineNuxtRouteMiddleware((to) => {
  const { isLoggedIn, user } = useMockAuth()
  const protectedPath = to.path === '/konto'
    || to.path.startsWith('/konto/')
    || to.path === '/sutaze/tim'
    || to.path.startsWith('/sutaze/tim/')
    || to.path.startsWith('/admin')

  if (to.path === '/login' && isLoggedIn.value) {
    const redirect = isSafeAppRedirect(to.query.redirect)
      ? to.query.redirect
      : getAuthenticatedHome(user.value?.role)
    return navigateTo(redirect)
  }

  if (!protectedPath) return

  if (!isLoggedIn.value || !user.value) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }

  if (to.path === '/konto' && user.value.role !== 'angler') {
    return navigateTo(getAuthenticatedHome(user.value.role))
  }

  if (to.path.startsWith('/sutaze/tim') && user.value.role !== 'team') {
    return navigateTo(getAuthenticatedHome(user.value.role))
  }

  if (!to.path.startsWith('/admin')) return

  if (user.value.role === 'angler' || user.value.role === 'team') {
    return navigateTo(getAuthenticatedHome(user.value.role))
  }

  if (!canAccessAdminPath(user.value?.role, to.path)) {
    const deniedModule = findAdminModuleByPath(to.path)
    const home = getAuthenticatedHome(user.value.role)

    return navigateTo({
      path: home === to.path ? '/' : home,
      query: {
        denied: deniedModule?.label ?? 'modul',
      },
    })
  }
})
