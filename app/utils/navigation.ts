const BOTTOM_TAB_BAR_HIDDEN_PATH_PREFIXES = [
  '/admin',
  '/login',
  '/registracia',
  '/zabudnute-heslo',
  '/obnova-hesla',
]

const PWA_INSTALL_PROMPT_HIDDEN_PATH_PREFIXES = [
  '/login',
  '/registracia',
  '/zabudnute-heslo',
  '/obnova-hesla',
]

export function isBottomTabBarRoute(path: string) {
  return !BOTTOM_TAB_BAR_HIDDEN_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export function isPwaInstallPromptRoute(path: string) {
  return !PWA_INSTALL_PROMPT_HIDDEN_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}
