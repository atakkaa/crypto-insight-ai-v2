// api/scan-short-term.ts — Kısa Vadeli Premium Tarama (Çoklu Zaman Dilimi + Paralel İşleme)

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

type RequestLike = {
  method?: string;
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

type TrackingRow = {
  user_id: string;
  market: string;
  symbol: string;
};

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

// ==========================================================
// ZAMAN DİLİMİNE GÖRE VARLIK LİSTELERİ (OPTİMİZASYON)
// ==========================================================

const TF_SYMBOLS: Record<string, { crypto: string[]; bist: string[]; us: string[] }> = {
  "15m": {
    crypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "TRXUSDT", "LTCUSDT", "ATOMUSDT", "UNIUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT"],
    bist: ["THYAO.IS", "ASELS.IS", "GARAN.IS", "AKBNK.IS", "EREGL.IS"],
    us: ["AAPL.US", "MSFT.US", "NVDA.US", "TSLA.US", "AMZN.US"],
  },
  "1h": {
    crypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "TRXUSDT", "LTCUSDT", "BCHUSDT", "ATOMUSDT", "UNIUSDT", "AAVEUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "TONUSDT", "SHIBUSDT", "PEPEUSDT", "INJUSDT", "SEIUSDT", "TIAUSDT", "RUNEUSDT", "FETUSDT"],
    bist: ["THYAO.IS", "ASELS.IS", "TUPRS.IS", "BIMAS.IS", "GARAN.IS", "AKBNK.IS", "ISCTR.IS", "YKBNK.IS", "KCHOL.IS", "SAHOL.IS"],
    us: ["AAPL.US", "MSFT.US", "NVDA.US", "AMZN.US", "GOOGL.US", "META.US", "TSLA.US", "JPM.US", "WMT.US", "ORCL.US"],
  },
  "4h": {
    crypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "TRXUSDT", "LTCUSDT", "ATOMUSDT", "UNIUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT"],
    bist: ["THYAO.IS", "ASELS.IS", "GARAN.IS", "AKBNK.IS", "EREGL.IS"],
    us: ["AAPL.US", "MSFT.US", "NVDA.US", "TSLA.US", "AMZN.US"],
  },
  "1d": {
    crypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "TRXUSDT", "LTCUSDT", "ATOMUSDT", "UNIUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT"],
    bist: ["THYAO.IS", "ASELS.IS", "GARAN.IS", "AKBNK.IS", "EREGL.IS"],
    us: ["AAPL.US", "MSFT.US", "NVDA.US", "TSLA.US", "AMZN.US"],
  },
};

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
  let gainSum = 0;
  let lossSum = 0;
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

function calcBollinger(values: number[], period = 20, mult = 2) {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    const variance = slice.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / slice.length;
    const sd = Math.sqrt(variance);
    middle.push(avg);
    upper.push(avg + mult * sd);
    lower.push(avg - mult * sd);
  }
  return { middle, upper, lower };
}

function calculateIndicatorData(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const rsi = calcRSI(closes, 14);
  const { macd, signal, histogram } = calcMACD(closes);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const bb = calcBollinger(closes, 20, 2);
  const avgVol = calcSMA(volumes, 20);
  const last = candles.length - 1;
  const curVol = volumes[last] ?? 0;
  const curAvgVol = avgVol[last] ?? 0;
  return {
    rsi: rsi[last] ?? 50,
    macd: macd[last] ?? 0,
    macdSignal: signal[last] ?? 0,
    macdHistogram: histogram[last] ?? 0,
    ema20: ema20[last] ?? 0,
    ema50: ema50[last] ?? 0,
    ema200: ema200[last] ?? 0,
    bollingerUpper: bb.upper[last] ?? 0,
    bollingerMiddle: bb.middle[last] ?? 0,
    bollingerLower: bb.lower[last] ?? 0,
    adx: 0,
    volume: curVol,
    averageVolume: curAvgVol,
    volumeRatio: curAvgVol > 0 ? curVol / curAvgVol : 0,
  };
}

