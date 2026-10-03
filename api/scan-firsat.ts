// api/scan-firsat.ts — Gelişmiş Piyasa Tarama Motoru v3

import { RSI, MACD, EMA, BollingerBands, ADX } from "technicalindicators";
import { getNewsForSymbol } from "../src/lib/news";
import { generateCommentary, type AiCommentary } from "../src/lib/ai-commentary";
import { computeSignalScore, type SignalScoreResult } from "../src/lib/signal-score";

// ==========================================================
// TİPLER
// ==========================================================

type RequestLike = {
  method?: string;
  body?: any;
  query?: Record<string, any>;
};

type ResponseLike = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ResponseLike;
  json: (data: unknown) => unknown;
  end: () => unknown;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type IndicatorSignal = {
  name: string;
  value: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
};

type PatternSignal = {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  description: string;
};

type AnalysisResult = {
  symbol: string;
  market: string;
  price: number;
  changePercent: number;
  indicators: IndicatorSignal[];
  patterns: PatternSignal[];
  overallDirection: "bullish" | "bearish" | "neutral";
  overallStrength: number;
  isImportant: boolean;
  news?: Array<{
    title: string;
    url?: string;
    source: string;
    sentiment: string;
    sentimentScore: number;
    publishedAt: string;
  }>;
  signalScore?: SignalScoreResult;
  ai?: AiCommentary;
};

type CustomAsset = {
  user_id: string;
  market: string;
  symbol: string;
};

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

// ==========================================================
// CACHE
// ==========================================================

async function getFromCache<T>(key: string): Promise<T | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/market_cache?cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${new Date().toISOString()}&select=data`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ data: T }>;
    return rows[0]?.data ?? null;
  } catch {
    return null;
  }
}

async function setToCache(key: string, data: unknown, ttlMinutes: number) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/market_cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ cache_key: key, data, expires_at: expiresAt }),
    });
  } catch (error) {
    console.error("Cache yazma hatası:", error);
  }
}

async function getCryptoCandles(symbol: string): Promise<Candle[]> {
  const cacheKey = `binance:${symbol}:1h`;
  const cached = await getFromCache<Candle[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=200`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const raw = (await response.json()) as unknown[][];
    const candles: Candle[] = raw.map((k) => ({
      time: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
    await setToCache(cacheKey, candles, 10);
    return candles;
  } catch {
    return [];
  }
}

async function getStockCandles(symbol: string): Promise<Candle[]> {
  const cacheKey = `stooq:${symbol}:1d`;
  const cached = await getFromCache<Candle[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const url = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" },
    });
    if (!response.ok) return [];
    const csv = await response.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 3) return [];
    const candles: Candle[] = lines
      .slice(1)
      .map((line) => {
        const parts = line.split(",");
        const dateStr = parts[0] ?? "";
        const ts = new Date(dateStr).getTime();
        return {
          time: Number.isFinite(ts) ? ts : Date.now(),
          open: Number(parts[1] ?? 0),
          high: Number(parts[2] ?? 0),
          low: Number(parts[3] ?? 0),
          close: Number(parts[4] ?? 0),
          volume: Number(parts[5] ?? 0),
        };
      })
      .filter((c) => Number.isFinite(c.close))
      .slice(-100);
    await setToCache(cacheKey, candles, 60 * 24);
    return candles;
  } catch {
    return [];
  }
}

async function getTopCryptoSymbols(limit = 100): Promise<string[]> {
  const cacheKey = `binance:top:${limit}`;
  const cached = await getFromCache<string[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const response = await fetch("https://api.binance.com/api/v3/exchangeInfo");
    if (!response.ok) return [];
    const data = (await response.json()) as {
      symbols?: Array<{ symbol?: string; status?: string; quoteAsset?: string }>;
    };
    const symbols = (data.symbols ?? [])
      .filter(
        (item) =>
          item.status === "TRADING" &&
          item.quoteAsset === "USDT" &&
          typeof item.symbol === "string" &&
          !item.symbol.includes("UP") &&
          !item.symbol.includes("DOWN") &&
          !item.symbol.includes("BULL") &&
          !item.symbol.includes("BEAR"),
      )
      .map((item) => item.symbol as string)
      .slice(0, limit);
    await setToCache(cacheKey, symbols, 60);
    return symbols;
  } catch {
    return [];
  }
}

