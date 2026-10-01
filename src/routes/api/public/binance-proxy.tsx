import { createFileRoute } from "@tanstack/react-router";

// ==========================================================
// BINANCE API ENDPOINTS (fallback için)
// ==========================================================

const BINANCE_ENDPOINTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://data-api.binance.vision",
];

// ==========================================================
// BASİT ÖNBELLEK (cache)
// ==========================================================

type CacheEntry = {
  data: unknown;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10_000; // 10 saniye

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

// ==========================================================
// BINANCE'E İSTEK AT (fallback ile)
// ==========================================================

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

// ==========================================================
// ANA HANDLER
// ==========================================================

async function handle(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get("path");

    if (!path) {
      return new Response(
        JSON.stringify({ error: "path parametresi gerekli" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!path.startsWith("/api/v3/")) {
      return new Response(
        JSON.stringify({ error: "Sadece /api/v3/ path'leri desteklenir" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const cached = getCached(path);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Cache": "HIT",
        },
      });
    }

    const binanceRes = await fetchBinance(path);

    if (!binanceRes.ok) {
      return new Response(
        JSON.stringify({
          error: `Binance hatası: ${binanceRes.status}`,
        }),
        {
          status: binanceRes.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const data = (await binanceRes.json()) as unknown;

    setCache(path, data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        "Cache-Control": "public, max-age=10",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ==========================================================
// ROUTE — scan.tsx ile AYNI YAPI
// ==========================================================

export const Route = createFileRoute("/api/public/binance-proxy")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
    },
  },
});