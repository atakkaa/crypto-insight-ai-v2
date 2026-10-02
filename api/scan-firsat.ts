// api/scan-firsat.ts — Gelişmiş Piyasa Tarama Motoru

import { RSI, MACD, EMA, BollingerBands, ADX } from "technicalindicators";

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
  strength: number; // 0-100
};

type PatternSignal = {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number; // 0-100
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
  overallStrength: number; // 0-100
  isImportant: boolean;
};

// ==========================================================
// ENVIRONMENT
// ==========================================================

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

// ==========================================================
// CACHE FONKSİYONLARI
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
      body: JSON.stringify({
        cache_key: key,
        data,
        expires_at: expiresAt,
      }),
    });
  } catch (error) {
    console.error("Cache yazma hatası:", error);
  }
}

// ==========================================================
// BINANCE VERİ ÇEKME (CACHE İLE)
// ==========================================================

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

    // 10 dakika cache
    await setToCache(cacheKey, candles, 10);
    return candles;
  } catch {
    return [];
  }
}

// ==========================================================
// STOOQ HİSSE VERİSİ (CACHE İLE)
// ==========================================================

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
        const [date, open, high, low, close, volume] = line.split(",");
        return {
          time: new Date(date).getTime(),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume ?? 0),
        };
      })
      .filter((c) => Number.isFinite(c.close))
      .slice(-100);

    // 1 gün cache (günlük mumlar değişmez)
    await setToCache(cacheKey, candles, 60 * 24);
    return candles;
  } catch {
    return [];
  }
}

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

  // ========================================================
  // 1. RSI
  // ========================================================
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

  // ========================================================
  // 2. MACD
  // ========================================================
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
      const current = macdValues[macdValues.length - 1];
      const prev = macdValues[macdValues.length - 2];

      if (current && prev && current.MACD && prev.MACD && current.signal && prev.signal) {
        const crossedUp = prev.MACD <= prev.signal && current.MACD > current.signal;
        const crossedDown = prev.MACD >= prev.signal && current.MACD < current.signal;

        if (crossedUp) {
          signals.push({
            name: "MACD",
            value: "Al Kesişimi",
            direction: "bullish",
            strength: 75,
          });
        } else if (crossedDown) {
          signals.push({
            name: "MACD",
            value: "Sat Kesişimi",
            direction: "bearish",
            strength: 75,
          });
        }
      }
    }
  } catch {}

  // ========================================================
  // 3. EMA 50 / 200 (Golden/Death Cross)
  // ========================================================
  try {
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    const ema200 = EMA.calculate({ values: closes, period: 200 });

    if (ema50.length >= 2 && ema200.length >= 2) {
      const current50 = ema50[ema50.length - 1];
      const current200 = ema200[ema200.length - 1];
      const prev50 = ema50[ema50.length - 2];
      const prev200 = ema200[ema200.length - 2];

      if (current50 && current200 && prev50 && prev200) {
        if (prev50 <= prev200 && current50 > current200) {
          signals.push({
            name: "EMA",
            value: "Golden Cross (50/200)",
            direction: "bullish",
            strength: 90,
          });
        } else if (prev50 >= prev200 && current50 < current200) {
          signals.push({
            name: "EMA",
            value: "Death Cross (50/200)",
            direction: "bearish",
            strength: 90,
          });
        }
      }
    }
  } catch {}

  // ========================================================
  // 4. BOLLINGER BANDS
  // ========================================================
  try {
    const bb = BollingerBands.calculate({
      values: closes,
      period: 20,
      stdDev: 2,
    });

    if (bb.length > 0) {
      const last = bb[bb.length - 1];
      const lastClose = closes[closes.length - 1];

      if (last && last.upper && last.lower) {
        if (lastClose > last.upper) {
          signals.push({
            name: "Bollinger",
            value: "Üst Bant Kırılımı",
            direction: "bearish",
            strength: 65,
          });
        } else if (lastClose < last.lower) {
          signals.push({
            name: "Bollinger",
            value: "Alt Bant Kırılımı",
            direction: "bullish",
            strength: 65,
          });
        }
      }
    }
  } catch {}

  // ========================================================
  // 5. ADX (Trend Gücü)
  // ========================================================
  try {
    const adxValues = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    });

    if (adxValues.length > 0) {
      const last = adxValues[adxValues.length - 1];
      if (last && last.adx && last.adx > 40) {
        signals.push({
          name: "ADX",
          value: last.adx.toFixed(1),
          direction: "neutral",
          strength: 60,
        });
      }
    }
  } catch {}

  // ========================================================
  // 6. HACİM
  // ========================================================
  try {
    if (volumes.length >= 20) {
      const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const currentVolume = volumes[volumes.length - 1];

      if (currentVolume > avgVolume * 2) {
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
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // ========================================================
  // 1. İKİLİ DİP (Bullish)
  // ========================================================
  try {
    const recent = candles.slice(-30);
    const recentLows = recent.map((c) => c.low);
    const minLow = Math.min(...recentLows);
    const minIndex = recentLows.indexOf(minLow);

    // İlk dip son 25 mumda, ikinci dip son 10 mumda
    if (minIndex < 20 && minIndex > 0) {
      const secondHalf = recentLows.slice(15);
      const secondMin = Math.min(...secondHalf);
      const diff = Math.abs(minLow - secondMin) / minLow;

      // İki dip birbirine %3 yakın
      if (diff < 0.03 && secondMin > minLow * 0.97) {
        const currentClose = closes[closes.length - 1];
        if (currentClose > minLow * 1.02) {
          patterns.push({
            name: "İkili Dip",
            direction: "bullish",
            confidence: 75,
            description: "Son 30 mumda iki dip oluştu, kırılım onaylandı",
          });
        }
      }
    }
  } catch {}

  // ========================================================
  // 2. İKİLİ TEPE (Bearish)
  // ========================================================
  try {
    const recent = candles.slice(-30);
    const recentHighs = recent.map((c) => c.high);
    const maxHigh = Math.max(...recentHighs);
    const maxIndex = recentHighs.indexOf(maxHigh);

    if (maxIndex < 20 && maxIndex > 0) {
      const secondHalf = recentHighs.slice(15);
      const secondMax = Math.max(...secondHalf);
      const diff = Math.abs(maxHigh - secondMax) / maxHigh;

      if (diff < 0.03 && secondMax < maxHigh * 1.03) {
        const currentClose = closes[closes.length - 1];
        if (currentClose < maxHigh * 0.98) {
          patterns.push({
            name: "İkili Tepe",
            direction: "bearish",
            confidence: 75,
            description: "Son 30 mumda iki tepe oluştu, kırılım aşağı",
          });
        }
      }
    }
  } catch {}

  // ========================================================
  // 3. YÜKSELEN ÜÇGEN (Bullish)
  // ========================================================
  try {
    const recent = candles.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);

    // Tepe noktaları yatay, dip noktaları yükseliyor
    const firstHalfHigh = Math.max(...highs.slice(0, 15));
    const secondHalfHigh = Math.max(...highs.slice(15));
    const firstHalfLow = Math.min(...lows.slice(0, 15));
    const secondHalfLow = Math.min(...lows.slice(15));

    const highFlat = Math.abs(firstHalfHigh - secondHalfHigh) / firstHalfHigh < 0.02;
    const lowRising = secondHalfLow > firstHalfLow * 1.02;

    if (highFlat && lowRising) {
      const currentClose = closes[closes.length - 1];
      if (currentClose > secondHalfHigh * 0.99) {
        patterns.push({
          name: "Yükselen Üçgen",
          direction: "bullish",
          confidence: 80,
          description: "Yatay direnç + yükselen dip, kırılım yukarı",
        });
      }
    }
  } catch {}

  // ========================================================
  // 4. DÜŞEN ÜÇGEN (Bearish)
  // ========================================================
  try {
    const recent = candles.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);

    const firstHalfHigh = Math.max(...highs.slice(0, 15));
    const secondHalfHigh = Math.max(...highs.slice(15));
    const firstHalfLow = Math.min(...lows.slice(0, 15));
    const secondHalfLow = Math.min(...lows.slice(15));

    const highFalling = secondHalfHigh < firstHalfHigh * 0.98;
    const lowFlat = Math.abs(firstHalfLow - secondHalfLow) / firstHalfLow < 0.02;

    if (highFalling && lowFlat) {
      const currentClose = closes[closes.length - 1];
      if (currentClose < secondHalfLow * 1.01) {
        patterns.push({
          name: "Düşen Üçgen",
          direction: "bearish",
          confidence: 80,
          description: "Düşen direnç + yatay destek, kırılım aşağı",
        });
      }
    }
  } catch {}

  // ========================================================
  // 5. OBO (Omuz-Baş-Omuz, Bearish)
  // ========================================================
  try {
    if (candles.length >= 40) {
      const recent = candles.slice(-40);
      const highs = recent.map((c) => c.high);

      const leftShoulder = Math.max(...highs.slice(0, 12));
      const head = Math.max(...highs.slice(12, 26));
      const rightShoulder = Math.max(...highs.slice(26, 40));

      // Baş en yüksek, omuzlar yakın
      if (head > leftShoulder * 1.02 && head > rightShoulder * 1.02) {
        const shoulderDiff = Math.abs(leftShoulder - rightShoulder) / leftShoulder;
        if (shoulderDiff < 0.03) {
          patterns.push({
            name: "Omuz-Baş-Omuz",
            direction: "bearish",
            confidence: 85,
            description: "Klasik OBO formasyonu tespit edildi",
          });
        }
      }
    }
  } catch {}

  // ========================================================
  // 6. TOBO (Ters OBO, Bullish)
  // ========================================================
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
          patterns.push({
            name: "Ters OBO",
            direction: "bullish",
            confidence: 85,
            description: "Ters OBO formasyonu tespit edildi",
          });
        }
      }
    }
  } catch {}

  return patterns;
}// ==========================================================
// ANALİZ SONUÇLARINI BİRLEŞTİR
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
  const changePercent = ((currentPrice - prevPrice) / prevPrice) * 100;

  // Yön ağırlığı hesapla
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

  // Toplam uyum sayısı
  const bullishCount = indicators.filter((i) => i.direction === "bullish").length +
    patterns.filter((p) => p.direction === "bullish").length;
  const bearishCount = indicators.filter((i) => i.direction === "bearish").length +
    patterns.filter((p) => p.direction === "bearish").length;

  const totalSignals = bullishCount + bearishCount;
  const overallStrength = totalSignals > 0
    ? Math.round((Math.max(bullishScore, bearishScore) / totalSignals) * 1.2)
    : 0;

  const overallDirection: "bullish" | "bearish" | "neutral" =
    bullishScore > bearishScore * 1.5
      ? "bullish"
      : bearishScore > bullishScore * 1.5
        ? "bearish"
        : "neutral";

  // Önemli mi? (3+ sinyal uyumu VEYA güçlü tek sinyal)
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
// KULLANICILARI ÇEK (FAVORİLER + ÖNCELİKLİLER)
// ==========================================================

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
        // Öncelikli zaten varsa atla, yoksa ekle
        if (!result.some((r) => r.user_id === p.user_id)) {
          result.push({ user_id: p.user_id, type: "priority" });
        } else {
          // Favori ise, priority'e yükselt
          const existing = result.find((r) => r.user_id === p.user_id);
          if (existing) existing.type = "priority";
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Kullanıcı çekme hatası:", error);
    return [];
  }
}