const BIST_TOP_50 = [
  "THYAO", "ASELS", "TUPRS", "BIMAS", "GARAN", "AKBNK", "ISCTR", "YKBNK",
  "KCHOL", "SAHOL", "SISE", "EREGL", "PETKM", "FROTO", "TOASO", "TAVHL",
  "TCELL", "MGROS", "ENKAI", "HEKTS", "SASA", "PGSUS", "AEFES", "ULKER",
  "DOAS", "KOZAL", "KRDMD", "ALARK", "CCOLA", "OYAKC", "ASTOR", "KONTR",
  "MIATK", "GUBRF", "VESTL", "ARCLK", "TKFEN", "ENJSA", "CIMSA", "ALBRK",
  "VAKBN", "HALKB", "TSKB", "ODAS", "IPEKE", "KRDMA", "KARSN", "AKSA",
  "ISMEN", "MPARK", "AGHOL", "ANACM", "ANHYT", "ARSAN", "BERA", "BRISA",
  "BRYAT", "CANTE", "CLEBI", "DEVA", "ECILC", "EGEEN", "EKGYO", "ENERY",
  "GESAN", "GLYHO", "GOZDE", "GSDHO", "HLGYO", "INDES", "ISDMR", "ISGYO",
  "IZMDC", "KAREL", "KAYSE", "KLGYO", "KLMSN", "LOGO", "MAVI", "NTHOL",
  "OTKAR", "PARSN", "RALYH", "RTALB", "SANEL", "SELEC", "SNGYO", "SOKM",
  "TATGD", "TKNSA", "TRGYO", "TTKOM", "TTRAK", "VERUS", "YATAS", "ZOREN",
  "BIEN", "BRSAN", "DGNMO", "IEYHO", "KRVGD", "SDTTR",
].map((s) => `${s}.IS`);

const US_TOP_25 = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA",
  "BRK-B", "JPM", "WMT", "ORCL", "LLY", "V", "MA", "XOM", "COST",
  "NFLX", "AMD", "CRM", "QCOM", "CSCO", "IBM", "NOW", "PLTR", "MU",
  "AMAT", "TXN", "INTU", "CAT", "GE", "BA", "MCD", "KO", "PEP",
  "DIS", "NKE", "SBUX", "TMO", "ABBV", "JNJ", "MRK", "PFE", "UNH",
  "CVX", "COP", "GS", "MS", "BAC", "UBER",
].map((s) => `${s}.US`);

const ASIA_TOP_50 = [
  "7203.T", "6758.T", "9984.T", "6861.T", "8306.T", "8035.T", "9432.T",
  "6501.T", "6098.T", "4063.T", "4502.T", "7267.T", "9433.T", "6902.T",
  "2914.T", "8058.T", "8001.T", "8031.T", "8766.T", "7974.T",
  "005930.KS", "000660.KS", "035420.KS", "035720.KS", "005380.KS",
  "012330.KS", "105560.KS", "055550.KS", "051910.KS", "066570.KS",
  "0700.HK", "9988.HK", "3690.HK", "0941.HK", "1810.HK", "1299.HK",
  "2318.HK", "0005.HK", "9618.HK", "1024.HK",
  "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
  "BHARTIARTL.NS", "ITC.NS", "SBIN.NS", "HINDUNILVR.NS", "LT.NS",
];

const EUROPE_TOP_50 = [
  "SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "AIR.PA", "ASML.AS",
  "NESN.SW", "ROG.SW", "NOVN.SW", "NOVO-B.CO", "SHEL.L", "AZN.L",
  "HSBA.L", "ULVR.L", "BP.L", "GSK.L", "RIO.L", "LSEG.L", "REL.L",
  "VOD.L", "LVMH.PA", "TTE.PA", "OR.PA", "SAN.PA", "MC.PA",
  "SU.PA", "BNP.PA", "AI.PA", "SAF.PA", "CS.PA", "ENEL.MI",
  "ENI.MI", "ISP.MI", "UCG.MI", "STLAM.MI", "IBE.MC", "ITX.MC",
  "SAN.MC", "BBVA.MC", "REP.MC", "INGA.AS", "ADYEN.AS", "PHIA.AS",
  "HEIA.AS", "UNA.AS", "VOLV-B.ST", "ERIC-B.ST", "EQNR.OL", "NOKIA.HE",
  "DSV.V",
];
// ==========================================================
// İNDİKATÖR ANALİZİ
// ==========================================================

