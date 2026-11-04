/* ============================================================
   sw.js — service worker: офлайн-кэш и обработка push/уведомлений
   ============================================================ */
const CACHE = 'ritm-v1.4.0';
const ASSETS = [
  './',
  './index.html',
  './widget.html',
  './manifest.json',
  './icon.svg',
  './css/styles.css',
  './css/widget.css',
  './css/chess.css',
  './css/training.css',
  './css/recipes.css',
  './css/music.css',
  './css/nutrition.css',
  './css/blackjack.css',
  './js/utils.js',
  './js/storage.js',
  './js/model.js',
  './js/stats.js',
  './js/charts.js',
  './js/notifications.js',
  './js/ui.js',
  './js/chess.js',
  './js/training.js',
  './js/recipes.js',
  './js/music.js',
  './js/nutrition.js',
  './js/blackjack.js',
  './js/modules.js',
  './js/app.js'
];

/* --- Установка: кэшируем оболочку --- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* --- Активация: удаляем старые версии --- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* --- Запросы: сеть в приоритете для API, кэш — для оболочки --- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;    // сторонние шрифты не кэшируем

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});

/* --- Клиентские уведомления через SW --- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'notify') {
    self.registration.showNotification(data.title || 'Ритм', {
      body: data.body || '',
      icon: './icon.svg',
      badge: './icon.svg',
      tag: data.tag || ('ritm-' + Date.now()),
      data: { habitId: data.habitId || null }
    });
  }
});

/* --- Web Push (требует серверной отправки) --- */
self.addEventListener('push', (event) => {
  let payload = { title: 'Ритм', body: 'Пора отметить привычку' };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icon.svg',
      badge: './icon.svg',
      data: payload.data || {}
    })
  );
});

/* --- Клик по уведомлению --- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'notification-click', data: event.notification.data || {} });
          return client.focus();
        }
      }
      return self.clients.openWindow('./index.html');
    })
  );
});
