// api/_lib/news.ts — Haber toplama + sentiment analizi (RSS tabanlı)

const ENV = (globalThis as any).process?.env ?? {};
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");
const NEWSAPI_KEY = String(ENV.NEWSAPI_API_KEY ?? "");
const FINNHUB_KEY = String(ENV.FINNHUB_API_KEY ?? "");

// ==========================================================
// TİPLER
// ==========================================================

export type NewsItem = {
  title: string;
  url?: string;
  source: string;
  publishedAt: string;
  summary?: string;
  sentiment: "pozitif" | "negatif" | "nötr";
  sentimentScore: number;
  keywords?: string[];
};

// ==========================================================
// COIN İSİM HARİTASI (BTCUSDT → Bitcoin)
// ==========================================================

const COIN_NAME_MAP: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "Ripple",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  DOT: "Polkadot",
  LINK: "Chainlink",
  AVAX: "Avalanche",
  MATIC: "Polygon",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  BNB: "Binance",
  TRX: "Tron",
  ATOM: "Cosmos",
  UNI: "Uniswap",
  AAVE: "Aave",
  FIL: "Filecoin",
  NEAR: "NEAR",
  ICP: "Internet Computer",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  SUI: "Sui",
  TON: "Toncoin",
  SHIB: "Shiba",
  PEPE: "Pepe",
  WIF: "dogwifhat",
  BONK: "Bonk",
};

function getCoinName(symbol: string): string {
  const base = symbol.replace("USDT", "").replace("USDC", "");
  return COIN_NAME_MAP[base] ?? base;
}

// ==========================================================
// CACHE
// ==========================================================

async function getCachedNews(market: string, symbol: string): Promise<NewsItem[]> {
  if (!SUPABASE_URL) return [];
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/news_cache?market=eq.${market}&symbol=eq.${encodeURIComponent(symbol)}&published_at=gt.${since}&order=published_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as any[];
    return rows.map((r) => ({
      title: r.title,
      url: r.url,
      source: r.source,
      publishedAt: r.published_at,
      summary: r.summary,
      sentiment: r.sentiment ?? "nötr",
      sentimentScore: r.sentiment_score ?? 0,
      keywords: r.keywords,
    }));
  } catch {
    return [];
  }
}

async function saveNews(market: string, symbol: string, items: NewsItem[]) {
  if (!SUPABASE_URL || items.length === 0) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/news_cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=ignore-duplicates",
      },
      body: JSON.stringify(
        items.map((n) => ({
          market,
          symbol,
          title: n.title,
          url: n.url,
          source: n.source,
          published_at: n.publishedAt,
          summary: n.summary,
          sentiment: n.sentiment,
          sentiment_score: n.sentimentScore,
          keywords: n.keywords,
        })),
      ),
    });
  } catch {}
}

// ==========================================================
// LEXICON-BASED SENTIMENT
// ==========================================================

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

export function lexiconSentiment(text: string): {
  sentiment: "pozitif" | "negatif" | "nötr";
  score: number;
} {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score += 15;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score -= 15;
  score = Math.max(-100, Math.min(100, score));
  const sentiment = score > 10 ? "pozitif" : score < -10 ? "negatif" : "nötr";
  return { sentiment, score };
}

// ==========================================================
// RSS PARSER (basit ama etkili)
// ==========================================================

function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  pubDate: string;
  description?: string;
}> {
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description?: string;
  }> = [];

  // <item>...</item> bloklarını bul
  const itemRegex = /<item[\s>][\s\S]*?<\/item>/gi;
  const matches = xml.match(itemRegex) ?? [];

  for (const block of matches) {
    const title =
      block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? "";
    const pubDate =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? "";
    const description =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]?.trim() ?? "";

    if (!title) continue;

    const cleanTitle = title
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim();
    const cleanDesc = description
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
      .slice(0, 300)
      .trim();

    items.push({
      title: cleanTitle,
      link,
      pubDate,
      description: cleanDesc,
    });
  }

  return items;
}

// ==========================================================
// KRİPTO RSS (ücretsiz, API key gerektirmez)
// ==========================================================

const CRYPTO_RSS_FEEDS: Array<{ url: string; source: string }> = [
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

  // Feed'leri paralel çek (hız için)
  const results = await Promise.allSettled(
    CRYPTO_RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" },
        });
        if (!res.ok) return [];
        const xml = await res.text();
        const parsed = parseRssItems(xml);

        return parsed
          .filter((p) => {
            const text = `${p.title} ${p.description ?? ""}`.toLowerCase();
            // Coin adı veya ticker geçiyor mu?
            return (
              text.includes(coinName.toLowerCase()) ||
              text.includes(coinBase.toLowerCase())
            );
          })
          .map((p) => {
            const text = `${p.title} ${p.description ?? ""}`;
            const lex = lexiconSentiment(text);
            return {
              title: p.title,
              url: p.link,
              source: feed.source,
              publishedAt: p.pubDate
                ? new Date(p.pubDate).toISOString()
                : new Date().toISOString(),
              summary: p.description,
              sentiment: lex.sentiment,
              sentimentScore: lex.score,
            } as NewsItem;
          });
      } catch {
        return [];
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      items.push(...r.value);
    }
  }

  // En yeni 10 tanesini al
  items.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return items.slice(0, 10);
}