function analyzeIndicators(candles: Candle[]): IndicatorSignal[] {
  const signals: IndicatorSignal[] = [];
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  if (closes.length < 50) return signals;

  try {
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const rsi = rsiValues[rsiValues.length - 1];
    if (rsi !== undefined) {
      if (rsi >= 70) {
        signals.push({
          name: "RSI",
          value: rsi.toFixed(1),
          direction: "bearish",
          strength: Math.min(100, (rsi - 70) * 3 + 60),
        });
      } else if (rsi <= 30) {
        signals.push({
          name: "RSI",
          value: rsi.toFixed(1),
          direction: "bullish",
          strength: Math.min(100, (30 - rsi) * 3 + 60),
        });
      }
    }
  } catch {}

  try {
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    if (macdValues.length >= 2) {
      const cur = macdValues[macdValues.length - 1];
      const prev = macdValues[macdValues.length - 2];
      if (cur && prev && cur.MACD && prev.MACD && cur.signal && prev.signal) {
        const crossedUp = prev.MACD <= prev.signal && cur.MACD > cur.signal;
        const crossedDown = prev.MACD >= prev.signal && cur.MACD < cur.signal;
        if (crossedUp) {
          signals.push({ name: "MACD", value: "Al Kesişimi", direction: "bullish", strength: 75 });
        } else if (crossedDown) {
          signals.push({ name: "MACD", value: "Sat Kesişimi", direction: "bearish", strength: 75 });
        }
      }
    }
  } catch {}

  try {
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    const ema200 = EMA.calculate({ values: closes, period: 200 });
    if (ema50.length >= 2 && ema200.length >= 2) {
      const c50 = ema50[ema50.length - 1];
      const c200 = ema200[ema200.length - 1];
      const p50 = ema50[ema50.length - 2];
      const p200 = ema200[ema200.length - 2];
      if (c50 && c200 && p50 && p200) {
        if (p50 <= p200 && c50 > c200) {
          signals.push({ name: "EMA", value: "Golden Cross", direction: "bullish", strength: 90 });
        } else if (p50 >= p200 && c50 < c200) {
          signals.push({ name: "EMA", value: "Death Cross", direction: "bearish", strength: 90 });
        }
      }
    }
  } catch {}

  try {
    const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
    if (bb.length > 0) {
      const last = bb[bb.length - 1];
      const lastClose = closes[closes.length - 1];
      if (last && last.upper && last.lower && lastClose !== undefined) {
        if (lastClose > last.upper) {
          signals.push({ name: "Bollinger", value: "Üst Bant", direction: "bearish", strength: 65 });
        } else if (lastClose < last.lower) {
          signals.push({ name: "Bollinger", value: "Alt Bant", direction: "bullish", strength: 65 });
        }
      }
    }
  } catch {}

  try {
    const adxValues = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    if (adxValues.length > 0) {
      const last = adxValues[adxValues.length - 1];
      if (last && last.adx && last.adx > 40) {
        signals.push({ name: "ADX", value: last.adx.toFixed(1), direction: "neutral", strength: 60 });
      }
    }
  } catch {}

  try {
    if (volumes.length >= 20) {
      const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const currentVolume = volumes[volumes.length - 1];
      if (avgVolume > 0 && currentVolume !== undefined && currentVolume > avgVolume * 2) {
        signals.push({
          name: "Hacim",
          value: `${(currentVolume / avgVolume).toFixed(1)}x`,
          direction: "neutral",
          strength: 70,
        });
      }
    }
  } catch {}

  return signals;
}

// ==========================================================
// FORMASYON ANALİZİ
// ==========================================================

