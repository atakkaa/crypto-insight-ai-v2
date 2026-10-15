// public/sw.js — Service Worker for PWA + Push Notifications + Offline Cache

const CACHE_NAME = "formasyon-ai-v2";
const RUNTIME_CACHE = "formasyon-ai-runtime";

const PRECACHE_URLS = [
  "/",
  "/favicon.ico",
  "/manifest.json",
];

// ============================================
// 1. INSTALL — Precache
// ============================================

self.addEventListener("install", (event) => {
  console.log("✅ Service Worker kuruluyor...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn("Precache hatası (kritik değil):", err);
        });
      })
      .then(() => self.skipWaiting()),
  );
});

// ============================================
// 2. ACTIVATE — Eski cache'leri temizle
// ============================================

self.addEventListener("activate", (event) => {
  console.log("✅ Service Worker aktif");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
            .map((name) => {
              console.log("🗑️ Eski cache siliniyor:", name);
              return caches.delete(name);
            }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// ============================================
// 3. FETCH — Cache stratejisi
// ============================================

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (url.pathname.startsWith("/api/")) return;

  if (url.hostname.includes("supabase")) return;

  if (
    url.hostname.includes("binance") ||
    url.hostname.includes("yahoo")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          if (request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }

          return new Response("Offline", {
            status: 503,
            statusText: "Offline",
          });
        });
      }),
  );
});

// ============================================
// 4. PUSH BİLDİRİMİ AL
// ============================================

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Formasyon AI", body: event.data.text() };
  }

  const title = payload.title || "Formasyon AI";
  const options = {
    body: payload.body || "Yeni bir bildirim var",
    tag: payload.tag || "default",
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: payload.priority === true,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ============================================
// 5. BİLDİRİME TIKLAMA
// ============================================

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus().then(() => client.navigate(urlToOpen));
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});

// ============================================
// 6. MESAJ DİNLEME (Test için)
// ============================================

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TEST_NOTIFICATION") {
    self.registration.showNotification("Test Bildirimi", {
      body: "Service Worker çalışıyor! 🎉",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
  }

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});