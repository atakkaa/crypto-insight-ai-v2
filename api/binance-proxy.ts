// api/binance-proxy.ts

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

const BINANCE_ENDPOINTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://data-api.binance.vision",
];

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10_000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function fetchBinance(path: string): Promise<Response> {
  let lastError: Error | null = null;

  for (const base of BINANCE_ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: {
          "User-Agent": "FormasyonAI/1.0",
          Accept: "application/json",
        },
      });

      if (res.ok) {
        return res;
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Binance ${base} → ${res.status}`);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err as Error;
      continue;
    }
  }

  throw lastError ?? new Error("Tüm Binance endpoint'leri başarısız");
}

export default async function handler(
  request: RequestLike,
  response: ResponseLike,
) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    return response.status(200).end();
  }

  if (request.method !== "GET") {
    return response.status(405).json({
      success: false,
      error: "Sadece GET destekleniyor",
    });
  }

  try {
    const path = request.query?.["path"];

    if (!path || typeof path !== "string") {
      return response.status(400).json({
        success: false,
        error: "path parametresi gerekli",
      });
    }

    if (!path.startsWith("/api/v3/")) {
      return response.status(400).json({
        success: false,
        error: "Sadece /api/v3/ path'leri desteklenir",
      });
    }

    const cached = getCached(path);
    if (cached) {
      response.setHeader("X-Cache", "HIT");
      return response.status(200).json(cached);
    }

    const binanceRes = await fetchBinance(path);

    if (!binanceRes.ok) {
      return response.status(binanceRes.status).json({
        success: false,
        error: `Binance hatası: ${binanceRes.status}`,
      });
    }

    const data = (await binanceRes.json()) as unknown;
    setCache(path, data);

    response.setHeader("X-Cache", "MISS");
    return response.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return response.status(500).json({
      success: false,
      error: message,
    });
  }
}