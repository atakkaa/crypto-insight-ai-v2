// api/scan-firsat.ts — Gelişmiş Piyasa Tarama Motoru v5 (Formation-first + Chunked)
// Tek dosya, tüm bağımlılıklar inline

import { RSI, MACD, EMA, BollingerBands, ADX } from "technicalindicators";

// ==========================================================
// ENV
// ==========================================================

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");
const OPENROUTER_KEY = String(ENV.OPENROUTER_API_KEY ?? "");
const OPENROUTER_MODEL = String(ENV.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-exp:free");
const FINNHUB_KEY = String(ENV.FINNHUB_API_KEY ?? "");

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

type NewsItem = {
  title: string;
  url?: string;
  source: string;
  publishedAt: string;
  summary?: string;
  sentiment: "pozitif" | "negatif" | "nötr";
  sentimentScore: number;
};

type AiCommentary = {
  summary: string;
  impact: "pozitif" | "negatif" | "nötr";
  action: "AL" | "SAT" | "BEKLE" | "İZLE";
  sentiment: string;
  confidence: number;
  source: string;
};

type SignalScoreResult = {
  score: number;
  breakdown: {
    formation: number;
    indicator: number;
    news: number;
    volume: number;
    trend: number;
  };
  shouldNotify: boolean;
  reason: string;
  tier: "critical" | "important" | "watch" | "silent";
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
  news?: NewsItem[];
  signalScore?: SignalScoreResult;
  ai?: AiCommentary;
};

type CustomAsset = {
  user_id: string;
  market: string;
  symbol: string;
};

// ==========================================================
// YARDIMCILAR
// ==========================================================

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function safeDate(input: string | undefined | null): string {
  if (!input) return new Date().toISOString();
  const ts = new Date(input).getTime();
  if (!Number.isFinite(ts)) return new Date().toISOString();
  return new Date(ts).toISOString();
}

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
  } catch {}
}

// ==========================================================
// HABERLER
// ==========================================================

const COIN_NAME_MAP: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "Ripple",
  ADA: "Cardano", DOGE: "Dogecoin", DOT: "Polkadot", LINK: "Chainlink",
  AVAX: "Avalanche", MATIC: "Polygon", LTC: "Litecoin", BCH: "Bitcoin Cash",
  BNB: "Binance", TRX: "Tron", ATOM: "Cosmos", UNI: "Uniswap",
  AAVE: "Aave", FIL: "Filecoin", NEAR: "NEAR", ICP: "Internet Computer",
  APT: "Aptos", ARB: "Arbitrum", OP: "Optimism", SUI: "Sui",
  TON: "Toncoin", SHIB: "Shiba", PEPE: "Pepe", WIF: "dogwifhat", BONK: "Bonk",
};

function getCoinName(symbol: string): string {
  const base = symbol.replace("USDT", "").replace("USDC", "");
  return COIN_NAME_MAP[base] ?? base;
}

const POSITIVE_WORDS = [
  "rally", "surge", "soar", "bullish", "gain", "rise", "jump", "breakout",
  "adoption", "approval", "partnership", "upgrade", "record", "high", "boost",
  "launch", "listing", "etf", "inflow", "accumulate", "buy", "support",
  "yükseliş", "rekor", "artış", "olumlu", "güçlü", "destek", "onay", "anlaşma",
];

const NEGATIVE_WORDS = [
  "crash", "plunge", "drop", "bearish", "fall", "decline", "dump", "hack",
  "ban", "lawsuit", "sec", "investigation", "fraud", "warning", "risk", "low",
  "sell", "outflow", "liquidat", "exploit", "scam", "fear",
  "düşüş", "çöküş", "kayıp", "olumsuz", "risk", "yasak", "soruşturma", "uyarı",
];

function lexiconSentiment(text: string): { sentiment: "pozitif" | "negatif" | "nötr"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 15;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score -= 15;
  score = Math.max(-100, Math.min(100, score));
  const sentiment: "pozitif" | "negatif" | "nötr" = score > 10 ? "pozitif" : score < -10 ? "negatif" : "nötr";
  return { sentiment, score };
}

type RawRssItem = { title: string; link: string; pubDate: string; description: string };

function parseRssItems(xml: string): RawRssItem[] {
  const items: RawRssItem[] = [];
  const matches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of matches) {
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? "";
    const pubDate = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? "";
    const description = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]?.trim() ?? "";
    if (!title) continue;
    items.push({
      title: title.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim(),
      link,
      pubDate,
      description: description.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").slice(0, 300).trim(),
    });
  }
  return items;
}

const CRYPTO_RSS_FEEDS = [
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://cryptopotato.com/feed/", source: "CryptoPotato" },
  { url: "https://bitcoinist.com/feed/", source: "Bitcoinist" },
];

async function fetchCryptoRss(symbol: string): Promise<NewsItem[]> {
  const coinName = getCoinName(symbol);
  const coinBase = symbol.replace("USDT", "").replace("USDC", "");
  const items: NewsItem[] = [];
  const results = await Promise.allSettled(
    CRYPTO_RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" } });
        if (!res.ok) return [] as NewsItem[];
        const parsed = parseRssItems(await res.text());
        return parsed
          .filter((p) => {
            const text = `${p.title} ${p.description}`.toLowerCase();
            return text.includes(coinName.toLowerCase()) || text.includes(coinBase.toLowerCase());
          })
          .map((p): NewsItem => {
            const lex = lexiconSentiment(`${p.title} ${p.description}`);
            const item: NewsItem = {
              title: p.title,
              url: p.link,
              source: feed.source,
              publishedAt: safeDate(p.pubDate),
              sentiment: lex.sentiment,
              sentimentScore: lex.score,
            };
            if (p.description) item.summary = p.description;
            return item;
          });
      } catch { return [] as NewsItem[]; }
    }),
  );
  for (const r of results) if (r.status === "fulfilled") items.push(...r.value);
  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return items.slice(0, 10);
}

