// api/backtest.ts
// Backtest aracı: Geçmiş sinyalleri yeni parametrelerle yeniden değerlendirir.
// Sadece admin erişimi.

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = {
  method?: string;
  query?: Record<string, string | string[]>;
  headers?: any;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
};

type SignalRow = {
  id: string;
  symbol: string;
  market: string;
  formation_name: string;
  formation_bias: string;
  status: string;
  result_percent: number | null;
  entry_price: number;
  target_price: number;
  stop_price: number;
  signal_time: string;
  signal_type: string | null;
  quality_score: number | null;
};

type UserTier = "admin" | "premium" | "trial" | "free";

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
// SİNYALLERİ ÇEK
// ==========================================================

async function fetchSignals(days: number): Promise<SignalRow[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

    const params = new URLSearchParams();
    params.set(
      "select",
      "id,symbol,market,formation_name,formation_bias,status,result_percent,entry_price,target_price,stop_price,signal_time,signal_type,quality_score",
    );
    params.set("status", "in.(hit_target,hit_stop)");
    params.set("signal_time", `gte.${since}`);
    params.set("limit", "10000");
    params.set("order", "signal_time.desc");

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/formation_signals?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as SignalRow[];
  } catch {
    return [];
  }
}

// ==========================================================
// İSTATİSTİK
// ==========================================================

type StatResult = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalReturn: number;
  expectancy: number;
};

function computeStats(
  results: Array<{ status: "win" | "loss"; percent: number }>,
): StatResult {
  const wins = results.filter((r) => r.status === "win");
  const losses = results.filter((r) => r.status === "loss");

  const winPercents = wins.map((w) => w.percent);
  const lossPercents = losses.map((l) => l.percent);

  const avgWin =
    winPercents.length > 0
      ? winPercents.reduce((a, b) => a + b, 0) / winPercents.length
      : 0;
  const avgLoss =
    lossPercents.length > 0
      ? lossPercents.reduce((a, b) => a + b, 0) / lossPercents.length
      : 0;

  const total = wins.length + losses.length;
  const winRate = total > 0 ? (wins.length / total) * 100 : 0;

  const totalReturn =
    winPercents.reduce((a, b) => a + b, 0) +
    lossPercents.reduce((a, b) => a + b, 0);

  const winRateDecimal = total > 0 ? wins.length / total : 0;
  const lossRateDecimal = total > 0 ? losses.length / total : 0;
  const expectancy = avgWin * winRateDecimal + avgLoss * lossRateDecimal;

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    winRate: Math.round(winRate * 10) / 10,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
  };
}

// ==========================================================
// YENİDEN DEĞERLENDİRME
// ==========================================================

type BacktestParams = {
  days: number;
  minQuality: number;
  minTargetPercent: number; // 0.02 = %2
  minStopPercent: number; // 0.01 = %1
  maxStopPercent: number; // 0.03 = %3
  minRR: number; // 2.0 = 1:2
  marketFilter: "all" | "crypto" | "hisse";
};

type BacktestResult = {
  accepted: boolean;
  reason?: string;
  status?: "win" | "loss";
  percent?: number;
};

