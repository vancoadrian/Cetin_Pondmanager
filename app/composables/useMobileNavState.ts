/**
 * Shared open/closed state for the mobile "more" menu (AppHeader's
 * USlideover), so BottomTabBar's "Viac" tab can open the same menu instead
 * of duplicating its destinations.
 */
export function useMobileNavState() {
  return useState('rybolov-mobile-nav-open', () => false)
}
