self.addEventListener('push', event => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Gym Tracker', {
      body: data.body || 'Your analysis report is ready.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'analysis',
      data: data.url || '/',
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data || '/dashboard'))
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