function analyzePatterns(candles: Candle[]): PatternSignal[] {
  const patterns: PatternSignal[] = [];
  if (candles.length < 30) return patterns;
  const closes = candles.map((c) => c.close);

  try {
    const recent = candles.slice(-30);
    const recentLows = recent.map((c) => c.low);
    const minLow = Math.min(...recentLows);
    const minIndex = recentLows.indexOf(minLow);
    if (minIndex >= 0 && minIndex < 15) {
      const secondHalf = recentLows.slice(15);
      const secondMin = Math.min(...secondHalf);
      const diff = Math.abs(minLow - secondMin) / minLow;
      if (diff < 0.03 && secondMin > minLow * 0.97) {
        const currentClose = closes[closes.length - 1];
        if (currentClose !== undefined && currentClose > minLow * 1.02) {
          patterns.push({ name: "İkili Dip", direction: "bullish", confidence: 75, description: "İki dip oluştu" });
        }
      }
    }
  } catch {}

  try {
    const recent = candles.slice(-30);
    const recentHighs = recent.map((c) => c.high);
    const maxHigh = Math.max(...recentHighs);
    const maxIndex = recentHighs.indexOf(maxHigh);
    if (maxIndex >= 0 && maxIndex < 15) {
      const secondHalf = recentHighs.slice(15);
      const secondMax = Math.max(...secondHalf);
      const diff = Math.abs(maxHigh - secondMax) / maxHigh;
      if (diff < 0.03 && secondMax < maxHigh * 1.03) {
        const currentClose = closes[closes.length - 1];
        if (currentClose !== undefined && currentClose < maxHigh * 0.98) {
          patterns.push({ name: "İkili Tepe", direction: "bearish", confidence: 75, description: "İki tepe oluştu" });
        }
      }
    }
  } catch {}

  try {
    const recent = candles.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const firstHigh = Math.max(...highs.slice(0, 15));
    const secondHigh = Math.max(...highs.slice(15));
    const firstLow = Math.min(...lows.slice(0, 15));
    const secondLow = Math.min(...lows.slice(15));
    const highFlat = Math.abs(firstHigh - secondHigh) / firstHigh < 0.02;
    const lowRising = secondLow > firstLow * 1.02;
    if (highFlat && lowRising) {
      const currentClose = closes[closes.length - 1];
      if (currentClose !== undefined && currentClose > secondHigh * 0.99) {
        patterns.push({ name: "Yükselen Üçgen", direction: "bullish", confidence: 80, description: "Yatay direnç + yükselen dip" });
      }
    }
  } catch {}

  try {
    const recent = candles.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const firstHigh = Math.max(...highs.slice(0, 15));
    const secondHigh = Math.max(...highs.slice(15));
    const firstLow = Math.min(...lows.slice(0, 15));
    const secondLow = Math.min(...lows.slice(15));
    const highFalling = secondHigh < firstHigh * 0.98;
    const lowFlat = Math.abs(firstLow - secondLow) / firstLow < 0.02;
    if (highFalling && lowFlat) {
      const currentClose = closes[closes.length - 1];
      if (currentClose !== undefined && currentClose < secondLow * 1.01) {
        patterns.push({ name: "Düşen Üçgen", direction: "bearish", confidence: 80, description: "Düşen direnç + yatay destek" });
      }
    }
  } catch {}

  try {
    if (candles.length >= 40) {
      const recent = candles.slice(-40);
      const highs = recent.map((c) => c.high);
      const leftShoulder = Math.max(...highs.slice(0, 12));
      const head = Math.max(...highs.slice(12, 26));
      const rightShoulder = Math.max(...highs.slice(26, 40));
      if (head > leftShoulder * 1.02 && head > rightShoulder * 1.02) {
        const shoulderDiff = Math.abs(leftShoulder - rightShoulder) / leftShoulder;
        if (shoulderDiff < 0.03) {
          patterns.push({ name: "Omuz-Baş-Omuz", direction: "bearish", confidence: 85, description: "Klasik OBO" });
        }
      }
    }
  } catch {}

  try {
    if (candles.length >= 40) {
      const recent = candles.slice(-40);
      const lows = recent.map((c) => c.low);
      const leftShoulder = Math.min(...lows.slice(0, 12));
      const head = Math.min(...lows.slice(12, 26));
      const rightShoulder = Math.min(...lows.slice(26, 40));
      if (head < leftShoulder * 0.98 && head < rightShoulder * 0.98) {
        const shoulderDiff = Math.abs(leftShoulder - rightShoulder) / leftShoulder;
        if (shoulderDiff < 0.03) {
          patterns.push({ name: "Ters OBO", direction: "bullish", confidence: 85, description: "Ters OBO" });
        }
      }
    }
  } catch {}

  return patterns;
}

// ==========================================================
// ANALİZ BİRLEŞTİR
// ==========================================================

