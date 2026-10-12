// api/check-signals.ts
// Bekleyen sinyalleri kontrol eder ve sonuçlandırır.
// Her saat başı çalışır (Vercel cron).

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

// Vercel cron header'ı veya Authorization Bearer token kontrolü
function authorized(request: RequestLike): boolean {
  if (!CRON_SECRET) return true; // Secret yoksa herkese izin ver (test için)

  // Vercel cron header
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

// Binance'ten güncel fiyat çek (kripto)
async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { price?: string };
    return data.price ? Number(data.price) : null;
  } catch {
    return null;
  }
}

// Yahoo Finance'ten güncel fiyat çek (hisse)
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

async function getCurrentPrice(symbol: string, market: string): Promise<number | null> {
  if (market === "crypto") {
    return fetchCryptoPrice(symbol);
  }
  return fetchStockPrice(symbol);
}

// Supabase'den pending sinyalleri çek
async function fetchPendingSignals(): Promise<PendingSignal[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/formation_signals?status=eq.pending&select=id,symbol,market,formation_bias,entry_price,target_price,stop_price,signal_time&limit=500`,
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

// Sinyali güncelle
async function updateSignal(
  id: string,
  status: string,
  resultPrice: number,
  resultPercent: number,
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/formation_signals?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status,
          result_price: resultPrice,
          result_percent: resultPercent,
          result_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Ana handler
export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");

  if (!authorized(request)) {
    return response.status(401).json({ error: "unauthorized" });
  }

  try {
    const signals = await fetchPendingSignals();
    console.log(`🔍 ${signals.length} pending sinyal kontrol ediliyor...`);

    let hitTarget = 0;
    let hitStop = 0;
    let expired = 0;
    let stillPending = 0;

    const MAX_AGE_HOURS = 24 * 7; // 7 gün
    const now = Date.now();

    for (const signal of signals) {
      try {
        // Yaş kontrolü (7 günden eski mi?)
        const signalTime = new Date(signal.signal_time).getTime();
        const ageHours = (now - signalTime) / (1000 * 60 * 60);

        if (ageHours > MAX_AGE_HOURS) {
          // Süresi geçmiş → expired
          await updateSignal(signal.id, "expired", 0, 0);
          expired++;
          continue;
        }

        // Güncel fiyatı al
        const currentPrice = await getCurrentPrice(signal.symbol, signal.market);
        if (currentPrice === null) {
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
          // AL sinyali: hedef yukarıda, stop aşağıda
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
          // SAT sinyali: hedef aşağıda, stop yukarıda
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
          await updateSignal(signal.id, newStatus, currentPrice, resultPercent);
          console.log(
            `✅ ${signal.symbol}: ${newStatus} (%${resultPercent.toFixed(2)})`,
          );
        }
      } catch (err) {
        console.error(`Sinyal hatası (${signal.id}):`, err);
        stillPending++;
      }
    }

    return response.status(200).json({
      success: true,
      checked: signals.length,
      hitTarget,
      hitStop,
      expired,
      stillPending,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Cron handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}