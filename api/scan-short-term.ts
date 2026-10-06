// api/scan-short-term.ts — Kısa Vadeli (20-30 Mum) Premium Tarama (Self-Contained)

import { runChartAnalysis, type AnalyzeCandle } from "../src/lib/analysis.server";

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
};

// ==========================================================
// YARDIMCILAR
// ==========================================================

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

async function fetchFearGreed(): Promise<{ value: number; classification: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ value: string; value_classification: string }> };
    const entry = data.data?.[0];
    if (!entry) return null;
    return { value: Number(entry.value), classification: entry.value_classification };
  } catch {
    return null;
  }
}

async function supabaseSelect(table: string, query: string): Promise<any[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
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
  } catch {
    return false;
  }
}

// ==========================================================
// ANA FONKSİYON
// ==========================================================

const SHORT_TERM_MAX_SYMBOLS_PER_RUN = 20;
const SHORT_TERM_MIN_CONFIDENCE = 75;
const SHORT_TERM_DEDUPE_HOURS = 4;
const SHORT_TERM_MIN_INDICATORS = 2;
const SHORT_TERM_MIN_VOLUME_RATIO = 1.2;

async function scanShortTermForPremium() {
  // 1. Tüm kısa vadeli takip kayıtlarını çek
  const trackingRaw = await supabaseSelect("short_term_tracking", "select=user_id,market,symbol&limit=500");
  const tracking = trackingRaw as TrackingRow[];

  if (tracking.length === 0) {
    return { scanned: [], created: 0, tracked: 0, filtered: 0 };
  }

  // 2. Sadece Premium/Trial/Admin üyeleri filtrele
  const userIds: string[] = [...new Set(tracking.map((r) => r.user_id))];
  if (userIds.length === 0) {
    return { scanned: [], created: 0, tracked: 0, filtered: 0 };
  }

  const profilesRaw = await supabaseSelect(
    "profiles",
    `select=id,role,membership,trial_ends_at&id=in.(${userIds.join(",")})`,
  );
  const profiles = profilesRaw as ProfileRow[];

  const paidUserIds = new Set<string>();
  for (const p of profiles) {
    const role = String(p.role ?? "user");
    const membership = String(p.membership ?? "free");
    const trialEndsAt = p.trial_ends_at;

    if (role === "admin" || membership === "premium") {
      paidUserIds.add(p.id);
    } else if (membership === "trial" && trialEndsAt) {
      const isExpired = new Date(trialEndsAt).getTime() < Date.now();
      if (!isExpired) paidUserIds.add(p.id);
    }
  }

  const filteredRows = tracking.filter((r) => paidUserIds.has(r.user_id));

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
  const fearGreed = await fetchFearGreed();

  let created = 0;
  const scanned: string[] = [];

  for (const target of targets) {
    try {
      let candles: AnalyzeCandle[] = [];
      if (target.market === "crypto") {
        candles = await fetchCryptoCandles(target.symbol);
      } else {
        candles = await fetchStockCandles(target.symbol);
      }

      if (candles.length < 20) continue;
      const shortCandles = candles.slice(-30);

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

      if (action === "BEKLE" || confidence < SHORT_TERM_MIN_CONFIDENCE) continue;
      if (!indicatorAnalysis || indicatorAnalysis.direction === "kararsız") continue;

      const sameDirCount = analysis.indicatorValues
        ? [
            analysis.indicatorValues.rsi > 50,
            analysis.indicatorValues.macdHistogram > 0,
            analysis.indicatorValues.adx >= 25,
          ].filter(Boolean).length
        : 0;
      if (sameDirCount < SHORT_TERM_MIN_INDICATORS) continue;

      const volumeRatio = analysis.indicatorValues?.volumeRatio ?? 0;
      if (volumeRatio < SHORT_TERM_MIN_VOLUME_RATIO) continue;

      if (target.market === "crypto" && fearGreed) {
        if (fearGreed.value >= 85 || fearGreed.value <= 15) {
          console.log(`⏸️ Fear&Greed aşırı (${fearGreed.value}) — ${target.symbol} atlandı`);
          continue;
        }
      }

      const pattern = analysis.pattern;

      for (const userId of [...new Set(target.users)]) {
        const recent = await supabaseSelect(
          "short_term_notifications",
          `select=id&user_id=eq.${userId}&market=eq.${target.market}&symbol=eq.${encodeURIComponent(target.symbol)}&pattern_bias=eq.${encodeURIComponent(pattern.bias)}&created_at=gt.${since}&limit=1`,
        );
        if (recent.length > 0) continue;

        const ok = await supabaseInsert("short_term_notifications", {
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

        if (ok) created += 1;
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
      return response.status(405).json({ success: false, error: "Sadece GET/POST desteklenir" });
    }

    console.log("🔍 Kısa vadeli tarama başladı...");
    const result = await scanShortTermForPremium();
    console.log(`✅ Kısa vadeli tarama tamamlandı:`, result);

    return response.status(200).json({
      success: true,
      message: "Kısa vadeli tarama tamamlandı.",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Kısa vadeli tarama hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}