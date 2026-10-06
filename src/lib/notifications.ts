import { supabase } from "@/integrations/supabase/client";

// =====================================================
// TİPLER
// =====================================================

export type NotificationSeverity = "kritik" | "önemli" | "dikkat";

export type Notification = {
  id: string;
  user_id: string | null;
  market: string;
  symbol: string;
  type: string;
  priority: boolean;
  severity: NotificationSeverity;
  title: string;
  message: string;
  reason: string | null;
  event_key: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
  // === AI + Signal Score ALANLARI ===
  signal_score?: number | null;
  signal_breakdown?: Record<string, number> | null;
  ai_summary?: string | null;
  ai_impact?: string | null;
  ai_action?: string | null;
  ai_sentiment?: string | null;
  ai_confidence?: number | null;
  ai_source?: string | null;
  ai_generated_at?: string | null;
  // === YENİ: GİRİŞ/HEDEF/STOP/RR/S/R ===
  ai_entry_zone?: string | null;
  ai_target?: string | null;
  ai_stop_loss?: string | null;
  ai_risk_reward?: string | null;
  ai_support?: string | null;
  ai_resistance?: string | null;
    fear_greed?: number | null;
  // === DİĞER ===
  is_global?: boolean | null;
  notification_type?: string | null;
  confidence?: number | null;
  news_items?: unknown[] | null;
  premium_only?: boolean | null;
};

// =====================================================
// SUPABASE'DEN BİLDİRİM ÇEK
// =====================================================

export async function fetchNotifications(
  userId: string,
  limit = 100,
): Promise<Notification[]> {
  const { data, error } = await (supabase as any)
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Bildirimler çekilemedi:", error);
    return [];
  }

  return (data ?? []) as Notification[];
}

// =====================================================
// BİLDİRİMİ OKUNDU İŞARETLE
// =====================================================

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) {
    console.error("Bildirim okundu işaretlenemedi:", error);
    return false;
  }
  return true;
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) {
    console.error("Bildirimler okundu işaretlenemedi:", error);
    return false;
  }
  return true;
}

// =====================================================
// BİLDİRİM SİL
// =====================================================

export async function deleteNotification(notificationId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("notifications")
    .delete()
    .eq("id", notificationId);

  if (error) {
    console.error("Bildirim silinemedi:", error);
    return false;
  }
  return true;
}

export async function clearAllNotifications(userId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("notifications")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Bildirimler silinemedi:", error);
    return false;
  }
  return true;
}

// =====================================================
// REALTIME ABONELİK
// =====================================================

export function subscribeToNotifications(
  userId: string,
  onNewNotification: (notification: Notification) => void,
): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newNotification = payload.new as Notification;
        onNewNotification(newNotification);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("🔔 Bildirim kanalı açıldı:", userId);
      } else if (status === "CHANNEL_ERROR") {
        console.error("❌ Bildirim kanalı hatası");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

// =====================================================
// YARDIMCI FONKSİYONLAR
// =====================================================

export function formatNotificationTitle(notification: Notification): string {
  if (notification.priority) {
    return `⭐ ÖNCELİKLİ | ${notification.title}`;
  }
  return notification.title;
}

export function severityEmoji(severity: NotificationSeverity): string {
  switch (severity) {
    case "kritik":
      return "🔴";
    case "önemli":
      return "🟠";
    case "dikkat":
      return "🟡";
    default:
      return "⚪";
  }
}

export function severityColorClass(severity: NotificationSeverity): string {
  switch (severity) {
    case "kritik":
      return "bg-bear/15 text-bear";
    case "önemli":
      return "bg-warn/15 text-warn";
    case "dikkat":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}
// =====================================================
// KISA VADELİ BİLDİRİMLER (short_term_notifications)
// =====================================================

export type ShortTermNotification = {
  id: string;
  user_id: string;
  market: string;
  symbol: string;
  pattern_name: string;
  pattern_bias: string; // "yükseliş" | "düşüş"
  confidence: number;
  signal_score: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  reason: string | null;
  fear_greed: number | null;
  created_at: string;
  read: boolean;
};

export async function fetchShortTermNotifications(
  userId: string,
  limit = 100,
): Promise<ShortTermNotification[]> {
  const { data, error } = await (supabase as any)
    .from("short_term_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Kısa vadeli bildirimler çekilemedi:", error);
    return [];
  }

  return (data ?? []) as ShortTermNotification[];
}

export async function markShortTermNotificationRead(
  notificationId: string,
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("short_term_notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) {
    console.error("Kısa vadeli bildirim okundu işaretlenemedi:", error);
    return false;
  }
  return true;
}

export async function markAllShortTermNotificationsRead(
  userId: string,
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("short_term_notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);

  if (error) {
    console.error("Kısa vadeli bildirimler okundu işaretlenemedi:", error);
    return false;
  }
  return true;
}

export async function clearAllShortTermNotifications(
  userId: string,
): Promise<boolean> {
  const { error } = await (supabase as any)
    .from("short_term_notifications")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("Kısa vadeli bildirimler silinemedi:", error);
    return false;
  }
  return true;
}

export function subscribeToShortTermNotifications(
  userId: string,
  onNewNotification: (notification: ShortTermNotification) => void,
): () => void {
  const channel = supabase
    .channel(`short_term_notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "short_term_notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newNotification = payload.new as ShortTermNotification;
        onNewNotification(newNotification);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("🔔 Kısa vadeli bildirim kanalı açıldı:", userId);
      } else if (status === "CHANNEL_ERROR") {
        console.error("❌ Kısa vadeli bildirim kanalı hatası");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}