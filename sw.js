// তাসবীহ — Service Worker v5 (Offline + OneSignal)
const CACHE_VERSION = "tajbih-v5";
const CACHE_NAME = `tajbih-cache-${CACHE_VERSION}`;
const FONT_CACHE = "tajbih-fonts-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/data.js",
  "/i18n.js",
  "/prayer.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png"
];

// Install — cache all app shell files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("tajbih-cache-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — offline-first for app, stale-while-revalidate for fonts
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Skip OneSignal requests entirely
  if (request.url.includes("onesignal.com")) return;

  const url = new URL(request.url);

  // Google Fonts — cache-first with font cache
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Same-origin — app shell files
  if (url.origin === self.location.origin) {

    // Navigation (HTML page)
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/index.html", copy));
            return response;
          })
          .catch(() => caches.match("/index.html"))
      );
      return;
    }

    // JS / CSS / images — cache-first, update in background
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(request, response.clone()));
          }
          return response;
        }).catch(() => cached || new Response("Offline", { status: 503 }));

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cross-origin (other CDNs) — network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// Push from OneSignal backend
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const d = event.data.json();
    event.waitUntil(
      self.registration.showNotification(d.title || "তাসবীহ", {
        body:     d.body || d.alert || "",
        icon:     "/icons/icon-192.png",
        badge:    "/icons/icon-192.png",
        tag:      d.tag || "prayer",
        renotify: true,
        vibrate:  [200, 100, 200],
        data:     { url: d.url || "/" }
      })
    );
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification("তাসবীহ", {
        body: event.data.text(),
        icon: "/icons/icon-192.png"
      })
    );
  }
});
// Handle skip waiting message from client
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
