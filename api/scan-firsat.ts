// api/scan-firsat.ts

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

// ==========================================================
// ENVIRONMENT VARIABLES
// ==========================================================

const ENV = (globalThis as any).process?.env ?? {};

const TELEGRAM_CHAT_IDS = String(ENV.TELEGRAM_CHAT_IDS ?? "")
  .split(",")
  .map((id: string) => id.trim())
  .filter((id: string) => Boolean(id));

const TELEGRAM_BOT_TOKEN = String(ENV.TELEGRAM_BOT_TOKEN ?? "");
const GEMINI_API_KEY = String(ENV.GEMINI_API_KEY ?? "");
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

// ==========================================================
// GEÇİCİ TAKİP LİSTESİ
// ==========================================================

let DINAMIK_USER_LISTESI: string[] = [];

// ==========================================================
// SUPABASE BİLDİRİM FONKSİYONU
// ==========================================================

async function sendNotificationToSupabase(params: {
  userId: string;
  market: string;
  symbol: string;
  durum: string;
  price: number;
  priority: boolean;
}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("Supabase env eksik, bildirim gönderilemedi.");
    return;
  }

  const { userId, market, symbol, durum, price, priority } = params;

  const severity = durum.includes("🚀")
    ? "önemli"
    : durum.includes("⚠️")
      ? "kritik"
      : "dikkat";

  // Başlık: "🚀 Güçlü yükseliş hareketi"
  const title = durum.replace(/[🚀⚠️🔨]/g, "").trim().slice(0, 100);

  const eventKey = [
    market,
    symbol,
    durum.slice(0, 20),
    new Date().toISOString().slice(0, 13), // saat bazında
  ].join("|");

  const body = {
    user_id: userId,
    market,
    symbol,
    type: "formation",
    priority,
    severity,
    title,
    message: `${symbol} ${price.toFixed(2)} → ${durum}`,
    reason: `Motor taraması: ${new Date().toLocaleString("tr-TR")}`,
    event_key: eventKey,
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal,resolution=ignore-duplicates",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Supabase bildirim hatası:", res.status, errorText);
    } else {
      console.log(`✅ Bildirim gönderildi: ${symbol} (${userId.slice(0, 8)}...)`);
    }
  } catch (error) {
    console.error("Supabase fetch hatası:", error);
  }
}

// ==========================================================
// ÖNCELİKLİ VARLIKLARI ÇEK
// ==========================================================

async function getPriorityAssets(): Promise<
  Array<{ user_id: string; market: string; symbol: string }>
> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/priority_assets?select=user_id,market,symbol`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!res.ok) {
      console.error("Priority assets çekilemedi:", res.status);
      return [];
    }

    return (await res.json()) as Array<{
      user_id: string;
      market: string;
      symbol: string;
    }>;
  } catch (error) {
    console.error("Priority assets fetch hatası:", error);
    return [];
  }
}

// ==========================================================
// TELEGRAM MESAJI
// ==========================================================

async function sendTelegramMessage(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN tanımlı değil.");
    return;
  }

  try {
    const url =
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` + `/sendMessage`;

    const telegramResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!telegramResponse.ok) {
      console.error(`Telegram HTTP ${telegramResponse.status}`);
    }
  } catch (error) {
    console.error("Telegram bildirim hatası:", error);
  }
}

// ==========================================================
// GEMINI YORUMU
// ==========================================================

