// api/formation-projection.ts
// Belirli bir sembol için formasyon gelecek projeksiyonu + dönüşüm analizi
// GET /api/formation-projection?market=crypto&symbol=BTCUSDT&interval=1h

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

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type NewsItem = {
  title: string;
  source: string;
  sentiment: "pozitif" | "negatif" | "nötr";
  sentimentScore: number;
  publishedAt: string;
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

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ==========================================================
// VERİ ÇEKME
// ==========================================================

async function fetchCandles(
  market: string,
  symbol: string,
  interval: string,
): Promise<Candle[]> {
  try {
    if (market === "crypto") {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=200`,
      );
      if (!res.ok) return [];
      const raw = (await res.json()) as unknown[][];
      return raw.map((k) => ({
        time: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));
    }
    const range = interval === "1h" ? "3mo" : interval === "4h" ? "1y" : "2y";
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: (number | null)[];
              high?: (number | null)[];
              low?: (number | null)[];
              close?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>;
      };
    };
    const result = data.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) return [];
    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const close = quote.close?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const volume = quote.volume?.[i];
      if (open == null || close == null || !Number.isFinite(open) || !Number.isFinite(close)) continue;
      candles.push({
        time: (timestamps[i] ?? 0) * 1000,
        open: Number(open),
        high: Number(high ?? close),
        low: Number(low ?? close),
        close: Number(close),
        volume: Number(volume ?? 0),
      });
    }
    return candles.slice(-200);
  } catch {
    return [];
  }
}

// ==========================================================
// HABER ÇEKME
// ==========================================================

const POSITIVE_WORDS = ["rally","surge","soar","bullish","gain","rise","jump","breakout","adoption","approval","partnership","upgrade","record","high","boost","launch","listing","etf","inflow","accumulate","buy","support","yükseliş","rekor","artış","olumlu","güçlü","destek","onay","anlaşma"];
const NEGATIVE_WORDS = ["crash","plunge","drop","bearish","fall","decline","dump","hack","ban","lawsuit","sec","investigation","fraud","warning","risk","low","sell","outflow","liquidat","exploit","scam","fear","düşüş","çöküş","kayıp","olumsuz","risk","yasak","soruşturma","uyarı"];

function lexiconSentiment(text: string): { sentiment: "pozitif" | "negatif" | "nötr"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 15;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score -= 15;
  score = Math.max(-100, Math.min(100, score));
  const sentiment: "pozitif" | "negatif" | "nötr" = score > 10 ? "pozitif" : score < -10 ? "negatif" : "nötr";
  return { sentiment, score };
}

async function fetchNews(
  market: string,
  symbol: string,
): Promise<NewsItem[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];

  try {
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const params = new URLSearchParams();
    params.set("select", "title,source,sentiment,sentiment_score,published_at");
    params.set("market", `eq.${market}`);
    params.set("symbol", `eq.${symbol}`);
    params.set("published_at", `gte.${since}`);
    params.set("order", "published_at.desc");
    params.set("limit", "10");

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/news_cache?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      title: string;
      source: string;
      sentiment: "pozitif" | "negatif" | "nötr";
      sentiment_score: number;
      published_at: string;
    }>;
    return rows.map((r) => ({
      title: r.title,
      source: r.source,
      sentiment: r.sentiment,
      sentimentScore: r.sentiment_score,
      publishedAt: r.published_at,
    }));
  } catch {
    return [];
  }
}

// ==========================================================
// İNDİKATÖRLER
// ==========================================================

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = values[0] ?? 0;
  result.push(ema);
  for (let i = 1; i < values.length; i++) {
    const current = values[i] ?? ema;
    ema = (current - ema) * k + ema;
    result.push(ema);
  }
  return result;
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - (ema26[i] ?? 0));
  const signalLine = calculateEMA(macdLine, 9);
  const last = closes.length - 1;
  const macd = macdLine[last] ?? 0;
  const signal = signalLine[last] ?? 0;
  return {
    macd,
    signal,
    histogram: macd - signal,
  };
}

function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) {
    if (candles.length === 0) return 0;
    const ranges = candles.map((c) => c.high - c.low);
    return average(ranges);
  }
  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trueRanges.push(tr);
  }
  return average(trueRanges.slice(-period));
}

// ==========================================================
// FORMASYON TESPİTİ (basit)
// ==========================================================

type FormationResult = {
  name: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  quality: number;
  completion: number;
  support: number | null;
  resistance: number | null;
  target: number | null;
  invalidation: number | null;
};

function detectSimpleFormation(candles: Candle[]): FormationResult | null {
  if (candles.length < 30) return null;

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const n = candles.length;
  const currentPrice = closes[n - 1] ?? 0;

  const recentHighs = highs.slice(-30);
  const recentLows = lows.slice(-30);

  // Çift Dip
  const minLow = Math.min(...recentLows);
  const minIdx = recentLows.indexOf(minLow);
  if (minIdx >= 0 && minIdx < 15) {
    const secondMin = Math.min(...recentLows.slice(15));
    if (
      Math.abs(minLow - secondMin) / minLow < 0.03 &&
      secondMin > minLow * 0.97 &&
      currentPrice > minLow * 1.02
    ) {
      const neckline = Math.max(...recentHighs.slice(minIdx + 1, 30));
      const height = neckline - minLow;
      const target = neckline + height;
      return {
        name: "Çift Dip",
        bias: "yükseliş",
        quality: 75,
        completion: 70,
        support: minLow,
        resistance: neckline,
        target,
        invalidation: minLow * 0.98,
      };
    }
  }

  // Çift Tepe
  const maxHigh = Math.max(...recentHighs);
  const maxIdx = recentHighs.indexOf(maxHigh);
  if (maxIdx >= 0 && maxIdx < 15) {
    const secondMax = Math.max(...recentHighs.slice(15));
    if (
      Math.abs(maxHigh - secondMax) / maxHigh < 0.03 &&
      maxHigh * 0.97 < secondMax &&
      currentPrice < maxHigh * 0.98
    ) {
      const neckline = Math.min(...recentLows.slice(maxIdx + 1, 30));
      const height = maxHigh - neckline;
      const target = neckline - height;
      return {
        name: "Çift Tepe",
        bias: "düşüş",
        quality: 75,
        completion: 70,
        support: neckline,
        resistance: maxHigh,
        target,
        invalidation: maxHigh * 1.02,
      };
    }
  }

  // Yükselen Üçgen
  const firstHigh = Math.max(...recentHighs.slice(0, 15));
  const secondHigh = Math.max(...recentHighs.slice(15));
  const firstLow = Math.min(...recentLows.slice(0, 15));
  const secondLow = Math.min(...recentLows.slice(15));
  if (
    Math.abs(firstHigh - secondHigh) / firstHigh < 0.02 &&
    secondLow > firstLow * 1.02
  ) {
    const height = firstHigh - firstLow;
    const target = firstHigh + height;
    return {
      name: "Yükselen Üçgen",
      bias: "yükseliş",
      quality: 80,
      completion: 65,
      support: secondLow,
      resistance: firstHigh,
      target,
      invalidation: secondLow * 0.98,
    };
  }

  // Düşen Üçgen
  if (
    secondHigh < firstHigh * 0.98 &&
    Math.abs(firstLow - secondLow) / firstLow < 0.02
  ) {
    const height = firstHigh - firstLow;
    const target = firstLow - height;
    return {
      name: "Düşen Üçgen",
      bias: "düşüş",
      quality: 80,
      completion: 65,
      support: firstLow,
      resistance: secondHigh,
      target,
      invalidation: secondHigh * 1.02,
    };
  }

  // Simetrik Üçgen
  if (secondHigh < firstHigh * 0.99 && secondLow > firstLow * 1.01) {
    return {
      name: "Simetrik Üçgen",
      bias: "nötr",
      quality: 72,
      completion: 60,
      support: secondLow,
      resistance: secondHigh,
      target: null,
      invalidation: null,
    };
  }

  return null;
}

// ==========================================================
// BENZER GEÇMİŞ
// ==========================================================

async function getSimilarPastFormations(
  symbol: string,
  market: string,
  formationName: string,
): Promise<{
  count: number;
  wins: number;
  losses: number;
  success_rate: number;
  avg_win: number;
  avg_loss: number;
}> {
  const empty = {
    count: 0,
    wins: 0,
    losses: 0,
    success_rate: 0,
    avg_win: 0,
    avg_loss: 0,
  };

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return empty;

  try {
    const since = new Date(Date.now() - 180 * 24 * 3600_000).toISOString();
    const params = new URLSearchParams();
    params.set("select", "status,result_percent");
    params.set("market", `eq.${market}`);
    params.set("symbol", `eq.${symbol}`);
    params.set("formation_name", `eq.${formationName}`);
    params.set("signal_time", `gte.${since}`);
    params.set("status", "in.(hit_target,hit_stop)");
    params.set("limit", "500");

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
      status: string;
      result_percent: number | null;
    }>;

    const wins = rows.filter((r) => r.status === "hit_target");
    const losses = rows.filter((r) => r.status === "hit_stop");

    const winPercents = wins
      .map((r) => Number(r.result_percent ?? 0))
      .filter((n) => Number.isFinite(n));
    const lossPercents = losses
      .map((r) => Number(r.result_percent ?? 0))
      .filter((n) => Number.isFinite(n));

    const total = wins.length + losses.length;

    return {
      count: total,
      wins: wins.length,
      losses: losses.length,
      success_rate: total > 0 ? Math.round((wins.length / total) * 1000) / 10 : 0,
      avg_win:
        winPercents.length > 0
          ? Math.round(average(winPercents) * 100) / 100
          : 0,
      avg_loss:
        lossPercents.length > 0
          ? Math.round(average(lossPercents) * 100) / 100
          : 0,
    };
  } catch {
    return empty;
  }
}

// ==========================================================
// PROJEKSİYON HESAPLAMA
// ==========================================================

function calculateProjection(params: {
  formation: FormationResult;
  currentPrice: number;
  rsi: number;
  macd: { macd: number; signal: number; histogram: number };
  volumeRatio: number;
  volumeTrend: "up" | "down" | "stable";
  atr: number;
  market: string;
}) {
  const { formation, currentPrice, rsi, macd, volumeRatio, volumeTrend, atr, market } = params;

  const isBullish = formation.bias === "yükseliş";
  const isBearish = formation.bias === "düşüş";

  const baseTarget = formation.target ?? currentPrice * (isBullish ? 1.03 : isBearish ? 0.97 : 1);
  const baseStop = formation.invalidation ?? currentPrice * (isBullish ? 0.98 : isBearish ? 1.02 : 1);

  let bullScore = 0;
  let bearScore = 0;

  if (isBullish) bullScore += 30;
  else if (isBearish) bearScore += 30;
  else { bullScore += 15; bearScore += 15; }

  if (rsi >= 70) bearScore += 20;
  else if (rsi <= 30) bullScore += 20;
  else if (rsi > 55) bullScore += 10;
  else if (rsi < 45) bearScore += 10;

  if (macd.histogram > 0) bullScore += 15;
  else if (macd.histogram < 0) bearScore += 15;

  if (volumeRatio > 1.3) {
    if (isBullish) bullScore += 15;
    else if (isBearish) bearScore += 15;
  } else if (volumeRatio < 0.8) {
    bullScore -= 5;
    bearScore -= 5;
  }

  const qualityBonus = formation.quality >= 80 ? 10 : formation.quality >= 70 ? 5 : 0;
  if (isBullish) bullScore += qualityBonus;
  else if (isBearish) bearScore += qualityBonus;

  const totalScore = bullScore + bearScore;
  let bullProb = totalScore > 0 ? (bullScore / totalScore) * 100 : 33;
  let bearProb = totalScore > 0 ? (bearScore / totalScore) * 100 : 33;

  let baseProb = 100 - bullProb - bearProb;

  bullProb = clamp(bullProb, 10, 75);
  bearProb = clamp(bearProb, 10, 75);
  baseProb = clamp(100 - bullProb - bearProb, 10, 60);

  const sum = bullProb + bearProb + baseProb;
  bullProb = Math.round((bullProb / sum) * 100);
  bearProb = Math.round((bearProb / sum) * 100);
  baseProb = 100 - bullProb - bearProb;

  const atrPercent = atr / currentPrice;

  const bullTarget = isBullish
    ? Math.max(baseTarget, currentPrice * (1 + Math.max(0.02, atrPercent * 2)))
    : currentPrice * (1 + Math.max(0.02, atrPercent * 2));

  const bearTarget = isBearish
    ? Math.min(baseTarget, currentPrice * (1 - Math.max(0.02, atrPercent * 2)))
    : currentPrice * (1 - Math.max(0.02, atrPercent * 2));

  const baseTargetPrice = baseTarget;

  const resistance = formation.resistance ?? currentPrice * 1.02;
  const support = formation.support ?? currentPrice * 0.98;

  const bullTrigger = `Direnç ${resistance.toFixed(2)} kırılım + hacim artışı`;
  const bearTrigger = `Destek ${support.toFixed(2)} kırılım`;
  const baseTrigger = "Yatay seyir, belirsiz";

  const reasoning: string[] = [];
  reasoning.push(`Formasyon: ${formation.name} (kalite: ${formation.quality}/100)`);
  reasoning.push(`Tamamlanma: %${formation.completion}`);
  reasoning.push(`RSI: ${rsi.toFixed(1)} ${rsi >= 70 ? "(aşırı alım)" : rsi <= 30 ? "(aşırı satım)" : "(normal)"}`);
  reasoning.push(`MACD: ${macd.histogram > 0 ? "pozitif" : "negatif"} (${macd.histogram.toFixed(4)})`);
  reasoning.push(`Hacim: ${volumeRatio.toFixed(2)}x ${volumeTrend === "up" ? "(artıyor)" : volumeTrend === "down" ? "(azalıyor)" : "(stabil)"}`);
  if (volumeTrend === "down" && isBullish) {
    reasoning.push("⚠️ Hacim azalıyor — kırılım zayıf olabilir");
  }
  if (volumeTrend === "up" && isBullish) {
    reasoning.push("✅ Hacim artıyor — kırılım güçlü");
  }

  return {
    bull: {
      probability: bullProb,
      target: Math.round(bullTarget * 100) / 100,
      target_percent: Math.round(((bullTarget / currentPrice) - 1) * 10000) / 100,
      trigger: bullTrigger,
    },
    base: {
      probability: baseProb,
      target: Math.round(baseTargetPrice * 100) / 100,
      target_percent: Math.round(((baseTargetPrice / currentPrice) - 1) * 10000) / 100,
      trigger: baseTrigger,
    },
    bear: {
      probability: bearProb,
      target: Math.round(bearTarget * 100) / 100,
      target_percent: Math.round(((bearTarget / currentPrice) - 1) * 10000) / 100,
      trigger: bearTrigger,
    },
    reasoning,
  };
}

// ==========================================================
// FORMASYON DÖNÜŞÜM ANALİZİ
// ==========================================================

type FutureFormation = {
  name: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  probability: number;
  time_estimate: string;
  target: number | null;
  target_percent: number | null;
  conditions: Array<{
    label: string;
    met: boolean;
    current: string;
  }>;
};

function calculateFutureFormations(params: {
  currentFormation: FormationResult;
  currentPrice: number;
  resistance: number;
  support: number;
  rsi: number;
  macdHistogram: number;
  volumeRatio: number;
  volumeTrend: "up" | "down" | "stable";
  atr: number;
  newsSentiment: number;
}): FutureFormation[] {
  const {
    currentFormation,
    currentPrice,
    resistance,
    support,
    rsi,
    macdHistogram,
    volumeRatio,
    atr,
    newsSentiment,
  } = params;

  const atrPercent = atr / currentPrice;
  const targetDistance = Math.max(0.02, atrPercent * 2);

  const resistanceDistance = (resistance - currentPrice) / currentPrice;
  const supportDistance = (currentPrice - support) / currentPrice;

  const futureFormations: FutureFormation[] = [];

  // ==========================================================
  // 1. YÜKSELEN KANAL (Bullish dönüşüm)
  // ==========================================================
  if (currentFormation.bias === "yükseliş" || currentFormation.bias === "nötr") {
    const conditions = [
      {
        label: `Direnç ${resistance.toFixed(2)} üzeri kapanış`,
        met: currentPrice > resistance * 0.99,
        current: `${currentPrice.toFixed(2)} (fark: %${(resistanceDistance * 100).toFixed(2)})`,
      },
      {
        label: "Hacim 1.5x üzeri",
        met: volumeRatio >= 1.5,
        current: `${volumeRatio.toFixed(2)}x`,
      },
      {
        label: "RSI 55-70 arası (sağlıklı)",
        met: rsi >= 55 && rsi <= 70,
        current: `${rsi.toFixed(1)}`,
      },
      {
        label: "MACD pozitif",
        met: macdHistogram > 0,
        current: macdHistogram > 0 ? "✅ pozitif" : "❌ negatif",
      },
    ];

    const metCount = conditions.filter((c) => c.met).length;
    const baseProb = (metCount / conditions.length) * 60 + 20; // 20-80 arası
    const newsBonus = newsSentiment > 20 ? 10 : newsSentiment > 0 ? 5 : 0;
    const prob = clamp(Math.round(baseProb + newsBonus), 5, 85);

    futureFormations.push({
      name: "Yükselen Kanal",
      bias: "yükseliş",
      probability: prob,
      time_estimate: prob >= 60 ? "1-3 gün" : prob >= 40 ? "3-5 gün" : "5-7 gün",
      target: Math.round(currentPrice * (1 + targetDistance * 1.5) * 100) / 100,
      target_percent: Math.round(targetDistance * 1.5 * 10000) / 100,
      conditions,
    });
  }

  // ==========================================================
  // 2. DÜŞEN KANAL (Bearish dönüşüm)
  // ==========================================================
  if (currentFormation.bias === "düşüş" || currentFormation.bias === "nötr") {
    const conditions = [
      {
        label: `Destek ${support.toFixed(2)} altı kapanış`,
        met: currentPrice < support * 1.01,
        current: `${currentPrice.toFixed(2)} (fark: %${(supportDistance * 100).toFixed(2)})`,
      },
      {
        label: "Hacim 1.5x üzeri (satış)",
        met: volumeRatio >= 1.5,
        current: `${volumeRatio.toFixed(2)}x`,
      },
      {
        label: "RSI 30-45 arası (zayıf)",
        met: rsi >= 30 && rsi <= 45,
        current: `${rsi.toFixed(1)}`,
      },
      {
        label: "MACD negatif",
        met: macdHistogram < 0,
        current: macdHistogram < 0 ? "✅ negatif" : "❌ pozitif",
      },
    ];

    const metCount = conditions.filter((c) => c.met).length;
    const baseProb = (metCount / conditions.length) * 60 + 20;
    const newsMalus = newsSentiment < -20 ? 10 : newsSentiment < 0 ? 5 : 0;
    const prob = clamp(Math.round(baseProb + newsMalus), 5, 85);

    futureFormations.push({
      name: "Düşen Kanal",
      bias: "düşüş",
      probability: prob,
      time_estimate: prob >= 60 ? "1-3 gün" : prob >= 40 ? "3-5 gün" : "5-7 gün",
      target: Math.round(currentPrice * (1 - targetDistance * 1.5) * 100) / 100,
      target_percent: Math.round(-targetDistance * 1.5 * 10000) / 100,
      conditions,
    });
  }

  // ==========================================================
  // 3. YATAY KANAL (Nötr dönüşüm)
  // ==========================================================
  {
    const conditions = [
      {
        label: "Fiyat direnç ve destek arası",
        met: currentPrice < resistance && currentPrice > support,
        current: `D: ${resistance.toFixed(2)} / S: ${support.toFixed(2)}`,
      },
      {
        label: "Hacim 0.8-1.2x arası (dengeli)",
        met: volumeRatio >= 0.8 && volumeRatio <= 1.2,
        current: `${volumeRatio.toFixed(2)}x`,
      },
      {
        label: "RSI 45-55 arası (nötr)",
        met: rsi >= 45 && rsi <= 55,
        current: `${rsi.toFixed(1)}`,
      },
      {
        label: "MACD zayıf (histogram ±0.001)",
        met: Math.abs(macdHistogram) < 0.001,
        current: Math.abs(macdHistogram) < 0.001 ? "✅ zayıf" : "❌ güçlü",
      },
    ];

    const metCount = conditions.filter((c) => c.met).length;
    const baseProb = (metCount / conditions.length) * 60 + 10;
    const prob = clamp(Math.round(baseProb), 5, 75);

    futureFormations.push({
      name: "Yatay Kanal",
      bias: "nötr",
      probability: prob,
      time_estimate: prob >= 60 ? "1-2 gün" : "3-5 gün",
      target: Math.round(((resistance + support) / 2) * 100) / 100,
      target_percent: Math.round((((resistance + support) / 2 / currentPrice) - 1) * 10000) / 100,
      conditions,
    });
  }

  // Olasılığa göre sırala
  return futureFormations.sort((a, b) => b.probability - a.probability);
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
    const market = getQueryStr(request.query, "market") ?? "";
    const symbol = (getQueryStr(request.query, "symbol") ?? "").toUpperCase();
    const interval = getQueryStr(request.query, "interval") ?? "1h";

    if (!market || !symbol) {
      return response.status(400).json({
        success: false,
        error: "market ve symbol parametreleri gerekli",
      });
    }

    const candles = await fetchCandles(market, symbol, interval);
    if (candles.length < 30) {
      return response.status(200).json({
        success: true,
        market,
        symbol,
        interval,
        has_formation: false,
        message: "Yetersiz mum verisi",
      });
    }

    const currentPrice = candles[candles.length - 1]?.close ?? 0;
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);

    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const atr = calculateATR(candles, 14);

    const recentVolumes = volumes.slice(-5);
    const avgVolume20 = average(volumes.slice(-20));
    const avgVolume5 = average(recentVolumes);
    const currentVolume = volumes[volumes.length - 1] ?? 0;
    const volumeRatio = avgVolume20 > 0 ? currentVolume / avgVolume20 : 1;

    let volumeTrend: "up" | "down" | "stable" = "stable";
    if (avgVolume5 > avgVolume20 * 1.2) volumeTrend = "up";
    else if (avgVolume5 < avgVolume20 * 0.8) volumeTrend = "down";

    const formation = detectSimpleFormation(candles);

    if (!formation) {
      return response.status(200).json({
        success: true,
        market,
        symbol,
        interval,
        has_formation: false,
        message: "Aktif formasyon tespit edilmedi",
        currentPrice,
        indicators: {
          rsi: Math.round(rsi * 10) / 10,
          macd_histogram: Math.round(macd.histogram * 10000) / 10000,
          volume_ratio: Math.round(volumeRatio * 100) / 100,
          volume_trend: volumeTrend,
        },
      });
    }

    // Haberleri çek
    const news = await fetchNews(market, symbol);
    const newsSentiment =
      news.length > 0
        ? Math.round(average(news.map((n) => n.sentimentScore)))
        : 0;

    const projection = calculateProjection({
      formation,
      currentPrice,
      rsi,
      macd,
      volumeRatio,
      volumeTrend,
      atr,
      market,
    });

    const similarPast = await getSimilarPastFormations(market, symbol, formation.name);

    // YENİ: Gelecek formasyon dönüşümleri
    const futureFormations = calculateFutureFormations({
      currentFormation: formation,
      currentPrice,
      resistance: formation.resistance ?? currentPrice * 1.02,
      support: formation.support ?? currentPrice * 0.98,
      rsi,
      macdHistogram: macd.histogram,
      volumeRatio,
      volumeTrend,
      atr,
      newsSentiment,
    });

    return response.status(200).json({
      success: true,
      market,
      symbol,
      interval,
      has_formation: true,
      formation: {
        name: formation.name,
        bias: formation.bias,
        quality: formation.quality,
        completion: formation.completion,
        support: formation.support,
        resistance: formation.resistance,
        target: formation.target,
        invalidation: formation.invalidation,
      },
      current_price: Math.round(currentPrice * 10000) / 10000,
      scenarios: {
        bull: projection.bull,
        base: projection.base,
        bear: projection.bear,
      },
      future_formations: futureFormations,
      indicators: {
        rsi: Math.round(rsi * 10) / 10,
        macd_histogram: Math.round(macd.histogram * 10000) / 10000,
        volume_ratio: Math.round(volumeRatio * 100) / 100,
        volume_trend: volumeTrend,
        atr: Math.round(atr * 10000) / 10000,
      },
      news_effect: {
        count: news.length,
        sentiment: newsSentiment,
        sentiment_label:
          newsSentiment > 15
            ? "olumlu"
            : newsSentiment < -15
              ? "olumsuz"
              : "nötr",
        items: news.slice(0, 5).map((n) => ({
          title: n.title.slice(0, 100),
          source: n.source,
          sentiment: n.sentiment,
          score: n.sentimentScore,
        })),
      },
      similar_past: similarPast,
      reasoning: projection.reasoning,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Formation projection hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}