function combineAnalysis(
  symbol: string,
  market: string,
  candles: Candle[],
  indicators: IndicatorSignal[],
  patterns: PatternSignal[],
): AnalysisResult {
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const prevPrice = candles[candles.length - 2]?.close ?? currentPrice;
  const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

  let bullishScore = 0;
  let bearishScore = 0;
  for (const ind of indicators) {
    if (ind.direction === "bullish") bullishScore += ind.strength;
    else if (ind.direction === "bearish") bearishScore += ind.strength;
  }
  for (const pat of patterns) {
    if (pat.direction === "bullish") bullishScore += pat.confidence;
    else if (pat.direction === "bearish") bearishScore += pat.confidence;
  }

  const bullishCount =
    indicators.filter((i) => i.direction === "bullish").length +
    patterns.filter((p) => p.direction === "bullish").length;
  const bearishCount =
    indicators.filter((i) => i.direction === "bearish").length +
    patterns.filter((p) => p.direction === "bearish").length;

  const totalSignals = bullishCount + bearishCount;
  const overallStrength =
    totalSignals > 0
      ? Math.round((Math.max(bullishScore, bearishScore) / totalSignals) * 1.2)
      : 0;

  const overallDirection: "bullish" | "bearish" | "neutral" =
    bullishScore > bearishScore * 1.5
      ? "bullish"
      : bearishScore > bullishScore * 1.5
        ? "bearish"
        : "neutral";

  const isImportant =
    totalSignals >= 3 ||
    patterns.some((p) => p.confidence >= 80) ||
    indicators.some((i) => i.strength >= 85);

  return {
    symbol,
    market,
    price: currentPrice,
    changePercent,
    indicators,
    patterns,
    overallDirection,
    overallStrength: Math.min(100, overallStrength),
    isImportant,
  };
}

// ==========================================================
// KULLANICI VERİLERİ
// ==========================================================

async function getCustomAssets(): Promise<CustomAsset[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/custom_assets?select=user_id,market,symbol`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as CustomAsset[];
  } catch {
    return [];
  }
}

async function getUsersForSymbol(
  market: string,
  symbol: string,
): Promise<Array<{ user_id: string; type: "favorite" | "priority" }>> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const [favRes, priRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/favorites?select=user_id&market=eq.${market}&symbol=eq.${encodeURIComponent(symbol)}`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/priority_assets?select=user_id&market=eq.${market}&symbol=eq.${encodeURIComponent(symbol)}`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      ),
    ]);
    const result: Array<{ user_id: string; type: "favorite" | "priority" }> = [];
    if (favRes.ok) {
      const favs = (await favRes.json()) as Array<{ user_id: string }>;
      for (const f of favs) result.push({ user_id: f.user_id, type: "favorite" });
    }
    if (priRes.ok) {
      const pri = (await priRes.json()) as Array<{ user_id: string }>;
      for (const p of pri) {
        const existing = result.find((r) => r.user_id === p.user_id);
        if (existing) existing.type = "priority";
        else result.push({ user_id: p.user_id, type: "priority" });
      }
    }
    return result;
  } catch {
    return [];
  }
}

async function isOnCooldown(
  userId: string,
  symbol: string,
  market: string,
  type: "global" | "favorite" | "priority",
): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  const cooldownHours = type === "global" ? 1 : type === "priority" ? 2 : 4;
  const since = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?select=id&user_id=eq.${userId}&symbol=eq.${encodeURIComponent(symbol)}&market=eq.${market}&created_at=gt.${since}&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
}
// ==========================================================
// BİLDİRİM GÖNDER
// ==========================================================

async function sendNotification(params: {
  userId: string;
  market: string;
  symbol: string;
  type: "global" | "favorite" | "priority";
  analysis: AnalysisResult;
  isGlobal?: boolean;
}) {
  const { userId, market, symbol, type, analysis, isGlobal } = params;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

  const signalScore = analysis.signalScore;
  const ai = analysis.ai;
  if (!signalScore || !ai) {
    console.warn(`⚠️ ${symbol}: signalScore veya ai eksik`);
    return;
  }

  const priority = type === "priority";

  const severity =
    signalScore.tier === "critical"
      ? "kritik"
      : signalScore.tier === "important"
        ? "önemli"
        : "dikkat";

  const actionEmoji =
    ai.action === "AL"
      ? "🟢"
      : ai.action === "SAT"
        ? "🔴"
        : ai.action === "BEKLE"
          ? "🟡"
          : "⚪";

  const typeLabel = isGlobal
    ? "🌍 GLOBAL"
    : priority
      ? "⭐ ÖNCELİKLİ"
      : "📢 FAVORİ";

  const cleanSymbol = symbol
    .replace("USDT", "")
    .replace(/\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/, "");

  const title = `${typeLabel} | ${cleanSymbol}`;
  const message = `${actionEmoji} ${ai.action} | ${ai.summary}`;
  const reason = signalScore.reason;

  const eventKey = [
    type,
    market,
    symbol,
    analysis.overallDirection,
    Math.floor(analysis.overallStrength / 10),
    signalScore.tier,
    new Date().toISOString().slice(0, 13),
  ].join("|");

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        market,
        symbol,
        type: analysis.patterns.length > 0 ? "formation" : "indicator",
        priority,
        severity,
        title,
        message,
        reason,
        event_key: eventKey,
        notification_type: type,
        confidence: ai.confidence,
        is_global: isGlobal ?? false,
        signal_score: signalScore.score,
        signal_breakdown: signalScore.breakdown,
        ai_summary: ai.summary,
        ai_impact: ai.impact,
        ai_action: ai.action,
        ai_sentiment: ai.sentiment,
        ai_confidence: ai.confidence,
        ai_source: ai.source,
        ai_generated_at: new Date().toISOString(),
        news_items: analysis.news ?? [],
        data: {
          indicators: analysis.indicators,
          patterns: analysis.patterns,
          direction: analysis.overallDirection,
          changePercent: analysis.changePercent,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Bildirim hatası (${symbol}):`, res.status, err);
    } else {
      console.log(
        `✅ ${typeLabel} → ${symbol} → score=${signalScore.score} → ${ai.action} (${ai.source})`,
      );
    }
  } catch (error) {
    console.error("Bildirim fetch hatası:", error);
  }
}

