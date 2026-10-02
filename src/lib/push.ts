// src/lib/push.ts — Push Notification Utilities

import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = (import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string) || "";

// ============================================
// 1. VAPID PUBLIC KEY'İ BASE64'TEN UINT8ARRAY'E ÇEVİR
// ============================================

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ============================================
// 2. PUSH ABONELİĞİ OLUŞTUR
// ============================================

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push bildirimleri desteklenmiyor");
    return false;
  }

  if (!VAPID_PUBLIC_KEY) {
    console.error("VAPID_PUBLIC_KEY eksik");
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const subscriptionJson = subscription.toJSON();
    const keys = subscriptionJson.keys as
      | { p256dh?: string; auth?: string }
      | undefined;

    const { error } = await (supabase as any)
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: subscriptionJson.endpoint || "",
          p256dh: keys?.p256dh || "",
          auth: keys?.auth || "",
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        },
        { onConflict: "user_id,endpoint" },
      );

    if (error) {
      console.error("Push aboneliği kaydedilemedi:", error);
      return false;
    }

    console.log("✅ Push aboneliği kaydedildi");
    return true;
  } catch (error) {
    console.error("Push abonelik hatası:", error);
    return false;
  }
}

// ============================================
// 3. PUSH İZNİ İSTE
// ============================================

export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (!("Notification" in window)) {
    console.warn("Notification API desteklenmiyor");
    return false;
  }

  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}