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

  const { data: watch, error } = await supabaseAdmin
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
        const { data: recent } = await supabaseAdmin
          .from("alerts")
          .select("id")
          .eq("user_id", userId)
          .eq("market", target.market)
          .eq("symbol", target.symbol)
          .eq("action", action)
          .gte("created_at", since)
          .limit(1);
        if (recent && recent.length > 0) continue;

        const { error: insertError } = await supabaseAdmin.from("alerts").insert({
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