const BIST_RSS_FEEDS = [
  { url: "https://tr.investing.com/rss/news_25.rss", source: "Investing TR" },
  { url: "https://www.dunya.com/rss?list=piyasa", source: "Dünya" },
];

async function fetchBistRss(symbol: string): Promise<NewsItem[]> {
  const ticker = symbol.replace(".IS", "");
  const items: NewsItem[] = [];
  const results = await Promise.allSettled(
    BIST_RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" } });
        if (!res.ok) return [] as NewsItem[];
        const parsed = parseRssItems(await res.text());
        return parsed
          .filter((p) => `${p.title} ${p.description}`.toUpperCase().includes(ticker))
          .map((p): NewsItem => {
            const lex = lexiconSentiment(`${p.title} ${p.description}`);
            const item: NewsItem = {
              title: p.title,
              url: p.link,
              source: feed.source,
              publishedAt: safeDate(p.pubDate),
              sentiment: lex.sentiment,
              sentimentScore: lex.score,
            };
            if (p.description) item.summary = p.description;
            return item;
          });
      } catch { return [] as NewsItem[]; }
    }),
  );
  for (const r of results) if (r.status === "fulfilled") items.push(...r.value);
  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return items.slice(0, 10);
}

async function fetchFinnhub(symbol: string): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) return [];
  const ticker = symbol.replace(".US", "");
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
  try {
    const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ headline: string; url: string; datetime: number; source: string; summary: string }>;
    return data.slice(0, 10).map((n): NewsItem => {
      const lex = lexiconSentiment(`${n.headline} ${n.summary ?? ""}`);
      const item: NewsItem = {
        title: n.headline,
        url: n.url,
        source: n.source,
        publishedAt: safeDate(new Date(n.datetime * 1000).toISOString()),
        sentiment: lex.sentiment,
        sentimentScore: lex.score,
      };
      if (n.summary) item.summary = n.summary;
      return item;
    });
  } catch { return []; }
}

async function getNewsForSymbol(market: string, symbol: string, isPriority = false): Promise<NewsItem[]> {
  const limit = isPriority ? 20 : 10;
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/news_cache?market=eq.${market}&symbol=eq.${encodeURIComponent(symbol)}&published_at=gt.${since}&order=published_at.desc&limit=${limit}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (res.ok) {
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (rows.length > 0) {
        return rows.map((r): NewsItem => {
          const item: NewsItem = {
            title: String(r["title"] ?? ""),
            source: String(r["source"] ?? ""),
            publishedAt: String(r["published_at"] ?? new Date().toISOString()),
            sentiment: (r["sentiment"] as NewsItem["sentiment"]) ?? "nötr",
            sentimentScore: Number(r["sentiment_score"] ?? 0),
          };
          if (r["url"]) item.url = String(r["url"]);
          if (r["summary"]) item.summary = String(r["summary"]);
          return item;
        });
      }
    }
  } catch {}

  let fresh: NewsItem[] = [];
  if (market === "crypto") fresh = await fetchCryptoRss(symbol);
  else if (market === "us" || market === "asia" || market === "europe") fresh = await fetchFinnhub(symbol);
  else if (market === "bist") fresh = await fetchBistRss(symbol);

  // Priority için daha fazla haber sakla
  const freshLimited = fresh.slice(0, limit);

  if (freshLimited.length > 0 && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/news_cache`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify(freshLimited.map((n) => ({
          market, symbol,
          title: n.title,
          url: n.url ?? null,
          source: n.source,
          published_at: n.publishedAt,
          summary: n.summary ?? null,
          sentiment: n.sentiment,
          sentiment_score: n.sentimentScore,
        }))),
      });
    } catch {}
  }
  return freshLimited;
}
// ==========================================================
// AI YORUM
// ==========================================================

function generateRuleBasedCommentary(input: {
  symbol: string; direction: "bullish" | "bearish" | "neutral"; strength: number;
  patterns: PatternSignal[]; indicators: IndicatorSignal[]; news: NewsItem[]; changePercent: number;
}): AiCommentary {
  const { direction, strength, patterns, indicators, news, symbol, changePercent } = input;
  const displaySymbol = symbol.replace("USDT", "").replace(/\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/, "");
  const avgNewsSentiment = news.length > 0 ? news.reduce((a, b) => a + b.sentimentScore, 0) / news.length : 0;
  let sentiment = "nötr";
  if (changePercent <= -8) sentiment = "panik";
  else if (changePercent <= -5 || avgNewsSentiment <= -30) sentiment = "korku";
  else if (changePercent >= 8) sentiment = "coşku";
  else if (changePercent >= 5 || avgNewsSentiment >= 30) sentiment = "açgözlülük";

  const impact: AiCommentary["impact"] = direction === "bullish" && strength >= 60 ? "pozitif" : direction === "bearish" && strength >= 60 ? "negatif" : "nötr";
  let action: AiCommentary["action"] = "İZLE";
  if (direction === "bullish" && strength >= 75) action = "AL";
  else if (direction === "bullish" && strength >= 55) action = "BEKLE";
  else if (direction === "bearish" && strength >= 75) action = "SAT";
  else if (direction === "bearish" && strength >= 55) action = "BEKLE";

  const patternText = patterns.length > 0 ? `${patterns.map((p) => p.name).join(", ")} formasyonu` : "Formasyon";
  const indText = indicators.length > 0 ? `${indicators.slice(0, 2).map((i) => `${i.name} ${i.value}`).join(" + ")}` : "indikatörler";
  const newsText = news.length > 0 ? `${news.length} haber (${avgNewsSentiment > 10 ? "olumlu" : avgNewsSentiment < -10 ? "olumsuz" : "nötr"})` : "haber yok";

  return {
    summary: `${displaySymbol} için ${patternText} + ${indText} uyumlu. ${newsText}. Fiyat ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%.`,
    impact, action, sentiment,
    confidence: Math.min(100, Math.round(strength * 0.9 + Math.abs(avgNewsSentiment) * 0.1)),
    source: "motor:rule-based",
  };
}

async function generateWithOpenRouter(input: {
  symbol: string; market: string; price: number; changePercent: number;
  direction: "bullish" | "bearish" | "neutral"; strength: number;
  indicators: IndicatorSignal[]; patterns: PatternSignal[]; news: NewsItem[];
}): Promise<AiCommentary | null> {
  if (!OPENROUTER_KEY) return null;
  const newsText = input.news.length > 0
    ? input.news.slice(0, 5).map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join("\n")
    : "Haber bulunamadı.";

  const prompt = `Finansal analist olarak bildirim metni hazırla.

VARLIK: ${input.symbol} (${input.market})
FİYAT: ${input.price.toFixed(4)} (${input.changePercent >= 0 ? "+" : ""}${input.changePercent.toFixed(2)}%)
YÖN: ${input.direction} (güç: ${input.strength}/100)
İndikatörler: ${input.indicators.map((i) => `${i.name}=${i.value}(${i.direction})`).join(", ")}
Formasyonlar: ${input.patterns.map((p) => `${p.name}(${p.direction},${p.confidence}%)`).join(", ") || "yok"}
HABERLER:
${newsText}

SADECE JSON döndür:
{
  "summary": "1-2 cümle Türkçe özet",
  "impact": "pozitif" | "negatif" | "nötr",
  "action": "AL" | "SAT" | "BEKLE" | "İZLE",
  "sentiment": "korku" | "panik" | "nötr" | "açgözlülük" | "coşku",
  "confidence": 0-100
}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://formasyon.ai",
        "X-Title": "Formasyon AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const cleaned = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<AiCommentary>;
    if (typeof parsed.summary !== "string" || !["pozitif", "negatif", "nötr"].includes(parsed.impact ?? "") || !["AL", "SAT", "BEKLE", "İZLE"].includes(parsed.action ?? "")) return null;
    return {
      summary: parsed.summary,
      impact: parsed.impact as AiCommentary["impact"],
      action: parsed.action as AiCommentary["action"],
      sentiment: parsed.sentiment ?? "nötr",
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence ?? 70))),
      source: `openrouter:${OPENROUTER_MODEL}`,
    };
  } catch { return null; }
}

