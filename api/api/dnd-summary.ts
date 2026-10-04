// api/dnd-summary.ts — DND birikmiş bildirimler için sabah özeti

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = {
  method?: string;
  query?: Record<string, any>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Content-Type", "application/json");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return response.status(500).json({ success: false, error: "Supabase env yok" });
  }

  try {
    // 1. Birikmiş bildirimleri çek (delivered = false)
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?delivered=eq.false&created_at=gt.${since}&select=user_id,symbol,market,signal_score,ai_action,ai_summary,severity,priority,is_global,created_at&order=signal_score.desc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!res.ok) {
      return response.status(500).json({ success: false, error: "Fetch hatası" });
    }

    const notifications = (await res.json()) as Array<{
      user_id: string;
      symbol: string;
      market: string;
      signal_score: number;
      ai_action: string;
      ai_summary: string;
      severity: string;
      priority: boolean;
      is_global: boolean;
      created_at: string;
    }>;

    // 2. Kullanıcıya göre grupla
    const grouped: Record<string, typeof notifications> = {};
    for (const n of notifications) {
      if (!grouped[n.user_id]) grouped[n.user_id] = [];
      grouped[n.user_id]!.push(n);
    }

    let summarySent = 0;

    // 3. Her kullanıcı için özet gönder
    for (const [userId, items] of Object.entries(grouped)) {
      const count = items.length;
      if (count === 0) continue;

      // En önemli 5 tanesi
      const top5 = items.slice(0, 5);
      const lines = top5.map((n) => {
        const emoji = n.is_global ? "🌍" : n.priority ? "⭐" : "📢";
        const actionEmoji = n.ai_action === "AL" ? "🟢" : n.ai_action === "SAT" ? "🔴" : "🟡";
        const cleanSymbol = n.symbol.replace("USDT", "").replace(/\.(IS|US)$/, "");
        return `${emoji} ${cleanSymbol} → ${actionEmoji} ${n.ai_action} (skor: ${n.signal_score})`;
      }).join("\n");

      const title = `🔔 GECE ÖZETİ (${count} gelişme)`;
      const message = `Gece boyunca ${count} önemli gelişme oldu.\n\nEn önemliler:\n${lines}\n\nTamamı için uygulamayı aç.`;

      // Bildirim gönder
      await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_id: userId,
          market: "system",
          symbol: "SUMMARY",
          type: "summary",
          notification_type: "summary",
          priority: false,
          severity: "dikkat",
          title,
          message,
          delivered: true,
          is_global: false,
        }),
      });

      // Birikmişleri "delivered = true" yap
      const ids = items.map((n) => `"${(n as any).id}"`).filter(Boolean);
      if (ids.length > 0) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/notifications?id=in.(${ids.join(",")})`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ delivered: true }),
          },
        );
      }

      summarySent++;
    }

    return response.status(200).json({
      success: true,
      usersNotified: summarySent,
      totalNotifications: notifications.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return response.status(500).json({ success: false, error: message });
  }
}