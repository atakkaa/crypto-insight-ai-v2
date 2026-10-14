// api/alarms.ts — Alarm CRUD + Cron Kontrolü (tek dosyada)
// GET    /api/alarms             → alarmları listele
// GET    /api/alarms?action=check → cron kontrolü (check-alarms'ın işi)
// POST   /api/alarms             → yeni alarm
// PATCH  /api/alarms?id=X        → güncelle
// DELETE /api/alarms?id=X        → sil

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");
const CRON_SECRET = String(ENV.CRON_SECRET ?? "");

type RequestLike = {
  method?: string;
  query?: Record<string, string | string[]>;
  headers?: any;
  body?: any;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
};

type UserTier = "admin" | "premium" | "trial" | "free";

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
  triggered_at: string | null;
};

// ==========================================================
// TIER LİMİTLERİ
// ==========================================================

const ALARM_LIMITS: Record<UserTier, number> = {
  admin: 999,
  premium: 50,
  trial: 10,
  free: 3,
};

// ==========================================================
// YETKİ
// ==========================================================

function isCronAuthorized(request: RequestLike): boolean {
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
// KULLANICI TIER
// ==========================================================

async function getUserTier(userId: string): Promise<UserTier> {
  if (!userId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return "free";

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role,membership,trial_ends_at`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return "free";
    const rows = (await res.json()) as Array<{
      role?: string;
      membership?: string;
      trial_ends_at?: string;
    }>;
    const row = rows[0];
    if (!row) return "free";

    if (row.role === "admin") return "admin";
    if (row.membership === "premium") return "premium";
    if (row.membership === "trial" && row.trial_ends_at) {
      if (new Date(row.trial_ends_at).getTime() >= Date.now()) return "trial";
    }
    return "free";
  } catch {
    return "free";
  }
}

// ==========================================================
// YARDIMCILAR
// ==========================================================

function getQueryStr(
  query: Record<string, string | string[]> | undefined,
  key: string,
): string | undefined {
  if (!query) return undefined;
  const val = query[key];
  if (Array.isArray(val)) return val[0];
  return val;
}

async function supabaseFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
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

// ==========================================================
// FİYAT ÇEKME
// ==========================================================

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
): Promise<{ formation_name: string; quality_score: number } | null> {
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const params = new URLSearchParams();
    params.set("select", "formation_name,quality_score");
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
    }>;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ==========================================================
// CRON KONTROLÜ (eski check-alarms)
// ==========================================================

async function handleCheckAlarms(response: ResponseLike): Promise<unknown> {
  const startTime = Date.now();

  try {
    const alarmsRes = await supabaseFetch(
      `alarms?is_active=eq.true&select=*&limit=1000`,
    );
    if (!alarmsRes.ok) {
      return response.status(500).json({ success: false, error: "Alarmlar çekilemedi" });
    }
    const alarms = (await alarmsRes.json()) as AlarmRow[];
    console.log(`🔔 ${alarms.length} aktif alarm kontrol ediliyor...`);

    let triggered = 0;
    let checked = 0;
    let errors = 0;

    for (const alarm of alarms) {
      try {
        let shouldTrigger = false;
        let triggerTitle = "";
        let triggerMessage = "";

        if (alarm.type === "price") {
          const currentPrice = await getCurrentPrice(alarm.symbol, alarm.market);
          if (currentPrice === null) {
            errors++;
            continue;
          }
          const target = Number(alarm.target_price ?? 0);
          if (alarm.condition === "above" && currentPrice >= target) {
            shouldTrigger = true;
            triggerTitle = `🔔 FİYAT ALARMI: ${alarm.symbol}`;
            triggerMessage = `${alarm.symbol} ${target} seviyesinin üzerine çıktı. Güncel: ${currentPrice}`;
          } else if (alarm.condition === "below" && currentPrice <= target) {
            shouldTrigger = true;
            triggerTitle = `🔔 FİYAT ALARMI: ${alarm.symbol}`;
            triggerMessage = `${alarm.symbol} ${target} seviyesinin altına düştü. Güncel: ${currentPrice}`;
          }
        } else if (alarm.type === "formation") {
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
        } else if (alarm.type === "quality") {
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

        if (shouldTrigger) {
          // Bildirim gönder
          await supabaseFetch("notifications", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              user_id: alarm.user_id,
              market: alarm.market,
              symbol: alarm.symbol,
              type: "alarm",
              notification_type: "alarm",
              priority: true,
              severity: "önemli",
              title: triggerTitle,
              message: triggerMessage,
              reason: "Kurduğunuz alarm tetiklendi",
              delivered: true,
              is_global: false,
            }),
          });

          // Alarmı güncelle (tek seferlik tetikleme)
          await supabaseFetch(`alarms?id=eq.${alarm.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              is_active: false,
              triggered_at: new Date().toISOString(),
              trigger_count: (alarm.trigger_count ?? 0) + 1,
              last_checked_at: new Date().toISOString(),
            }),
          });

          triggered++;
        } else {
          await supabaseFetch(`alarms?id=eq.${alarm.id}`, {
            method: "PATCH",
            body: JSON.stringify({ last_checked_at: new Date().toISOString() }),
          });
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
    return response.status(500).json({ success: false, error: message });
  }
}

