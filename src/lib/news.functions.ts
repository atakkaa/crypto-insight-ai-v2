import { createServerFn } from "@tanstack/react-start";

import { callAiJson, GatewayError } from "./ai-gateway.server";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  published: string;

  /** RSS özeti + haber sayfasından çekilen tam metin (kısaltılmış). */
  content: string;
};

export type NewsAsset = {
  asset: string;
  market: string;
  direction: "yukarı" | "aşağı" | "yatay";
  strength: "yüksek" | "orta" | "düşük";
  note: string;
};

export type NewsImpact = {
  title: string;
  link: string;
  source: string;
  published: string;
  summary: string;

  /** Haberin tam metninden çıkan ayrıntılı etki yorumu. */
  detail: string;

  assets: NewsAsset[];
};

const FEEDS: Array<{ url: string; source: string }> = [
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "CoinDesk",
  },
  {
    url: "https://cointelegraph.com/rss",
    source: "Cointelegraph",
  },
  {
    url: "https://cryptoslate.com/feed/",
    source: "CryptoSlate",
  },
  {
    url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    source: "WSJ Markets",
  },
  {
    url: "https://www.investing.com/rss/news_285.rss",
    source: "Investing",
  },
  {
    url: "https://tr.investing.com/rss/news_25.rss",
    source: "Investing TR",
  },
  {
    url: "https://www.bloomberght.com/rss",
    source: "BloombergHT",
  },
  {
    url: "https://www.dunya.com/rss?dunya",
    source: "Dünya",
  },
];

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(tag: string, block: string): string {
  const match = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  ).exec(block);

  return decode(match?.[1] ?? "");
}

async function fetchFeed(feed: {
  url: string;
  source: string;
}): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) return [];

    const xml = await res.text();

    const blocks = xml
      .split(/<item[\s>]/i)
      .slice(1, 9);

    return blocks
      .map((block) => ({
        title: pick("title", block),
        link: pick("link", block),
        source: feed.source,
        published: pick("pubDate", block),

        content: [
          pick("description", block),
          pick("content:encoded", block),
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 1200),
      }))
      .filter((item) => item.title.length > 0);
  } catch {
    return [];
  }
}

/**
 * Haber sayfasını indirip gövde metnini çıkarır.
 * Başlık dışında mümkün olduğunca haberin gerçek metnini almaya çalışır.
 */
async function fetchArticleText(url: string): Promise<string> {
  if (!url || !/^https?:\/\//.test(url)) {
    return "";
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FormasyonAI/1.0)",
        Accept: "text/html",
      },
    });

    if (!res.ok) return "";

    const html = await res.text();

    const paragraphs = [
      ...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi),
    ]
      .map((m) => decode(m[1] ?? ""))
      .filter((text) => text.length > 60);

    const body = paragraphs.join("\n");

    return body.slice(0, 3500);
  } catch {
    return "";
  }
}

