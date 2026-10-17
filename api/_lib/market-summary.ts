// api/market-summary.ts — Piyasa Özet İstatistikleri
// Günlük/Haftalık özet, en iyi/kötü, formasyonlar, market durumu

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
  symbol: string;
  market: string;
  formation_name: string;
  formation_bias: string;
  status: string;
  result_percent: number | null;
  signal_time: string;
  signal_type: string | null;
  quality_score: number | null;
};

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
// SİNYALLERİ ÇEK
// ==========================================================

async function fetchSignals(
  sinceIso: string,
  options: { onlyResolved?: boolean } = {},
): Promise<SignalRow[]> {
  try {
    const params = new URLSearchParams();
    params.set(
      "select",
      "symbol,market,formation_name,formation_bias,status,result_percent,signal_time,signal_type,quality_score",
    );
    params.set("signal_time", `gte.${sinceIso}`);
    params.set("limit", "10000");
    params.set("order", "signal_time.desc");

    if (options.onlyResolved) {
      params.set("status", "in.(hit_target,hit_stop)");
    }

    const res = await supabaseFetch(
      `formation_signals?${params.toString()}`,
    );
    if (!res.ok) return [];
    return (await res.json()) as SignalRow[];
  } catch {
    return [];
  }
}

// ==========================================================
// FEAR & GREED
// ==========================================================

async function fetchFearGreed(): Promise<{
  value: number;
  classification: string;
  emoji: string;
} | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string }>;
    };
    const entry = data.data?.[0];
    if (!entry) return null;

    const value = Number(entry.value);
    let emoji = "😐";
    if (value <= 24) emoji = "😱";
    else if (value <= 44) emoji = "😰";
    else if (value <= 55) emoji = "😐";
    else if (value <= 74) emoji = "🤑";
    else emoji = "🚀";

    return {
      value,
      classification: entry.value_classification,
      emoji,
    };
  } catch {
    return null;
  }
}

// ==========================================================
// İSTATİSTİK
// ==========================================================

function computeStats(signals: SignalRow[]) {
  const wins = signals.filter((s) => s.status === "hit_target");
  const losses = signals.filter((s) => s.status === "hit_stop");

  const winPercents = wins
    .map((s) => Number(s.result_percent ?? 0))
    .filter((n) => Number.isFinite(n));
  const lossPercents = losses
    .map((s) => Number(s.result_percent ?? 0))
    .filter((n) => Number.isFinite(n));

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

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    winRate: Math.round(winRate * 10) / 10,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
  };
}

