// Push notifications sent by scripts/notify.mjs through Firebase Messaging, loaded by the app's service worker
// (vite.config.ts, workbox.importScripts). Data-only messages: { title, body, url, tag }.

self.addEventListener('push', (e) => {
  const m = e.data ? e.data.json() : {}
  const d = m.data || m
  if (!d.title) return
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: new URL('icon-192.png', self.registration.scope).href,
      tag: d.tag, // a newer one of the same kind replaces it
      data: { url: d.url || '' },
    }),
  )
})

// open the page it is about, in the app's window when there is one
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data.url, self.registration.scope).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const c = cs.find((x) => x.url.startsWith(self.registration.scope))
      if (!c) return self.clients.openWindow(url)
      return c
        .focus()
        .then(() => c.navigate(url))
        .catch(() => self.clients.openWindow(url))
    }),
  )
})