// ==========================================================
// GET — Listele
// ==========================================================

async function handleGet(
  userId: string,
  response: ResponseLike,
): Promise<unknown> {
  const res = await supabaseFetch(
    `alarms?user_id=eq.${userId}&order=created_at.desc&select=*`,
  );

  if (!res.ok) {
    return response.status(500).json({ success: false, error: "Fetch hatası" });
  }

  const alarms = (await res.json()) as unknown[];
  const tier = await getUserTier(userId);
  const limit = ALARM_LIMITS[tier];

  return response.status(200).json({
    success: true,
    alarms,
    tier,
    limit,
    used: alarms.length,
  });
}

// ==========================================================
// POST — Oluştur
// ==========================================================

type CreateAlarmBody = {
  type: "price" | "formation" | "quality";
  market: string;
  symbol: string;
  target_price?: number;
  condition?: "above" | "below";
  formation_name?: string;
  min_quality?: number;
  min_score?: number;
};

async function handlePost(
  userId: string,
  body: any,
  response: ResponseLike,
): Promise<unknown> {
  if (!body || typeof body !== "object") {
    return response.status(400).json({ success: false, error: "Body gerekli" });
  }

  const type = String(body.type ?? "") as "price" | "formation" | "quality";
  const market = String(body.market ?? "");
  const symbol = String(body.symbol ?? "").toUpperCase();

  if (!["price", "formation", "quality"].includes(type)) {
    return response.status(400).json({ success: false, error: "Geçersiz alarm tipi" });
  }
  if (!market || !symbol) {
    return response.status(400).json({ success: false, error: "Market ve sembol gerekli" });
  }

  const tier = await getUserTier(userId);
  const limit = ALARM_LIMITS[tier];

  const countRes = await supabaseFetch(`alarms?user_id=eq.${userId}&select=id`);
  if (!countRes.ok) {
    return response.status(500).json({ success: false, error: "Count hatası" });
  }
  const existing = (await countRes.json()) as unknown[];
  if (existing.length >= limit) {
    return response.status(403).json({
      success: false,
      error: `Alarm limitinize ulaştınız (${limit}). Premium'a geçin.`,
      tier,
      limit,
      used: existing.length,
    });
  }

  const insertData: Record<string, unknown> = {
    user_id: userId,
    type,
    market,
    symbol,
    is_active: true,
  };

  if (type === "price") {
    const targetPrice = Number(body.target_price);
    const condition = String(body.condition ?? "");
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      return response.status(400).json({ success: false, error: "Geçersiz hedef fiyat" });
    }
    if (!["above", "below"].includes(condition)) {
      return response.status(400).json({ success: false, error: "Geçersiz koşul" });
    }
    insertData.target_price = targetPrice;
    insertData.condition = condition;
  } else if (type === "formation") {
    const formationName = String(body.formation_name ?? "");
    if (!formationName) {
      return response.status(400).json({ success: false, error: "Formasyon adı gerekli" });
    }
    insertData.formation_name = formationName;
    if (body.min_quality) {
      insertData.min_quality = Math.min(Math.max(Number(body.min_quality), 0), 100);
    }
  } else if (type === "quality") {
    const minQuality = Number(body.min_quality ?? 85);
    if (!Number.isFinite(minQuality) || minQuality < 0 || minQuality > 100) {
      return response.status(400).json({ success: false, error: "Geçersiz min kalite" });
    }
    insertData.min_quality = minQuality;
    if (body.min_score) {
      insertData.min_score = Math.min(Math.max(Number(body.min_score), 0), 100);
    }
  }

  const insertRes = await supabaseFetch("alarms", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(insertData),
  });

  if (!insertRes.ok) {
    const err = await insertRes.text();
    console.error("Alarm kayıt hatası:", err);
    return response.status(500).json({ success: false, error: "Kayıt başarısız" });
  }

  const created = (await insertRes.json()) as unknown[];

  return response.status(200).json({
    success: true,
    alarm: created[0],
    message: "Alarm oluşturuldu",
  });
}

