// api/_lib/ai-commentary.ts — AI yorum + rule-based fallback

import type { NewsItem } from "./news";
import { summarizeNewsForPrompt } from "./news";

const ENV = (globalThis as any).process?.env ?? {};
const OPENROUTER_KEY = String(ENV.OPENROUTER_API_KEY ?? "");
const OPENROUTER_MODEL =
  String(ENV.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-exp:free");
const SUPABASE_URL = String(ENV.SUPABASE_URL ?? "");
const SUPABASE_SERVICE_ROLE_KEY = String(ENV.SUPABASE_SERVICE_ROLE_KEY ?? "");

// ==========================================================
// TİPLER
// ==========================================================

export type AiCommentary = {
  summary: string;
  impact: "pozitif" | "negatif" | "nötr";
  action: "AL" | "SAT" | "BEKLE" | "İZLE";
  sentiment: string;
  confidence: number;
  source: string;
};

export type AnalysisInput = {
  symbol: string;
  market: string;
  price: number;
  changePercent: number;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  indicators: Array<{ name: string; value: string; direction: string; strength: number }>;
  patterns: Array<{ name: string; direction: string; confidence: number; description: string }>;
  news: NewsItem[];
};

// ==========================================================
// CACHE
// ==========================================================

function hashKey(input: AnalysisInput): string {
  const newsHash = input.news
    .slice(0, 3)
    .map((n) => n.title.slice(0, 20))
    .join("|");
  return [
    input.market,
    input.symbol,
    input.direction,
    Math.floor(input.strength / 10),
    newsHash,
  ].join("::");
}

async function getFromAiCache(key: string): Promise<AiCommentary | null> {
  if (!SUPABASE_URL) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_commentary_cache?cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${new Date().toISOString()}&select=commentary,source`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ commentary: AiCommentary; source: string }>;
    return rows[0]?.commentary ?? null;
  } catch {
    return null;
  }
}

async function saveToAiCache(key: string, commentary: AiCommentary, ttlMin = 60) {
  if (!SUPABASE_URL) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_commentary_cache`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        cache_key: key,
        commentary,
        source: commentary.source,
        expires_at: new Date(Date.now() + ttlMin * 60_000).toISOString(),
      }),
    });
  } catch {}
}

// ==========================================================
// RULE-BASED MOTOR (fallback)
// ==========================================================

export function generateRuleBasedCommentary(input: AnalysisInput): AiCommentary {
  const { direction, strength, patterns, indicators, news, symbol, changePercent } = input;

  const displaySymbol = symbol
    .replace("USDT", "")
    .replace(/\.(IS|US|T|KS|HK|NS|DE|PA|L|MI|MC|AS|ST|OL|HE|SW|CO|V)$/, "");

  const avgNewsSentiment =
    news.length > 0
      ? news.reduce((a, b) => a + b.sentimentScore, 0) / news.length
      : 0;

  let sentiment = "nötr";
  if (changePercent <= -8) sentiment = "panik";
  else if (changePercent <= -5 || avgNewsSentiment <= -30) sentiment = "korku";
  else if (changePercent >= 8) sentiment = "coşku";
  else if (changePercent >= 5 || avgNewsSentiment >= 30) sentiment = "açgözlülük";

  const impact: AiCommentary["impact"] =
    direction === "bullish" && strength >= 60
      ? "pozitif"
      : direction === "bearish" && strength >= 60
        ? "negatif"
        : "nötr";

  let action: AiCommentary["action"] = "İZLE";
  if (direction === "bullish" && strength >= 80) action = "AL";
  else if (direction === "bullish" && strength >= 60) action = "BEKLE";
  else if (direction === "bearish" && strength >= 80) action = "SAT";
  else if (direction === "bearish" && strength >= 60) action = "BEKLE";

  const patternText =
    patterns.length > 0
      ? `${patterns.map((p) => p.name).join(", ")} formasyonu`
      : "Formasyon";
  const indText =
    indicators.length > 0
      ? `${indicators.slice(0, 2).map((i) => `${i.name} ${i.value}`).join(" + ")}`
      : "indikatörler";
  const newsText =
    news.length > 0
      ? `${news.length} haber (${avgNewsSentiment > 10 ? "olumlu" : avgNewsSentiment < -10 ? "olumsuz" : "nötr"})`
      : "haber yok";

  const summary = `${displaySymbol} için ${patternText} + ${indText} uyumlu. ${newsText}. Fiyat ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%.`;

  return {
    summary,
    impact,
    action,
    sentiment,
    confidence: Math.min(
      100,
      Math.round(strength * 0.9 + Math.abs(avgNewsSentiment) * 0.1),
    ),
    source: "motor:rule-based",
  };
}