async function generateCommentary(input: {
  symbol: string; market: string; price: number; changePercent: number;
  direction: "bullish" | "bearish" | "neutral"; strength: number;
  indicators: IndicatorSignal[]; patterns: PatternSignal[]; news: NewsItem[];
}): Promise<AiCommentary> {
  let result = await generateWithOpenRouter(input);
  if (!result) {
    console.log("⚠️ AI başarısız → rule-based motor");
    result = generateRuleBasedCommentary(input);
  }
  return result;
}
// ==========================================================
// SİNYAL SKORU (Formation-first)
// ==========================================================

function computeSignalScore(input: {
  direction: "bullish" | "bearish" | "neutral";
  changePercent: number;
  indicators: IndicatorSignal[];
  patterns: PatternSignal[];
  news: NewsItem[];
  isPriority?: boolean;
}): SignalScoreResult {
  const { direction, indicators, patterns, news, changePercent, isPriority = false } = input;

  const sameDirPatterns = patterns.filter((p) => p.direction === direction);
  const bestFormation = sameDirPatterns.reduce((max, p) => Math.max(max, p.confidence), 0);

  if (sameDirPatterns.length === 0 || bestFormation < 60) {
    return {
      score: 0,
      breakdown: { formation: 0, indicator: 0, news: 0, volume: 0, trend: 0 },
      shouldNotify: false,
      reason: "Net formasyon yok veya zayıf (<60)",
      tier: "silent",
    };
  }

  const sameDirIndicators = indicators.filter((i) => i.direction === direction);
  const indicatorCount = sameDirIndicators.length;

  if (indicatorCount < 2) {
    return {
      score: 0,
      breakdown: { formation: bestFormation, indicator: indicatorCount * 20, news: 0, volume: 0, trend: 0 },
      shouldNotify: false,
      reason: `Yetersiz indikatör (${indicatorCount}/2)`,
      tier: "silent",
    };
  }

  const formationScore = clamp(bestFormation);
  const avgIndicatorStrength = sameDirIndicators.reduce((a, b) => a + b.strength, 0) / indicatorCount;
  const indicatorScore = clamp(avgIndicatorStrength * 0.7 + Math.min(indicatorCount - 2, 2) * 15);

  const avgNewsSentiment = news.length > 0 ? news.reduce((a, b) => a + b.sentimentScore, 0) / news.length : 0;
  const newsSupports =
    (direction === "bullish" && avgNewsSentiment > 15) ||
    (direction === "bearish" && avgNewsSentiment < -15);
  const newsContradicts =
    (direction === "bullish" && avgNewsSentiment < -40) ||
    (direction === "bearish" && avgNewsSentiment > 40);

  let newsScore = 50;
  if (newsSupports) newsScore = clamp(50 + Math.abs(avgNewsSentiment) * 0.5);
  if (newsContradicts) newsScore = 20;
  if (news.length === 0) newsScore = 40;

  const volumeIndicator = indicators.find((i) => i.name === "Hacim");
  const volumeScore = volumeIndicator ? clamp(volumeIndicator.strength) : 40;

  const adxIndicator = indicators.find((i) => i.name === "ADX");
  const trendScore = adxIndicator ? clamp(Number(adxIndicator.value) * 1.5) : 40;

  let finalScore =
    formationScore * 0.4 +
    indicatorScore * 0.25 +
    newsScore * 0.2 +
    volumeScore * 0.1 +
    trendScore * 0.05;

  if (bestFormation >= 85) finalScore += 5;
  if ((direction === "bullish" && changePercent >= 3) || (direction === "bearish" && changePercent <= -3)) finalScore += 3;
  if (Math.abs(avgNewsSentiment) >= 40 && newsSupports) finalScore += 5;

  finalScore = clamp(Math.round(finalScore));

  const thresholdCritical = 85;
  const thresholdImportant = isPriority ? 55 : 60;
  const thresholdWatch = isPriority ? 45 : 50;

  let tier: SignalScoreResult["tier"] = "silent";
  if (finalScore >= thresholdCritical) tier = "critical";
  else if (finalScore >= thresholdImportant) tier = "important";
  else if (finalScore >= thresholdWatch) tier = "watch";

  const shouldNotify = tier === "critical" || tier === "important";

  let reason = "";
  if (shouldNotify) {
    const parts = [`Formasyon ${bestFormation}%`, `${indicatorCount} indikatör uyumlu`];
    if (news.length > 0 && newsSupports) parts.push(`Haber ${avgNewsSentiment > 0 ? "olumlu" : "olumsuz"}`);
    else if (news.length === 0) parts.push("Haber yok");
    reason = parts.join(" + ");
  } else {
    reason = `Skor düşük (${finalScore}/${thresholdImportant})`;
  }

  return {
    score: finalScore,
    breakdown: {
      formation: Math.round(formationScore),
      indicator: Math.round(indicatorScore),
      news: Math.round(newsScore),
      volume: Math.round(volumeScore),
      trend: Math.round(trendScore),
    },
    shouldNotify,
    reason,
    tier,
  };
}