// ==========================================================
// PATCH — Güncelle
// ==========================================================

async function handlePatch(
  userId: string,
  alarmId: string,
  body: any,
  response: ResponseLike,
): Promise<unknown> {
  if (!alarmId) {
    return response.status(400).json({ success: false, error: "id gerekli" });
  }

  const checkRes = await supabaseFetch(
    `alarms?id=eq.${alarmId}&user_id=eq.${userId}&select=id`,
  );
  if (!checkRes.ok) {
    return response.status(500).json({ success: false, error: "Yetki hatası" });
  }
  const existing = (await checkRes.json()) as unknown[];
  if (existing.length === 0) {
    return response.status(404).json({ success: false, error: "Alarm bulunamadı" });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.is_active === "boolean") {
    updateData.is_active = body.is_active;
    if (body.is_active === true) {
      updateData.triggered_at = null;
    }
  }

  if (body.reset_trigger === true) {
    updateData.trigger_count = 0;
    updateData.triggered_at = null;
    updateData.is_active = true;
  }

  const updateRes = await supabaseFetch(`alarms?id=eq.${alarmId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(updateData),
  });

  if (!updateRes.ok) {
    return response.status(500).json({ success: false, error: "Güncelleme hatası" });
  }

  const updated = (await updateRes.json()) as unknown[];

  return response.status(200).json({
    success: true,
    alarm: updated[0],
    message: "Alarm güncellendi",
  });
}

// ==========================================================
// DELETE — Sil
// ==========================================================

async function handleDelete(
  userId: string,
  alarmId: string,
  response: ResponseLike,
): Promise<unknown> {
  if (!alarmId) {
    return response.status(400).json({ success: false, error: "id gerekli" });
  }

  const deleteRes = await supabaseFetch(
    `alarms?id=eq.${alarmId}&user_id=eq.${userId}`,
    { method: "DELETE" },
  );

  if (!deleteRes.ok) {
    return response.status(500).json({ success: false, error: "Silme hatası" });
  }

  return response.status(200).json({ success: true, message: "Alarm silindi" });
}

// ==========================================================
// HANDLER
// ==========================================================

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-id, x-cron-secret");

  if (request.method === "OPTIONS") {
    return response.status(200).json({});
  }

  try {
    // CRON kontrolü (action=check)
    const action = getQueryStr(request.query, "action");
    if (action === "check") {
      if (!isCronAuthorized(request)) {
        return response.status(401).json({ error: "unauthorized" });
      }
      return await handleCheckAlarms(response);
    }

    // Kullanıcı işlemleri
    const headers = request.headers;
    let userId = "";
    if (headers && typeof headers.get === "function") {
      userId = headers.get("x-user-id") || "";
    } else if (headers) {
      userId = headers["x-user-id"] || "";
    }

    if (!userId) {
      return response.status(401).json({ success: false, error: "Giriş gerekli" });
    }

    const method = request.method ?? "GET";
    const alarmId = getQueryStr(request.query, "id") ?? "";

    if (method === "GET") {
      return await handleGet(userId, response);
    }
    if (method === "POST") {
      return await handlePost(userId, request.body, response);
    }
    if (method === "PATCH") {
      return await handlePatch(userId, alarmId, request.body, response);
    }
    if (method === "DELETE") {
      return await handleDelete(userId, alarmId, response);
    }

    return response.status(405).json({ success: false, error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Alarm handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}