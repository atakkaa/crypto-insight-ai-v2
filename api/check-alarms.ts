// api/check-alarms.ts — Aktif alarmları kontrol eder ve tetikler
// Cron: Her 15 dakikada bir çalışır

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");
const CRON_SECRET = String(ENV.CRON_SECRET ?? "");

type RequestLike = {
  method?: string;
  headers?: { get?: (name: string) => string | null } | Record<string, string>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
};

type AlarmRow = {
  id: string;
  user_id: string;
  type: "price" | "formation" | "quality";
  market: string;
  symbol: string;
  target_price: number | null;
  condition: "above" | "below" | null;
  formation_name: string | null;
  min_quality: number | null;
  min_score: number | null;
  is_active: boolean;
  trigger_count: number;
};

// ==========================================================
// YETKİ
// ==========================================================

function authorized(request: RequestLike): boolean {
  if (!CRON_SECRET) return true;

  const headers = request.headers;
  if (headers && typeof (headers as any).get === "function") {
    const cronHeader = (headers as any).get("x-cron-secret");
    if (cronHeader === CRON_SECRET) return true;
    const auth = (headers as any).get("authorization");
    if (auth === `Bearer ${CRON_SECRET}`) return true;
  } else if (headers) {
    const h = headers as Record<string, string>;
    if (h["x-cron-secret"] === CRON_SECRET) return true;
    if (h["authorization"] === `Bearer ${CRON_SECRET}`) return true;
  }

  return false;
}

// ==========================================================
// SUPABASE YARDIMCILAR
// ==========================================================

async function supabaseFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers ?? {}),
    },
  });
}

async function fetchActiveAlarms(): Promise<AlarmRow[]> {
  try {
    const res = await supabaseFetch(
      `alarms?is_active=eq.true&select=*&limit=1000`,
    );
    if (!res.ok) return [];
    return (await res.json()) as AlarmRow[];
  } catch {
    return [];
  }
}

