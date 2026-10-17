// api/_lib/binance-proxy.ts

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

// Binance yerine MEXC kullanıyoruz (Vercel IP engelini aşmak için)
const MEXC_ENDPOINT = "https://api.mexc.com";

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
    let path = request.query?.["path"];

    if (!path || typeof path !== "string") {
      return response.status(400).json({
        success: false,
        error: "path parametresi gerekli",
      });
    }

    // URL'deki & karakteri yüzünden path'in geri kalanı ayrı parametre olarak gelmiş olabilir.
    // Örneğin: path=/api/v3/klines?symbol=BTCUSDT&interval=1h
    // Bu durumda gelen diğer parametreleri path'e tekrar ekliyoruz.
    const allQueryParams = Object.entries(request.query || {})
      .filter(([key]) => key !== "path" && key !== "originalPath") // path ve originalPath hariç diğerleri
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    if (allQueryParams) {
      path = `${path}&${allQueryParams}`;
    }

    // MEXC bazı endpoint'lerde farklı yollar kullanabilir, kontrolü esnettik
    if (!path.startsWith("/api/v3/") && !path.startsWith("/api/")) {
      return response.status(400).json({
        success: false,
        error: "Geçersiz path",
      });
    }

    const cached = getCached(path);
    if (cached) {
      response.setHeader("X-Cache", "HIT");
      return response.status(200).json(cached);
    }

    // MEXC'e istek at (header'ları kaldırdık, çünkü fetch/FormData uyumsuzluğuna neden olabiliyor)
    const mexcRes = await fetch(`${MEXC_ENDPOINT}${path}`);

    if (!mexcRes.ok) {
      return response.status(mexcRes.status).json({
        success: false,
        error: `MEXC hatası: ${mexcRes.status}`,
      });
    }

    const data = (await mexcRes.json()) as unknown;
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