import { callAiJson } from "./ai-gateway.server";
import type { ChartAnalysis, NewsContextItem } from "./analysis-types";
import type { UserFormationLine } from "./formation-evaluation.server";

export type FormationChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type FormationChatInput = {
  symbol: string;
  market: string;
  interval: string;
  analysis: ChartAnalysis | null;
  userLines: UserFormationLine[];
  relevantNews: NewsContextItem[];
  messages: FormationChatMessage[];
  question: string;
};

function buildAnalysisBlock(
  analysis: ChartAnalysis | null,
): string {
  if (!analysis) {
    return "Mevcut AI analizi bulunamadı.";
  }

  const i = analysis.indicatorValues;

  return `
MEVCUT AI FORMASYONU:
Ad: ${analysis.pattern?.name ?? "Bilinmiyor"}
Yön: ${analysis.pattern?.bias ?? "Belirsiz"}
Güven: %${Number(analysis.pattern?.confidence ?? 0)}

AI FORMASYON GEREKÇELERİ:
${(analysis.reasoning ?? [])
  .map((item) => `- ${item}`)
  .join("\n")}

İNDİKATÖRLER:
RSI: ${i?.rsi ?? 0}
MACD: ${i?.macd ?? 0}
MACD Signal: ${i?.macdSignal ?? 0}
MACD Histogram: ${i?.macdHistogram ?? 0}
EMA20: ${i?.ema20 ?? 0}
EMA50: ${i?.ema50 ?? 0}
EMA200: ${i?.ema200 ?? 0}
Bollinger Upper: ${i?.bollingerUpper ?? 0}
Bollinger Middle: ${i?.bollingerMiddle ?? 0}
Bollinger Lower: ${i?.bollingerLower ?? 0}
ADX: ${i?.adx ?? 0}
Güncel Hacim: ${i?.volume ?? 0}
Ortalama Hacim: ${i?.averageVolume ?? 0}
Hacim / Ortalama: ${i?.volumeRatio ?? 0}

İNDİKATÖR ANALİZİ:
Yön: ${analysis.indicatorAnalysis?.direction ?? "Kararsız"}
Güven: %${analysis.indicatorAnalysis?.confidence ?? 0}
Özet: ${analysis.indicatorAnalysis?.summary ?? ""}
RSI: ${analysis.indicatorAnalysis?.rsiComment ?? ""}
MACD: ${analysis.indicatorAnalysis?.macdComment ?? ""}
EMA: ${analysis.indicatorAnalysis?.emaComment ?? ""}
Bollinger: ${analysis.indicatorAnalysis?.bollingerComment ?? ""}
ADX: ${analysis.indicatorAnalysis?.adxComment ?? ""}
Hacim: ${analysis.indicatorAnalysis?.volumeComment ?? ""}
Birleşik yorum: ${analysis.indicatorAnalysis?.combinedComment ?? ""}
Risk: ${analysis.indicatorAnalysis?.riskNote ?? ""}

HABER ETKİSİ:
Yön: ${analysis.newsEffect?.direction ?? "Belirsiz"}
Güç: ${analysis.newsEffect?.strength ?? "Belirsiz"}
Uyum: ${analysis.newsEffect?.alignment ?? "Nötr"}
Özet: ${analysis.newsEffect?.summary ?? ""}
${(analysis.newsEffect?.drivers ?? [])
  .map((item) => `- ${item}`)
  .join("\n")}
`;
}

function buildDrawingBlock(
  lines: UserFormationLine[],
): string {
  if (!lines.length) {
    return "Kullanıcı çizimi bulunmuyor.";
  }

  return lines
    .map(
      (line, index) =>
        `${index + 1}. çizgi: (${line.start.x.toFixed(
          2,
        )}, ${line.start.y.toFixed(
          2,
        )}) -> (${line.end.x.toFixed(
          2,
        )}, ${line.end.y.toFixed(2)})`,
    )
    .join("\n");
}