async function getCurrentPrice(symbol: string, market: string): Promise<number | null> {
  try {
    if (market === "crypto") {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { price?: string };
      return data.price ? Number(data.price) : null;
    }
    // Hisse
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

async function getRecentFormationSignal(
  market: string,
  symbol: string,
  formationName: string | null,
  minQuality: number | null,
): Promise<{ formation_name: string; quality_score: number; signal_time: string } | null> {
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const params = new URLSearchParams();
    params.set(
      "select",
      "formation_name,quality_score,signal_time",
    );
    params.set("market", `eq.${market}`);
    params.set("symbol", `eq.${symbol}`);
    params.set("signal_time", `gte.${since}`);
    params.set("order", "signal_time.desc");
    params.set("limit", "1");

    if (formationName) params.set("formation_name", `eq.${formationName}`);
    if (minQuality && minQuality > 0) {
      params.set("quality_score", `gte.${minQuality}`);
    }

    const res = await supabaseFetch(`formation_signals?${params.toString()}`);
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      formation_name: string;
      quality_score: number;
      signal_time: string;
    }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function updateAlarmTriggered(alarmId: string, triggerCount: number): Promise<void> {
  try {
    await supabaseFetch(`alarms?id=eq.${alarmId}`, {
      method: "PATCH",
      body: JSON.stringify({
        is_active: false, // Tek seferlik tetikleme
        triggered_at: new Date().toISOString(),
        trigger_count: triggerCount + 1,
        last_checked_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error(`Alarm güncelleme hatası (${alarmId}):`, err);
  }
}

async function updateAlarmChecked(alarmId: string): Promise<void> {
  try {
    await supabaseFetch(`alarms?id=eq.${alarmId}`, {
      method: "PATCH",
      body: JSON.stringify({ last_checked_at: new Date().toISOString() }),
    });
  } catch {
    // Sessizce yut
  }
}

// ==========================================================
// BİLDİRİM GÖNDER
// ==========================================================

async function sendAlarmNotification(params: {
  userId: string;
  market: string;
  symbol: string;
  title: string;
  message: string;
}): Promise<boolean> {
  try {
    const cleanSymbol = params.symbol
      .replace("USDT", "")
      .replace(/\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/, "");

    const res = await supabaseFetch("notifications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: params.userId,
        market: params.market,
        symbol: params.symbol,
        type: "alarm",
        notification_type: "alarm",
        priority: true,
        severity: "önemli",
        title: params.title,
        message: params.message,
        reason: "Kurduğunuz alarm tetiklendi",
        delivered: true,
        is_global: false,
        data: {
          symbol: cleanSymbol,
          alarm_triggered: true,
        },
      }),
    });

    return res.ok;
  } catch (err) {
    console.error("Bildirim gönderme hatası:", err);
    return false;
  }
}

// ==========================================================
// ANA HANDLER
// ==========================================================

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");

  if (!authorized(request)) {
    return response.status(401).json({ error: "unauthorized" });
  }

  const startTime = Date.now();

  try {
    const alarms = await fetchActiveAlarms();
    console.log(`🔔 ${alarms.length} aktif alarm kontrol ediliyor...`);

    let triggered = 0;
    let checked = 0;
    let errors = 0;

    for (const alarm of alarms) {
      try {
        let shouldTrigger = false;
        let triggerTitle = "";
        let triggerMessage = "";

        // ==========================================================
        // FİYAT ALARMI
        // ==========================================================
        if (alarm.type === "price") {
          const currentPrice = await getCurrentPrice(alarm.symbol, alarm.market);
          if (currentPrice === null) {
            await updateAlarmChecked(alarm.id);
            errors++;
            continue;
          }

          const target = Number(alarm.target_price ?? 0);
          const condition = alarm.condition;

          if (condition === "above" && currentPrice >= target) {
            shouldTrigger = true;
            triggerTitle = `🔔 FİYAT ALARMI: ${alarm.symbol}`;
            triggerMessage = `${alarm.symbol} ${target} seviyesinin üzerine çıktı. Güncel: ${currentPrice}`;
          } else if (condition === "below" && currentPrice <= target) {
            shouldTrigger = true;
            triggerTitle = `🔔 FİYAT ALARMI: ${alarm.symbol}`;
            triggerMessage = `${alarm.symbol} ${target} seviyesinin altına düştü. Güncel: ${currentPrice}`;
          }
        }

        // ==========================================================
        // FORMASYON ALARMI
        // ==========================================================
        else if (alarm.type === "formation") {
          const signal = await getRecentFormationSignal(
            alarm.market,
            alarm.symbol,
            alarm.formation_name,
            alarm.min_quality,
          );

          if (signal) {
            shouldTrigger = true;
            triggerTitle = `🔔 FORMASYON ALARMI: ${alarm.symbol}`;
            triggerMessage = `${signal.formation_name} formasyonu tespit edildi. Kalite: ${signal.quality_score}`;
          }
        }

        // ==========================================================
        // KALİTE ALARMI
        // ==========================================================
        else if (alarm.type === "quality") {
          const signal = await getRecentFormationSignal(
            alarm.market,
            alarm.symbol,
            null,
            alarm.min_quality,
          );

          if (signal) {
            shouldTrigger = true;
            triggerTitle = `🔔 KALİTE ALARMI: ${alarm.symbol}`;
            triggerMessage = `${signal.formation_name} formasyonu (kalite: ${signal.quality_score}) tespit edildi.`;
          }
        }

        // ==========================================================
        // TETİKLE
        // ==========================================================
        if (shouldTrigger) {
          await sendAlarmNotification({
            userId: alarm.user_id,
            market: alarm.market,
            symbol: alarm.symbol,
            title: triggerTitle,
            message: triggerMessage,
          });

          await updateAlarmTriggered(alarm.id, alarm.trigger_count);
          triggered++;
          console.log(`✅ Tetiklendi: ${alarm.symbol} (${alarm.type})`);
        } else {
          await updateAlarmChecked(alarm.id);
          checked++;
        }
      } catch (err) {
        console.error(`Alarm kontrol hatası (${alarm.id}):`, err);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Tamamlandı: ${alarms.length} alarm, ${triggered} tetiklendi`);

    return response.status(200).json({
      success: true,
      totalAlarms: alarms.length,
      triggered,
      checked,
      errors,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Check-alarms handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}