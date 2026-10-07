// api/scan-multi-timeframe.ts — Çoklu Zaman Dilimi Karşılaştırmalı Tarama

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = { method?: string; query?: Record<string, any> };
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

type TrackingRow = { user_id: string; market: string; symbol: string };
type ProfileRow = {
  id: string;
  role: string;
  membership: string;
  trial_ends_at: string | null;
  short_term_patterns: UserShortTermPatterns | null;
  short_term_global_enabled?: boolean;
};

type DetectedPattern = {
  name: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  confidence: number;
  reasons: string[];
  support: number | null;
  resistance: number | null;
  target: number | null;
  invalidation: number | null;
};

type UserShortTermPatterns = {
  ikili_dip: boolean;
  ikili_tepe: boolean;
  yukselen_ucgen: boolean;
  dusen_ucgen: boolean;
  obo: boolean;
  ters_obo: boolean;
  uclu_dip: boolean;
  uclu_tepe: boolean;
  yukselen_kama: boolean;
  dusen_kama: boolean;
  boga_bayragi: boolean;
  ayi_bayragi: boolean;
  boga_flamasi: boolean;
  ayi_flamasi: boolean;
  fincan_kulp: boolean;
  simetrik_ucgen: boolean;
};

const DEFAULT_USER_PATTERNS: UserShortTermPatterns = {
  ikili_dip: true,
  ikili_tepe: true,
  yukselen_ucgen: true,
  dusen_ucgen: true,
  obo: true,
  ters_obo: true,
  uclu_dip: true,
  uclu_tepe: true,
  yukselen_kama: true,
  dusen_kama: true,
  boga_bayragi: true,
  ayi_bayragi: true,
  boga_flamasi: true,
  ayi_flamasi: true,
  fincan_kulp: true,
  simetrik_ucgen: true,
};

function patternNameToKey(name: string): keyof UserShortTermPatterns | null {
  const lower = name.toLowerCase();
  if (lower.includes("ikili dip")) return "ikili_dip";
  if (lower.includes("ikili tepe")) return "ikili_tepe";
  if (lower.includes("yükselen üçgen") || lower.includes("yukselen ucgen")) return "yukselen_ucgen";
  if (lower.includes("düşen üçgen") || lower.includes("dusen ucgen")) return "dusen_ucgen";
  if (lower.includes("ters obo")) return "ters_obo";
  if (lower.includes("obo") || lower.includes("omuz")) return "obo";
  if (lower.includes("üçlü dip") || lower.includes("uclu dip")) return "uclu_dip";
  if (lower.includes("üçlü tepe") || lower.includes("uclu tepe")) return "uclu_tepe";
  if (lower.includes("yükselen kama")) return "yukselen_kama";
  if (lower.includes("düşen kama")) return "dusen_kama";
  if (lower.includes("boğa bayrağı")) return "boga_bayragi";
  if (lower.includes("ayı bayrağı")) return "ayi_bayragi";
  if (lower.includes("boğa flaması")) return "boga_flamasi";
  if (lower.includes("ayı flaması")) return "ayi_flamasi";
  if (lower.includes("fincan") || lower.includes("kulp")) return "fincan_kulp";
  if (lower.includes("simetrik üçgen")) return "simetrik_ucgen";
  return null;
}

// Popüler varlık listeleri
const CRYPTO_TOP_30 = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT",
  "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "TRXUSDT", "LTCUSDT", "BCHUSDT",
  "ATOMUSDT", "UNIUSDT", "AAVEUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
  "SUIUSDT", "TONUSDT", "SHIBUSDT", "PEPEUSDT", "INJUSDT", "SEIUSDT", "TIAUSDT",
  "RUNEUSDT", "FETUSDT",
];

const BIST_TOP_10 = [
  "THYAO.IS", "ASELS.IS", "TUPRS.IS", "GARAN.IS", "AKBNK.IS",
  "EREGL.IS", "KCHOL.IS", "SISE.IS", "FROTO.IS", "TCELL.IS",
];

const US_TOP_10 = [
  "AAPL.US", "MSFT.US", "NVDA.US", "TSLA.US", "AMZN.US",
  "GOOGL.US", "META.US", "JPM.US", "WMT.US", "NFLX.US",
];

