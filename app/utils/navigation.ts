export interface AppNavItem {
  label: string
  to: string
  icon: string
}

export const HOME_NAV_ITEM: AppNavItem = { icon: 'i-heroicons-home', label: 'Domov', to: '/' }

export const PRIMARY_NAV_ITEMS: AppNavItem[] = [
  { icon: 'i-heroicons-map', label: 'Revíry', to: '/reviry' },
  { icon: 'i-heroicons-map-pin', label: 'Mapa', to: '/mapa' },
  { icon: 'i-heroicons-calendar-days', label: 'Rezervácie', to: '/rezervacie' },
  { icon: 'i-heroicons-camera', label: 'Úlovky', to: '/ulovky' },
  { icon: 'i-heroicons-trophy', label: 'Súťaže', to: '/sutaze' },
  { icon: 'i-heroicons-information-circle', label: 'Pravidlá', to: '/info' },
]

export const SECONDARY_NAV_ITEMS: AppNavItem[] = [
  { icon: 'i-heroicons-building-storefront', label: 'Sponzori', to: '/sponzori' },
]

export const UTILITY_NAV_ITEMS: AppNavItem[] = [
  { icon: 'i-heroicons-bell-alert', label: 'Výstrahy a oznamy', to: '/notifikacie' },
  { icon: 'i-heroicons-phone', label: 'Kontakt', to: '/kontakt' },
]

const BOTTOM_TAB_PATHS = ['/mapa', '/rezervacie', '/ulovky']

export const BOTTOM_TAB_ITEMS: AppNavItem[] = [
  HOME_NAV_ITEM,
  ...PRIMARY_NAV_ITEMS.filter((item) => BOTTOM_TAB_PATHS.includes(item.to)),
]

export const MOBILE_MENU_NAV_ITEMS: AppNavItem[] = [
  HOME_NAV_ITEM,
  ...PRIMARY_NAV_ITEMS,
  ...SECONDARY_NAV_ITEMS,
  ...UTILITY_NAV_ITEMS,
]

export function isActiveNavPath(currentPath: string, to: string) {
  if (to === '/') return currentPath === '/'
  return currentPath.startsWith(to)
}

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
