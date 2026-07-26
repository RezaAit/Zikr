// তাসবীহ — Service Worker v5 (OneSignal compatible)
const CACHE_VERSION = "tajbih-v5";
const CACHE_NAME = `tajbih-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  "/", "/index.html", "/style.css", "/script.js",
  "/data.js", "/i18n.js", "/prayer.js", "/manifest.json",
  "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/icon-maskable-192.png", "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png", "/icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith("tajbih-cache-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if(request.method !== "GET") return;
  if(request.url.includes("onesignal.com")) return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin){
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  if(request.mode === "navigate"){
    event.respondWith(
      fetch(request)
        .then((r) => {
          caches.open(CACHE_NAME).then((c) => c.put("/index.html", r.clone()));
          return r;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if(cached) return cached;
      return fetch(request).then((r) => {
        if(r && r.status === 200){
          caches.open(CACHE_NAME).then((c) => c.put(request, r.clone()));
        }
        return r;
      }).catch(() => cached);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for(const c of list){
        if(c.url.includes(self.location.origin) && "focus" in c) return c.focus();
      }
      return clients.openWindow("/");
    })
  );
});

self.addEventListener("push", (event) => {
  if(!event.data) return;
  try{
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
  }catch(e){
    event.waitUntil(
      self.registration.showNotification("তাসবীহ", {
        body:  event.data.text(),
        icon:  "/icons/icon-192.png",
      })
    );
  }
});
