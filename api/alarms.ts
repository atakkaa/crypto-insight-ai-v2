// api/alarms.ts — Alarm CRUD endpoint
// GET    /api/alarms         → kullanıcının alarmlarını listele
// POST   /api/alarms         → yeni alarm oluştur
// PATCH  /api/alarms?id=X    → alarm güncelle (aktif/pasif)
// DELETE /api/alarms?id=X    → alarm sil

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

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

  // Tier ve limit bilgisi
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

async function handlePost(
  userId: string,
  body: any,
  response: ResponseLike,
): Promise<unknown> {
  if (!body || typeof body !== "object") {
    return response.status(400).json({ success: false, error: "Body gerekli" });
  }

  const type = String(body.type ?? "");
  const market = String(body.market ?? "");
  const symbol = String(body.symbol ?? "").toUpperCase();

  // Validasyon
  if (!["price", "formation", "quality"].includes(type)) {
    return response.status(400).json({ success: false, error: "Geçersiz alarm tipi" });
  }
  if (!market || !symbol) {
    return response.status(400).json({ success: false, error: "Market ve sembol gerekli" });
  }

  // Tier limit kontrolü
  const tier = await getUserTier(userId);
  const limit = ALARM_LIMITS[tier];

  const countRes = await supabaseFetch(
    `alarms?user_id=eq.${userId}&select=id`,
  );
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

  // Tip bazlı validasyon
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
      return response.status(400).json({ success: false, error: "Geçersiz koşul (above/below)" });
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

  // Insert
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
// PATCH — Güncelle (aktif/pasif)
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

  // Yetki kontrolü (kendi alarmı mı?)
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
    // Yeniden aktif ediliyorsa trigger'ı sıfırla
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

  // CORS
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-id");

  if (request.method === "OPTIONS") {
    return response.status(200).json({});
  }

  try {
    // Kullanıcı ID
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