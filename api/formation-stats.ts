// api/formation-stats.ts
// Formasyon başarı istatistiklerini döndürür.
// Genel, formasyon bazlı ve sembol bazlı.

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = {
  method?: string;
  query?: Record<string, string>;
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
};

// Supabase'den tüm sonuçlanmış sinyalleri çek
async function fetchCompletedSignals(days = 30): Promise<SignalRow[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/formation_signals?select=symbol,market,formation_name,formation_bias,status,result_percent,signal_time&status=in.(hit_target,hit_stop)&signal_time=gte.${since}&limit=5000`,
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

// İstatistik hesapla
function calculateStats(signals: SignalRow[]) {
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

  // Toplam getiri ($100 yatırım varsayımı)
  const totalReturn = winPercents.reduce((a, b) => a + b, 0) +
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

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "public, max-age=300"); // 5 dk cache

  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const daysParam = Number(request.query?.["days"] ?? 30);
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 90) : 30;

    const signals = await fetchCompletedSignals(days);

    // Genel istatistik
    const general = calculateStats(signals);

    // Formasyon bazlı
    const byFormationMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byFormationMap.get(s.formation_name) ?? [];
      list.push(s);
      byFormationMap.set(s.formation_name, list);
    }
    const byFormation = Array.from(byFormationMap.entries())
      .map(([name, sigs]) => ({
        name,
        ...calculateStats(sigs),
      }))
      .sort((a, b) => b.total - a.total);

    // Sembol bazlı
    const bySymbolMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = bySymbolMap.get(s.symbol) ?? [];
      list.push(s);
      bySymbolMap.set(s.symbol, list);
    }
    const bySymbol = Array.from(bySymbolMap.entries())
      .map(([symbol, sigs]) => ({
        symbol,
        market: sigs[0]?.market ?? "",
        ...calculateStats(sigs),
      }))
      .filter((s) => s.total >= 3) // En az 3 sinyal
      .sort((a, b) => b.total - a.total)
      .slice(0, 30);

    // Piyasa bazlı
    const byMarketMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byMarketMap.get(s.market) ?? [];
      list.push(s);
      byMarketMap.set(s.market, list);
    }
    const byMarket = Array.from(byMarketMap.entries())
      .map(([market, sigs]) => ({
        market,
        ...calculateStats(sigs),
      }))
      .sort((a, b) => b.total - a.total);

    return response.status(200).json({
      success: true,
      period: `${days} gün`,
      general,
      byFormation,
      bySymbol,
      byMarket,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Stats handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}