function buildNewsBlock(
  news: NewsContextItem[],
): string {
  if (!news.length) {
    return "İlgili haber bulunamadı.";
  }

  return news
    .slice(0, 8)
    .map(
      (item, index) => `
${index + 1}. ${item.source}
Başlık: ${item.title}
Özet: ${item.summary}
Detay: ${item.detail}
Yön: ${item.direction ?? "belirsiz"}
Güç: ${item.strength ?? "belirsiz"}
Not: ${item.note ?? ""}
`,
    )
    .join("\n");
}

function buildMessagesBlock(
  messages: FormationChatMessage[],
): string {
  if (!messages.length) {
    return "Bu sohbette daha önce mesaj yok.";
  }

  return messages
    .slice(-12)
    .map(
      (message) =>
        `${message.role === "user" ? "KULLANICI" : "FORMASYON AI"}: ${message.text}`,
    )
    .join("\n");
}

export async function answerFormationChat(
  input: FormationChatInput,
): Promise<string> {
  const response = await callAiJson<{ answer?: string }>([
    {
      role: "system",
      content: `
Sen Formasyon AI uygulamasının özel teknik analiz sohbet asistanısın.

SADECE şu konular hakkında konuş:

- Grafik formasyonları
- Kullanıcının çizdiği formasyon
- Mevcut AI formasyonu
- Trendler
- Destek ve direnç
- Kırılım / breakout
- RSI
- MACD
- EMA20 / EMA50 / EMA200
- Bollinger Bands
- ADX
- Hacim
- Formasyon teyidi
- Teknik riskler
- İlgili piyasa haberleri ve bu haberlerin teknik yapıya olası etkisi

Bunun dışındaki konulara cevap verme.

Örneğin kullanıcı:
- hava durumu
- yemek tarifi
- kod yazma
- siyaset
- genel sohbet
- başka bir konu
sorarsa kısa şekilde:
"Bu sohbet yalnızca mevcut formasyon ve teknik piyasa analizi hakkında yardımcı olabilir."
de.

ÇOK ÖNEMLİ:

1. Sana verilen mevcut AI analizini değiştirme.
2. Mevcut AI formasyonunun yerine başka bir formasyon uydurma.
3. Kullanıcının çizimini ve mevcut AI formasyonunu karşılaştırabilirsin.
4. Verilmeyen fiyat, haber veya indikatör değerlerini uydurma.
5. Haber konusunda yalnızca verilen haber verilerini kullan.
6. Kesin yükseliş/düşüş garantisi verme.
7. Yatırım tavsiyesi verme.
8. Teknik senaryo, teyit ve risk üzerinden konuş.
9. Yüzde verirsen bunun başarı ihtimali değil teknik uyum/ölçüm olduğunu açıkça belirt.
10. Türkçe cevap ver.
11. Kısa ama açıklayıcı cevap ver.
12. Sadece geçerli JSON döndür.

JSON:
{
  "answer": "kullanıcıya verilecek Türkçe cevap"
}
`,
    },
    {
      role: "user",
      content: `
SEMBOL:
${input.symbol}

PİYASA:
${input.market}

ZAMAN DİLİMİ:
${input.interval}

========================================
KULLANICI ÇİZİMİ
========================================

${buildDrawingBlock(input.userLines)}

========================================
MEVCUT AI ANALİZİ
========================================

${buildAnalysisBlock(input.analysis)}

========================================
İLGİLİ HABERLER
========================================

${buildNewsBlock(input.relevantNews)}

========================================
ÖNCEKİ SOHBET
========================================

${buildMessagesBlock(input.messages)}

========================================
KULLANICININ YENİ SORUSU
========================================

${input.question}

Bu soruya mevcut teknik verileri kullanarak cevap ver.
`,
    },
  ]);

  const answer = response?.answer?.trim();

  if (!answer) {
    return "Bu soru için mevcut teknik verilerle anlamlı bir cevap oluşturulamadı. Formasyon, indikatör, hacim, destek/direnç veya haber etkisi hakkında daha spesifik sorabilirsin.";
  }

  return answer;
}