// ==========================================================
// VERİ ÇEKME
// ==========================================================

async function getCryptoCandles(symbol: string): Promise<Candle[]> {
  const cacheKey = `binance:${symbol}:1h`;
  const cached = await getFromCache<Candle[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=200`);
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown[][];
    const candles: Candle[] = raw.map((k) => ({
      time: Number(k[0]), open: Number(k[1]), high: Number(k[2]),
      low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
    }));
    await setToCache(cacheKey, candles, 10);
    return candles;
  } catch { return []; }
}

async function getStockCandles(symbol: string): Promise<Candle[]> {
  const cacheKey = `stooq:${symbol}:1d`;
  const cached = await getFromCache<Candle[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const res = await fetch(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`, { headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" } });
    if (!res.ok) return [];
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 3) return [];
    const candles: Candle[] = lines.slice(1).map((line) => {
      const p = line.split(",");
      const ts = new Date(p[0] ?? "").getTime();
      return {
        time: Number.isFinite(ts) ? ts : Date.now(),
        open: Number(p[1] ?? 0), high: Number(p[2] ?? 0),
        low: Number(p[3] ?? 0), close: Number(p[4] ?? 0), volume: Number(p[5] ?? 0),
      };
    }).filter((c) => Number.isFinite(c.close)).slice(-100);
    await setToCache(cacheKey, candles, 60 * 24);
    return candles;
  } catch { return []; }
}

async function getTopCryptoSymbols(limit = 100): Promise<string[]> {
  const cacheKey = `binance:top:${limit}`;
  const cached = await getFromCache<string[]>(cacheKey);
  if (cached && cached.length > 0) return cached;
  try {
    const res = await fetch("https://api.binance.com/api/v3/exchangeInfo");
    if (!res.ok) return [];
    const data = (await res.json()) as { symbols?: Array<{ symbol?: string; status?: string; quoteAsset?: string }> };
    const symbols = (data.symbols ?? []).filter((item) =>
      item.status === "TRADING" && item.quoteAsset === "USDT" &&
      typeof item.symbol === "string" &&
      !item.symbol.includes("UP") && !item.symbol.includes("DOWN") &&
      !item.symbol.includes("BULL") && !item.symbol.includes("BEAR"),
    ).map((item) => item.symbol as string).slice(0, limit);
    await setToCache(cacheKey, symbols, 60);
    return symbols;
  } catch { return []; }
}

const BIST_TOP_50 = ["THYAO","ASELS","TUPRS","BIMAS","GARAN","AKBNK","ISCTR","YKBNK","KCHOL","SAHOL","SISE","EREGL","PETKM","FROTO","TOASO","TAVHL","TCELL","MGROS","ENKAI","HEKTS","SASA","PGSUS","AEFES","ULKER","DOAS","KOZAL","KRDMD","ALARK","CCOLA","OYAKC","ASTOR","KONTR","MIATK","GUBRF","VESTL","ARCLK","TKFEN","ENJSA","CIMSA","ALBRK","VAKBN","HALKB","TSKB","ODAS","IPEKE","KRDMA","KARSN","AKSA","ISMEN","MPARK","AGHOL","ANACM","ANHYT","ARSAN","BERA","BRISA","BRYAT","CANTE","CLEBI","DEVA","ECILC","EGEEN","EKGYO","ENERY","GESAN","GLYHO","GOZDE","GSDHO","HLGYO","INDES","ISDMR","ISGYO","IZMDC","KAREL","KAYSE","KLGYO","KLMSN","LOGO","MAVI","NTHOL","OTKAR","PARSN","RALYH","RTALB","SANEL","SELEC","SNGYO","SOKM","TATGD","TKNSA","TRGYO","TTKOM","TTRAK","VERUS","YATAS","ZOREN","BIEN","BRSAN","DGNMO","IEYHO","KRVGD","SDTTR"].map((s) => `${s}.IS`);

const US_TOP_25 = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","AVGO","TSLA","BRK-B","JPM","WMT","ORCL","LLY","V","MA","XOM","COST","NFLX","AMD","CRM","QCOM","CSCO","IBM","NOW","PLTR","MU","AMAT","TXN","INTU","CAT","GE","BA","MCD","KO","PEP","DIS","NKE","SBUX","TMO","ABBV","JNJ","MRK","PFE","UNH","CVX","COP","GS","MS","BAC","UBER"].map((s) => `${s}.US`);