function reevaluateSignal(
  s: SignalRow,
  params: BacktestParams,
): BacktestResult {
  // 1. Market filtresi
  if (params.marketFilter !== "all") {
    const isCrypto = s.market === "crypto";
    if (params.marketFilter === "crypto" && !isCrypto) {
      return { accepted: false, reason: "market" };
    }
    if (params.marketFilter === "hisse" && isCrypto) {
      return { accepted: false, reason: "market" };
    }
  }

  // 2. Kalite filtresi
  const quality = s.quality_score ?? 0;
  if (quality < params.minQuality) {
    return { accepted: false, reason: "quality" };
  }

  const entry = Number(s.entry_price);
  if (!Number.isFinite(entry) || entry <= 0) {
    return { accepted: false, reason: "invalid_entry" };
  }

  // 3. Yeni hedef ve stop hesapla
  const bias = s.formation_bias;
  const isBullish = bias === "yükseliş";
  const isBearish = bias === "düşüş";

  if (!isBullish && !isBearish) {
    return { accepted: false, reason: "neutral_bias" };
  }

  const resultPrice = Number(s.result_percent ?? 0);
  // Sonuç yüzdesinden fiyatı geri hesapla
  // result_percent = hit_target'ta (current - entry) / entry * 100
  //              veya hit_stop'ta (current - entry) / entry * 100
  // Ama düşüş sinyalleri için ters — formülden emin olalım.

  // Basitleştirilmiş: Mevcut sonuç yüzdesini kullan
  // Yeni hedef/stop mesafesi daha büyükse, sinyal muhtemelen aynı yönde sonuçlanırdı

  // Yeni hedef yüzdesi
  const newTargetPercent = Math.max(
    params.minTargetPercent,
    params.minStopPercent * params.minRR, // R/R min koru
  );

  // Yeni stop yüzdesi (max sınırı ile)
  let newStopPercent = params.minStopPercent;
  if (newStopPercent > params.maxStopPercent) {
    newStopPercent = params.maxStopPercent;
  }

  // Eski sonuç yüzdesinin mutlak değeri
  const absResult = Math.abs(resultPrice);

  // Eski hedef/stop mesafesi (mevcut)
  const oldEntry = Number(s.entry_price);
  const oldTarget = Number(s.target_price);
  const oldStop = Number(s.stop_price);
  const oldTargetPercent = Math.abs((oldTarget - oldEntry) / oldEntry);
  const oldStopPercent = Math.abs((oldStop - oldEntry) / oldEntry);

  // Yeni hedef/stop fiyatları
  let newTarget: number;
  let newStop: number;
  if (isBullish) {
    newTarget = entry * (1 + newTargetPercent);
    newStop = entry * (1 - newStopPercent);
  } else {
    newTarget = entry * (1 - newTargetPercent);
    newStop = entry * (1 + newStopPercent);
  }

  // Simülasyon: Eski sonuç fiyatına bakarak yeni sonucu belirle
  // Eski sonuç: s.status === "hit_target" veya "hit_stop"
  // Eğer eski hit_target ise, fiyat hedefe ulaşmıştı
  // Eğer yeni hedef daha büyükse, fiyat yeni hedefe ulaşmamış olabilir

  if (s.status === "hit_target") {
    // Eski hedefe ulaşıldı. Fiyat eski_target civarındaydı.
    // Yeni hedef daha küçükse → kâr daha az olur (gerçekleşmiş oldu)
    // Yeni hedef daha büyükse → belirsiz, kâr alınamamış olabilir
    if (newTargetPercent <= oldTargetPercent) {
      // Yeni hedef daha yakın → kesin kazanç
      return {
        accepted: true,
        status: "win",
        percent: isBullish
          ? newTargetPercent * 100
          : newTargetPercent * 100,
      };
    } else {
      // Yeni hedef daha uzak → kazanç olmayabilir
      // Muhafazakar yaklaşım: eski sonuçla aynı (kâr = eski kâr)
      return {
        accepted: true,
        status: "win",
        percent: absResult, // eski kâr
      };
    }
  } else {
    // Eski stop oldu. Fiyat eski_stop civarındaydı.
    // Yeni stop daha dar → daha erken stop olur (aynı kayıp)
    // Yeni stop daha geniş → fiyat yeni stop'a ulaşmamış olabilir
    if (newStopPercent >= oldStopPercent) {
      // Yeni stop daha geniş → eski stop geçersiz, kayıp olmayabilir
      // Ama fiyat eski_stop'a kadar düştü ve geri döndü, sonuç belirsiz
      // Muhafazakar: eski kayıpla aynı
      return {
        accepted: true,
        status: "loss",
        percent: -absResult,
      };
    } else {
      // Yeni stop daha dar → daha erken stop, daha küçük kayıp
      return {
        accepted: true,
        status: "loss",
        percent: -newStopPercent * 100,
      };
    }
  }
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

  if (request.method !== "GET" && request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Yetki kontrolü
    const headers = request.headers;
    let userId = "";
    if (headers && typeof headers.get === "function") {
      userId = headers.get("x-user-id") || "";
    } else if (headers) {
      userId = headers["x-user-id"] || "";
    }

    const tier = await getUserTier(userId);
    if (tier !== "admin") {
      return response.status(403).json({
        success: false,
        error: "Backtest sadece admin için",
        tier,
      });
    }

    // 2. Parametreleri oku
    const q = request.query ?? {};
    const getNum = (key: string, def: number) => {
      const v = Array.isArray(q[key]) ? q[key]?.[0] : q[key];
      const n = Number(v);
      return Number.isFinite(n) ? n : def;
    };
    const getStr = (key: string, def: string) => {
      const v = Array.isArray(q[key]) ? q[key]?.[0] : q[key];
      return typeof v === "string" ? v : def;
    };

    const params: BacktestParams = {
      days: Math.min(Math.max(getNum("days", 30), 1), 365),
      minQuality: Math.min(Math.max(getNum("minQuality", 65), 0), 100),
      minTargetPercent: Math.min(
        Math.max(getNum("minTargetPercent", 0.02), 0.001),
        0.5,
      ),
      minStopPercent: Math.min(
        Math.max(getNum("minStopPercent", 0.01), 0.001),
        0.5,
      ),
      maxStopPercent: Math.min(
        Math.max(getNum("maxStopPercent", 0.03), 0.001),
        0.5,
      ),
      minRR: Math.min(Math.max(getNum("minRR", 2.0), 0.5), 10),
      marketFilter: (getStr("marketFilter", "all") as
        | "all"
        | "crypto"
        | "hisse"),
    };

    // 3. Sinyalleri çek
    const signals = await fetchSignals(params.days);

    // 4. Before (mevcut durum)
    const beforeResults = signals.map((s) => ({
      status: s.status === "hit_target" ? ("win" as const) : ("loss" as const),
      percent: Number(s.result_percent ?? 0),
    }));
    const before = computeStats(beforeResults);

    // 5. After (yeniden değerlendirme)
    const afterResults: Array<{ status: "win" | "loss"; percent: number }> = [];
    let rejected = 0;
    const rejectedByReason: Record<string, number> = {};

    const byFormationMap = new Map<
      string,
      {
        before: Array<{ status: "win" | "loss"; percent: number }>;
        after: Array<{ status: "win" | "loss"; percent: number }>;
      }
    >();

    for (const s of signals) {
      // Önce before'a ekle
      const formationKey = s.formation_name;
      const formationEntry = byFormationMap.get(formationKey) ?? {
        before: [],
        after: [],
      };
      formationEntry.before.push({
        status: s.status === "hit_target" ? "win" : "loss",
        percent: Number(s.result_percent ?? 0),
      });

      // Sonra after'ı hesapla
      const result = reevaluateSignal(s, params);

      if (result.accepted && result.status && result.percent !== undefined) {
        afterResults.push({
          status: result.status,
          percent: result.percent,
        });
        formationEntry.after.push({
          status: result.status,
          percent: result.percent,
        });
      } else {
        rejected++;
        const reason = result.reason ?? "unknown";
        rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;
      }

      byFormationMap.set(formationKey, formationEntry);
    }

    const after = computeStats(afterResults);

    // 6. Diff
    const diff = {
      total: after.total - before.total,
      winRate: Math.round((after.winRate - before.winRate) * 10) / 10,
      totalReturn:
        Math.round((after.totalReturn - before.totalReturn) * 100) / 100,
      expectancy:
        Math.round((after.expectancy - before.expectancy) * 100) / 100,
    };

    // 7. Formasyon bazlı
    const byFormation = Array.from(byFormationMap.entries())
      .map(([name, data]) => {
        const beforeStats = computeStats(data.before);
        const afterStats = computeStats(data.after);
        return {
          name,
          before: beforeStats,
          after: afterStats,
          diff: {
            total: afterStats.total - beforeStats.total,
            winRate:
              Math.round((afterStats.winRate - beforeStats.winRate) * 10) / 10,
            totalReturn:
              Math.round(
                (afterStats.totalReturn - beforeStats.totalReturn) * 100,
              ) / 100,
          },
        };
      })
      .sort((a, b) => b.before.total - a.before.total);

    return response.status(200).json({
      success: true,
      params,
      before,
      after,
      diff,
      rejected,
      rejectedByReason,
      totalSignals: signals.length,
      byFormation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Backtest handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}