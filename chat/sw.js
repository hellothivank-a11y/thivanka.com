const CACHE_NAME = 'oasis-cache-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png'
];

// Install Event - Pre-cache essential app shell assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event - Clean up old caches & claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Stale-while-revalidate for static assets, bypass API/WebSockets
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    const url = new URL(event.request.url);
    if (url.hostname.includes('supabase.co') || url.hostname.includes('peerjs') || url.protocol === 'wss:') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                return cachedResponse;
            });

            return cachedResponse || fetchPromise;
        })
    );
});

// Push Notification Event (Web Push API - Handles server-side triggers when app is closed)
self.addEventListener('push', (event) => {
    let payload = { 
        title: 'Oasis — New Message', 
        body: 'You received a private message ❤️', 
        icon: './icon-192.png' 
    };

    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body || 'You received a message in Oasis.',
        icon: payload.icon || './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200],
        tag: payload.tag || 'oasis-msg',
        renotify: true,
        data: {
            url: payload.url || self.registration.scope
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Oasis', options)
    );
});

// Client Message Listener (Triggered by app.js postMessage for instant client fallback)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, tag, icon } = event.data;
        const options = {
            body: body || 'New message received',
            icon: icon || './icon-192.png',
            badge: './icon-192.png',
            vibrate: [200, 100, 200],
            tag: tag || 'oasis-msg',
            renotify: true,
            data: { url: self.registration.scope }
        };
        event.waitUntil(
            self.registration.showNotification(title || 'Oasis', options)
        );
    }
});

// Notification Click Listener (Brings user back directly into Oasis when tapped)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
