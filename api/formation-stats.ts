// api/formation-stats.ts
// Formasyon başarı istatistiklerini döndürür.
// Tier bazlı: Free (403), Premium (filtreli), Admin (tam + CSV export)

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
  send: (data: string) => unknown;
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

// ==========================================================
// YARDIMCILAR
// ==========================================================

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
}

function toSupabaseIn(values: string[]): string {
  return `in.(${values.map((v) => v.replace(/,/g, "")).join(",")})`;
}

// CSV hücresini güvenli hale getir
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // İçinde virgül, tırnak veya yeni satır varsa tırnak içine al
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Sinyal dizisini CSV string'e çevir
function toCsv(signals: SignalRow[]): string {
  const headers = [
    "symbol",
    "market",
    "formation_name",
    "formation_bias",
    "status",
    "result_percent",
    "signal_time",
  ];

  const lines: string[] = [];
  lines.push(headers.join(","));

  for (const s of signals) {
    lines.push(
      [
        csvCell(s.symbol),
        csvCell(s.market),
        csvCell(s.formation_name),
        csvCell(s.formation_bias),
        csvCell(s.status),
        csvCell(s.result_percent),
        csvCell(s.signal_time),
      ].join(","),
    );
  }

  // Excel'in Türkçe karakterleri doğru görmesi için BOM ekle
  return "\uFEFF" + lines.join("\r\n");
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
// SİNYALLERİ ÇEK (filtreli)
// ==========================================================

type Filters = {
  days: number;
  formations: string[];
  markets: string[];
  symbol?: string;
  bias?: string;
};

async function fetchSignals(filters: Filters): Promise<SignalRow[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const since = new Date(
      Date.now() - filters.days * 24 * 3600_000,
    ).toISOString();

    const params = new URLSearchParams();
    params.set(
      "select",
      "symbol,market,formation_name,formation_bias,status,result_percent,signal_time",
    );
    params.set("status", "in.(hit_target,hit_stop)");
    params.set("signal_time", `gte.${since}`);
    params.set("limit", "5000");
    params.set("order", "signal_time.desc");

    if (filters.formations.length === 1) {
      params.set("formation_name", `eq.${filters.formations[0]}`);
    } else if (filters.formations.length > 1) {
      params.set("formation_name", toSupabaseIn(filters.formations));
    }

    if (filters.markets.length === 1) {
      params.set("market", `eq.${filters.markets[0]}`);
    } else if (filters.markets.length > 1) {
      params.set("market", toSupabaseIn(filters.markets));
    }

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

// ==========================================================
// FİLTRE SEÇENEKLERİ
// ==========================================================

async function fetchFilterOptions(days: number): Promise<{
  formations: string[];
  markets: string[];
  symbols: string[];
  biases: string[];
}> {
  const empty = {
    formations: [] as string[],
    markets: [] as string[],
    symbols: [] as string[],
    biases: [] as string[],
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return empty;

  try {
    const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

    const params = new URLSearchParams();
    params.set("select", "formation_name,market,symbol,formation_bias");
    params.set("status", "in.(hit_target,hit_stop)");
    params.set("signal_time", `gte.${since}`);
    params.set("limit", "10000");

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/formation_signals?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return empty;

    const rows = (await res.json()) as Array<{
      formation_name: string;
      market: string;
      symbol: string;
      formation_bias: string;
    }>;

    const formations = new Set<string>();
    const markets = new Set<string>();
    const symbols = new Set<string>();
    const biases = new Set<string>();

    for (const r of rows) {
      if (r.formation_name) formations.add(r.formation_name);
      if (r.market) markets.add(r.market);
      if (r.symbol) symbols.add(r.symbol);
      if (r.formation_bias) biases.add(r.formation_bias);
    }

    return {
      formations: Array.from(formations).sort(),
      markets: Array.from(markets).sort(),
      symbols: Array.from(symbols).sort(),
      biases: Array.from(biases).sort(),
    };
  } catch {
    return empty;
  }
}

// ==========================================================
// İSTATİSTİK HESAPLA
// ==========================================================

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
// HANDLER
// ==========================================================

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET") {
    response.setHeader("Content-Type", "application/json");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. Kullanıcı
    const headers = request.headers;
    let userId = "";
    if (headers && typeof headers.get === "function") {
      userId = headers.get("x-user-id") || "";
    } else if (headers) {
      userId = headers["x-user-id"] || "";
    }

    const tier = await getUserTier(userId);

    if (tier === "free") {
      response.setHeader("Content-Type", "application/json");
      return response.status(403).json({
        success: false,
        error: "Premium gerekli",
        message:
          "Formasyon başarı istatistiklerini görmek için premium'a geçin.",
        tier,
      });
    }

    // 2. Filtreleri oku
    const daysParam = Number(
      Array.isArray(request.query?.["days"])
        ? request.query?.["days"]?.[0]
        : request.query?.["days"] ?? 30,
    );
    const days = Number.isFinite(daysParam)
      ? Math.min(Math.max(daysParam, 1), 365)
      : 30;

    const formations = asArray(request.query?.["formation"]);
    const markets = asArray(request.query?.["market"]);
    const symbolRaw = request.query?.["symbol"];
    const biasRaw = request.query?.["bias"];
    const formatRaw = request.query?.["format"];

    const symbol = Array.isArray(symbolRaw)
      ? symbolRaw[0]?.trim() || undefined
      : symbolRaw?.trim() || undefined;
    const bias = Array.isArray(biasRaw)
      ? biasRaw[0]?.trim() || undefined
      : biasRaw?.trim() || undefined;
    const format = Array.isArray(formatRaw)
      ? formatRaw[0]?.trim() || ""
      : formatRaw?.trim() || "";

    const filters: Filters = { days, formations, markets, symbol, bias };

    // ==========================================================
    // CSV EXPORT (sadece admin)
    // ==========================================================
    if (format === "csv") {
      if (tier !== "admin") {
        response.setHeader("Content-Type", "application/json");
        return response.status(403).json({
          success: false,
          error: "CSV export sadece admin için",
          tier,
        });
      }

      const signals = await fetchSignals(filters);
      const csv = toCsv(signals);

      const filename = `formasyon-istatistikleri-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      return response.send(csv);
    }

    // ==========================================================
    // JSON (mevcut davranış)
    // ==========================================================
    response.setHeader("Content-Type", "application/json");

    const [signals, filterOptions] = await Promise.all([
      fetchSignals(filters),
      fetchFilterOptions(days),
    ]);

    const general = calculateStats(signals);

    const byFormationMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byFormationMap.get(s.formation_name) ?? [];
      list.push(s);
      byFormationMap.set(s.formation_name, list);
    }
    const byFormation = Array.from(byFormationMap.entries())
      .map(([name, sigs]) => ({ name, ...calculateStats(sigs) }))
      .sort((a, b) => b.total - a.total);

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

    const byMarketMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byMarketMap.get(s.market) ?? [];
      list.push(s);
      byMarketMap.set(s.market, list);
    }
    const byMarket = Array.from(byMarketMap.entries())
      .map(([mkt, sigs]) => ({ market: mkt, ...calculateStats(sigs) }))
      .sort((a, b) => b.total - a.total);

    const byBiasMap = new Map<string, SignalRow[]>();
    for (const s of signals) {
      const list = byBiasMap.get(s.formation_bias) ?? [];
      list.push(s);
      byBiasMap.set(s.formation_bias, list);
    }
    const byBias = Array.from(byBiasMap.entries())
      .map(([b, sigs]) => ({ bias: b, ...calculateStats(sigs) }))
      .sort((a, b) => b.total - a.total);

    return response.status(200).json({
      success: true,
      tier,
      filters: {
        days,
        formations,
        markets,
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
    response.setHeader("Content-Type", "application/json");
    return response.status(500).json({ success: false, error: message });
  }
}