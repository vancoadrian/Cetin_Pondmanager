self.addEventListener('push', (event) => {
  const fallback = {
    title: 'Rybolov Cetín',
    body: 'Nová správa z revíru.',
    url: '/',
  }

  const payload = event.data ? event.data.json() : fallback
  const expiresAt = payload.expiresAt ? Date.parse(payload.expiresAt) : Number.NaN
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return

  const title = payload.title || fallback.title

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || fallback.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: {
        url: payload.url || fallback.url,
      },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((item) => item.url.includes(targetUrl))
      if (client) return client.focus()
      return self.clients.openWindow(targetUrl)
    }),
  )
})
