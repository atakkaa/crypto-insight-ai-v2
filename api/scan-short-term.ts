// api/scan-short-term.ts — Kısa Vadeli (20-30 Mum) Premium Tarama (Self-Contained)

// ==========================================================
// ENV
// ==========================================================

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

// Kullanıcının seçtiği formasyonlar
type UserShortTermPatterns = {
  ikili_dip: boolean;
  ikili_tepe: boolean;
  yukselen_ucgen: boolean;
  dusen_ucgen: boolean;
  obo: boolean;
  ters_obo: boolean;
};

const DEFAULT_USER_PATTERNS: UserShortTermPatterns = {
  ikili_dip: true,
  ikili_tepe: true,
  yukselen_ucgen: true,
  dusen_ucgen: true,
  obo: true,
  ters_obo: true,
};

// Formasyon adı → kullanıcı tercihi anahtarı
function patternNameToKey(name: string): keyof UserShortTermPatterns | null {
  const lower = name.toLowerCase();
  if (lower.includes("ikili dip")) return "ikili_dip";
  if (lower.includes("ikili tepe")) return "ikili_tepe";
  if (lower.includes("yükselen üçgen") || lower.includes("yukselen ucgen")) return "yukselen_ucgen";
  if (lower.includes("düşen üçgen") || lower.includes("dusen ucgen")) return "dusen_ucgen";
  if (lower.includes("ters obo")) return "ters_obo";
  if (lower.includes("obo") || lower.includes("omuz")) return "obo";
  return null;
}

// Popüler varlık listeleri (global tarama için)
const CRYPTO_TOP_50 = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT",
  "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "TRXUSDT", "LTCUSDT", "BCHUSDT",
  "ATOMUSDT", "UNIUSDT", "AAVEUSDT", "FILUSDT", "NEARUSDT", "ICPUSDT",
  "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "TONUSDT", "SHIBUSDT", "PEPEUSDT",
  "WIFUSDT", "BONKUSDT", "INJUSDT", "SEIUSDT", "TIAUSDT", "RUNEUSDT", "FETUSDT",
  "RENDERUSDT", "JUPUSDT", "PYTHUSDT", "STRKUSDT", "WLDUSDT", "ORDIUSDT",
  "ENAUSDT", "ETHFIUSDT", "REZUSDT", "OMNIUSDT", "SAGAUSDT", "TNSRUSDT", "WUSDT",
  "ZECUSDT", "DASHUSDT", "COMPUSDT",
];

const BIST_TOP_30 = [
  "THYAO.IS", "ASELS.IS", "TUPRS.IS", "BIMAS.IS", "GARAN.IS", "AKBNK.IS",
  "ISCTR.IS", "YKBNK.IS", "KCHOL.IS", "SAHOL.IS", "SISE.IS", "EREGL.IS",
  "PETKM.IS", "FROTO.IS", "TOASO.IS", "TAVHL.IS", "TCELL.IS", "MGROS.IS",
  "ENKAI.IS", "HEKTS.IS", "SASA.IS", "PGSUS.IS", "AEFES.IS", "ULKER.IS",
  "DOAS.IS", "KOZAL.IS", "KRDMD.IS", "ALARK.IS", "CCOLA.IS", "OYAKC.IS",
];

