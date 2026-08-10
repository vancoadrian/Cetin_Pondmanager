const BOTTOM_TAB_BAR_HIDDEN_PATH_PREFIXES = [
  '/admin',
  '/login',
  '/registracia',
  '/zabudnute-heslo',
  '/obnova-hesla',
]

export function isBottomTabBarRoute(path: string) {
  return !BOTTOM_TAB_BAR_HIDDEN_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}