// ==========================================================
// COOLDOWN KONTROLÜ
// ==========================================================

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

  const priority = type === "priority";
  const severity = analysis.overallStrength >= 80
    ? "kritik"
    : analysis.overallStrength >= 60
      ? "önemli"
      : "dikkat";

  const directionEmoji = analysis.overallDirection === "bullish"
    ? "🚀"
    : analysis.overallDirection === "bearish"
      ? "⚠️"
      : "⚪";

  const typeLabel = isGlobal
    ? "🌍 GLOBAL"
    : priority
      ? "⭐ ÖNCELİKLİ"
      : "📢 FAVORİ";

  const title = `${typeLabel} | ${symbol.replace("USDT", "").replace(".IS", "")}`;

  // Mesaj: Ana sinyal + detaylar
  const signalsText = [
    ...analysis.indicators.map((i) => `${i.name}: ${i.value} (${i.strength}%)`),
    ...analysis.patterns.map((p) => `${p.name} (${p.confidence}%)`),
  ].slice(0, 5).join(" • ");

  const message = `${directionEmoji} ${analysis.overallDirection.toUpperCase()} | Fiyat: ${analysis.price.toFixed(2)} (${analysis.changePercent >= 0 ? "+" : ""}${analysis.changePercent.toFixed(2)}%) | Güç: ${analysis.overallStrength}%`;

  const reason = signalsText || "Detaylı analiz yapıldı";

  // Unique event key (aynı olay tekrar etmesin)
  const eventKey = [
    type,
    market,
    symbol,
    analysis.overallDirection,
    Math.floor(analysis.overallStrength / 10), // güç 10'luk gruplar
    new Date().toISOString().slice(0, 13), // saat
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
        confidence: analysis.overallStrength,
        is_global: isGlobal ?? false,
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
      console.log(`✅ ${typeLabel} → ${symbol} → ${userId.slice(0, 8)}...`);
    }
  } catch (error) {
    console.error("Bildirim fetch hatası:", error);
  }
}

