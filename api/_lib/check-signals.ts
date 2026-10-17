// api/check-signals.ts
// Bekleyen sinyalleri kontrol eder ve sonuçlandırır.
// Vercel cron / harici cron tarafından çağrılır.
// OPTIMIZE EDİLDİ: Toplu fiyat çekme + paralel işleme + cache

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

type PendingSignal = {
  id: string;
  symbol: string;
  market: string;
  formation_bias: string;
  entry_price: number;
  target_price: number;
  stop_price: number;
  signal_time: string;
};

// ==========================================================
// YETKİLENDİRME
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
// TOPLU FİYAT ÇEKME (Binance)
// ==========================================================

async function fetchAllCryptoPrices(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price");
    if (!res.ok) return map;
    const data = (await res.json()) as Array<{ symbol: string; price: string }>;
    for (const item of data) {
      const price = Number(item.price);
      if (Number.isFinite(price)) {
        map.set(item.symbol, price);
      }
    }
  } catch (err) {
    console.error("Binance toplu fiyat hatası:", err);
  }
  return map;
}

// ==========================================================
// HİSSE FİYAT ÇEKME (Yahoo, paralel)
// ==========================================================

async function fetchStockPrice(symbol: string): Promise<number | null> {
  try {
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

// Paralel hisse fiyat çekme (10'arlı gruplar)
async function fetchStockPricesParallel(
  symbols: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const CONCURRENCY = 10;

  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sym) => {
        const price = await fetchStockPrice(sym);
        return { sym, price };
      }),
    );
    for (const r of results) {
      if (r.price !== null) map.set(r.sym, r.price);
    }
  }

  return map;
}

// ==========================================================
// SUPABASE
// ==========================================================

async function fetchPendingSignals(): Promise<PendingSignal[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/formation_signals?status=eq.pending&select=id,symbol,market,formation_bias,entry_price,target_price,stop_price,signal_time&limit=200`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as PendingSignal[];
  } catch {
    return [];
  }
}

async function updateSignals(
  updates: Array<{
    id: string;
    status: string;
    resultPrice: number;
    resultPercent: number;
  }>,
): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return 0;
  if (updates.length === 0) return 0;

  // Toplu PATCH (Supabase desteklemez, tek tek paralel yapalım)
  const CONCURRENCY = 10;
  let successCount = 0;

  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (u) => {
        try {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/formation_signals?id=eq.${u.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                status: u.status,
                result_price: u.resultPrice,
                result_percent: u.resultPercent,
                result_time: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }),
            },
          );
          return res.ok;
        } catch {
          return false;
        }
      }),
    );
    successCount += results.filter(Boolean).length;
  }

  return successCount;
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
    const signals = await fetchPendingSignals();
    console.log(`🔍 ${signals.length} pending sinyal kontrol ediliyor...`);

    if (signals.length === 0) {
      return response.status(200).json({
        success: true,
        checked: 0,
        hitTarget: 0,
        hitStop: 0,
        expired: 0,
        stillPending: 0,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 1. ADIM: TÜM FİYATLARI TOPLU ÇEK
    // ═══════════════════════════════════════════════════════════

    const cryptoSymbols = signals
      .filter((s) => s.market === "crypto")
      .map((s) => s.symbol);
    const stockSymbols = [
      ...new Set(
        signals
          .filter((s) => s.market !== "crypto")
          .map((s) => s.symbol),
      ),
    ];

    console.log(
      `💰 ${cryptoSymbols.length} kripto + ${stockSymbols.length} hisse fiyatı çekiliyor...`,
    );

    const [cryptoPrices, stockPrices] = await Promise.all([
      fetchAllCryptoPrices(),
      fetchStockPricesParallel(stockSymbols),
    ]);

    console.log(
      `✅ Fiyatlar alındı: ${cryptoPrices.size} kripto, ${stockPrices.size} hisse`,
    );

    // ═══════════════════════════════════════════════════════════
    // 2. ADIM: SİNYALLERİ DEĞERLENDİR
    // ═══════════════════════════════════════════════════════════

    const now = Date.now();
    const MAX_AGE_HOURS = 24 * 7; // 7 gün
    const updates: Array<{
      id: string;
      status: string;
      resultPrice: number;
      resultPercent: number;
    }> = [];

    let hitTarget = 0;
    let hitStop = 0;
    let expired = 0;
    let stillPending = 0;

    for (const signal of signals) {
      try {
        // Yaş kontrolü
        const signalTime = new Date(signal.signal_time).getTime();
        const ageHours = (now - signalTime) / (1000 * 60 * 60);

        if (ageHours > MAX_AGE_HOURS) {
          updates.push({
            id: signal.id,
            status: "expired",
            resultPrice: 0,
            resultPercent: 0,
          });
          expired++;
          continue;
        }

        // Fiyatı map'ten oku
        const currentPrice =
          signal.market === "crypto"
            ? cryptoPrices.get(signal.symbol)
            : stockPrices.get(signal.symbol);

        if (currentPrice === undefined || currentPrice === null) {
          stillPending++;
          continue;
        }

        const entry = Number(signal.entry_price);
        const target = Number(signal.target_price);
        const stop = Number(signal.stop_price);
        const bias = signal.formation_bias;

        let newStatus: string | null = null;
        let resultPercent = 0;

        if (bias === "yükseliş") {
          if (currentPrice >= target) {
            newStatus = "hit_target";
            resultPercent = ((currentPrice - entry) / entry) * 100;
            hitTarget++;
          } else if (currentPrice <= stop) {
            newStatus = "hit_stop";
            resultPercent = ((currentPrice - entry) / entry) * 100;
            hitStop++;
          } else {
            stillPending++;
          }
        } else if (bias === "düşüş") {
          if (currentPrice <= target) {
            newStatus = "hit_target";
            resultPercent = ((entry - currentPrice) / entry) * 100;
            hitTarget++;
          } else if (currentPrice >= stop) {
            newStatus = "hit_stop";
            resultPercent = ((entry - currentPrice) / entry) * 100;
            hitStop++;
          } else {
            stillPending++;
          }
        } else {
          stillPending++;
        }

        if (newStatus) {
          updates.push({
            id: signal.id,
            status: newStatus,
            resultPrice: currentPrice,
            resultPercent,
          });
        }
      } catch (err) {
        console.error(`Sinyal hatası (${signal.id}):`, err);
        stillPending++;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. ADIM: TOPLU GÜNCELLE
    // ═══════════════════════════════════════════════════════════

    const updatedCount = await updateSignals(updates);
    console.log(`💾 ${updatedCount} sinyal güncellendi.`);

    const duration = Date.now() - startTime;
    console.log(`⏱️ Toplam süre: ${duration}ms`);

    return response.status(200).json({
      success: true,
      checked: signals.length,
      updated: updatedCount,
      hitTarget,
      hitStop,
      expired,
      stillPending,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Cron handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}