const ASIA_TOP_50 = ["7203.T","6758.T","9984.T","6861.T","8306.T","8035.T","9432.T","6501.T","6098.T","4063.T","4502.T","7267.T","9433.T","6902.T","2914.T","8058.T","8001.T","8031.T","8766.T","7974.T","005930.KS","000660.KS","035420.KS","035720.KS","005380.KS","012330.KS","105560.KS","055550.KS","051910.KS","066570.KS","0700.HK","9988.HK","3690.HK","0941.HK","1810.HK","1299.HK","2318.HK","0005.HK","9618.HK","1024.HK","RELIANCE.NS","TCS.NS","HDFCBANK.NS","INFY.NS","ICICIBANK.NS","BHARTIARTL.NS","ITC.NS","SBIN.NS","HINDUNILVR.NS","LT.NS"];

const EUROPE_TOP_50 = ["SAP.DE","SIE.DE","ALV.DE","DTE.DE","AIR.PA","ASML.AS","NESN.SW","ROG.SW","NOVN.SW","NOVO-B.CO","SHEL.L","AZN.L","HSBA.L","ULVR.L","BP.L","GSK.L","RIO.L","LSEG.L","REL.L","VOD.L","LVMH.PA","TTE.PA","OR.PA","SAN.PA","MC.PA","SU.PA","BNP.PA","AI.PA","SAF.PA","CS.PA","ENEL.MI","ENI.MI","ISP.MI","UCG.MI","STLAM.MI","IBE.MC","ITX.MC","SAN.MC","BBVA.MC","REP.MC","INGA.AS","ADYEN.AS","PHIA.AS","HEIA.AS","UNA.AS","VOLV-B.ST","ERIC-B.ST","EQNR.OL","NOKIA.HE","DSV.V"];

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
      if (rsi >= 70) signals.push({ name: "RSI", value: rsi.toFixed(1), direction: "bearish", strength: Math.min(100, (rsi - 70) * 3 + 60) });
      else if (rsi <= 30) signals.push({ name: "RSI", value: rsi.toFixed(1), direction: "bullish", strength: Math.min(100, (30 - rsi) * 3 + 60) });
      else if (rsi > 50) signals.push({ name: "RSI", value: rsi.toFixed(1), direction: "bullish", strength: 50 });
      else if (rsi < 50) signals.push({ name: "RSI", value: rsi.toFixed(1), direction: "bearish", strength: 50 });
    }
  } catch {}

  try {
    const macd = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    if (macd.length >= 2) {
      const cur = macd[macd.length - 1];
      const prev = macd[macd.length - 2];
      if (cur && prev && cur.MACD && prev.MACD && cur.signal && prev.signal) {
        if (prev.MACD <= prev.signal && cur.MACD > cur.signal) signals.push({ name: "MACD", value: "Al Kesişimi", direction: "bullish", strength: 75 });
        else if (prev.MACD >= prev.signal && cur.MACD < cur.signal) signals.push({ name: "MACD", value: "Sat Kesişimi", direction: "bearish", strength: 75 });
        else if (cur.MACD > cur.signal) signals.push({ name: "MACD", value: "Pozitif", direction: "bullish", strength: 55 });
        else if (cur.MACD < cur.signal) signals.push({ name: "MACD", value: "Negatif", direction: "bearish", strength: 55 });
      }
    }
  } catch {}

  try {
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    const ema200 = EMA.calculate({ values: closes, period: 200 });
    if (ema50.length >= 2 && ema200.length >= 2) {
      const c50 = ema50[ema50.length - 1], c200 = ema200[ema200.length - 1];
      const p50 = ema50[ema50.length - 2], p200 = ema200[ema200.length - 2];
      if (c50 && c200 && p50 && p200) {
        if (p50 <= p200 && c50 > c200) signals.push({ name: "EMA", value: "Golden Cross", direction: "bullish", strength: 90 });
        else if (p50 >= p200 && c50 < c200) signals.push({ name: "EMA", value: "Death Cross", direction: "bearish", strength: 90 });
        else if (c50 > c200) signals.push({ name: "EMA", value: "50>200", direction: "bullish", strength: 60 });
        else if (c50 < c200) signals.push({ name: "EMA", value: "50<200", direction: "bearish", strength: 60 });
      }
    }
  } catch {}

  try {
    const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
    if (bb.length > 0) {
      const last = bb[bb.length - 1];
      const lastClose = closes[closes.length - 1];
      if (last && last.upper && last.lower && lastClose !== undefined) {
        const mid = (last.upper + last.lower) / 2;
        if (lastClose > last.upper) signals.push({ name: "Bollinger", value: "Üst Bant", direction: "bearish", strength: 65 });
        else if (lastClose < last.lower) signals.push({ name: "Bollinger", value: "Alt Bant", direction: "bullish", strength: 65 });
        else if (lastClose > mid) signals.push({ name: "Bollinger", value: "Üst Yarı", direction: "bullish", strength: 50 });
        else if (lastClose < mid) signals.push({ name: "Bollinger", value: "Alt Yarı", direction: "bearish", strength: 50 });
      }
    }
  } catch {}

  try {
    const adxValues = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    if (adxValues.length > 0) {
      const last = adxValues[adxValues.length - 1];
      if (last && last.adx && last.adx > 25) {
        signals.push({ name: "ADX", value: last.adx.toFixed(1), direction: "neutral", strength: last.adx > 40 ? 80 : 60 });
      }
    }
  } catch {}

  try {
    if (volumes.length >= 20) {
      const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const curVol = volumes[volumes.length - 1];
      if (avgVolume > 0 && curVol !== undefined && curVol > avgVolume * 1.5) {
        signals.push({ name: "Hacim", value: `${(curVol / avgVolume).toFixed(1)}x`, direction: "neutral", strength: 70 });
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
      const secondMin = Math.min(...recentLows.slice(15));
      if (Math.abs(minLow - secondMin) / minLow < 0.03 && secondMin > minLow * 0.97) {
        const cur = closes[closes.length - 1];
        if (cur !== undefined && cur > minLow * 1.02) patterns.push({ name: "İkili Dip", direction: "bullish", confidence: 75, description: "İki dip oluştu" });
      }
    }
  } catch {}

  try {
    const recent = candles.slice(-30);
    const recentHighs = recent.map((c) => c.high);
    const maxHigh = Math.max(...recentHighs);
    const maxIndex = recentHighs.indexOf(maxHigh);
    if (maxIndex >= 0 && maxIndex < 15) {
      const secondMax = Math.max(...recentHighs.slice(15));
      if (Math.abs(maxHigh - secondMax) / maxHigh < 0.03 && secondMax < maxHigh * 1.03) {
        const cur = closes[closes.length - 1];
        if (cur !== undefined && cur < maxHigh * 0.98) patterns.push({ name: "İkili Tepe", direction: "bearish", confidence: 75, description: "İki tepe oluştu" });
      }
    }
  } catch {}

  try {
    const recent = candles.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const firstHigh = Math.max(...highs.slice(0, 15)), secondHigh = Math.max(...highs.slice(15));
    const firstLow = Math.min(...lows.slice(0, 15)), secondLow = Math.min(...lows.slice(15));
    if (Math.abs(firstHigh - secondHigh) / firstHigh < 0.02 && secondLow > firstLow * 1.02) {
      const cur = closes[closes.length - 1];
      if (cur !== undefined && cur > secondHigh * 0.99) patterns.push({ name: "Yükselen Üçgen", direction: "bullish", confidence: 80, description: "Yatay direnç + yükselen dip" });
    }
  } catch {}

  try {
    const recent = candles.slice(-30);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const firstHigh = Math.max(...highs.slice(0, 15)), secondHigh = Math.max(...highs.slice(15));
    const firstLow = Math.min(...lows.slice(0, 15)), secondLow = Math.min(...lows.slice(15));
    if (secondHigh < firstHigh * 0.98 && Math.abs(firstLow - secondLow) / firstLow < 0.02) {
      const cur = closes[closes.length - 1];
      if (cur !== undefined && cur < secondLow * 1.01) patterns.push({ name: "Düşen Üçgen", direction: "bearish", confidence: 80, description: "Düşen direnç + yatay destek" });
    }
  } catch {}

  try {
    if (candles.length >= 40) {
      const recent = candles.slice(-40);
      const highs = recent.map((c) => c.high);
      const ls = Math.max(...highs.slice(0, 12)), head = Math.max(...highs.slice(12, 26)), rs = Math.max(...highs.slice(26, 40));
      if (head > ls * 1.02 && head > rs * 1.02 && Math.abs(ls - rs) / ls < 0.03) {
        patterns.push({ name: "Omuz-Baş-Omuz", direction: "bearish", confidence: 85, description: "Klasik OBO" });
      }
    }
  } catch {}

  try {
    if (candles.length >= 40) {
      const recent = candles.slice(-40);
      const lows = recent.map((c) => c.low);
      const ls = Math.min(...lows.slice(0, 12)), head = Math.min(...lows.slice(12, 26)), rs = Math.min(...lows.slice(26, 40));
      if (head < ls * 0.98 && head < rs * 0.98 && Math.abs(ls - rs) / ls < 0.03) {
        patterns.push({ name: "Ters OBO", direction: "bullish", confidence: 85, description: "Ters OBO" });
      }
    }
  } catch {}

  return patterns;
}