// ==========================================================
// KRİPTO TARAMA
// ==========================================================

async function scanCrypto(symbols: string[]): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const symbol of symbols) {
    try {
      const candles = await getCryptoCandles(symbol);
      if (candles.length < 50) continue;

      const indicators = analyzeIndicators(candles);
      const patterns = analyzePatterns(candles);

      if (indicators.length === 0 && patterns.length === 0) continue;

      const analysis = combineAnalysis(symbol, "crypto", candles, indicators, patterns);
      results.push(analysis);
    } catch (error) {
      console.error(`Kripto tarama hatası (${symbol}):`, error);
    }
  }

  return results;
}

// ==========================================================
// HİSSE TARAMA
// ==========================================================

async function scanStocks(stocks: string[]): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const stock of stocks) {
    try {
      const candles = await getStockCandles(stock);
      if (candles.length < 50) continue;

      const indicators = analyzeIndicators(candles);
      const patterns = analyzePatterns(candles);

      if (indicators.length === 0 && patterns.length === 0) continue;

      const market = stock.endsWith(".IS") ? "bist" : "us";
      const analysis = combineAnalysis(stock, market, candles, indicators, patterns);
      results.push(analysis);
    } catch (error) {
      console.error(`Hisse tarama hatası (${stock}):`, error);
    }
  }

  return results;
}

