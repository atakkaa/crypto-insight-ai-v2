// public/sw.js — Service Worker for PWA + Push Notifications

const CACHE_NAME = "formasyon-ai-v1";

// ============================================
// 1. PUSH BİLDİRİMİ AL
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
// 2. BİLDİRİME TIKLAMA
// ============================================

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
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
// 3. SERVICE WORKER KURULUM
// ============================================

self.addEventListener("install", (event) => {
  console.log("✅ Service Worker kuruldu");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("✅ Service Worker aktif");
  event.waitUntil(clients.claim());
});

// ============================================
// 4. MESAJ DİNLEME (Test için)
// ============================================

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TEST_NOTIFICATION") {
    self.registration.showNotification("Test Bildirimi", {
      body: "Service Worker çalışıyor! 🎉",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
  }
});