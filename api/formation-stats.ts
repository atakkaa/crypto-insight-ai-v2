// api/formation-stats.ts
// Formasyon başarı istatistiklerini döndürür.
// Tier bazlı: Free (403), Premium (filtreli), Admin (tam)

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = {
  method?: string;
  query?: Record<string, string>;
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
};

type UserTier = "admin" | "premium" | "trial" | "free";

// Kullanıcı tier'ını al
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

// Supabase'den sinyalleri çek (filtreli)
async function fetchSignals(filters: {
  days: number;
  formation?: string;
  market?: string;
  symbol?: string;
  bias?: string;
}): Promise<SignalRow[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const since = new Date(Date.now() - filters.days * 24 * 3600_000).toISOString();
    const params = new URLSearchParams();
    params.set("select", "symbol,market,formation_name,formation_bias,status,result_percent,signal_time");
    params.set("status", "in.(hit_target,hit_stop)");
    params.set("signal_time", `gte.${since}`);
    params.set("limit", "5000");
    params.set("order", "signal_time.desc");

    if (filters.formation) params.set("formation_name", `eq.${filters.formation}`);
    if (filters.market) params.set("market", `eq.${filters.market}`);
    if (filters.symbol) params.set("symbol", `eq.${filters.symbol}`);
    if (filters.bias) params.set("formation_bias", `eq.${filters.bias}`);

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

  const totalReturn =
    winPercents.reduce((a, b) => a + b, 0) +
    lossPercents.reduce((a, b) => a + b, 0);

  // Expectancy: ortalama kazanç * kazanma oranı + ortalama kayıp * kaybetme oranı
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

// Mevcut filtre seçeneklerini topla (formasyon, market, symbol listesi)
function collectFilterOptions(signals: SignalRow[]) {
  const formations = new Set<string>();
  const markets = new Set<string>();
  const symbols = new Set<string>();

  for (const s of signals) {
    if (s.formation_name) formations.add(s.formation_name);
    if (s.market) markets.add(s.market);
    if (s.symbol) symbols.add(s.symbol);
  }

  return {
    formations: Array.from(formations).sort(),
    markets: Array.from(markets).sort(),
    symbols: Array.from(symbols).sort(),
  };
}

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Kullanıcı kontrolü (header'dan userId al)
    const headers = request.headers;
    let userId = "";
    if (headers && typeof headers.get === "function") {
      userId = headers.get("x-user-id") || "";
    } else if (headers) {
      userId = headers["x-user-id"] || "";
    }

    const tier = await getUserTier(userId);

    // 2. Free kullanıcılar göremez
    if (tier === "free") {
      return response.status(403).json({
        success: false,
        error: "Premium gerekli",
        message: "Formasyon başarı istatistiklerini görmek için premium'a geçin.",
        tier,
      });
    }

    // 3. Filtreleri oku
    const daysParam = Number(request.query?.["days"] ?? 30);
    const days = Number.isFinite(daysParam)
      ? Math.min(Math.max(daysParam, 1), 365)
      : 30;

    const formation = request.query?.["formation"] || undefined;
    const market = request.query?.["market"] || undefined;
    const symbol = request.query?.["symbol"] || undefined;
    const bias = request.query?.["bias"] || undefined;

    const filters = { days, formation, market, symbol, bias };

    // 4. Veriyi çek
    const signals = await fetchSignals(filters);

    // 5. İstatistikleri hesapla
    const general = calculateStats(signals);

    // Formasyon bazlı
    const byFormationMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byFormationMap.get(s.formation_name) ?? [];
      list.push(s);
      byFormationMap.set(s.formation_name, list);
    }
    const byFormation = Array.from(byFormationMap.entries())
      .map(([name, sigs]) => ({ name, ...calculateStats(sigs) }))
      .sort((a, b) => b.total - a.total);

    // Sembol bazlı
    const bySymbolMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = bySymbolMap.get(s.symbol) ?? [];
      list.push(s);
      bySymbolMap.set(s.symbol, list);
    }
    const bySymbol = Array.from(bySymbolMap.entries())
      .map(([sym, sigs]) => ({
        symbol: sym,
        market: sigs[0]?.market ?? "",
        ...calculateStats(sigs),
      }))
      .filter((s) => s.total >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);

    // Market bazlı
    const byMarketMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byMarketMap.get(s.market) ?? [];
      list.push(s);
      byMarketMap.set(s.market, list);
    }
    const byMarket = Array.from(byMarketMap.entries())
      .map(([mkt, sigs]) => ({ market: mkt, ...calculateStats(sigs) }))
      .sort((a, b) => b.total - a.total);

    // Bias bazlı (AL/SAT)
    const byBiasMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byBiasMap.get(s.formation_bias) ?? [];
      list.push(s);
      byBiasMap.set(s.formation_bias, list);
    }
    const byBias = Array.from(byBiasMap.entries())
      .map(([b, sigs]) => ({ bias: b, ...calculateStats(sigs) }))
      .sort((a, b) => b.total - a.total);

    // Filtre seçenekleri (mevcut değerler)
    const filterOptions = collectFilterOptions(signals);

    return response.status(200).json({
      success: true,
      tier,
      filters: {
        days,
        formation: formation ?? null,
        market: market ?? null,
        symbol: symbol ?? null,
        bias: bias ?? null,
      },
      filterOptions,
      general,
      byFormation,
      bySymbol,
      byMarket,
      byBias,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Stats handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}