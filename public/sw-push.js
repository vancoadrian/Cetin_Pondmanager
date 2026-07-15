const fallbackPayload = {
  title: 'Rybolov Cetín',
  body: 'Nová správa z revíru.',
  url: '/',
}

const obsoleteRuntimeCaches = new Set([
  'rybolov-pages-v1',
  'rybolov-public-api',
  'rybolov-public-api-v2',
])

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => obsoleteRuntimeCaches.has(cacheName))
        .map((cacheName) => caches.delete(cacheName)),
    )),
  )
})

function normalizeNotificationUrl(value) {
  if (typeof value !== 'string') return fallbackPayload.url

  try {
    const url = new URL(value, self.location.origin)
    if (url.origin !== self.location.origin) return fallbackPayload.url

    return `${url.pathname}${url.search}${url.hash}`
  }
  catch {
    return fallbackPayload.url
  }
}

function readPushPayload(data) {
  if (!data) return fallbackPayload

  try {
    const payload = data.json()
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallbackPayload

    return {
      body: typeof payload.body === 'string' ? payload.body : fallbackPayload.body,
      expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined,
      title: typeof payload.title === 'string' ? payload.title : fallbackPayload.title,
      url: normalizeNotificationUrl(payload.url),
    }
  }
  catch {
    return fallbackPayload
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event.data)
  const expiresAt = payload.expiresAt ? Date.parse(payload.expiresAt) : Number.NaN
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      data: {
        url: payload.url,
      },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetPath = normalizeNotificationUrl(event.notification.data?.url)
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const exactClient = clients.find((client) => client.url === targetUrl)
      if (exactClient) return exactClient.focus()

      const appClient = clients.find((client) => new URL(client.url).origin === self.location.origin)
      if (appClient) {
        return appClient.navigate(targetUrl)
          .then((client) => client ? client.focus() : self.clients.openWindow(targetUrl))
          .catch(() => self.clients.openWindow(targetUrl))
      }

      return self.clients.openWindow(targetUrl)
    }),
  )
})