const ALL_SYMBOLS: Array<{ market: string; symbol: string }> = [
  ...CRYPTO_TOP_30.map((s) => ({ market: "crypto", symbol: s })),
  ...BIST_TOP_10.map((s) => ({ market: "bist", symbol: s })),
  ...US_TOP_10.map((s) => ({ market: "us", symbol: s })),
];

// ==========================================================
// İNDİKATÖR HESAPLAMALARI
// ==========================================================

function calcEMA(values: number[], period: number): number[] {
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

function calcSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  return result;
}

function calcRSI(values: number[], period = 14): number[] {
  if (values.length === 0) return [];
  const result: number[] = new Array(values.length).fill(50);
  if (values.length < 2) return result;
  let gainSum = 0, lossSum = 0;
  const initPeriod = Math.min(period, values.length - 1);
  for (let i = 1; i <= initPeriod; i++) {
    const change = (values[i] ?? 0) - (values[i - 1] ?? 0);
    if (change >= 0) gainSum += change;
    else lossSum += Math.abs(change);
  }
  let avgGain = gainSum / initPeriod;
  let avgLoss = lossSum / initPeriod;
  for (let i = initPeriod; i < values.length; i++) {
    if (i > initPeriod) {
      const change = (values[i] ?? 0) - (values[i - 1] ?? 0);
      avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    }
    if (avgLoss === 0) result[i] = 100;
    else result[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcMACD(values: number[]) {
  const ema12 = calcEMA(values, 12);
  const ema26 = calcEMA(values, 26);
  const macd = values.map((_, i) => (ema12[i] ?? 0) - (ema26[i] ?? 0));
  const signal = calcEMA(macd, 9);
  const histogram = macd.map((v, i) => v - (signal[i] ?? 0));
  return { macd, signal, histogram };
}

function calculateIndicatorData(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const rsi = calcRSI(closes, 14);
  const { histogram } = calcMACD(closes);
  const avgVol = calcSMA(volumes, 20);
  const last = candles.length - 1;
  const curVol = volumes[last] ?? 0;
  const curAvgVol = avgVol[last] ?? 0;
  return {
    rsi: rsi[last] ?? 50,
    macdHistogram: histogram[last] ?? 0,
    volumeRatio: curAvgVol > 0 ? curVol / curAvgVol : 0,
  };
}

// ==========================================================
// FORMASYON TESPİTİ (Basitleştirilmiş)
// ==========================================================

function detectPatterns(candles: Candle[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  if (candles.length < 30) return patterns;
  const closes = candles.map((c) => c.close);
  const n = candles.length;
  const lastClose = closes[n - 1] ?? 0;
  const recentHighs = candles.slice(-30).map((c) => c.high);
  const recentLows = candles.slice(-30).map((c) => c.low);

  // 1. İkili Dip
  try {
    const minLow = Math.min(...recentLows);
    const minIdx = recentLows.indexOf(minLow);
    if (minIdx >= 0 && minIdx < 15) {
      const secondMin = Math.min(...recentLows.slice(15));
      if (Math.abs(minLow - secondMin) / minLow < 0.03 && secondMin > minLow * 0.97 && lastClose > minLow * 1.02) {
        const sliceStart = Math.min(minIdx + 1, 20);
        const neckline = Math.max(...recentHighs.slice(sliceStart, 30));
        const safeNeckline = Number.isFinite(neckline) && neckline > minLow
          ? neckline : Math.max(...recentHighs.slice(15, 30));
        const target = safeNeckline + (safeNeckline - minLow);
        const invalidation = minLow * 0.98;
        patterns.push({
          name: "İkili Dip", bias: "yükseliş", confidence: 78,
          reasons: [`İki dip aynı seviyede`],
          support: minLow, resistance: safeNeckline,
          target, invalidation,
        });
      }
    }
  } catch {}

  // 2. İkili Tepe
  try {
    const maxHigh = Math.max(...recentHighs);
    const maxIdx = recentHighs.indexOf(maxHigh);
    if (maxIdx >= 0 && maxIdx < 15) {
      const secondMax = Math.max(...recentHighs.slice(15));
      if (Math.abs(maxHigh - secondMax) / maxHigh < 0.03 && maxHigh * 0.97 < secondMax && lastClose < maxHigh * 0.98) {
        const sliceStart = Math.min(maxIdx + 1, 20);
        const neckline = Math.min(...recentLows.slice(sliceStart, 30));
        const safeNeckline = Number.isFinite(neckline) && neckline < maxHigh
          ? neckline : Math.min(...recentLows.slice(15, 30));
        const target = safeNeckline - (maxHigh - safeNeckline);
        const invalidation = maxHigh * 1.02;
        patterns.push({
          name: "İkili Tepe", bias: "düşüş", confidence: 78,
          reasons: [`İki tepe aynı seviyede`],
          support: safeNeckline, resistance: maxHigh,
          target, invalidation,
        });
      }
    }
  } catch {}

  // 3. Yükselen Üçgen
  try {
    const firstHigh = Math.max(...recentHighs.slice(0, 15));
    const secondHigh = Math.max(...recentHighs.slice(15));
    const firstLow = Math.min(...recentLows.slice(0, 15));
    const secondLow = Math.min(...recentLows.slice(15));
    if (Math.abs(firstHigh - secondHigh) / firstHigh < 0.02 && secondLow > firstLow * 1.02 && lastClose > secondHigh * 0.99) {
      const target = firstHigh + (firstHigh - firstLow);
      const invalidation = secondLow * 0.98;
      patterns.push({
        name: "Yükselen Üçgen", bias: "yükseliş", confidence: 80,
        reasons: [`Yatay direnç + yükselen dip`],
        support: firstLow, resistance: firstHigh, target, invalidation,
      });
    }
  } catch {}

  // 4. Düşen Üçgen
  try {
    const firstHigh = Math.max(...recentHighs.slice(0, 15));
    const secondHigh = Math.max(...recentHighs.slice(15));
    const firstLow = Math.min(...recentLows.slice(0, 15));
    const secondLow = Math.min(...recentLows.slice(15));
    if (secondHigh < firstHigh * 0.98 && Math.abs(firstLow - secondLow) / firstLow < 0.02 && lastClose < secondLow * 1.01) {
      const target = firstLow - (firstHigh - firstLow);
      const invalidation = secondHigh * 1.02;
      patterns.push({
        name: "Düşen Üçgen", bias: "düşüş", confidence: 80,
        reasons: [`Düşen direnç + yatay destek`],
        support: firstLow, resistance: firstHigh, target, invalidation,
      });
    }
  } catch {}

  // 5. OBO
  try {
    if (candles.length >= 40) {
      const h = candles.slice(-40).map((c) => c.high);
      const l = candles.slice(-40).map((c) => c.low);
      const ls = Math.max(...h.slice(0, 12));
      const head = Math.max(...h.slice(12, 26));
      const rs = Math.max(...h.slice(26, 40));
      if (head > ls * 1.02 && head > rs * 1.02 && Math.abs(ls - rs) / ls < 0.03) {
        const neckline = Math.min(...l.slice(12, 26));
        const target = neckline - (head - neckline);
        const invalidation = head * 1.02;
        patterns.push({
          name: "Omuz-Baş-Omuz", bias: "düşüş", confidence: 85,
          reasons: [`Klasik OBO`],
          support: neckline, resistance: head, target, invalidation,
        });
      }
    }
  } catch {}

  // 6. Ters OBO
  try {
    if (candles.length >= 40) {
      const h = candles.slice(-40).map((c) => c.high);
      const l = candles.slice(-40).map((c) => c.low);
      const ls = Math.min(...l.slice(0, 12));
      const head = Math.min(...l.slice(12, 26));
      const rs = Math.min(...l.slice(26, 40));
      if (head < ls * 0.98 && head < rs * 0.98 && Math.abs(ls - rs) / ls < 0.03) {
        const neckline = Math.max(...h.slice(12, 26));
        const target = neckline + (neckline - head);
        const invalidation = head * 0.98;
        patterns.push({
          name: "Ters OBO", bias: "yükseliş", confidence: 85,
          reasons: [`Ters OBO`],
          support: head, resistance: neckline, target, invalidation,
        });
      }
    }
  } catch {}

  // 7. Üçlü Dip
  try {
    if (candles.length >= 45) {
      const l = candles.slice(-45).map((c) => c.low);
      const h = candles.slice(-45).map((c) => c.high);
      const d1 = Math.min(...l.slice(0, 15));
      const d2 = Math.min(...l.slice(15, 30));
      const d3 = Math.min(...l.slice(30, 45));
      if (Math.abs(d1 - d2) / d1 < 0.03 && Math.abs(d2 - d3) / d2 < 0.03 && lastClose > d1 * 1.02) {
        const neckline = Math.max(...h.slice(0, 45));
        const target = neckline + (neckline - d1);
        const invalidation = d1 * 0.98;
        patterns.push({
          name: "Üçlü Dip", bias: "yükseliş", confidence: 82,
          reasons: [`Üç dip aynı seviyede`],
          support: d1, resistance: neckline, target, invalidation,
        });
      }
    }
  } catch {}

  // 8. Üçlü Tepe
  try {
    if (candles.length >= 45) {
      const h = candles.slice(-45).map((c) => c.high);
      const l = candles.slice(-45).map((c) => c.low);
      const t1 = Math.max(...h.slice(0, 15));
      const t2 = Math.max(...h.slice(15, 30));
      const t3 = Math.max(...h.slice(30, 45));
      if (Math.abs(t1 - t2) / t1 < 0.03 && Math.abs(t2 - t3) / t2 < 0.03 && lastClose < t1 * 0.98) {
        const neckline = Math.min(...l.slice(0, 45));
        const target = neckline - (t1 - neckline);
        const invalidation = t1 * 1.02;
        patterns.push({
          name: "Üçlü Tepe", bias: "düşüş", confidence: 82,
          reasons: [`Üç tepe aynı seviyede`],
          support: neckline, resistance: t1, target, invalidation,
        });
      }
    }
  } catch {}

  // 9. Yükselen Kama
  try {
    if (candles.length >= 40) {
      const h = candles.slice(-40).map((c) => c.high);
      const l = candles.slice(-40).map((c) => c.low);
      const lh = Math.max(...h.slice(0, 20));
      const rh = Math.max(...h.slice(20, 40));
      const ll = Math.min(...l.slice(0, 20));
      const rl = Math.min(...l.slice(20, 40));
      if (rh > lh && rl > ll && (rh - rl) < (lh - ll) * 0.7 && lastClose < rl * 1.01) {
        const target = rl - (rh - rl);
        const invalidation = rh * 1.02;
        patterns.push({
          name: "Yükselen Kama", bias: "düşüş", confidence: 78,
          reasons: [`Yükselen kama daralıyor`],
          support: rl, resistance: rh, target, invalidation,
        });
      }
    }
  } catch {}

  // 10. Düşen Kama
  try {
    if (candles.length >= 40) {
      const h = candles.slice(-40).map((c) => c.high);
      const l = candles.slice(-40).map((c) => c.low);
      const lh = Math.max(...h.slice(0, 20));
      const rh = Math.max(...h.slice(20, 40));
      const ll = Math.min(...l.slice(0, 20));
      const rl = Math.min(...l.slice(20, 40));
      if (rh < lh && rl < ll && (rh - rl) < (lh - ll) * 0.7 && lastClose > rh * 0.99) {
        const target = rh + (rh - rl);
        const invalidation = rl * 0.98;
        patterns.push({
          name: "Düşen Kama", bias: "yükseliş", confidence: 78,
          reasons: [`Düşen kama daralıyor`],
          support: rl, resistance: rh, target, invalidation,
        });
      }
    }
  } catch {}

  // 11. Boğa Bayrağı
  try {
    if (candles.length >= 30) {
      const h = candles.slice(-30).map((c) => c.high);
      const l = candles.slice(-30).map((c) => c.low);
      const first = closes.slice(0, 10);
      const rise = (first[9] ?? 0) - (first[0] ?? 0);
      const strongRise = rise > 0 && rise / (first[0] ?? 1) > 0.05;
      const fh = h.slice(10, 25);
      const fl = l.slice(10, 25);
      const isFlag = (fh[fh.length - 1] ?? 0) < (fh[0] ?? 0) && (fl[fl.length - 1] ?? 0) < (fl[0] ?? 0);
      if (strongRise && isFlag && lastClose > (fh[fh.length - 1] ?? 0)) {
        const flagH = (fh[0] ?? 0) - (fl[0] ?? 0);
        const target = lastClose + flagH;
        const invalidation = (fl[fl.length - 1] ?? lastClose * 0.97);
        patterns.push({
          name: "Boğa Bayrağı", bias: "yükseliş", confidence: 80,
          reasons: [`Güçlü yükseliş + bayrak`],
          support: fl[fl.length - 1] ?? null, resistance: fh[0] ?? null, target, invalidation,
        });
      }
    }
  } catch {}

  // 12. Ayı Bayrağı
  try {
    if (candles.length >= 30) {
      const h = candles.slice(-30).map((c) => c.high);
      const l = candles.slice(-30).map((c) => c.low);
      const first = closes.slice(0, 10);
      const drop = (first[0] ?? 0) - (first[9] ?? 0);
      const strongDrop = drop > 0 && drop / (first[0] ?? 1) > 0.05;
      const fh = h.slice(10, 25);
      const fl = l.slice(10, 25);
      const isFlag = (fh[fh.length - 1] ?? 0) > (fh[0] ?? 0) && (fl[fl.length - 1] ?? 0) > (fl[0] ?? 0);
      if (strongDrop && isFlag && lastClose < (fl[fl.length - 1] ?? 0)) {
        const flagH = (fh[0] ?? 0) - (fl[0] ?? 0);
        const target = lastClose - flagH;
        const invalidation = (fh[fh.length - 1] ?? lastClose * 1.03);
        patterns.push({
          name: "Ayı Bayrağı", bias: "düşüş", confidence: 80,
          reasons: [`Güçlü düşüş + bayrak`],
          support: fl[0] ?? null, resistance: fh[fh.length - 1] ?? null, target, invalidation,
        });
      }
    }
  } catch {}

  return patterns;
}

// ==========================================================
// VERİ ÇEKME
// ==========================================================

async function fetchCryptoCandles(symbol: string, interval: string): Promise<Candle[]> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=150`);
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown[][];
    return raw.map((k) => ({
      time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
    }));
  } catch { return []; }
}

async function fetchStockCandles(symbol: string): Promise<Candle[]> {
  try {
    const res = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 3) return [];
    const out: Candle[] = [];
    for (const line of lines.slice(1)) {
      const [date, open, high, low, close, volume] = line.split(",");
      if (!date || !close) continue;
      const c: Candle = { time: new Date(date).getTime(), open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume ?? 0) };
      if (Number.isFinite(c.close)) out.push(c);
    }
    return out.slice(-160);
  } catch { return []; }
}

async function fetchFearGreed() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ value: string; value_classification: string }> };
    const entry = data.data?.[0];
    if (!entry) return null;
    return { value: Number(entry.value), classification: entry.value_classification };
  } catch { return null; }
}

async function supabaseSelect(table: string, query: string): Promise<any[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function supabaseInsert(table: string, data: any): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

// ==========================================================
// KARŞILAŞTIRMALI YORUM OLUŞTURMA (KURAL TABANLI)
// ==========================================================

type TimeframeResult = {
  timeframe: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  pattern: string;
  confidence: number;
  entry: number;
  stop: number;
  target: number;
};

function generateMultiTfCommentary(results: TimeframeResult[], symbol: string): string {
  if (results.length === 0) return "Veri yok.";

  const h1 = results.find((r) => r.timeframe === "1h");
  const h4 = results.find((r) => r.timeframe === "4h");
  const d1 = results.find((r) => r.timeframe === "1d");

  const lines: string[] = [];
  lines.push("📊 ÇOKLU ZAMAN DİLİMİ KARŞILAŞTIRMASI");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (h1) lines.push(`• 1h: ${h1.bias === "yükseliş" ? "🟢" : h1.bias === "düşüş" ? "🔴" : "⚪"} ${h1.pattern} (%${h1.confidence})`);
  if (h4) lines.push(`• 4h: ${h4.bias === "yükseliş" ? "🟢" : h4.bias === "düşüş" ? "🔴" : "⚪"} ${h4.pattern} (%${h4.confidence})`);
  if (d1) lines.push(`• 1d: ${d1.bias === "yükseliş" ? "🟢" : d1.bias === "düşüş" ? "🔴" : "⚪"} ${d1.pattern} (%${d1.confidence})`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Karşılaştırma senaryoları
  const biases = [h1?.bias, h4?.bias, d1?.bias].filter(Boolean);
  const allUp = biases.every((b) => b === "yükseliş");
  const allDown = biases.every((b) => b === "düşüş");

  if (allUp && biases.length >= 2) {
    lines.push(`💡 YORUM: GÜÇLÜ YÜKSELİŞ SİNYALİ`);
    lines.push(`${symbol} için tüm vadeler (${biases.length}) yükseliş yönünde uyumlu. Bu, güçlü bir yükseliş trendinin göstergesi olabilir.`);
    lines.push(`⚠️ Ancak yine de risk yönetimini ihmal etmeyin.`);
  } else if (allDown && biases.length >= 2) {
    lines.push(`💡 YORUM: GÜÇLÜ DÜŞÜŞ SİNYALİ`);
    lines.push(`${symbol} için tüm vadeler (${biases.length}) düşüş yönünde uyumlu. Bu, güçlü bir düşüş trendinin göstergesi olabilir.`);
    lines.push(`⚠️ Alım yapmadan önce dikkatli olun.`);
  } else if (h1?.bias === "yükseliş" && h4?.bias === "yükseliş" && d1?.bias === "düşüş") {
    lines.push(`💡 YORUM: KISA-ORTA VADELİ TEPKİ`);
    lines.push(`Kısa (1h) ve orta (4h) vadede yükseliş var, ancak uzun vadede (1d) düşüş hakim.`);
    lines.push(`Bu, bir tepki yükselişi olabilir. Uzun vadeli trend dönene kadar dikkatli olun.`);
  } else if (h1?.bias === "düşüş" && h4?.bias === "düşüş" && d1?.bias === "yükseliş") {
    lines.push(`💡 YORUM: KISA-ORTA VADELİ DÜZELTME`);
    lines.push(`Kısa (1h) ve orta (4h) vadede düşüş var, ancak uzun vadede (1d) yükseliş hakim.`);
    lines.push(`Bu, bir düzeltme (pullback) olabilir. Uzun vadeli trend yükseliş olduğu için alım fırsatı olabilir.`);
  } else if (h1?.bias === "yükseliş" && h4?.bias === "düşüş") {
    lines.push(`💡 YORUM: ZAYIF TEPKİ`);
    lines.push(`Kısa vadede (1h) yükseliş var, ancak orta vadede (4h) düşüş hakim.`);
    lines.push(`Bu, zayıf bir tepki olabilir. Orta vade teyidi bekleyin.`);
  } else if (h1?.bias === "düşüş" && h4?.bias === "yükseliş") {
    lines.push(`💡 YORUM: ORTA VADELİ ALIM FIRSATI`);
    lines.push(`Kısa vadede (1h) düşüş var, ancak orta vadede (4h) yükseliş hakim.`);
    lines.push(`Bu, orta vadeli bir alım fırsatı olabilir. Kısa vadeli düşüş bitince alım değerlendirilebilir.`);
  } else {
    lines.push(`💡 YORUM: KARARSIZ / BELİRSİZ`);
    lines.push(`${symbol} için zaman dilimleri arasında uyumsuzluk var.`);
    lines.push(`Net bir sinyal için beklemek daha güvenli olabilir.`);
  }

  return lines.join("\n");
}

// ==========================================================
// ANA FONKSİYON
// ==========================================================

async function scanMultiTimeframe() {
  // 1. Kullanıcı tercihlerini çek
  const usersRaw = await supabaseSelect(
    "profiles",
    `select=id,role,membership,trial_ends_at,short_term_global_enabled,short_term_patterns&short_term_global_enabled=eq.true`,
  );

  const eligibleUsers: string[] = [];
  const userPatterns = new Map<string, UserShortTermPatterns>();

  for (const u of usersRaw) {
    const role = String(u.role ?? "user");
    const membership = String(u.membership ?? "free");
    const trialEndsAt = u.trial_ends_at as string | null;

    if (role === "admin" || membership === "premium") {
      eligibleUsers.push(u.id);
      userPatterns.set(u.id, u.short_term_patterns ?? DEFAULT_USER_PATTERNS);
    } else if (membership === "trial" && trialEndsAt) {
      if (new Date(trialEndsAt).getTime() >= Date.now()) {
        eligibleUsers.push(u.id);
        userPatterns.set(u.id, u.short_term_patterns ?? DEFAULT_USER_PATTERNS);
      }
    }
  }

  if (eligibleUsers.length === 0) {
    return { multiScanned: 0, multiCreated: 0, multiUsers: 0 };
  }

  const fearGreed = await fetchFearGreed();
  const timeframes = ["1h", "4h", "1d"];

  let multiCreated = 0;
  let multiScanned = 0;

  // Paralel işleme
  const CONCURRENCY = 5;
  for (let i = 0; i < ALL_SYMBOLS.length; i += CONCURRENCY) {
    const batch = ALL_SYMBOLS.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (target) => {
      try {
        const tfResults: TimeframeResult[] = [];

        // Her zaman dilimi için tarama
        for (const tf of timeframes) {
          let candles: Candle[] = [];
          if (target.market === "crypto") candles = await fetchCryptoCandles(target.symbol, tf);
          else candles = await fetchStockCandles(target.symbol);
          if (candles.length < 20) continue;

          const shortCandles = candles.slice(-30);
          const patterns = detectPatterns(shortCandles);
          if (patterns.length === 0) continue;

          const best = patterns.reduce((max, p) => (p.confidence > max.confidence ? p : max), patterns[0]!);

          const lastClose = shortCandles[shortCandles.length - 1]?.close ?? 0;

          // Target/Stop yön doğrulaması
          let targetPrice = best.target ?? (best.bias === "yükseliş" ? lastClose * 1.05 : lastClose * 0.95);
          let stopPrice = best.invalidation ?? (best.bias === "yükseliş" ? lastClose * 0.97 : lastClose * 1.03);

          if (best.bias === "yükseliş") {
            if (targetPrice <= lastClose) targetPrice = lastClose * 1.05;
            if (stopPrice >= lastClose) stopPrice = lastClose * 0.97;
          } else if (best.bias === "düşüş") {
            if (targetPrice >= lastClose) targetPrice = lastClose * 0.95;
            if (stopPrice <= lastClose) stopPrice = lastClose * 1.03;
          }

          tfResults.push({
            timeframe: tf,
            bias: best.bias,
            pattern: best.name,
            confidence: best.confidence,
            entry: lastClose,
            stop: stopPrice,
            target: targetPrice,
          });
        }

        if (tfResults.length < 2) return; // En az 2 zaman dilimi gerekli

        multiScanned += 1;

        // Karşılaştırmalı yorum oluştur
        const commentary = generateMultiTfCommentary(tfResults, target.symbol);

        // Ana zaman dilimi (1h) sonucunu al
        const primary = tfResults.find((r) => r.timeframe === "1h") ?? tfResults[0]!;

        if (primary.confidence < 75) return;

        const patternKey = patternNameToKey(primary.pattern);
        if (!patternKey) return;

        // Her kullanıcı için bildirim oluştur
        for (const userId of eligibleUsers) {
          const userPattern = userPatterns.get(userId) ?? DEFAULT_USER_PATTERNS;
          if (!userPattern[patternKey]) continue;

          // Dedupe: Aynı sembol için son 6 saatte bildirim gitmişse atla
          const since = new Date(Date.now() - 6 * 3600_000).toISOString();
          const recent = await supabaseSelect(
            "short_term_notifications",
            `select=id&user_id=eq.${userId}&market=eq.${target.market}&symbol=eq.${encodeURIComponent(target.symbol)}&created_at=gt.${since}&limit=1`,
          );
          if (recent.length > 0) continue;

          const reason = `${primary.pattern} (%${primary.confidence}) · ${primary.bias} · 1H`;

          const ok = await supabaseInsert("short_term_notifications", {
            user_id: userId,
            market: target.market,
            symbol: target.symbol,
            pattern_name: primary.pattern,
            pattern_bias: primary.bias,
            confidence: primary.confidence,
            signal_score: primary.confidence,
            entry: primary.entry,
            stop: primary.stop,
            target: primary.target,
            reason,
            fear_greed: fearGreed?.value ?? null,
            timeframe: "multi",
            multi_tf_commentary: commentary,
            multi_tf_data: tfResults,
          });
          if (ok) multiCreated += 1;
        }
      } catch (err) {
        console.error(`Çoklu TF hatası (${target.symbol}):`, err);
      }
    }));
  }

  return { multiScanned, multiCreated, multiUsers: eligibleUsers.length };
}

// ==========================================================
// HANDLER
// ==========================================================

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(200).end();

  try {
    if (request.method !== "GET" && request.method !== "POST") {
      return response.status(405).json({ success: false, error: "Sadece GET/POST" });
    }

    console.log("🔍 Çoklu zaman dilimi tarama başladı...");
    const result = await scanMultiTimeframe();
    console.log(`✅ Çoklu TF tamamlandı:`, result);

    return response.status(200).json({
      success: true,
      message: "Çoklu zaman dilimi tarama tamamlandı.",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Hata:", error);
    return response.status(500).json({ success: false, error: message });
  }
}