// ==========================================================
// NEWSAPI (US/global hisse haber — opsiyonel)
// ==========================================================

async function fetchNewsApi(symbol: string): Promise<NewsItem[]> {
  if (!NEWSAPI_KEY) return [];
  const query = symbol.replace(/\.(US|IS)$/, "");
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWSAPI_KEY}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      articles?: Array<{
        title: string;
        url: string;
        publishedAt: string;
        source?: { name?: string };
        description?: string;
      }>;
    };
    return (data.articles ?? []).map((a) => {
      const text = `${a.title} ${a.description ?? ""}`;
      const lex = lexiconSentiment(text);
      return {
        title: a.title,
        url: a.url,
        source: a.source?.name ?? "NewsAPI",
        publishedAt: a.publishedAt,
        summary: a.description,
        sentiment: lex.sentiment,
        sentimentScore: lex.score,
      };
    });
  } catch {
    return [];
  }
}

// ==========================================================
// FINNHUB (US hisse — opsiyonel)
// ==========================================================

async function fetchFinnhub(symbol: string): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) return [];
  const ticker = symbol.replace(".US", "");
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      headline: string;
      url: string;
      datetime: number;
      source: string;
      summary: string;
    }>;
    return data.slice(0, 10).map((n) => {
      const text = `${n.headline} ${n.summary}`;
      const lex = lexiconSentiment(text);
      return {
        title: n.headline,
        url: n.url,
        source: n.source,
        publishedAt: new Date(n.datetime * 1000).toISOString(),
        summary: n.summary,
        sentiment: lex.sentiment,
        sentimentScore: lex.score,
      };
    });
  } catch {
    return [];
  }
}

// ==========================================================
// BIST RSS (Investing TR + Dünya)
// ==========================================================

const BIST_RSS_FEEDS: Array<{ url: string; source: string }> = [
  { url: "https://tr.investing.com/rss/news_25.rss", source: "Investing TR" },
  { url: "https://www.dunya.com/rss?list=piyasa", source: "Dünya" },
  { url: "https://www.bloomberght.com/rss", source: "Bloomberg HT" },
];

async function fetchBistRss(symbol: string): Promise<NewsItem[]> {
  const ticker = symbol.replace(".IS", "");
  const items: NewsItem[] = [];

  const results = await Promise.allSettled(
    BIST_RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 FormasyonAI" },
        });
        if (!res.ok) return [];
        const xml = await res.text();
        const parsed = parseRssItems(xml);

        return parsed
          .filter((p) => {
            const text = `${p.title} ${p.description ?? ""}`.toUpperCase();
            return text.includes(ticker);
          })
          .map((p) => {
            const text = `${p.title} ${p.description ?? ""}`;
            const lex = lexiconSentiment(text);
            return {
              title: p.title,
              url: p.link,
              source: feed.source,
              publishedAt: p.pubDate
                ? new Date(p.pubDate).toISOString()
                : new Date().toISOString(),
              summary: p.description,
              sentiment: lex.sentiment,
              sentimentScore: lex.score,
            } as NewsItem;
          });
      } catch {
        return [];
      }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      items.push(...r.value);
    }
  }

  items.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return items.slice(0, 10);
}

// ==========================================================
// ANA FONKSİYON
// ==========================================================

export async function getNewsForSymbol(
  market: string,
  symbol: string,
): Promise<NewsItem[]> {
  // 1. Cache
  const cached = await getCachedNews(market, symbol);
  if (cached.length > 0) return cached;

  // 2. Kaynağa göre çek
  let fresh: NewsItem[] = [];
  if (market === "crypto") {
    fresh = await fetchCryptoRss(symbol);
  } else if (market === "us" || market === "asia" || market === "europe") {
    fresh = NEWSAPI_KEY
      ? await fetchNewsApi(symbol)
      : await fetchFinnhub(symbol);
  } else if (market === "bist") {
    fresh = await fetchBistRss(symbol);
  }

  // 3. Kaydet
  if (fresh.length > 0) {
    await saveNews(market, symbol, fresh);
  }

  return fresh;
}

// ==========================================================
// HABERLERİ ÖZETLE (LLM'e vermek için)
// ==========================================================

export function summarizeNewsForPrompt(items: NewsItem[]): {
  text: string;
  avgSentiment: number;
  hasNews: boolean;
} {
  if (items.length === 0) {
    return { text: "Haber bulunamadı.", avgSentiment: 0, hasNews: false };
  }
  const top = items.slice(0, 5);
  const avg = top.reduce((a, b) => a + b.sentimentScore, 0) / top.length;
  const text = top
    .map(
      (n, i) =>
        `${i + 1}. [${n.source}] ${n.title} (sentiment: ${n.sentiment}, ${n.sentimentScore})`,
    )
    .join("\n");
  return { text, avgSentiment: avg, hasNews: true };
}