// ==========================================================
// ANALİZ BİRLEŞTİR (Formation-first)
// ==========================================================

function combineAnalysis(symbol: string, market: string, candles: Candle[], indicators: IndicatorSignal[], patterns: PatternSignal[]): AnalysisResult {
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const prevPrice = candles[candles.length - 2]?.close ?? currentPrice;
  const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

  const bullishPatterns = patterns.filter((p) => p.direction === "bullish");
  const bearishPatterns = patterns.filter((p) => p.direction === "bearish");
  const bullishPatternStrength = bullishPatterns.reduce((sum, p) => sum + p.confidence, 0);
  const bearishPatternStrength = bearishPatterns.reduce((sum, p) => sum + p.confidence, 0);

  const bullishIndicators = indicators.filter((i) => i.direction === "bullish");
  const bearishIndicators = indicators.filter((i) => i.direction === "bearish");
  const bullishIndStrength = bullishIndicators.reduce((sum, i) => sum + i.strength, 0);
  const bearishIndStrength = bearishIndicators.reduce((sum, i) => sum + i.strength, 0);

  let overallDirection: "bullish" | "bearish" | "neutral" = "neutral";

  if (bullishPatternStrength > 0 && bullishPatternStrength >= bearishPatternStrength) {
    if (bullishIndicators.length >= 2 || (bullishIndicators.length >= 1 && bullishIndStrength > bearishIndStrength)) {
      overallDirection = "bullish";
    }
  } else if (bearishPatternStrength > 0 && bearishPatternStrength > bullishPatternStrength) {
    if (bearishIndicators.length >= 2 || (bearishIndicators.length >= 1 && bearishIndStrength > bullishIndStrength)) {
      overallDirection = "bearish";
    }
  } else if (bullishPatternStrength === 0 && bearishPatternStrength === 0) {
    if (bullishIndicators.length >= 3 && bullishIndStrength > bearishIndStrength * 1.5) overallDirection = "bullish";
    else if (bearishIndicators.length >= 3 && bearishIndStrength > bullishIndStrength * 1.5) overallDirection = "bearish";
  }

  const totalBullishScore = bullishPatternStrength + bullishIndStrength;
  const totalBearishScore = bearishPatternStrength + bearishIndStrength;
  const maxScore = Math.max(totalBullishScore, totalBearishScore);
  const totalSignals = patterns.length + indicators.length;
  const overallStrength = totalSignals > 0
    ? Math.min(100, Math.round((maxScore / Math.max(1, totalSignals)) * 1.5))
    : 0;

  const hasFormation = patterns.length > 0;
  const hasIndicatorSupport =
    (overallDirection === "bullish" && bullishIndicators.length >= 2) ||
    (overallDirection === "bearish" && bearishIndicators.length >= 2);

  const isImportant = hasFormation && hasIndicatorSupport && totalSignals >= 3;

  return {
    symbol, market, price: currentPrice, changePercent,
    indicators, patterns, overallDirection, overallStrength, isImportant,
  };
}

