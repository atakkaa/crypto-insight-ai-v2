import { runChartAnalysis, type AnalyzeCandle } from "./analysis.server";

const MAX_SYMBOLS_PER_RUN = 12;
const MIN_CONFIDENCE = 70;
const DEDUPE_HOURS = 6;

type WatchRow = { user_id: string; market: string; symbol: string };

async function fetchCryptoCandles(symbol: string): Promise<AnalyzeCandle[]> {
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=150`,
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

async function fetchStockCandles(symbol: string): Promise<AnalyzeCandle[]> {
  const res = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return [];
  const csv = await res.text();
  const lines = csv.trim().split("\n");
  if (lines.length < 3) return [];
  const out: AnalyzeCandle[] = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close, volume] = line.split(",");
    if (!date || !close) continue;
    const candle: AnalyzeCandle = {
      time: new Date(date).getTime(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume ?? 0),
    };
    if (Number.isFinite(candle.close)) out.push(candle);
  }
  return out.slice(-160);
}

/**
 * Scans every watched (favorited) symbol with the AI analyst and stores an alert
 * for each watching user when a high-confidence buy/sell setup appears.
 * Runs from the public cron endpoint, so it works while nobody is signed in.
 */
export async function scanWatchlists() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: watch, error } = await db
    .from("favorites")
    .select("user_id, market, symbol")
    .limit(500);
  if (error) throw new Error(error.message);

  const rows = (watch ?? []) as WatchRow[];
  const groups = new Map<string, { market: string; symbol: string; users: string[] }>();
  for (const row of rows) {
    const key = `${row.market}:${row.symbol}`;
    const entry = groups.get(key) ?? { market: row.market, symbol: row.symbol, users: [] };
    entry.users.push(row.user_id);
    groups.set(key, entry);
  }

  const targets = [...groups.values()].slice(0, MAX_SYMBOLS_PER_RUN);
  const since = new Date(Date.now() - DEDUPE_HOURS * 3600_000).toISOString();
  let created = 0;
  const scanned: string[] = [];

  for (const target of targets) {
    try {
      const candles =
        target.market === "crypto"
          ? await fetchCryptoCandles(target.symbol)
          : await fetchStockCandles(target.symbol);
      if (candles.length < 30) continue;

      const analysis = await runChartAnalysis({
        symbol: target.symbol,
        market: target.market === "crypto" ? "kripto" : "hisse/endeks",
        interval: target.market === "crypto" ? "1h" : "1g",
        candles,
      });
      scanned.push(target.symbol);

      const action = analysis.prediction.action;
      const confidence = Number(analysis.prediction.confidence ?? 0);
      if (action === "BEKLE" || confidence < MIN_CONFIDENCE) continue;

      const price = candles.at(-1)?.close ?? null;

      for (const userId of [...new Set(target.users)]) {
        const { data: recent } = await db
          .from("alerts")
          .select("id")
          .eq("user_id", userId)
          .eq("market", target.market)
          .eq("symbol", target.symbol)
          .eq("action", action)
          .gte("created_at", since)
          .limit(1);
        if (recent && recent.length > 0) continue;

        const { error: insertError } = await db.from("alerts").insert({
          user_id: userId,
          market: target.market,
          symbol: target.symbol,
          interval: target.market === "crypto" ? "1h" : "1g",
          action,
          pattern: analysis.pattern.name,
          confidence: Math.round(confidence),
          price,
          entry: analysis.prediction.entry,
          stop: analysis.prediction.stop,
          targets: analysis.prediction.targets ?? [],
          reason: (analysis.reasoning ?? []).slice(0, 3).join(" · "),
        });
        if (!insertError) created += 1;
      }
    } catch {
      // Bir sembol hata verirse taramanın kalanı devam eder.
    }
  }

  return { scanned, created, watched: groups.size };
}

// ==========================================================
// KISA VADELİ (20-30 MUM) TARAMA — PREMIUM ÖZELLİĞİ
// ==========================================================

const SHORT_TERM_MAX_SYMBOLS_PER_RUN = 20;
const SHORT_TERM_MIN_CONFIDENCE = 75;
const SHORT_TERM_DEDUPE_HOURS = 4;
const SHORT_TERM_MIN_INDICATORS = 2;
const SHORT_TERM_MIN_VOLUME_RATIO = 1.2;

type ShortTermTrackingRow = {
  user_id: string;
  market: string;
  symbol: string;
};

type ShortTermFearGreed = {
  value: number;
  classification: string;
} | null;

async function fetchShortTermFearGreed(): Promise<ShortTermFearGreed> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string }>;
    };
    const entry = data.data?.[0];
    if (!entry) return null;
    return {
      value: Number(entry.value),
      classification: entry.value_classification,
    };
  } catch {
    return null;
  }
}

/**
 * Kısa vadeli (20-30 mum) bildirim taraması.
 * Sadece Premium/Trial/Admin üyelerin takip ettiği varlıkları tarar.
 * Free üyeler sadece manuel analiz yapabilir.
 */
export async function scanShortTermForPremium() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // 1. Tüm kısa vadeli takip kayıtlarını çek
  const { data: tracking, error: trackingError } = await db
    .from("short_term_tracking")
    .select("user_id, market, symbol")
    .limit(500);

  if (trackingError) throw new Error(trackingError.message);
  const trackingRows = (tracking ?? []) as ShortTermTrackingRow[];

  // 2. Sadece Premium/Trial/Admin üyeleri filtrele
  const userIds = [...new Set(trackingRows.map((r) => r.user_id))];
  if (userIds.length === 0) {
    return { scanned: [], created: 0, tracked: 0, filtered: 0 };
  }

  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id, role, membership, trial_ends_at")
    .in("id", userIds);

  if (profilesError) throw new Error(profilesError.message);

  const paidUserIds = new Set<string>();
  for (const p of profiles ?? []) {
    const role = String(p.role ?? "user");
    const membership = String(p.membership ?? "free");
    const trialEndsAt = p.trial_ends_at as string | null;

    if (role === "admin" || membership === "premium") {
      paidUserIds.add(p.id);
    } else if (membership === "trial" && trialEndsAt) {
      const isExpired = new Date(trialEndsAt).getTime() < Date.now();
      if (!isExpired) paidUserIds.add(p.id);
    }
  }

  const filteredRows = trackingRows.filter((r) => paidUserIds.has(r.user_id));

  // 3. Varlıkları grupla
  const groups = new Map<string, { market: string; symbol: string; users: string[] }>();
  for (const row of filteredRows) {
    const key = `${row.market}:${row.symbol}`;
    const entry = groups.get(key) ?? { market: row.market, symbol: row.symbol, users: [] };
    entry.users.push(row.user_id);
    groups.set(key, entry);
  }

  const targets = [...groups.values()].slice(0, SHORT_TERM_MAX_SYMBOLS_PER_RUN);
  const since = new Date(Date.now() - SHORT_TERM_DEDUPE_HOURS * 3600_000).toISOString();
  const fearGreed = await fetchShortTermFearGreed();

  let created = 0;
  const scanned: string[] = [];

  for (const target of targets) {
    try {
      // 4. Son 30 mumu çek
      let candles: AnalyzeCandle[] = [];
      if (target.market === "crypto") {
        candles = await fetchCryptoCandles(target.symbol);
      } else {
        candles = await fetchStockCandles(target.symbol);
      }

      if (candles.length < 20) continue;
      const shortCandles = candles.slice(-30);

      // 5. Kısa vadeli analiz yap
      const analysis = await runChartAnalysis({
        symbol: target.symbol,
        market: target.market === "crypto" ? "kripto" : "hisse/endeks",
        interval: target.market === "crypto" ? "1h" : "1g",
        candles: shortCandles,
        timeframe: "short",
      });

      scanned.push(target.symbol);

      const action = analysis.prediction.action;
      const confidence = Number(analysis.prediction.confidence ?? 0);
      const indicatorAnalysis = analysis.indicatorAnalysis;

      // 6. SIKI FİLTRE
      if (action === "BEKLE" || confidence < SHORT_TERM_MIN_CONFIDENCE) continue;
      if (!indicatorAnalysis || indicatorAnalysis.direction === "kararsız") continue;

      // İndikatör uyumu kontrolü
      const sameDirCount = analysis.indicatorValues
        ? [
            analysis.indicatorValues.rsi > 50,
            analysis.indicatorValues.macdHistogram > 0,
            analysis.indicatorValues.adx >= 25,
          ].filter(Boolean).length
        : 0;
      if (sameDirCount < SHORT_TERM_MIN_INDICATORS) continue;

      // Hacim teyidi
      const volumeRatio = analysis.indicatorValues?.volumeRatio ?? 0;
      if (volumeRatio < SHORT_TERM_MIN_VOLUME_RATIO) continue;

      // Fear & Greed (sadece kripto, aşırı bölgelerde uyarı)
      if (target.market === "crypto" && fearGreed) {
        if (fearGreed.value >= 85 || fearGreed.value <= 15) {
          console.log(`⏸️ Fear&Greed aşırı (${fearGreed.value}) — ${target.symbol} atlandı`);
          continue;
        }
      }

      const pattern = analysis.pattern;

      // 7. Kullanıcılara bildirim gönder
      for (const userId of [...new Set(target.users)]) {
        // Dedupe kontrolü
        const { data: recent } = await db
          .from("short_term_notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("market", target.market)
          .eq("symbol", target.symbol)
          .eq("pattern_bias", pattern.bias)
          .gte("created_at", since)
          .limit(1);
        if (recent && recent.length > 0) continue;

        const { error: insertError } = await db
          .from("short_term_notifications")
          .insert({
            user_id: userId,
            market: target.market,
            symbol: target.symbol,
            pattern_name: pattern.name,
            pattern_bias: pattern.bias,
            confidence: Math.round(confidence),
            signal_score: Math.round(confidence),
            entry: analysis.prediction.entry,
            stop: analysis.prediction.stop,
            target: analysis.prediction.targets?.[0] ?? null,
            reason: (analysis.reasoning ?? []).slice(0, 3).join(" · "),
            fear_greed: fearGreed?.value ?? null,
          });

        if (!insertError) created += 1;
      }
    } catch (err) {
      console.error(`Kısa vadeli tarama hatası (${target.symbol}):`, err);
    }
  }

  return {
    scanned,
    created,
    tracked: groups.size,
    filtered: filteredRows.length,
  };
}