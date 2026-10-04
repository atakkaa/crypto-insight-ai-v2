// api/dnd-summary.ts — DND birikmiş bildirimler için sabah özeti

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

// ==========================================================
// TİPLER
// ==========================================================

type RequestLike = {
  method?: string;
  query?: Record<string, any>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
  setHeader: (name: string, value: string) => void;
};

type NotificationRow = {
  id: string;
  user_id: string;
  symbol: string;
  market: string;
  signal_score: number | null;
  ai_action: string | null;
  ai_summary: string | null;
  severity: string;
  priority: boolean;
  is_global: boolean;
  created_at: string;
};

// ==========================================================
// ANA HANDLER
// ==========================================================

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return response
      .status(500)
      .json({ success: false, error: "Supabase env eksik" });
  }

  try {
    console.log("🔔 DND özet cron başladı");

    // 1. Birikmiş bildirimleri çek (delivered = false, son 24 saat)
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?delivered=eq.false&created_at=gt.${since}&select=id,user_id,symbol,market,signal_score,ai_action,ai_summary,severity,priority,is_global,created_at&order=signal_score.desc&limit=500`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Bildirim çekme hatası:", res.status, err);
      return response
        .status(500)
        .json({ success: false, error: "Bildirimler çekilemedi" });
    }

    const notifications = (await res.json()) as NotificationRow[];

    console.log(`📊 ${notifications.length} birikmiş bildirim bulundu`);

    if (notifications.length === 0) {
      return response.status(200).json({
        success: true,
        message: "Birikmiş bildirim yok",
        usersNotified: 0,
        totalNotifications: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Kullanıcıya göre grupla
    const grouped: Record<string, NotificationRow[]> = {};
    for (const n of notifications) {
      if (!grouped[n.user_id]) grouped[n.user_id] = [];
      grouped[n.user_id]!.push(n);
    }

    let summarySent = 0;
    let totalProcessed = 0;

    // 3. Her kullanıcı için özet gönder
    for (const [userId, items] of Object.entries(grouped)) {
      const count = items.length;
      if (count === 0) continue;

      // En önemli 5 tanesi (zaten skor'a göre sıralı geldi)
      const top5 = items.slice(0, 5);

      const lines = top5
        .map((n) => {
          const typeEmoji = n.is_global ? "🌍" : n.priority ? "⭐" : "📢";
          const actionEmoji =
            n.ai_action === "AL"
              ? "🟢"
              : n.ai_action === "SAT"
                ? "🔴"
                : "🟡";
          const cleanSymbol = n.symbol
            .replace("USDT", "")
            .replace(/\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/, "");
          const score = n.signal_score ?? "?";
          return `${typeEmoji} ${cleanSymbol} → ${actionEmoji} ${n.ai_action ?? "BEKLE"} (skor: ${score})`;
        })
        .join("\n");

      const title = `🔔 GECE ÖZETİ (${count} gelişme)`;
      const message = `Gece boyunca ${count} önemli gelişme oldu.

En önemliler:
${lines}

Tamamı için uygulamayı aç.`;

      // 4. Özet bildirimini gönder
      try {
        const sendRes = await fetch(
          `${SUPABASE_URL}/rest/v1/notifications`,
          {
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
              data: {
                summary_count: count,
                top_symbols: top5.map((n) => n.symbol),
              },
            }),
          },
        );

        if (!sendRes.ok) {
          console.error(`Özet gönderme hatası (${userId.slice(0, 8)}):`, await sendRes.text());
          continue;
        }
      } catch (err) {
        console.error(`Özet fetch hatası (${userId.slice(0, 8)}):`, err);
        continue;
      }

      // 5. Birikmişleri "delivered = true" yap
      const ids = items.map((n) => n.id).filter(Boolean);
      if (ids.length > 0) {
        try {
          // IDs'leri virgülle birleştir
          const idList = ids.map((id) => `"${id}"`).join(",");
          await fetch(
            `${SUPABASE_URL}/rest/v1/notifications?id=in.(${idList})`,
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
          totalProcessed += ids.length;
        } catch (err) {
          console.error(`Birikmişleri işaretleme hatası (${userId.slice(0, 8)}):`, err);
        }
      }

      summarySent++;
      console.log(
        `✅ ${userId.slice(0, 8)}... → ${count} bildirim özetlendi`,
      );
    }

    console.log(
      `🎉 Tamamlandı: ${summarySent} kullanıcıya özet, ${totalProcessed} bildirim işaretlendi`,
    );

    return response.status(200).json({
      success: true,
      message: "Özet tamamlandı",
      usersNotified: summarySent,
      totalNotifications: notifications.length,
      processedNotifications: totalProcessed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("DND özet handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}