// ==========================================================
// LLM ÇAĞRISI (OpenRouter)
// ==========================================================

async function generateWithOpenRouter(
  input: AnalysisInput,
): Promise<AiCommentary | null> {
  if (!OPENROUTER_KEY) return null;

  const newsCtx = summarizeNewsForPrompt(input.news);

  const prompt = `Sen bir finansal analist asistanısın. Aşağıdaki teknik analiz ve haber verilerine göre bir yatırımcıya bildirim metni hazırla.

VARLIK: ${input.symbol} (${input.market})
FİYAT: ${input.price.toFixed(4)} (${input.changePercent >= 0 ? "+" : ""}${input.changePercent.toFixed(2)}%)

TEKNİK ANALİZ:
- Genel Yön: ${input.direction}
- Güç: ${input.strength}/100
- İndikatörler: ${input.indicators.map((i) => `${i.name}=${i.value}(${i.direction},${i.strength}%)`).join(", ")}
- Formasyonlar: ${input.patterns.map((p) => `${p.name}(${p.direction},${p.confidence}%)`).join(", ") || "yok"}

HABERLER:
${newsCtx.text}

GÖREV: Aşağıdaki JSON formatında cevap ver. SADECE JSON döndür, başka metin ekleme.

{
  "summary": "1-2 cümle özet. Formasyon + indikatör + haber uyumunu belirt. Türkçe.",
  "impact": "pozitif" | "negatif" | "nötr",
  "action": "AL" | "SAT" | "BEKLE" | "İZLE",
  "sentiment": "korku" | "panik" | "nötr" | "açgözlülük" | "coşku",
  "confidence": 0-100 arası sayı
}

KURALLAR:
- Haberlerle teknik analiz çelişiyorsa "BEKLE" veya "İZLE" seç.
- Formasyon + indikatör + haber aynı yöndeyse confidence yüksek olsun.
- Türkçe, net, kısa yaz.`;

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
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn("OpenRouter hata:", res.status, err.slice(0, 200));
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<AiCommentary>;

    if (
      typeof parsed.summary !== "string" ||
      !["pozitif", "negatif", "nötr"].includes(parsed.impact ?? "") ||
      !["AL", "SAT", "BEKLE", "İZLE"].includes(parsed.action ?? "")
    ) {
      return null;
    }

    return {
      summary: parsed.summary,
      impact: parsed.impact as AiCommentary["impact"],
      action: parsed.action as AiCommentary["action"],
      sentiment: parsed.sentiment ?? "nötr",
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence ?? 70))),
      source: `openrouter:${OPENROUTER_MODEL}`,
    };
  } catch (err) {
    console.warn("OpenRouter parse hatası:", err);
    return null;
  }
}

// ==========================================================
// ANA FONKSİYON: AI → Fallback → Cache
// ==========================================================

export async function generateCommentary(
  input: AnalysisInput,
): Promise<AiCommentary> {
  const key = hashKey(input);

  const cached = await getFromAiCache(key);
  if (cached) return cached;

  let result = await generateWithOpenRouter(input);

  if (!result) {
    console.log("⚠️ AI başarısız/kota → rule-based motor devrede");
    result = generateRuleBasedCommentary(input);
  }

  await saveToAiCache(key, result, 60);

  return result;
}