// ==========================================================
// TEK VARLIK ANALİZİ
// ==========================================================

async function analyzeSymbol(
  symbol: string,
  market: string,
): Promise<AnalysisResult | null> {
  try {
    const candles =
      market === "crypto"
        ? await getCryptoCandles(symbol)
        : await getStockCandles(symbol);

    if (candles.length < 50) return null;

    const indicators = analyzeIndicators(candles);
    const patterns = analyzePatterns(candles);

    if (indicators.length === 0 && patterns.length === 0) return null;

    const baseResult = combineAnalysis(symbol, market, candles, indicators, patterns);

    let news: AnalysisResult["news"] = [];
    if (baseResult.isImportant) {
      news = await getNewsForSymbol(market, symbol);
    }

    return { ...baseResult, news };
  } catch (error) {
    console.error(`Analiz hatası (${symbol}):`, error);
    return null;
  }
}

// ==========================================================
// PARALEL TARAMA
// ==========================================================

async function scanSymbolsParallel(
  symbols: Array<{ symbol: string; market: string }>,
  concurrency = 10,
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((s) => analyzeSymbol(s.symbol, s.market)),
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

// ==========================================================
// ANA HANDLER
// ==========================================================

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(200).end();
  }

  try {
    if (request.method !== "GET") {
      return response
        .status(405)
        .json({ success: false, error: "Sadece GET desteklenir" });
    }

    const typeParam = String(request.query?.["type"] ?? "all");
    const regionParam = String(request.query?.["region"] ?? "all");

    console.log(`🔍 Tarama başladı: type=${typeParam}, region=${regionParam}`);

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_expired_cache`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
    } catch {}

    const assets: Array<{ symbol: string; market: string }> = [];

    if (typeParam === "all" || typeParam === "crypto") {
      const cryptoSymbols = await getTopCryptoSymbols(100);
      for (const s of cryptoSymbols) {
        assets.push({ symbol: s, market: "crypto" });
      }
    }

    if (typeParam === "all" || typeParam === "stocks") {
      if (regionParam === "all" || regionParam === "bist") {
        for (const s of BIST_TOP_50) {
          assets.push({ symbol: s, market: "bist" });
        }
      }
      if (regionParam === "all" || regionParam === "us") {
        for (const s of US_TOP_25) {
          assets.push({ symbol: s, market: "us" });
        }
      }
      if (regionParam === "all" || regionParam === "asia") {
        for (const s of ASIA_TOP_50) {
          assets.push({ symbol: s, market: "asia" });
        }
      }
      if (regionParam === "all" || regionParam === "europe") {
        for (const s of EUROPE_TOP_50) {
          assets.push({ symbol: s, market: "europe" });
        }
      }
    }

    const customAssets = await getCustomAssets();
    for (const c of customAssets) {
      const exists = assets.some(
        (a) => a.symbol === c.symbol && a.market === c.market,
      );
      if (!exists) {
        assets.push({ symbol: c.symbol, market: c.market });
      }
    }

    console.log(`📊 ${assets.length} varlık taranacak.`);

    const results = await scanSymbolsParallel(assets, 10);
    const importantResults = results.filter((r) => r.isImportant);
    console.log(
      `✅ ${results.length} varlık analiz edildi, ${importantResults.length} önemli.`,
    );

    let totalNotifications = 0;

    for (const result of importantResults) {
      try {
        const users = await getUsersForSymbol(result.market, result.symbol);
        const hasPriorityUser = users.some((u) => u.type === "priority");

        const signalScore = computeSignalScore({
          market: result.market,
          symbol: result.symbol,
          direction: result.overallDirection,
          overallStrength: result.overallStrength,
          changePercent: result.changePercent,
          indicators: result.indicators.map((i) => ({
            name: i.name,
            value: i.value,
            direction: i.direction,
            strength: i.strength,
          })),
          patterns: result.patterns.map((p) => ({
            name: p.name,
            direction: p.direction,
            confidence: p.confidence,
          })),
          news: (result.news ?? []).map((n) => ({
  title: n.title,
  url: n.url ?? "",
  source: n.source,
  publishedAt: n.publishedAt,
  sentiment: n.sentiment as "pozitif" | "negatif" | "nötr",
  sentimentScore: n.sentimentScore,
})),
          isPriority: hasPriorityUser,
        });

        result.signalScore = signalScore;

        if (!signalScore.shouldNotify) {
          console.log(
            `🔇 Bildirim atlandı: ${result.symbol} (score=${signalScore.score}, ${signalScore.reason})`,
          );
          continue;
        }

        const ai = await generateCommentary({
          symbol: result.symbol,
          market: result.market,
          price: result.price,
          changePercent: result.changePercent,
          direction: result.overallDirection,
          strength: result.overallStrength,
          indicators: result.indicators.map((i) => ({
            name: i.name,
            value: i.value,
            direction: i.direction,
            strength: i.strength,
          })),
          patterns: result.patterns.map((p) => ({
            name: p.name,
            direction: p.direction,
            confidence: p.confidence,
            description: p.description,
          })),
          news: (result.news ?? []).map((n) => ({
  title: n.title,
  url: n.url ?? "",
  source: n.source,
  publishedAt: n.publishedAt,
  sentiment: n.sentiment as "pozitif" | "negatif" | "nötr",
  sentimentScore: n.sentimentScore,
})),
        });

        result.ai = ai;
        console.log(`🤖 AI (${ai.source}): ${result.symbol} → ${ai.action}`);

        for (const user of users) {
          const notifType = user.type;
          const onCooldown = await isOnCooldown(
            user.user_id,
            result.symbol,
            result.market,
            notifType,
          );
          if (onCooldown) continue;

          await sendNotification({
            userId: user.user_id,
            market: result.market,
            symbol: result.symbol,
            type: notifType,
            analysis: result,
            isGlobal: false,
          });
          totalNotifications++;
        }

        const isGlobalImportant =
          signalScore.tier === "critical" ||
          (result.market === "crypto" && Math.abs(result.changePercent) >= 8) ||
          (["bist", "us", "asia", "europe"].includes(result.market) &&
            Math.abs(result.changePercent) >= 5);

        if (isGlobalImportant) {
          const allUsersRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=id&is_banned=eq.false`,
            {
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
            },
          );

          if (allUsersRes.ok) {
            const allUsers = (await allUsersRes.json()) as Array<{ id: string }>;
            const alreadyNotified = new Set(users.map((u) => u.user_id));

            for (const u of allUsers) {
              if (alreadyNotified.has(u.id)) continue;
              const onCooldown = await isOnCooldown(
                u.id,
                result.symbol,
                result.market,
                "global",
              );
              if (onCooldown) continue;

              await sendNotification({
                userId: u.id,
                market: result.market,
                symbol: result.symbol,
                type: "favorite",
                analysis: result,
                isGlobal: true,
              });
              totalNotifications++;
            }
          }
        }
      } catch (error) {
        console.error(`Bildirim hatası (${result.symbol}):`, error);
      }
    }

    return response.status(200).json({
      success: true,
      message: "Tarama tamamlandı.",
      scanned: results.length,
      important: importantResults.length,
      notificationsSent: totalNotifications,
      totalAssets: assets.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}