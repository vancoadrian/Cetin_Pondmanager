const normalizeSiteUrl = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`

  return withProtocol.replace(/\/$/, '')
}

const appName = 'Rybolov Cetín'
const venueName = 'Veľký Cetín & Kocka'
const fullTitle = `${appName} · ${venueName}`
const configuredSiteUrl = normalizeSiteUrl(process.env.NUXT_PUBLIC_SITE_URL)

if (process.env.RYBOLOV_ENVIRONMENT === 'production' && !configuredSiteUrl) {
  throw new Error('NUXT_PUBLIC_SITE_URL is required when RYBOLOV_ENVIRONMENT=production.')
}

const siteUrl = configuredSiteUrl || 'http://localhost:3000'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  future: {
    compatibilityVersion: 4,
    typescriptBundlerResolution: true,
  },

  devtools: { enabled: import.meta.dev },

  modules: ['@nuxt/eslint', '@nuxt/ui', '@vueuse/nuxt', '@vite-pwa/nuxt'],

  ui: {
    fonts: false,
  },

  nitro: {
    compressPublicAssets: true,
  },

  routeRules: {
    '/offline-fallback': {
      redirect: {
        statusCode: 302,
        to: '/offline-fallback.html',
      },
    },
  },

  css: ['~/assets/css/main.css'],

  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      htmlAttrs: { lang: 'sk' },
      title: fullTitle,
      titleTemplate: `%s · ${appName}`,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'PWA pre rybársky revír Veľký Cetín a Štrkovisko Kocka: rezervácie, obsadenosť, úlovky, súťaže a výstrahy.',
        },
        { name: 'theme-color', content: '#0f4c4a' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: appName },
        { name: 'application-name', content: fullTitle },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  runtimeConfig: {
    supabaseDbUrl: process.env.SUPABASE_DB_URL || '',
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    public: {
      siteUrl,
      appName,
      venueName,
      reservationsPhone: process.env.NUXT_PUBLIC_REZERVACIE_PHONE || '+421 911 298 702',
      supabasePublishableKey: process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY
        || '',
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: fullTitle,
      short_name: appName,
      description: 'PWA pre rezervácie, obsadenosť, úlovky a výstrahy pri vode.',
      theme_color: '#0f4c4a',
      background_color: '#f6faf8',
      display: 'standalone',
      id: '/',
      lang: 'sk',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      navigateFallback: null,
      globPatterns: [
        'offline-fallback.html',
        'favicon.svg',
        'logo.svg',
        'icons/*.{png,svg}',
        '_nuxt/*.css',
      ],
      importScripts: ['/sw-push.js'],
      runtimeCaching: [
        {
          handler: 'NetworkOnly',
          options: {
            precacheFallback: {
              fallbackURL: '/offline-fallback',
            },
          },
          urlPattern: ({ request }) => request.mode === 'navigate',
        },
        {
          handler: 'NetworkFirst',
          options: {
            cacheName: 'rybolov-low-risk-public-api-v3',
            expiration: {
              maxAgeSeconds: 15 * 60,
              maxEntries: 40,
            },
            networkTimeoutSeconds: 4,
          },
          urlPattern: /\/api\/(?:map|catches|payment-methods|rental-catalog|cabin-products|fish-registry\/rules|sponsors)(?:\/|\?|$)/,
        },
        {
          handler: 'CacheFirst',
          options: {
            cacheName: 'rybolov-nuxt-assets',
            expiration: {
              maxAgeSeconds: 30 * 24 * 60 * 60,
              maxEntries: 120,
            },
          },
          urlPattern: /\/_nuxt\/.*\.(?:js|css)$/i,
        },
        {
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'rybolov-source-images',
            expiration: {
              maxAgeSeconds: 7 * 24 * 60 * 60,
              maxEntries: 40,
            },
          },
          urlPattern: /\/images\/.*\.(?:avif|png|jpg|jpeg|webp|svg)$/i,
        },
      ],
    },
    devOptions: {
      enabled: process.env.NUXT_PWA_DEV === 'true',
      type: 'module',
      suppressWarnings: true,
    },
    client: {
      installPrompt: false,
    },
  },

  colorMode: {
    preference: 'light',
    fallback: 'light',
    classSuffix: '',
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },
})