// ==========================================================
// KULLANICI VERİLERİ
// ==========================================================

async function getCustomAssets(): Promise<CustomAsset[]> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/custom_assets?select=user_id,market,symbol`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as CustomAsset[];
  } catch { return []; }
}

async function getUsersForSymbol(market: string, symbol: string): Promise<Array<{ user_id: string; type: "favorite" | "priority" }>> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const [favRes, priRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/favorites?select=user_id&market=eq.${market}&symbol=eq.${encodeURIComponent(symbol)}`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      }),
      fetch(`${SUPABASE_URL}/rest/v1/priority_assets?select=user_id&market=eq.${market}&symbol=eq.${encodeURIComponent(symbol)}`, {
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      }),
    ]);
    const result: Array<{ user_id: string; type: "favorite" | "priority" }> = [];
    if (favRes.ok) {
      const favs = (await favRes.json()) as Array<{ user_id: string }>;
      for (const f of favs) result.push({ user_id: f.user_id, type: "favorite" });
    }
    if (priRes.ok) {
      const pri = (await priRes.json()) as Array<{ user_id: string }>;
      for (const p of pri) {
        const ex = result.find((r) => r.user_id === p.user_id);
        if (ex) ex.type = "priority";
        else result.push({ user_id: p.user_id, type: "priority" });
      }
    }
    return result;
  } catch { return []; }
}