// ==========================================================
// FORMASYON TESPİTİ (16 FORMASYON)
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
        const neckline = Math.max(...recentHighs.slice(minIdx, 15));
        patterns.push({
          name: "İkili Dip", bias: "yükseliş", confidence: 78,
          reasons: [`İki dip aynı seviyede`, `Boyun: ${neckline.toFixed(4)}`],
          support: minLow, resistance: neckline, target: neckline + (neckline - minLow), invalidation: minLow * 0.98,
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
        const neckline = Math.min(...recentLows.slice(maxIdx, 15));
        patterns.push({
          name: "İkili Tepe", bias: "düşüş", confidence: 78,
          reasons: [`İki tepe aynı seviyede`, `Boyun: ${neckline.toFixed(4)}`],
          support: neckline, resistance: maxHigh, target: neckline - (maxHigh - neckline), invalidation: maxHigh * 1.02,
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
      patterns.push({
        name: "Yükselen Üçgen", bias: "yükseliş", confidence: 80,
        reasons: [`Yatay direnç: ${firstHigh.toFixed(4)}`, `Yükselen dip`],
        support: firstLow, resistance: firstHigh, target: firstHigh + (firstHigh - firstLow), invalidation: secondLow * 0.98,
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
      patterns.push({
        name: "Düşen Üçgen", bias: "düşüş", confidence: 80,
        reasons: [`Düşen direnç`, `Yatay destek: ${firstLow.toFixed(4)}`],
        support: firstLow, resistance: firstHigh, target: firstLow - (firstHigh - firstLow), invalidation: secondHigh * 1.02,
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
        patterns.push({
          name: "Omuz-Baş-Omuz", bias: "düşüş", confidence: 85,
          reasons: [`Sol: ${ls.toFixed(4)}, Baş: ${head.toFixed(4)}, Sağ: ${rs.toFixed(4)}`],
          support: neckline, resistance: head, target: neckline - (head - neckline), invalidation: head * 1.02,
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
        patterns.push({
          name: "Ters OBO", bias: "yükseliş", confidence: 85,
          reasons: [`Sol: ${ls.toFixed(4)}, Baş: ${head.toFixed(4)}, Sağ: ${rs.toFixed(4)}`],
          support: head, resistance: neckline, target: neckline + (neckline - head), invalidation: head * 0.98,
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
        patterns.push({
          name: "Üçlü Dip", bias: "yükseliş", confidence: 82,
          reasons: [`Üç dip aynı seviyede`],
          support: d1, resistance: neckline, target: neckline + (neckline - d1), invalidation: d1 * 0.98,
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
        patterns.push({
          name: "Üçlü Tepe", bias: "düşüş", confidence: 82,
          reasons: [`Üç tepe aynı seviyede`],
          support: neckline, resistance: t1, target: neckline - (t1 - neckline), invalidation: t1 * 1.02,
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
        patterns.push({
          name: "Yükselen Kama", bias: "düşüş", confidence: 78,
          reasons: [`Yükselen kama + düşüş kırılımı`],
          support: rl, resistance: rh, target: rl - (rh - rl), invalidation: rh * 1.02,
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
        patterns.push({
          name: "Düşen Kama", bias: "yükseliş", confidence: 78,
          reasons: [`Düşen kama + yükseliş kırılımı`],
          support: rl, resistance: rh, target: rh + (rh - rl), invalidation: rl * 0.98,
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
        patterns.push({
          name: "Boğa Bayrağı", bias: "yükseliş", confidence: 80,
          reasons: [`Güçlü yükseliş + bayrak`],
          support: fl[fl.length - 1] ?? null, resistance: fh[0] ?? null, target: lastClose + flagH, invalidation: (fl[fl.length - 1] ?? 0) * 0.98,
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
        patterns.push({
          name: "Ayı Bayrağı", bias: "düşüş", confidence: 80,
          reasons: [`Güçlü düşüş + bayrak`],
          support: fl[0] ?? null, resistance: fh[fh.length - 1] ?? null, target: lastClose - flagH, invalidation: (fh[fh.length - 1] ?? 0) * 1.02,
        });
      }
    }
  } catch {}

  // 13. Boğa Flaması
  try {
    if (candles.length >= 30) {
      const first = closes.slice(0, 10);
      const rise = (first[9] ?? 0) - (first[0] ?? 0);
      const strongRise = rise > 0 && rise / (first[0] ?? 1) > 0.05;
      const h = candles.slice(-30).map((c) => c.high);
      const l = candles.slice(-30).map((c) => c.low);
      const ph = h.slice(10, 25);
      const pl = l.slice(10, 25);
      const r1 = (Math.max(...ph.slice(0, 7)) - Math.min(...pl.slice(0, 7)));
      const r2 = (Math.max(...ph.slice(7)) - Math.min(...pl.slice(7)));
      if (strongRise && r2 < r1 * 0.6 && lastClose > (Math.max(...ph) ?? 0)) {
        patterns.push({
          name: "Boğa Flaması", bias: "yükseliş", confidence: 78,
          reasons: [`Güçlü yükseliş + flama`],
          support: Math.min(...pl) ?? null, resistance: Math.max(...ph) ?? null, target: lastClose + rise * 0.8, invalidation: (Math.min(...pl) ?? 0) * 0.98,
        });
      }
    }
  } catch {}

  // 14. Ayı Flaması
  try {
    if (candles.length >= 30) {
      const first = closes.slice(0, 10);
      const drop = (first[0] ?? 0) - (first[9] ?? 0);
      const strongDrop = drop > 0 && drop / (first[0] ?? 1) > 0.05;
      const h = candles.slice(-30).map((c) => c.high);
      const l = candles.slice(-30).map((c) => c.low);
      const ph = h.slice(10, 25);
      const pl = l.slice(10, 25);
      const r1 = (Math.max(...ph.slice(0, 7)) - Math.min(...pl.slice(0, 7)));
      const r2 = (Math.max(...ph.slice(7)) - Math.min(...pl.slice(7)));
      if (strongDrop && r2 < r1 * 0.6 && lastClose < (Math.min(...pl) ?? 0)) {
        patterns.push({
          name: "Ayı Flaması", bias: "düşüş", confidence: 78,
          reasons: [`Güçlü düşüş + flama`],
          support: Math.min(...pl) ?? null, resistance: Math.max(...ph) ?? null, target: lastClose - drop * 0.8, invalidation: (Math.max(...ph) ?? 0) * 1.02,
        });
      }
    }
  } catch {}

  // 15. Fincan-Kulp
  try {
    if (candles.length >= 50) {
      const h = candles.slice(-50).map((c) => c.high);
      const l = candles.slice(-50).map((c) => c.low);
      const cl = Math.max(...h.slice(0, 5));
      const cb = Math.min(...l.slice(10, 30));
      const cr = Math.max(...h.slice(30, 35));
      const isCup = cl > cb * 1.03 && cr > cb * 1.03 && Math.abs(cl - cr) / cl < 0.05;
      const hl = Math.min(...l.slice(35, 50));
      const hd = (cr - hl) / cr;
      const isHandle = hd < 0.3 && hd > 0.05;
      if (isCup && isHandle && lastClose > cr) {
        patterns.push({
          name: "Fincan-Kulp", bias: "yükseliş", confidence: 82,
          reasons: [`Fincan + kulp tamamlandı`],
          support: cb, resistance: cr, target: lastClose + (cr - cb), invalidation: hl * 0.98,
        });
      }
    }
  } catch {}

  // 16. Simetrik Üçgen
  try {
    if (candles.length >= 30) {
      const fh = Math.max(...recentHighs.slice(0, 15));
      const sh = Math.max(...recentHighs.slice(15));
      const fl = Math.min(...recentLows.slice(0, 15));
      const sl = Math.min(...recentLows.slice(15));
      if (sh < fh * 0.99 && sl > fl * 1.01) {
        patterns.push({
          name: "Simetrik Üçgen", bias: "nötr", confidence: 72,
          reasons: [`Düşen direnç + yükselen destek`, `Kırılım yönü belirsiz`],
          support: sl, resistance: sh, target: null, invalidation: null,
        });
      }
    }
  } catch {}

  return patterns;
}

// ==========================================================
// VERİ ÇEKME
// ==========================================================

async function fetchCryptoCandles(symbol: string, interval = "1h"): Promise<Candle[]> {
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

function getDedupeHoursForTf(tf: string): number {
  switch (tf) {
    case "15m": return 1;
    case "1h": return 4;
    case "4h": return 12;
    case "1d": return 24;
    default: return 4;
  }
}

// ==========================================================
// ANA FONKSİYON (KULLANICI ODAKLI)
// ==========================================================

async function scanShortTermForPremium(timeframe: string) {
  const tracking = (await supabaseSelect("short_term_tracking", "select=user_id,market,symbol&limit=500")) as TrackingRow[];
  if (tracking.length === 0) return { scanned: [], created: 0, tracked: 0, filtered: 0 };

  const userIds: string[] = [...new Set(tracking.map((r) => r.user_id))];
  if (userIds.length === 0) return { scanned: [], created: 0, tracked: 0, filtered: 0 };

  const profiles = (await supabaseSelect("profiles", `select=id,role,membership,trial_ends_at,short_term_patterns&id=in.(${userIds.join(",")})`)) as ProfileRow[];

  const paidUserIds = new Set<string>();
  const userPatterns = new Map<string, UserShortTermPatterns>();

  for (const p of profiles) {
    const role = String(p.role ?? "user");
    const membership = String(p.membership ?? "free");
    const trialEndsAt = p.trial_ends_at;

    if (role === "admin" || membership === "premium") {
      paidUserIds.add(p.id);
      userPatterns.set(p.id, p.short_term_patterns ?? DEFAULT_USER_PATTERNS);
    } else if (membership === "trial" && trialEndsAt) {
      if (new Date(trialEndsAt).getTime() >= Date.now()) {
        paidUserIds.add(p.id);
        userPatterns.set(p.id, p.short_term_patterns ?? DEFAULT_USER_PATTERNS);
      }
    }
  }

  const filteredRows = tracking.filter((r) => paidUserIds.has(r.user_id));
  const groups = new Map<string, { market: string; symbol: string; users: string[] }>();
  for (const row of filteredRows) {
    const key = `${row.market}:${row.symbol}`;
    const entry = groups.get(key) ?? { market: row.market, symbol: row.symbol, users: [] };
    entry.users.push(row.user_id);
    groups.set(key, entry);
  }

  const targets = [...groups.values()].slice(0, 20);
  const dedupeHours = getDedupeHoursForTf(timeframe);
  const since = new Date(Date.now() - dedupeHours * 3600_000).toISOString();
  const fearGreed = await fetchFearGreed();
  let created = 0;
  const scanned: string[] = [];

  // Paralel işleme (aynı anda 5 varlık)
  const CONCURRENCY = 5;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (target) => {
      try {
        let candles: Candle[] = [];
        if (target.market === "crypto") candles = await fetchCryptoCandles(target.symbol, timeframe);
        else candles = await fetchStockCandles(target.symbol);
        if (candles.length < 20) return;

        const shortCandles = candles.slice(-30);
        const indicators = calculateIndicatorData(shortCandles);
        const patterns = detectPatterns(shortCandles);
        scanned.push(target.symbol);
        if (patterns.length === 0) return;

        const best = patterns.reduce((max, p) => (p.confidence > max.confidence ? p : max), patterns[0]!);
        if (best.confidence < 75) return;

        const sameDirCount = [
          best.bias === "yükseliş" ? indicators.rsi > 50 : indicators.rsi < 50,
          best.bias === "yükseliş" ? indicators.macdHistogram > 0 : indicators.macdHistogram < 0,
        ].filter(Boolean).length;
        if (sameDirCount < 1) return;
        if (indicators.volumeRatio < 1.2) return;
        if (target.market === "crypto" && fearGreed && (fearGreed.value >= 85 || fearGreed.value <= 15)) return;

        const lastClose = shortCandles[shortCandles.length - 1]?.close ?? 0;
        const stop = best.invalidation ?? (best.bias === "yükseliş" ? lastClose * 0.97 : lastClose * 1.03);
        const targetPrice = best.target ?? (best.bias === "yükseliş" ? lastClose * 1.05 : lastClose * 0.95);
        const reason = `${best.name} (%${best.confidence}) · RSI: ${indicators.rsi.toFixed(1)} · MACD: ${indicators.macdHistogram.toFixed(4)} · Hacim: ${(indicators.volumeRatio * 100).toFixed(0)}% · ${timeframe.toUpperCase()}`;

        const patternKey = patternNameToKey(best.name);

        for (const userId of [...new Set(target.users)]) {
          if (patternKey) {
            const userPattern = userPatterns.get(userId) ?? DEFAULT_USER_PATTERNS;
            if (!userPattern[patternKey]) continue;
          }

          const recent = await supabaseSelect("short_term_notifications", `select=id&user_id=eq.${userId}&market=eq.${target.market}&symbol=eq.${encodeURIComponent(target.symbol)}&pattern_bias=eq.${encodeURIComponent(best.bias)}&timeframe=eq.${timeframe}&created_at=gt.${since}&limit=1`);
          if (recent.length > 0) continue;

          const ok = await supabaseInsert("short_term_notifications", {
            user_id: userId, market: target.market, symbol: target.symbol,
            pattern_name: best.name, pattern_bias: best.bias,
            confidence: best.confidence, signal_score: best.confidence,
            entry: lastClose, stop, target: targetPrice, reason,
            fear_greed: fearGreed?.value ?? null,
            timeframe,
          });
          if (ok) created += 1;
        }
      } catch (err) { console.error(`Hata (${target.symbol}):`, err); }
    }));
  }

  return { scanned, created, tracked: groups.size, filtered: filteredRows.length };
}

// ==========================================================
// GLOBAL TARAMA (PARALEL İŞLEME)
// ==========================================================

async function scanGlobalShortTerm(timeframe: string) {
  const tfSymbols = TF_SYMBOLS[timeframe] ?? TF_SYMBOLS["1h"]!;
  const allSymbols: Array<{ market: string; symbol: string }> = [];
  for (const s of tfSymbols.crypto) allSymbols.push({ market: "crypto", symbol: s });
  for (const s of tfSymbols.bist) allSymbols.push({ market: "bist", symbol: s });
  for (const s of tfSymbols.us) allSymbols.push({ market: "us", symbol: s });

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
    return { globalScanned: 0, globalCreated: 0, globalUsers: 0 };
  }

  const dedupeHours = getDedupeHoursForTf(timeframe) * 1.5;
  const since = new Date(Date.now() - dedupeHours * 3600_000).toISOString();
  const fearGreed = await fetchFearGreed();

  let globalCreated = 0;
  let globalScanned = 0;

  // Paralel işleme (aynı anda 10 varlık)
  const CONCURRENCY = 10;
  for (let i = 0; i < allSymbols.length; i += CONCURRENCY) {
    const batch = allSymbols.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (target) => {
      try {
        let candles: Candle[] = [];
        if (target.market === "crypto") candles = await fetchCryptoCandles(target.symbol, timeframe);
        else candles = await fetchStockCandles(target.symbol);
        if (candles.length < 20) return;

        const shortCandles = candles.slice(-30);
        const indicators = calculateIndicatorData(shortCandles);
        const patterns = detectPatterns(shortCandles);
        if (patterns.length === 0) return;

        const best = patterns.reduce((max, p) => (p.confidence > max.confidence ? p : max), patterns[0]!);

        if (best.confidence < 85) return;
        if (best.bias === "nötr") return;

        const sameDirCount = [
          best.bias === "yükseliş" ? indicators.rsi > 50 : indicators.rsi < 50,
          best.bias === "yükseliş" ? indicators.macdHistogram > 0 : indicators.macdHistogram < 0,
        ].filter(Boolean).length;
        if (sameDirCount < 2) return;
        if (indicators.volumeRatio < 1.5) return;
        if (target.market === "crypto" && fearGreed && (fearGreed.value >= 90 || fearGreed.value <= 10)) return;

        globalScanned += 1;
        const lastClose = shortCandles[shortCandles.length - 1]?.close ?? 0;
        const stop = best.invalidation ?? (best.bias === "yükseliş" ? lastClose * 0.97 : lastClose * 1.03);
        const targetPrice = best.target ?? (best.bias === "yükseliş" ? lastClose * 1.05 : lastClose * 0.95);
        const reason = `${best.name} (%${best.confidence}) · RSI: ${indicators.rsi.toFixed(1)} · MACD: ${indicators.macdHistogram.toFixed(4)} · Hacim: ${(indicators.volumeRatio * 100).toFixed(0)}% · ${timeframe.toUpperCase()} · GLOBAL`;

        const patternKey = patternNameToKey(best.name);

        for (const userId of eligibleUsers) {
          if (patternKey) {
            const userPattern = userPatterns.get(userId) ?? DEFAULT_USER_PATTERNS;
            if (!userPattern[patternKey]) continue;
          }

          const recent = await supabaseSelect(
            "short_term_notifications",
            `select=id&user_id=eq.${userId}&market=eq.${target.market}&symbol=eq.${encodeURIComponent(target.symbol)}&pattern_bias=eq.${encodeURIComponent(best.bias)}&timeframe=eq.${timeframe}&created_at=gt.${since}&limit=1`,
          );
          if (recent.length > 0) continue;

          const ok = await supabaseInsert("short_term_notifications", {
            user_id: userId,
            market: target.market,
            symbol: target.symbol,
            pattern_name: best.name,
            pattern_bias: best.bias,
            confidence: best.confidence,
            signal_score: best.confidence,
            entry: lastClose,
            stop,
            target: targetPrice,
            reason,
            fear_greed: fearGreed?.value ?? null,
            timeframe,
          });
          if (ok) globalCreated += 1;
        }
      } catch (err) {
        console.error(`Global tarama hatası (${target.symbol}):`, err);
      }
    }));
  }

  return { globalScanned, globalCreated, globalUsers: eligibleUsers.length };
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

    const tfRaw = String(request.query?.["tf"] ?? "1h").toLowerCase();
    const allowedTfs = ["15m", "1h", "4h", "1d"];
    const timeframe = allowedTfs.includes(tfRaw) ? tfRaw : "1h";

    console.log(`🔍 Kısa vadeli tarama başladı (${timeframe})...`);
    const result = await scanShortTermForPremium(timeframe);
    console.log(`✅ Kullanıcı odaklı tamamlandı (${timeframe}):`, result);

    console.log(`🌍 Global tarama başladı (${timeframe})...`);
    const globalResult = await scanGlobalShortTerm(timeframe);
    console.log(`✅ Global tamamlandı (${timeframe}):`, globalResult);

    return response.status(200).json({
      success: true,
      message: `Tamamlandı (${timeframe}).`,
      timeframe,
      ...result,
      ...globalResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Hata:", error);
    return response.status(500).json({ success: false, error: message });
  }
}