// ==========================================================
// BINANCE LİSTESİ
// ==========================================================

async function getTopCryptoSymbols(): Promise<string[]> {
  try {
    const response = await fetch("https://api.binance.com/api/v3/exchangeInfo");
    if (!response.ok) return [];

    const data = (await response.json()) as {
      symbols?: Array<{
        symbol?: string;
        status?: string;
        quoteAsset?: string;
      }>;
    };

    return (data.symbols ?? [])
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
      .slice(0, 100);
  } catch (error) {
    console.error("Kripto listesi hatası:", error);
    return [];
  }
}

// ==========================================================
// POPÜLER HİSSELER
// ==========================================================

const BIST_POPULER = [
  "THYAO.IS", "EREGL.IS", "ASELS.IS", "TUPRS.IS", "ISCTR.IS",
  "AKBNK.IS", "YKBNK.IS", "GARAN.IS", "KCHOL.IS", "SAHOL.IS",
  "SISE.IS", "BIMAS.IS",
];

const USA_POPULER = [
  "AAPL.US", "MSFT.US", "NVDA.US", "AMZN.US", "META.US",
  "TSLA.US", "GOOGL.US", "AMD.US", "NFLX.US", "INTC.US",
];// ==========================================================
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
    // Sadece GET desteklenir (POST kaldırıldı, çünkü artık dinamik liste yok)
    if (request.method !== "GET") {
      return response.status(405).json({
        success: false,
        error: "Sadece GET desteklenir",
      });
    }

    console.log("🔍 Tarama başladı:", new Date().toISOString());

    // ========================================================
    // ESKİ CACHE TEMİZLE
    // ========================================================
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

    // ========================================================
    // KRİPTO TARAMA
    // ========================================================
    console.log("📊 Kripto listesi çekiliyor...");
    const topCryptos = await getTopCryptoSymbols();
    console.log(`📊 ${topCryptos.length} kripto bulundu.`);

    const cryptoResults = await scanCrypto(topCryptos);
    console.log(`✅ ${cryptoResults.length} kripto analiz edildi.`);

    // ========================================================
    // HİSSE TARAMA
    // ========================================================
    console.log("📈 Hisseler taranıyor...");
    const stockTargets = [
      ...BIST_POPULER,
      ...USA_POPULER,
    ];
    const stockResults = await scanStocks(stockTargets);
    console.log(`✅ ${stockResults.length} hisse analiz edildi.`);

    // ========================================================
    // TÜM SONUÇLAR
    // ========================================================
    const allResults = [...cryptoResults, ...stockResults];
    const importantResults = allResults.filter((r) => r.isImportant);
    console.log(`⚡ ${importantResults.length} önemli sinyal bulundu.`);

    // ========================================================
    // BİLDİRİM GÖNDER
    // ========================================================
    let totalNotifications = 0;

    for (const result of importantResults) {
      try {
        // 1. Kullanıcıları çek (favori + öncelikli)
        const users = await getUsersForSymbol(result.market, result.symbol);

        // 2. GLOBAL kontrolü (çok önemli olay)
        const isGlobalImportant =
          result.overallStrength >= 85 ||
          result.patterns.some((p) => p.confidence >= 90) ||
          (result.market === "crypto" && Math.abs(result.changePercent) >= 5) ||
          ((result.market === "bist" || result.market === "us") && Math.abs(result.changePercent) >= 3);

        // 3. Her kullanıcıya bildirim gönder
        for (const user of users) {
          const notifType = user.type; // "favorite" | "priority"

          // Cooldown kontrolü
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

        // 4. Global önemli ise HERKESE gönder
        if (isGlobalImportant && users.length < 10) {
          // Tüm kullanıcıları çek (henüz bildirim gönderilmemiş olanlar)
          const allUsersRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=id`,
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
        console.error(`Bildirim gönderme hatası (${result.symbol}):`, error);
      }
    }

    // ========================================================
    // SONUÇ
    // ========================================================
    console.log(`✅ Tarama tamamlandı. ${totalNotifications} bildirim gönderildi.`);

    return response.status(200).json({
      success: true,
      message: "Tarama tamamlandı.",
      scanned: allResults.length,
      important: importantResults.length,
      notificationsSent: totalNotifications,
      crypto: cryptoResults.length,
      stocks: stockResults.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Handler hatası:", error);
    return response.status(500).json({
      success: false,
      error: message,
    });
  }
}