async function isOnCooldown(userId: string, symbol: string, market: string, type: "global" | "favorite" | "priority"): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  const cooldownHours = type === "global" ? 1 : type === "priority" ? 2 : 4;
  const since = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications?select=id&user_id=eq.${userId}&symbol=eq.${encodeURIComponent(symbol)}&market=eq.${market}&created_at=gt.${since}&limit=1`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows.length > 0;
  } catch { return false; }
}

// ==========================================================
// BİLDİRİM GÖNDER
// ==========================================================

async function sendNotification(params: {
  userId: string; market: string; symbol: string;
  type: "global" | "favorite" | "priority";
  analysis: AnalysisResult; isGlobal?: boolean;
}) {
  const { userId, market, symbol, type, analysis, isGlobal } = params;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const signalScore = analysis.signalScore;
  const ai = analysis.ai;
  if (!signalScore || !ai) return;

  const priority = type === "priority";
  const severity = signalScore.tier === "critical" ? "kritik" : signalScore.tier === "important" ? "önemli" : "dikkat";
  const actionEmoji = ai.action === "AL" ? "🟢" : ai.action === "SAT" ? "🔴" : ai.action === "BEKLE" ? "🟡" : "⚪";
  const typeLabel = isGlobal ? "🌍 GLOBAL" : priority ? "⭐ ÖNCELİKLİ" : "📢 FAVORİ";
  const cleanSymbol = symbol.replace("USDT", "").replace(/\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/, "");
  const title = `${typeLabel} | ${cleanSymbol}`;
  const message = `${actionEmoji} ${ai.action} | ${ai.summary}`;
  const reason = signalScore.reason;
  const eventKey = [type, market, symbol, analysis.overallDirection, Math.floor(analysis.overallStrength / 10), signalScore.tier, new Date().toISOString().slice(0, 13)].join("|");

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
        user_id: userId, market, symbol,
        type: analysis.patterns.length > 0 ? "formation" : "indicator",
        priority, severity, title, message, reason,
        event_key: eventKey, notification_type: type,
        confidence: ai.confidence, is_global: isGlobal ?? false,
        signal_score: signalScore.score,
        signal_breakdown: signalScore.breakdown,
        ai_summary: ai.summary, ai_impact: ai.impact,
        ai_action: ai.action, ai_sentiment: ai.sentiment,
        ai_confidence: ai.confidence, ai_source: ai.source,
        ai_generated_at: new Date().toISOString(),
        news_items: analysis.news ?? [],
        data: { indicators: analysis.indicators, patterns: analysis.patterns, direction: analysis.overallDirection, changePercent: analysis.changePercent },
      }),
    });
    if (!res.ok) console.error(`Bildirim hatası (${symbol}):`, res.status, await res.text());
    else console.log(`✅ ${typeLabel} → ${symbol} → score=${signalScore.score} → ${ai.action}`);
  } catch (error) {
    console.error("Bildirim fetch hatası:", error);
  }
}

// ==========================================================
// ANALİZ
// ==========================================================

async function analyzeSymbol(symbol: string, market: string): Promise<AnalysisResult | null> {
  try {
    const candles = market === "crypto" ? await getCryptoCandles(symbol) : await getStockCandles(symbol);
    if (candles.length < 50) return null;
    const indicators = analyzeIndicators(candles);
    const patterns = analyzePatterns(candles);
    if (indicators.length === 0 && patterns.length === 0) return null;
    const baseResult = combineAnalysis(symbol, market, candles, indicators, patterns);

    let news: NewsItem[] = [];
    if (baseResult.isImportant) {
      // Kullanıcılar bu coini takip ediyor mu?
      const users = await getUsersForSymbol(market, symbol);
      const isPriorityTracked = users.some((u) => u.type === "priority");
      news = await getNewsForSymbol(market, symbol, isPriorityTracked);
    }

    return { ...baseResult, news };
  } catch (error) {
    console.error(`Analiz hatası (${symbol}):`, error);
    return null;
  }
}

async function scanSymbolsParallel(symbols: Array<{ symbol: string; market: string }>, concurrency = 10): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((s) => analyzeSymbol(s.symbol, s.market)));
    for (const r of batchResults) if (r) results.push(r);
  }
  return results;
}

// ==========================================================
// ANA HANDLER
// ==========================================================

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") return response.status(200).end();

  try {
    if (request.method !== "GET") return response.status(405).json({ success: false, error: "Sadece GET desteklenir" });

    const typeParam = String(request.query?.["type"] ?? "all");
    const regionParam = String(request.query?.["region"] ?? "all");
    const limitParam = Number(request.query?.["limit"] ?? 0);
    const offsetParam = Number(request.query?.["offset"] ?? 0);

    console.log(`🔍 Tarama başladı: type=${typeParam}, region=${regionParam}, limit=${limitParam}, offset=${offsetParam}`);

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_expired_cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      });
    } catch {}

    const assets: Array<{ symbol: string; market: string }> = [];

    if (typeParam === "all" || typeParam === "crypto") {
      const cryptoSymbols = await getTopCryptoSymbols(100);
      for (const s of cryptoSymbols) assets.push({ symbol: s, market: "crypto" });
    }

    if (typeParam === "all" || typeParam === "stocks") {
      if (regionParam === "all" || regionParam === "bist") for (const s of BIST_TOP_50) assets.push({ symbol: s, market: "bist" });
      if (regionParam === "all" || regionParam === "us") for (const s of US_TOP_25) assets.push({ symbol: s, market: "us" });
      if (regionParam === "all" || regionParam === "asia") for (const s of ASIA_TOP_50) assets.push({ symbol: s, market: "asia" });
      if (regionParam === "all" || regionParam === "europe") for (const s of EUROPE_TOP_50) assets.push({ symbol: s, market: "europe" });
    }

    const customAssets = await getCustomAssets();
    for (const c of customAssets) {
      if (!assets.some((a) => a.symbol === c.symbol && a.market === c.market)) assets.push({ symbol: c.symbol, market: c.market });
    }

    // LIMIT / OFFSET uygula (parçalama için)
    let finalAssets = assets;
    if (limitParam > 0) {
      finalAssets = assets.slice(offsetParam, offsetParam + limitParam);
      console.log(`🔢 Limit uygulandı: offset=${offsetParam}, limit=${limitParam}, sonuç=${finalAssets.length}`);
    }

    console.log(`📊 ${finalAssets.length} varlık taranacak.`);
    const results = await scanSymbolsParallel(finalAssets, 10);
    const importantResults = results.filter((r) => r.isImportant);
    console.log(`✅ ${results.length} varlık analiz edildi, ${importantResults.length} önemli.`);

    let totalNotifications = 0;

    for (const result of importantResults) {
      try {
        const users = await getUsersForSymbol(result.market, result.symbol);
        const hasPriorityUser = users.some((u) => u.type === "priority");

        const signalScore = computeSignalScore({
          direction: result.overallDirection,
          changePercent: result.changePercent,
          indicators: result.indicators,
          patterns: result.patterns,
          news: result.news ?? [],
          isPriority: hasPriorityUser,
        });
        result.signalScore = signalScore;

        if (!signalScore.shouldNotify) {
          console.log(`🔇 Bildirim atlandı: ${result.symbol} (score=${signalScore.score}, ${signalScore.reason})`);
          continue;
        }

        const ai = await generateCommentary({
          symbol: result.symbol, market: result.market, price: result.price,
          changePercent: result.changePercent, direction: result.overallDirection,
          strength: result.overallStrength, indicators: result.indicators,
          patterns: result.patterns, news: result.news ?? [],
        });
        result.ai = ai;
        console.log(`🤖 AI (${ai.source}): ${result.symbol} → ${ai.action}`);

        for (const user of users) {
          if (await isOnCooldown(user.user_id, result.symbol, result.market, user.type)) continue;
          await sendNotification({ userId: user.user_id, market: result.market, symbol: result.symbol, type: user.type, analysis: result, isGlobal: false });
          totalNotifications++;
        }

        const isGlobalImportant = signalScore.tier === "critical" ||
          (result.market === "crypto" && Math.abs(result.changePercent) >= 8) ||
          (["bist", "us", "asia", "europe"].includes(result.market) && Math.abs(result.changePercent) >= 5);

        if (isGlobalImportant) {
          const allUsersRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&is_banned=eq.false`, {
            headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          });
          if (allUsersRes.ok) {
            const allUsers = (await allUsersRes.json()) as Array<{ id: string }>;
            const alreadyNotified = new Set(users.map((u) => u.user_id));
            for (const u of allUsers) {
              if (alreadyNotified.has(u.id)) continue;
              if (await isOnCooldown(u.id, result.symbol, result.market, "global")) continue;
              await sendNotification({ userId: u.id, market: result.market, symbol: result.symbol, type: "favorite", analysis: result, isGlobal: true });
              totalNotifications++;
            }
          }
        }
      } catch (error) {
        console.error(`Bildirim hatası (${result.symbol}):`, error);
      }
    }

    return response.status(200).json({
      success: true, message: "Tarama tamamlandı.",
      scanned: results.length, important: importantResults.length,
      notificationsSent: totalNotifications, totalAssets: finalAssets.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Handler hatası:", error);
    return response.status(500).json({ success: false, error: message });
  }
}