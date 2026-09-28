import { createServerFn } from "@tanstack/react-start";

import { callAiJson, GatewayError } from "./ai-gateway.server";
import {
  normalizeNewsForDeterministicAnalysis,
  type DeterministicNewsItem,
} from "./news-impact";

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
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://cryptoslate.com/feed/", source: "CryptoSlate" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", source: "WSJ Markets" },
  { url: "https://www.investing.com/rss/news_285.rss", source: "Investing" },
  { url: "https://tr.investing.com/rss/news_25.rss", source: "Investing TR" },
  { url: "https://www.bloomberght.com/rss", source: "BloombergHT" },
  { url: "https://www.dunya.com/rss?dunya", source: "Dünya" },
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
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return decode(match?.[1] ?? "");
}

async function fetchFeed(feed: { url: string; source: string }): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const blocks = xml.split(/<item[\s>]/i).slice(1, 9);
    return blocks
      .map((block) => ({
        title: pick("title", block),
        link: pick("link", block),
        source: feed.source,
        published: pick("pubDate", block),
        content: [pick("description", block), pick("content:encoded", block)]
          .filter(Boolean)
          .join(" ")
          .slice(0, 1200),
      }))
      .filter((item) => item.title.length > 0);
  } catch {
    return [];
  }
}

/** Haber sayfasını indirip gövde metnini çıkarır (başlık dışında tam içerik). */
async function fetchArticleText(url: string): Promise<string> {
  if (!url || !/^https?:\/\//.test(url)) return "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FormasyonAI/1.0)", Accept: "text/html" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => decode(m[1] ?? ""))
      .filter((t) => t.length > 60);
    const body = paragraphs.join("\n");
    return body.slice(0, 3500);
  } catch {
    return "";
  }
}

export const getMarketNews = createServerFn({ method: "GET" }).handler(async () => {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const items = results.flat();
  items.sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  const top = items.slice(0, 10);

  if (top.length === 0) {
    return { items: [] as NewsImpact[], error: "Haber kaynakları şu an yanıt vermiyor." };
  }

  // Başlık yetmez: her haberin tam metnini indirip AI'ye veriyoruz.
  const fullTexts = await Promise.all(top.map((n) => fetchArticleText(n.link)));
  const enrichedInput = top.map((n, i) => {
    const body = (fullTexts[i] || n.content || "").slice(0, 3200);
    return `${i + 1}. [${n.source}] ${n.title}\nTAM METİN: ${body || "(metin alınamadı, başlığa göre değerlendir)"}`;
  });

  const bare = (): NewsImpact[] =>
    normalizeNewsForDeterministicAnalysis(
      top.map((n) => ({
        title: n.title,
        summary: n.content.slice(0, 900),
        detail: n.content.slice(0, 1800),
      })),
    ).map((n: DeterministicNewsItem, index: number): NewsImpact => ({
      title: top[index]?.title ?? n.title,
      link: top[index]?.link ?? "",
      source: top[index]?.source ?? "",
      published: top[index]?.published ?? new Date().toISOString(),
      summary: n.summary ?? "",
      detail: n.detail ?? "",
      assets: n.direction && n.direction !== "yatay"
        ? [{
            asset: "GENEL",
            market: "piyasa",
            direction: n.direction,
            strength: n.strength ?? "düşük",
            note: n.note ?? "AI kotası olmadan yapılan haber yönü değerlendirmesi.",
          }]
        : [],
    }));

  try {
    const parsed = await callAiJson<{ items?: Array<Record<string, unknown>> }>([
      {
        role: "system",
        content:
          "Sen kripto, ABD borsası ve Borsa İstanbul'u (BIST) takip eden Türkçe bir piyasa analistisin. Sana verilen haberlerin TAM METNİNİ okuyup gerçek piyasa etkisini çıkarırsın: hangi coin, hangi hisse (BIST için THYAO, ASELS, GARAN gibi kodlar; ABD için AAPL, NVDA gibi), hangi endeks ne yöne etkilenir. Sadece başlığa değil metindeki sayılara, şirket adlarına, sektöre, faiz/enflasyon/regülasyon detaylarına bakarsın. Yalnızca JSON döndürürsün.",
      },
      {
        role: "user",
        content: `Haberler:\n${enrichedInput.join("\n\n")}\n\nŞu JSON şemasıyla yanıt ver:\n{"items":[{"index":1,"summary":"tek cümle Türkçe özet","detail":"2-3 cümle: haberin metnindeki hangi bilgi hangi varlığı neden etkiler","assets":[{"asset":"BTC veya THYAO","market":"kripto|bist|abd hisse|endeks|emtia","direction":"yukarı|aşağı|yatay","strength":"yüksek|orta|düşük","note":"kısa gerekçe"}]}]}\nHer haber için en fazla 3 varlık. Etkisi yoksa assets boş kalabilir. BIST'i ilgilendiren haberlerde mutlaka ilgili BIST kodunu ekle.`,
      },
    ]);

    const byIndex = new Map<number, { summary: string; detail: string; assets: NewsAsset[] }>();
    for (const raw of parsed.items ?? []) {
      const idx = Number(raw["index"]);
      if (!Number.isFinite(idx)) continue;
      byIndex.set(idx, {
        summary: typeof raw["summary"] === "string" ? raw["summary"] : "",
        detail: typeof raw["detail"] === "string" ? raw["detail"] : "",
        assets: Array.isArray(raw["assets"]) ? (raw["assets"] as NewsAsset[]) : [],
      });
    }

    const enriched: NewsImpact[] = top.map((n, i) => {
      const extra = byIndex.get(i + 1);
      return {
        title: n.title,
        link: n.link,
        source: n.source,
        published: n.published,
        summary: extra?.summary ?? "",
        detail: extra?.detail ?? "",
        assets: extra?.assets ?? [],
      };
    });
    return { items: enriched, error: null as string | null };
  } catch (error) {
    const message = error instanceof GatewayError ? error.message : "Haber etki analizi şu an yapılamadı.";
    return { items: bare(), error: message };
  }
});
