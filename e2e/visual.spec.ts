import { expect, test } from '@playwright/test'

/**
 * Vizuálne regresné snapshoty stabilných verejných stránok. Zámerne tu nie sú
 * stránky s dátumovou variabilitou (domov, mapa, rezervácie, notifikácie) —
 * ich obsah sa mení s aktuálnym dňom a snapshoty by časom hnili. Baseline PNG
 * vznikajú v CI (linux) — pri zmene vzhľadu stiahni artifact `playwright-results`
 * a aktualizuj snapshoty z priečinka `-actual` súborov, alebo spusti
 * `--update-snapshots` v linux prostredí.
 */

const STABLE_PAGES = [
  { name: 'login', path: '/login' },
  { name: 'registracia', path: '/registracia' },
  { name: 'kontakt', path: '/kontakt' },
  { name: 'info', path: '/info' },
  { name: 'reviry', path: '/reviry' },
  { name: 'sponzori', path: '/sponzori' },
]

test.beforeEach(async ({ page }) => {
  // PWA výzva na inštaláciu by prekryla obsah — označ ju ako nedávno zavretú
  await page.addInitScript(() => {
    window.localStorage.setItem('rybolov-cetin-install-dismissed-at', String(Date.now()))
  })
})

for (const { name, path } of STABLE_PAGES) {
  test(`vizuálny snapshot: ${name}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    })
  })
}