async function improveWithGemini(text: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return text;
  }

  try {
    const url =
      "https://generativelanguage.googleapis.com/" +
      "v1beta/models/gemini-2.5-flash:generateContent" +
      `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  `${text}\n\n` +
                  "Yukarıdaki kripto ve borsa " +
                  "hareketlerini kısa ve anlaşılır " +
                  "şekilde yorumla. Önemli hareketleri " +
                  "öne çıkar. Kesin kazanç veya garanti " +
                  "ifadeleri kullanma.",
              },
            ],
          },
        ],
      }),
    });

    if (!geminiResponse.ok) {
      console.error(`Gemini HTTP ${geminiResponse.status}`);
      return text;
    }

    const data = (await geminiResponse.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof aiText === "string" && aiText.trim()) {
      return aiText.trim();
    }

    return text;
  } catch (error) {
    console.error("Gemini analiz hatası:", error);
    return text;
  }
}

// ==========================================================
// BINANCE KRİPTO LİSTESİ
// ==========================================================

async function getTopCryptoSymbols(): Promise<string[]> {
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/exchangeInfo",
    );

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
    console.error("Kripto listesi alınamadı:", error);
    return [];
  }
}

// ==========================================================
// BINANCE KRİPTO MUM VERİLERİ
// ==========================================================

async function getCryptoCandles(symbol: string) {
  try {
    const url =
      "https://api.binance.com/api/v3/klines" +
      `?symbol=${encodeURIComponent(symbol)}` +
      "&interval=1h&limit=100";

    const response = await fetch(url);
    if (!response.ok) return [];
    return (await response.json()) as any[];
  } catch {
    return [];
  }
}

// ==========================================================
// KRİPTO TARAMA
// ==========================================================

async function scanCrypto(symbols: string[]) {
  let result = "";
  let count = 0;
  const found: Array<{ symbol: string; price: number; durum: string }> = [];

  for (const symbol of symbols) {
    try {
      const klines = await getCryptoCandles(symbol);
      if (klines.length < 5) continue;

      const last = klines[klines.length - 1]!;
      const previous = klines[klines.length - 5]!;

      const close = Number(last[4]);
      const high = Number(last[2]);
      const low = Number(last[3]);
      const previousClose = Number(previous[4]);

      if (
        !Number.isFinite(close) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(previousClose)
      ) {
        continue;
      }

      let durum = "";

      if (close > previousClose * 1.04) {
        durum = "🚀 Güçlü yükseliş hareketi / kırılım ihtimali";
      } else if (close < previousClose * 0.96) {
        durum = "⚠️ Sert satış baskısı";
      } else if (high - close > (close - low) * 2.5) {
        durum = "🔨 Ters çekiç benzeri mum yapısı";
      } else if (close - low > (high - close) * 2.5) {
        durum = "🔨 Çekiç benzeri mum yapısı";
      }

      if (!durum) continue;

      result += `• ${symbol}: ` + `$${close.toLocaleString("en-US")} → ${durum}\n`;
      found.push({ symbol, price: close, durum });
      count++;
    } catch {
      continue;
    }
  }

  return { result, count, found };
}

// ==========================================================
// POPÜLER HİSSELER
// ==========================================================

const BIST_POPULER = [
  "THYAO", "EREGL", "ASELS", "TUPRS", "ISCTR", "AKBNK",
  "YKBNK", "GARAN", "KCHOL", "SAHOL", "SISE", "BIMAS",
];

const USA_POPULER = [
  "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA",
  "GOOGL", "AMD", "NFLX", "INTC",
];

// ==========================================================
// STOOQ HİSSE VERİSİ
// ==========================================================

async function getStockCandles(symbol: string) {
  try {
    const url =
      `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}&i=d`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 CryptoInsightAI" },
    });

    if (!response.ok) return [];

    const csv = await response.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 3) return [];

    return lines
      .slice(1)
      .map((line) => {
        const [date, open, high, low, close, volume] = line.split(",");
        return {
          date,
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume ?? 0),
        };
      })
      .filter((item) => Number.isFinite(item.close))
      .slice(-10);
  } catch {
    return [];
  }
}

// ==========================================================
// HİSSE TARAMA
// ==========================================================

async function scanStocks(stocks: string[]) {
  let result = "";
  let count = 0;
  const found: Array<{ symbol: string; price: number; durum: string }> = [];

  for (const stock of stocks) {
    try {
      const candles = await getStockCandles(stock);
      if (candles.length < 5) continue;

      const last = candles[candles.length - 1]!;
      const previous = candles[candles.length - 5]!;

      const close = Number(last.close);
      const previousClose = Number(previous.close);

      if (
        !Number.isFinite(close) ||
        !Number.isFinite(previousClose) ||
        close <= 0 ||
        previousClose <= 0
      ) {
        continue;
      }

      let durum = "";

      if (close > previousClose * 1.03) {
        durum = "🚀 Teknik yükseliş hareketi";
      } else if (close < previousClose * 0.97) {
        durum = "⚠️ Satış baskısı / düşüş hareketi";
      }

      if (!durum) continue;

      const marketName = stock.endsWith(".IS") ? "BIST" : "US";
      const cleanName = stock.replace(".IS", "");

      result += `• ${cleanName} (${marketName}): ` + `${close.toFixed(2)} → ${durum}\n`;
      found.push({ symbol: cleanName, price: close, durum });
      count++;
    } catch {
      continue;
    }
  }

  return { result, count, found };
}

// ==========================================================
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
    // ========================================================
    // POST
    // ========================================================

    if (request.method === "POST") {
      const body = request.body ?? {};
      const asset =
        typeof body.asset === "string" ? body.asset.toUpperCase().trim() : "";

      if (body.action === "add" && asset) {
        if (!DINAMIK_USER_LISTESI.includes(asset)) {
          DINAMIK_USER_LISTESI.push(asset);
        }
        return response.status(200).json({ success: true, list: DINAMIK_USER_LISTESI });
      }

      if (body.action === "remove" && asset) {
        DINAMIK_USER_LISTESI = DINAMIK_USER_LISTESI.filter(
          (item) => item !== asset,
        );
        return response.status(200).json({ success: true, list: DINAMIK_USER_LISTESI });
      }

      return response.status(400).json({ success: false, error: "Geçersiz işlem" });
    }

    // ========================================================
    // GET — TARAMA
    // ========================================================

    if (request.method === "GET") {
      let analizOzeti =
        "🔍 7/24 Dev Formasyon AI " + "Canlı Piyasa Taraması\n\n";

      let bulunanFirsatlar = "";
      let firsatSayaci = 0;

      const extraParam = request.query?.["extra"];
      const aktifUserListesi = [...DINAMIK_USER_LISTESI];

      if (extraParam) {
        String(extraParam)
          .split(",")
          .forEach((item) => {
            const symbol = item.trim().toUpperCase();
            if (symbol && !aktifUserListesi.includes(symbol)) {
              aktifUserListesi.push(symbol);
            }
          });
      }

      // ======================================================
      // KRİPTO
      // ======================================================

      const topCryptos = await getTopCryptoSymbols();
      const userCryptos = aktifUserListesi
        .filter(
          (item) =>
            item.endsWith("USDT") ||
            item === "BTC" ||
            item === "ETH" ||
            item === "SOL",
        )
        .map((item) => (item.endsWith("USDT") ? item : `${item}USDT`));

      const cryptoTargets = [
        ...new Set([...userCryptos, ...topCryptos]),
      ].slice(0, 110);

      const cryptoResult = await scanCrypto(cryptoTargets);
      bulunanFirsatlar += cryptoResult.result;
      firsatSayaci += cryptoResult.count;

      // ======================================================
      // HİSSELER
      // ======================================================

      const userStocks = aktifUserListesi
        .filter(
          (item) =>
            !item.endsWith("USDT") &&
            item !== "BTC" &&
            item !== "ETH" &&
            item !== "SOL",
        )
        .map((item) => {
          if (item.endsWith(".IS")) return item;
          if (USA_POPULER.includes(item)) return item;
          return `${item}.IS`;
        });

      const stockTargets = [
        ...new Set([
          ...userStocks,
          ...BIST_POPULER.map((item) => `${item}.IS`),
          ...USA_POPULER,
        ]),
      ];

      const stockResult = await scanStocks(stockTargets);
      bulunanFirsatlar += stockResult.result;
      firsatSayaci += stockResult.count;

      // ======================================================
      // ÖNCELİKLİ VARLIKLARA BİLDİRİM GÖNDER
      // ======================================================

      console.log("🔔 Öncelikli varlıklara bildirim gönderiliyor...");

      const priorityAssets = await getPriorityAssets();
      console.log(`📋 ${priorityAssets.length} öncelikli varlık bulundu.`);

      const allFound = [...cryptoResult.found, ...stockResult.found];

      for (const asset of priorityAssets) {
        // Bu öncelikli varlık bugün bulundu mu?
        const cleanSymbol = asset.symbol.replace("USDT", "").replace(".IS", "");
        const match = allFound.find((f) => {
          const fClean = f.symbol.replace("USDT", "").replace(".IS", "");
          return fClean === cleanSymbol;
        });

        if (match) {
          await sendNotificationToSupabase({
            userId: asset.user_id,
            market: asset.market,
            symbol: asset.symbol,
            durum: match.durum,
            price: match.price,
            priority: true,
          });
        }
      }

      // ======================================================
      // SONUÇ
      // ======================================================

      if (firsatSayaci > 0) {
        analizOzeti +=
          `📊 ${firsatSayaci} varlıkta ` +
          "dikkat çekici hareket algılandı.\n\n" +
          bulunanFirsatlar;
      } else {
        analizOzeti += "Piyasada şu an kritik " + "bir hareket algılanmadı.";
      }

      // ======================================================
      // GEMINI
      // ======================================================

      if (firsatSayaci > 0 && GEMINI_API_KEY) {
        analizOzeti = await improveWithGemini(analizOzeti);
      }

      // ======================================================
      // TELEGRAM
      // ======================================================

      if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length > 0) {
        for (const chatId of TELEGRAM_CHAT_IDS) {
          await sendTelegramMessage(chatId, analizOzeti);
        }
      } else {
        console.warn("Telegram environment variable'ları tanımlı değil.");
      }

      return response.status(200).json({
        success: true,
        message: "Tarama tamamlandı.",
        opportunities: firsatSayaci,
        priorityNotificationsSent: priorityAssets.length,
      });
    }

    return response
      .status(405)
      .json({ success: false, error: "Yöntem desteklenmiyor" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    return response.status(500).json({ success: false, error: message });
  }
}