export const getMarketNews = createServerFn({
  method: "GET",
}).handler(async () => {
  const results = await Promise.all(
    FEEDS.map(fetchFeed),
  );

  const items = results.flat();

  items.sort(
    (a, b) =>
      (Date.parse(b.published) || 0) -
      (Date.parse(a.published) || 0),
  );

  /**
   * İlk 10 güncel haber.
   */
  const top = items.slice(0, 10);

  if (top.length === 0) {
    return {
      items: [] as NewsImpact[],
      error: "Haber kaynakları şu an yanıt vermiyor.",
    };
  }

  /**
   * Sadece başlığı değil, mümkün olduğunda haberin
   * gerçek metnini de alıyoruz.
   */
  const fullTexts = await Promise.all(
    top.map((news) =>
      fetchArticleText(news.link),
    ),
  );

  const enrichedInput = top.map((news, index) => {
    const body = (
      fullTexts[index] ||
      news.content ||
      ""
    ).slice(0, 3200);

    return `${index + 1}. [${news.source}] ${news.title}
TAM METİN:
${body || "(metin alınamadı, başlığa göre değerlendir)"}`;
  });

  /**
   * AI çalışmazsa en azından gerçek haberleri
   * linkleriyle göstermeye devam ederiz.
   */
  const bare = (): NewsImpact[] =>
    top.map((news) => ({
      title: news.title,
      link: news.link,
      source: news.source,
      published: news.published,
      summary: "",
      detail: "",
      assets: [],
    }));

  try {
    const parsed = await callAiJson<{
      items?: Array<Record<string, unknown>>;
    }>([
      {
        role: "system",
        content:
          "Sen kripto, ABD borsası ve Borsa İstanbul'u (BIST) takip eden Türkçe bir piyasa analistisin. " +
          "Sana verilen haberlerin TAM METNİNİ okuyup gerçek piyasa etkisini çıkarırsın. " +
          "Hangi coin, hangi hisse, hangi endeks veya hangi emtianın etkilenebileceğini belirle. " +
          "BIST için THYAO, ASELS, GARAN gibi hisse kodlarını; ABD için AAPL, NVDA gibi kodları kullan. " +
          "Sadece başlığa değil metindeki sayılara, şirket adlarına, sektöre, faiz, enflasyon, regülasyon ve diğer ekonomik detaylara bak. " +
          "Yalnızca JSON döndür.",
      },
      {
        role: "user",
        content: `Haberler:

${enrichedInput.join("\n\n")}

Şu JSON şemasıyla yanıt ver:

{
  "items": [
    {
      "index": 1,
      "summary": "tek cümle Türkçe özet",
      "detail": "2-3 cümle: haberin metnindeki hangi bilgi hangi varlığı neden etkiler",
      "assets": [
        {
          "asset": "BTC veya THYAO",
          "market": "kripto|bist|abd hisse|endeks|emtia",
          "direction": "yukarı|aşağı|yatay",
          "strength": "yüksek|orta|düşük",
          "note": "kısa gerekçe"
        }
      ]
    }
  ]
}

Kurallar:
- Her haber için en fazla 3 varlık.
- Etkisi yoksa assets boş olabilir.
- BIST'i ilgilendiren haberlerde mümkünse ilgili BIST kodunu ekle.
- ABD hisselerini mümkünse gerçek hisse kodlarıyla belirt.
- Kripto varlıklarını mümkünse BTC, ETH gibi sade kodlarla belirt.
- direction sadece yukarı, aşağı veya yatay olsun.
- strength sadece yüksek, orta veya düşük olsun.`,
      },
    ]);

    const byIndex = new Map<
      number,
      {
        summary: string;
        detail: string;
        assets: NewsAsset[];
      }
    >();

    for (const raw of parsed.items ?? []) {
      const index = Number(raw["index"]);

      if (!Number.isFinite(index)) {
        continue;
      }

      const assets = Array.isArray(raw["assets"])
        ? (raw["assets"] as NewsAsset[])
        : [];

      byIndex.set(index, {
        summary:
          typeof raw["summary"] === "string"
            ? raw["summary"]
            : "",

        detail:
          typeof raw["detail"] === "string"
            ? raw["detail"]
            : "",

        assets,
      });
    }

    /**
     * RSS'den gelen gerçek haber linki korunuyor.
     * Böylece haber panelindeki "Haberi Aç" bağlantısı
     * gerçek haber sayfasına gidebilir.
     */
    const enriched: NewsImpact[] = top.map(
      (news, index) => {
        const extra = byIndex.get(index + 1);

        return {
          title: news.title,
          link: news.link,
          source: news.source,
          published: news.published,

          summary:
            extra?.summary ?? "",

          detail:
            extra?.detail ?? "",

          assets:
            extra?.assets ?? [],
        };
      },
    );

    return {
      items: enriched,
      error: null as string | null,
    };
  } catch (error) {
    const message =
      error instanceof GatewayError
        ? error.message
        : "Haber etki analizi şu an yapılamadı.";

    return {
      items: bare(),
      error: message,
    };
  }
});