// ==========================================================
// HANDLER
// ==========================================================

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
): Promise<unknown> {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");

  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const period = getQueryStr(request.query, "period") ?? "daily";
    const isWeekly = period === "weekly";

    // Zaman aralıkları
    const now = Date.now();
    const periodMs = isWeekly ? 7 * 24 * 3600_000 : 24 * 3600_000;
    const periodStart = new Date(now - periodMs).toISOString();
    const weekStart = new Date(now - 7 * 24 * 3600_000).toISOString();

    // Paralel veri çekme
    const [periodSignals, weekSignals, fearGreed] = await Promise.all([
      fetchSignals(periodStart, { onlyResolved: false }),
      fetchSignals(weekStart, { onlyResolved: true }),
      fetchFearGreed(),
    ]);

    // ==========================================================
    // 1. BUGÜNÜN/HAFTANIN ÖZETİ
    // ==========================================================
    const resolvedInPeriod = periodSignals.filter(
      (s) => s.status === "hit_target" || s.status === "hit_stop",
    );
    const bullish = periodSignals.filter(
      (s) => s.formation_bias === "yükseliş",
    ).length;
    const bearish = periodSignals.filter(
      (s) => s.formation_bias === "düşüş",
    ).length;

    const qualityScores = periodSignals
      .map((s) => s.quality_score)
      .filter((q): q is number => q !== null && Number.isFinite(q));
    const avgQuality =
      qualityScores.length > 0
        ? Math.round(
            qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length,
          )
        : 0;

    const periodSummary = {
      total: periodSignals.length,
      bullish,
      bearish,
      resolved: resolvedInPeriod.length,
      avgQuality,
      stats: computeStats(resolvedInPeriod),
    };

    // ==========================================================
    // 2. EN İYİ/KÖTÜ PERFORMANS (son 7 gün)
    // ==========================================================
    const symbolStats = new Map<
      string,
      { wins: number; total: number; totalReturn: number; market: string }
    >();

    for (const s of weekSignals) {
      const key = `${s.market}:${s.symbol}`;
      const entry = symbolStats.get(key) ?? {
        wins: 0,
        total: 0,
        totalReturn: 0,
        market: s.market,
      };
      entry.total += 1;
      if (s.status === "hit_target") entry.wins += 1;
      entry.totalReturn += Number(s.result_percent ?? 0);
      symbolStats.set(key, entry);
    }

    const symbolList = Array.from(symbolStats.entries())
      .filter(([, v]) => v.total >= 2) // min 2 sinyal
      .map(([key, v]) => {
        const [market, symbol] = key.split(":");
        return {
          symbol: symbol ?? key,
          market: market ?? "",
          total: v.total,
          wins: v.wins,
          winRate: Math.round((v.wins / v.total) * 1000) / 10,
          totalReturn: Math.round(v.totalReturn * 100) / 100,
        };
      });

    const topPerformers = [...symbolList]
      .sort((a, b) => b.totalReturn - a.totalReturn)
      .slice(0, 5);

    const worstPerformers = [...symbolList]
      .sort((a, b) => a.totalReturn - b.totalReturn)
      .slice(0, 5);

    // ==========================================================
    // 3. EN AKTİF FORMASYONLAR
    // ==========================================================
    const formationStats = new Map<
      string,
      { wins: number; losses: number; total: number; totalReturn: number }
    >();

    for (const s of weekSignals) {
      const key = s.formation_name;
      const entry = formationStats.get(key) ?? {
        wins: 0,
        losses: 0,
        total: 0,
        totalReturn: 0,
      };
      entry.total += 1;
      if (s.status === "hit_target") entry.wins += 1;
      else if (s.status === "hit_stop") entry.losses += 1;
      entry.totalReturn += Number(s.result_percent ?? 0);
      formationStats.set(key, entry);
    }

    const topFormations = Array.from(formationStats.entries())
      .map(([name, v]) => ({
        name,
        total: v.total,
        wins: v.wins,
        losses: v.losses,
        winRate:
          v.wins + v.losses > 0
            ? Math.round((v.wins / (v.wins + v.losses)) * 1000) / 10
            : 0,
        totalReturn: Math.round(v.totalReturn * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // ==========================================================
    // 4. PİYASA DURUMU (market bazlı AL/SAT)
    // ==========================================================
    const marketStats = new Map<
      string,
      { bullish: number; bearish: number; total: number }
    >();

    for (const s of periodSignals) {
      const key = s.market;
      const entry = marketStats.get(key) ?? {
        bullish: 0,
        bearish: 0,
        total: 0,
      };
      entry.total += 1;
      if (s.formation_bias === "yükseliş") entry.bullish += 1;
      else if (s.formation_bias === "düşüş") entry.bearish += 1;
      marketStats.set(key, entry);
    }

    const marketSummary = Array.from(marketStats.entries()).map(
      ([market, v]) => {
        const trend =
          v.bullish > v.bearish
            ? "boğa"
            : v.bearish > v.bullish
              ? "ayı"
              : "kararsız";
        return {
          market,
          bullish: v.bullish,
          bearish: v.bearish,
          total: v.total,
          trend,
          bullishPercent:
            v.total > 0 ? Math.round((v.bullish / v.total) * 1000) / 10 : 0,
        };
      },
    );

    // ==========================================================
    // RESPONSE
    // ==========================================================
    return response.status(200).json({
      success: true,
      period,
      periodSummary,
      topPerformers,
      worstPerformers,
      topFormations,
      marketSummary,
      fearGreed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Market summary hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}