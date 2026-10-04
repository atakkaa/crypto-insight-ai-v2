// api/start-trial.ts — 7 günlük deneme başlatma

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = {
  method?: string;
  body?: { userId?: string };
  query?: Record<string, any>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
};

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Content-Type", "application/json");

  if (request.method !== "POST") {
    return response.status(405).json({ success: false, error: "POST gerekli" });
  }

  const userId = String(request.body?.userId ?? request.query?.["userId"] ?? "");
  if (!userId) {
    return response.status(400).json({ success: false, error: "userId gerekli" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return response.status(500).json({ success: false, error: "Env eksik" });
  }

  try {
    // Kullanıcı bilgisini çek
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role,membership,trial_used`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!res.ok) return response.status(500).json({ success: false, error: "Fetch hatası" });

    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return response.status(404).json({ success: false, error: "Kullanıcı yok" });

    const role = String(row["role"] ?? "user");
    const membership = String(row["membership"] ?? "free");
    const trialUsed = Boolean(row["trial_used"]);

    // Kontroller
    if (role === "admin") {
      return response.status(400).json({ success: false, error: "Admin zaten premium" });
    }
    if (membership === "premium") {
      return response.status(400).json({ success: false, error: "Zaten premium" });
    }
    if (membership === "trial") {
      return response.status(400).json({ success: false, error: "Trial zaten aktif" });
    }
    if (trialUsed) {
      return response.status(400).json({ success: false, error: "Trial hakkı kullanıldı" });
    }

    // Trial başlat
    const now = new Date();
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        membership: "trial",
        trial_started_at: now.toISOString(),
        trial_ends_at: endsAt.toISOString(),
        trial_used: true,
      }),
    });

    if (!updateRes.ok) {
      return response.status(500).json({ success: false, error: "Güncelleme hatası" });
    }

    return response.status(200).json({
      success: true,
      message: "7 günlük deneme başladı",
      trialEndsAt: endsAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return response.status(500).json({ success: false, error: message });
  }
}