const US_TOP_30 = [
  "AAPL.US", "MSFT.US", "NVDA.US", "AMZN.US", "GOOGL.US", "META.US", "AVGO.US",
  "TSLA.US", "JPM.US", "WMT.US", "ORCL.US", "LLY.US", "V.US", "MA.US", "XOM.US",
  "COST.US", "NFLX.US", "AMD.US", "CRM.US", "QCOM.US", "CSCO.US", "IBM.US",
  "NOW.US", "PLTR.US", "MU.US", "AMAT.US", "TXN.US", "INTU.US", "CAT.US", "BA.US",
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
// FORMASYON TESPİTİ
// ==========================================================

function detectPatterns(candles: Candle[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  if (candles.length < 30) return patterns;
  const closes = candles.map((c) => c.close);
  const n = candles.length;

    // İkili Dip
  try {
    const recentLows = candles.slice(-30).map((c) => c.low);
    const recentHighs = candles.slice(-30).map((c) => c.high);
    const minLow = Math.min(...recentLows);
    const minIdx = recentLows.indexOf(minLow);
    if (minIdx >= 0 && minIdx < 15) {
      const secondMin = Math.min(...recentLows.slice(15));
      if (Math.abs(minLow - secondMin) / minLow < 0.03 && secondMin > minLow * 0.97) {
        const cur = closes[n - 1] ?? 0;
        if (cur > minLow * 1.02) {
          // Boyun çizgisi: iki dip arasındaki en yüksek nokta
          const neckline = Math.max(...recentHighs.slice(minIdx, 15));
          patterns.push({
            name: "İkili Dip", bias: "yükseliş", confidence: 75,
            reasons: [`İki dip aynı seviyede (${minLow.toFixed(4)}, ${secondMin.toFixed(4)})`, `Fiyat dip üzerinde`],
            support: minLow, resistance: neckline, target: neckline + (neckline - minLow), invalidation: minLow * 0.98,
          });
        }
      }
    }
  } catch {}

    // İkili Tepe
  try {
    const recentHighs = candles.slice(-30).map((c) => c.high);
    const recentLows = candles.slice(-30).map((c) => c.low);
    const maxHigh = Math.max(...recentHighs);
    const maxIdx = recentHighs.indexOf(maxHigh);
    if (maxIdx >= 0 && maxIdx < 15) {
      const secondMax = Math.max(...recentHighs.slice(15));
      if (Math.abs(maxHigh - secondMax) / maxHigh < 0.03) {
        const cur = closes[n - 1] ?? 0;
        if (cur < maxHigh * 0.98) {
          // Boyun çizgisi: iki tepe arasındaki en düşük nokta
          const neckline = Math.min(...recentLows.slice(maxIdx, 15));
          patterns.push({
            name: "İkili Tepe", bias: "düşüş", confidence: 75,
            reasons: [`İki tepe aynı seviyede`, `Fiyat tepe altında`],
            support: neckline, resistance: maxHigh, target: neckline - (maxHigh - neckline), invalidation: maxHigh * 1.02,
          });
        }
      }
    }
  } catch {}

  // Yükselen Üçgen
  try {
    const h = candles.slice(-30).map((c) => c.high);
    const l = candles.slice(-30).map((c) => c.low);
    const firstHigh = Math.max(...h.slice(0, 15));
    const secondHigh = Math.max(...h.slice(15));
    const firstLow = Math.min(...l.slice(0, 15));
    const secondLow = Math.min(...l.slice(15));
    if (Math.abs(firstHigh - secondHigh) / firstHigh < 0.02 && secondLow > firstLow * 1.02) {
      const cur = closes[n - 1] ?? 0;
      if (cur > secondHigh * 0.99) {
        patterns.push({
          name: "Yükselen Üçgen", bias: "yükseliş", confidence: 80,
          reasons: [`Yatay direnç ${firstHigh.toFixed(4)}`, `Yükselen dip`],
          support: firstLow, resistance: firstHigh, target: firstHigh + (firstHigh - firstLow), invalidation: secondLow * 0.98,
        });
      }
    }
  } catch {}

  // Düşen Üçgen
  try {
    const h = candles.slice(-30).map((c) => c.high);
    const l = candles.slice(-30).map((c) => c.low);
    const firstHigh = Math.max(...h.slice(0, 15));
    const secondHigh = Math.max(...h.slice(15));
    const firstLow = Math.min(...l.slice(0, 15));
    const secondLow = Math.min(...l.slice(15));
    if (secondHigh < firstHigh * 0.98 && Math.abs(firstLow - secondLow) / firstLow < 0.02) {
      const cur = closes[n - 1] ?? 0;
      if (cur < secondLow * 1.01) {
        patterns.push({
          name: "Düşen Üçgen", bias: "düşüş", confidence: 80,
          reasons: [`Düşen direnç`, `Yatay destek ${firstLow.toFixed(4)}`],
          support: firstLow, resistance: firstHigh, target: firstLow - (firstHigh - firstLow), invalidation: secondHigh * 1.02,
        });
      }
    }
  } catch {}

  return patterns;
}

// ==========================================================
// VERİ ÇEKME
// ==========================================================

async function fetchCryptoCandles(symbol: string): Promise<Candle[]> {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=150`);
  if (!res.ok) return [];
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
  }));
}

async function fetchStockCandles(symbol: string): Promise<Candle[]> {
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
// ANA FONKSİYON
// ==========================================================

async function scanShortTermForPremium() {
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
  const since = new Date(Date.now() - 4 * 3600_000).toISOString();
  const fearGreed = await fetchFearGreed();
  let created = 0;
  const scanned: string[] = [];

  for (const target of targets) {
    try {
      let candles: Candle[] = [];
      if (target.market === "crypto") candles = await fetchCryptoCandles(target.symbol);
      else candles = await fetchStockCandles(target.symbol);
      if (candles.length < 20) continue;

      const shortCandles = candles.slice(-30);
      const indicators = calculateIndicatorData(shortCandles);
      const patterns = detectPatterns(shortCandles);
      scanned.push(target.symbol);
      if (patterns.length === 0) continue;

      const best = patterns.reduce((max, p) => (p.confidence > max.confidence ? p : max), patterns[0]!);
      if (best.confidence < 75) continue;

      const sameDirCount = [
        best.bias === "yükseliş" ? indicators.rsi > 50 : indicators.rsi < 50,
        best.bias === "yükseliş" ? indicators.macdHistogram > 0 : indicators.macdHistogram < 0,
      ].filter(Boolean).length;
      if (sameDirCount < 1) continue;
      if (indicators.volumeRatio < 1.2) continue;
      if (target.market === "crypto" && fearGreed && (fearGreed.value >= 85 || fearGreed.value <= 15)) continue;

      const lastClose = shortCandles[shortCandles.length - 1]?.close ?? 0;
      const stop = best.invalidation ?? (best.bias === "yükseliş" ? lastClose * 0.97 : lastClose * 1.03);
      const targetPrice = best.target ?? (best.bias === "yükseliş" ? lastClose * 1.05 : lastClose * 0.95);
      const reason = `${best.name} (%${best.confidence}) · RSI: ${indicators.rsi.toFixed(1)} · MACD: ${indicators.macdHistogram.toFixed(4)} · Hacim: ${(indicators.volumeRatio * 100).toFixed(0)}%`;

      // Formasyon adı → kullanıcı tercihi anahtarı
      const patternKey = patternNameToKey(best.name);

      for (const userId of [...new Set(target.users)]) {
        // Kullanıcının bu formasyonu almak isteyip istemediğini kontrol et
        if (patternKey) {
          const userPattern = userPatterns.get(userId) ?? DEFAULT_USER_PATTERNS;
          if (!userPattern[patternKey]) continue;
        }

        const recent = await supabaseSelect("short_term_notifications", `select=id&user_id=eq.${userId}&market=eq.${target.market}&symbol=eq.${encodeURIComponent(target.symbol)}&pattern_bias=eq.${encodeURIComponent(best.bias)}&created_at=gt.${since}&limit=1`);
        if (recent.length > 0) continue;

        const ok = await supabaseInsert("short_term_notifications", {
          user_id: userId, market: target.market, symbol: target.symbol,
          pattern_name: best.name, pattern_bias: best.bias,
          confidence: best.confidence, signal_score: best.confidence,
          entry: lastClose, stop, target: targetPrice, reason,
          fear_greed: fearGreed?.value ?? null,
        });
        if (ok) created += 1;
      }
    } catch (err) { console.error(`Hata (${target.symbol}):`, err); }
  }

  return { scanned, created, tracked: groups.size, filtered: filteredRows.length };
}

// ==========================================================
// GLOBAL TARAMA (Tüm piyasa)
// ==========================================================

async function scanGlobalShortTerm() {
  const allSymbols: Array<{ market: string; symbol: string }> = [];

  for (const s of CRYPTO_TOP_50) allSymbols.push({ market: "crypto", symbol: s });
  for (const s of BIST_TOP_30) allSymbols.push({ market: "bist", symbol: s });
  for (const s of US_TOP_30) allSymbols.push({ market: "us", symbol: s });

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

  const since = new Date(Date.now() - 6 * 3600_000).toISOString();
  const fearGreed = await fetchFearGreed();

  let globalCreated = 0;
  let globalScanned = 0;

  for (const target of allSymbols) {
    try {
      let candles: Candle[] = [];
      if (target.market === "crypto") candles = await fetchCryptoCandles(target.symbol);
      else candles = await fetchStockCandles(target.symbol);
      if (candles.length < 20) continue;

      const shortCandles = candles.slice(-30);
      const indicators = calculateIndicatorData(shortCandles);
      const patterns = detectPatterns(shortCandles);
      if (patterns.length === 0) continue;

      const best = patterns.reduce((max, p) => (p.confidence > max.confidence ? p : max), patterns[0]!);

      if (best.confidence < 85) continue;
      if (best.bias === "nötr") continue;

      const sameDirCount = [
        best.bias === "yükseliş" ? indicators.rsi > 50 : indicators.rsi < 50,
        best.bias === "yükseliş" ? indicators.macdHistogram > 0 : indicators.macdHistogram < 0,
      ].filter(Boolean).length;
      if (sameDirCount < 2) continue;
      if (indicators.volumeRatio < 1.5) continue;
      if (target.market === "crypto" && fearGreed && (fearGreed.value >= 90 || fearGreed.value <= 10)) continue;

      globalScanned += 1;
      const lastClose = shortCandles[shortCandles.length - 1]?.close ?? 0;
      const stop = best.invalidation ?? (best.bias === "yükseliş" ? lastClose * 0.97 : lastClose * 1.03);
      const targetPrice = best.target ?? (best.bias === "yükseliş" ? lastClose * 1.05 : lastClose * 0.95);
      const reason = `${best.name} (%${best.confidence}) · RSI: ${indicators.rsi.toFixed(1)} · MACD: ${indicators.macdHistogram.toFixed(4)} · Hacim: ${(indicators.volumeRatio * 100).toFixed(0)}% · GLOBAL`;

      const patternKey = patternNameToKey(best.name);

      for (const userId of eligibleUsers) {
        // Kullanıcının bu formasyonu almak isteyip istemediğini kontrol et
        if (patternKey) {
          const userPattern = userPatterns.get(userId) ?? DEFAULT_USER_PATTERNS;
          if (!userPattern[patternKey]) continue;
        }

        const recent = await supabaseSelect(
          "short_term_notifications",
          `select=id&user_id=eq.${userId}&market=eq.${target.market}&symbol=eq.${encodeURIComponent(target.symbol)}&pattern_bias=eq.${encodeURIComponent(best.bias)}&created_at=gt.${since}&limit=1`,
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
        });
        if (ok) globalCreated += 1;
      }
    } catch (err) {
      console.error(`Global tarama hatası (${target.symbol}):`, err);
    }
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
    console.log("🔍 Kısa vadeli tarama başladı...");
    const result = await scanShortTermForPremium();
    console.log(`✅ Kullanıcı odaklı tamamlandı:`, result);

    console.log("🌍 Global tarama başladı...");
    const globalResult = await scanGlobalShortTerm();
    console.log(`✅ Global tamamlandı:`, globalResult);

    return response.status(200).json({
      success: true,
      message: "Tamamlandı.",
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