import { callAiJson } from "./ai-gateway.server";
import type { ChartAnalysis, NewsContextItem } from "./analysis-types";

export type UserFormationLine = {
  start: {
    x: number;
    y: number;
  };
  end: {
    x: number;
    y: number;
  };
};

export type FormationEvaluationResult = {
  userFormation: {
    name: string;
    direction: "yükseliş" | "düşüş" | "yatay" | "belirsiz";
    compatibilityScore: number;
    explanation: string;
    strengths: string[];
    weaknesses: string[];
  };

  aiFormation: {
    name: string;
    direction: "yükseliş" | "düşüş" | "yatay" | "belirsiz";
    compatibilityScore: number;
    explanation: string;
  };

  comparison: {
    summary: string;
    alignment: "uyumlu" | "kısmen uyumlu" | "uyumsuz";
    technicalReasons: string[];
  };

  indicatorAssessment: {
    direction: "yükseliş" | "düşüş" | "kararsız";
    summary: string;
    supportingIndicators: string[];
    conflictingIndicators: string[];
  };

  volumeAssessment: {
    ratio: number;
    confirmed: boolean;
    summary: string;
  };

  newsAssessment: {
    direction: "yukarı" | "aşağı" | "yatay" | "belirsiz";
    strength: "yüksek" | "orta" | "düşük" | "belirsiz";
    alignment: "destekliyor" | "zayıflatıyor" | "nötr" | "belirsiz";
    summary: string;
    drivers: string[];
  };

  finalAssessment: string;

  riskNote: string;
};

export type FormationEvaluationInput = {
  symbol: string;
  market: string;
  interval: string;

  userLines: UserFormationLine[];

  /*
   * Kullanıcının formasyonu neden düşündüğünü açıklaması.
   * Örneğin:
   *
   * "Son iki dip yükseliyor ve hacim artıyor.
   * Bu yüzden yükselen üçgen olduğunu düşündüm."
   */
  userReason?: string;

  analysis: ChartAnalysis | null;

  relevantNews?: NewsContextItem[];
};

function clampScore(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numberValue)));
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanStringArray(
  value: unknown,
  fallback: string[] = [],
): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeDirection(
  value: unknown,
): "yükseliş" | "düşüş" | "yatay" | "belirsiz" {
  if (value === "yükseliş") return "yükseliş";
  if (value === "düşüş") return "düşüş";
  if (value === "yatay") return "yatay";

  return "belirsiz";
}

function normalizeIndicatorDirection(
  value: unknown,
): "yükseliş" | "düşüş" | "kararsız" {
  if (value === "yükseliş") return "yükseliş";
  if (value === "düşüş") return "düşüş";

  return "kararsız";
}

function normalizeNewsDirection(
  value: unknown,
): "yukarı" | "aşağı" | "yatay" | "belirsiz" {
  if (value === "yukarı") return "yukarı";
  if (value === "aşağı") return "aşağı";
  if (value === "yatay") return "yatay";

  return "belirsiz";
}

function normalizeNewsStrength(
  value: unknown,
): "yüksek" | "orta" | "düşük" | "belirsiz" {
  if (value === "yüksek") return "yüksek";
  if (value === "orta") return "orta";
  if (value === "düşük") return "düşük";

  return "belirsiz";
}

function normalizeAlignment(
  value: unknown,
): "destekliyor" | "zayıflatıyor" | "nötr" | "belirsiz" {
  if (value === "destekliyor") return "destekliyor";
  if (value === "zayıflatıyor") return "zayıflatıyor";
  if (value === "nötr") return "nötr";

  return "belirsiz";
}

function normalizeComparisonAlignment(
  value: unknown,
): "uyumlu" | "kısmen uyumlu" | "uyumsuz" {
  if (value === "uyumlu") return "uyumlu";
  if (value === "kısmen uyumlu") return "kısmen uyumlu";

  return "uyumsuz";
}

function detectUserDirection(
  lines: UserFormationLine[],
): "yükseliş" | "düşüş" | "yatay" | "belirsiz" {
  if (!lines.length) {
    return "belirsiz";
  }

  let totalSlope = 0;
  let validCount = 0;

  for (const line of lines) {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;

    if (Math.abs(dx) < 0.001) {
      continue;
    }

    totalSlope += dy / dx;
    validCount += 1;
  }

  if (validCount === 0) {
    return "belirsiz";
  }

  const averageSlope = totalSlope / validCount;

  /*
   * SVG koordinatlarında Y aşağı doğru büyür.
   * Bu nedenle negatif eğim = grafikte yukarı yön.
   */
  if (averageSlope < -0.08) {
    return "yükseliş";
  }

  if (averageSlope > 0.08) {
    return "düşüş";
  }

  return "yatay";
}

function buildUserDrawingDescription(
  lines: UserFormationLine[],
): string {
  if (!lines.length) {
    return "Kullanıcı henüz herhangi bir çizgi çizmemiş.";
  }

  return lines
    .map(
      (line, index) =>
        `${index + 1}. çizgi: başlangıç (${line.start.x.toFixed(
          2,
        )}, ${line.start.y.toFixed(
          2,
        )}) -> bitiş (${line.end.x.toFixed(
          2,
        )}, ${line.end.y.toFixed(2)})`,
    )
    .join("\n");
}

function buildNewsBlock(
  news: NewsContextItem[],
): string {
  if (!news.length) {
    return "Bu sembol için ilgili güncel haber bulunamadı.";
  }

  return news
    .slice(0, 8)
    .map(
      (item, index) => `
${index + 1}. Kaynak: ${item.source}
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

function buildAnalysisBlock(
  analysis: ChartAnalysis | null,
): string {
  if (!analysis) {
    return "Mevcut AI analiz sonucu bulunamadı.";
  }

  const indicatorValues = analysis.indicatorValues;

  return `
AI FORMASYONU
Ad: ${analysis.pattern?.name ?? "Bilinmiyor"}
Yön: ${analysis.pattern?.bias ?? "nötr"}
Güven: %${Number(analysis.pattern?.confidence ?? 0)}
AI formasyon gerekçeleri:
${(analysis.reasoning ?? [])
  .map((reason) => `- ${reason}`)
  .join("\n")}

AI FORMASYON ÇİZGİLERİ:
${(analysis.pattern?.lines ?? [])
  .map(
    (line, index) =>
      `${index + 1}. ${line.label} | tür: ${line.kind} | noktalar: ${line.points
        .map(
          (point) =>
            `index=${point.index}, fiyat=${point.price}`,
        )
        .join(" -> ")}`,
  )
  .join("\n")}

İNDİKATÖRLER
RSI: ${indicatorValues?.rsi ?? 0}
MACD: ${indicatorValues?.macd ?? 0}
MACD Signal: ${indicatorValues?.macdSignal ?? 0}
MACD Histogram: ${indicatorValues?.macdHistogram ?? 0}
EMA20: ${indicatorValues?.ema20 ?? 0}
EMA50: ${indicatorValues?.ema50 ?? 0}
EMA200: ${indicatorValues?.ema200 ?? 0}
Bollinger Upper: ${indicatorValues?.bollingerUpper ?? 0}
Bollinger Middle: ${indicatorValues?.bollingerMiddle ?? 0}
Bollinger Lower: ${indicatorValues?.bollingerLower ?? 0}
ADX: ${indicatorValues?.adx ?? 0}
Güncel Hacim: ${indicatorValues?.volume ?? 0}
Ortalama Hacim: ${indicatorValues?.averageVolume ?? 0}
Hacim / Ortalama: ${indicatorValues?.volumeRatio ?? 0}

İNDİKATÖR ANALİZİ
Yön: ${analysis.indicatorAnalysis?.direction ?? "kararsız"}
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

HABER ETKİSİ
Yön: ${analysis.newsEffect?.direction ?? "belirsiz"}
Güç: ${analysis.newsEffect?.strength ?? "belirsiz"}
Uyum: ${analysis.newsEffect?.alignment ?? "nötr"}
Özet: ${analysis.newsEffect?.summary ?? ""}
Nedenler:
${(analysis.newsEffect?.drivers ?? [])
  .map((driver) => `- ${driver}`)
  .join("\n")}
`;
}

function createFallback(
  input: FormationEvaluationInput,
): FormationEvaluationResult {
  const userDirection = detectUserDirection(
    input.userLines,
  );

  const aiDirection = normalizeDirection(
    input.analysis?.pattern?.bias,
  );

  const indicatorDirection = normalizeIndicatorDirection(
    input.analysis?.indicatorAnalysis?.direction,
  );

  const aiScore = clampScore(
    Number(input.analysis?.pattern?.confidence ?? 0),
  );

  const userScore =
    userDirection !== "belirsiz" &&
    aiDirection !== "yatay" &&
    userDirection === aiDirection
      ? 70
      : 50;

  const volumeRatio = Number(
    input.analysis?.indicatorValues?.volumeRatio ?? 0,
  );

  return {
    userFormation: {
      name: "Kullanıcı çizimi",
      direction: userDirection,
      compatibilityScore: userScore,
      explanation:
        "Kullanıcının çizdiği yapı mevcut AI formasyonu ve teknik yön ile karşılaştırılmalıdır.",
      strengths: [],
      weaknesses: [],
    },

    aiFormation: {
      name:
        input.analysis?.pattern?.name ??
        "AI formasyonu",
      direction: aiDirection,
      compatibilityScore: aiScore,
      explanation:
        input.analysis?.indicatorAnalysis
          ?.combinedComment ??
        "Mevcut AI formasyonunun teknik göstergelerle birlikte değerlendirilmesi gerekiyor.",
    },

    comparison: {
      summary:
        "AI değerlendirmesi alınamadı. Mevcut teknik veriler üzerinden temel karşılaştırma gösteriliyor.",
      alignment:
        userDirection === aiDirection
          ? "uyumlu"
          : "kısmen uyumlu",
      technicalReasons: [],
    },

    indicatorAssessment: {
      direction: indicatorDirection,
      summary:
        input.analysis?.indicatorAnalysis
          ?.summary ?? "İndikatör özeti bulunamadı.",
      supportingIndicators:
        input.analysis?.indicatorAnalysis
          ?.reasons ?? [],
      conflictingIndicators: [],
    },

    volumeAssessment: {
      ratio: volumeRatio,
      confirmed: volumeRatio >= 1.5,
      summary:
        volumeRatio >= 1.5
          ? "Mevcut hacim 20 mumluk ortalamanın en az 1.5 katında."
          : "Mevcut hacim henüz 1.5 katlık teyit seviyesine ulaşmıyor.",
    },

    newsAssessment: {
      direction: normalizeNewsDirection(
        input.analysis?.newsEffect?.direction,
      ),
      strength: normalizeNewsStrength(
        input.analysis?.newsEffect?.strength,
      ),
      alignment: normalizeAlignment(
        input.analysis?.newsEffect?.alignment,
      ),
      summary:
        input.analysis?.newsEffect?.summary ??
        "Haber etkisi bulunamadı.",
      drivers:
        input.analysis?.newsEffect?.drivers ??
        [],
    },

    finalAssessment:
      "Kullanıcı çizimi, mevcut AI formasyonu, indikatörler, hacim ve haberler birlikte değerlendirilmelidir.",

    riskNote:
      "Bu değerlendirme teknik analiz içindir ve yatırım tavsiyesi değildir.",
  };
}

export async function evaluateUserFormation(
  input: FormationEvaluationInput,
): Promise<FormationEvaluationResult> {
  const analysisBlock = buildAnalysisBlock(
    input.analysis,
  );

  const userDrawingBlock =
    buildUserDrawingDescription(input.userLines);

  const newsBlock = buildNewsBlock(
    input.relevantNews ?? [],
  );

  const userDirection = detectUserDirection(
    input.userLines,
  );

  const userReason = cleanText(
    input.userReason,
    "Kullanıcı formasyon için herhangi bir gerekçe belirtmedi.",
  );

  const response = await callAiJson<FormationEvaluationResult>([
    {
      role: "system",
      content: `
Sen teknik analiz ve grafik formasyonları konusunda
uzman bir yapay zeka değerlendirme katmanısın.

Senin görevin mevcut AI analizini değiştirmek DEĞİL,
mevcut AI analizini ve kullanıcının kendi çizdiği
formasyonu karşılaştırmaktır.

ÇOK ÖNEMLİ:

1. Mevcut AI formasyonunu yeniden yazma.
2. Mevcut AI analizinin yerine yeni bir formasyon üretme.
3. Kullanıcının çizdiği yapıyı bağımsız olarak değerlendir.
4. Kullanıcının çizimini mevcut AI formasyonu ile karşılaştır.
5. Kullanıcının formasyonu neden düşündüğünü yazdığı gerekçeyi
   mutlaka değerlendir.
6. Kullanıcının gerekçesindeki teknik iddiaların verilen fiyat,
   indikatör, hacim ve haber verileriyle uyumlu olup olmadığını
   açıkla.
7. Kullanıcı gerekçesinde haberden bahsediyorsa, yalnızca verilen
   haber verilerine dayanarak bu haberin formasyonu destekleyip
   desteklemediğini değerlendir.
8. Kullanıcının gerekçesi ile çizdiği formasyon arasında çelişki
   varsa bunu açıkça belirt.
9. RSI, MACD, EMA20, EMA50, EMA200, Bollinger,
   ADX ve hacmi birlikte değerlendir.
10. Haberleri yalnızca verilen haber verilerine dayanarak yorumla.
11. Haberlerin formasyonu destekleyip desteklemediğini açıkla.
12. Kullanıcının çizimi ile AI formasyonu aynı yöndeyse
    bunu belirt.
13. Farklı yöndeyse bunun nedenlerini teknik verilerle açıkla.
14. Kullanıcının çiziminin teknik yapıya ne kadar
    uyduğunu 0-100 arasında bir "uyum skoru" olarak ver.
15. AI formasyonunun mevcut teknik verilerle ne kadar
    uyumlu olduğunu 0-100 arasında ver.
16. Bu yüzdeler başarı veya kazanç olasılığı değildir.
    Sadece mevcut teknik kriterlere uyum skorudur.
17. Kesin fiyat tahmini yapma.
18. "Kesin yükselecek" veya "kesin düşecek" deme.
19. Yatırım tavsiyesi verme.
20. Teknik senaryo, teyit, destek, direnç, kırılım,
    hacim ve risk üzerinden konuş.
21. Cevap Türkçe olmalıdır.
22. Cevap SADECE geçerli JSON olmalıdır.

Kullanıcının çizim yönü:
${userDirection}

JSON şemasını birebir koru.
Eksik veri varsa uydurma.
`,
    },

    {
      role: "user",
      content: `
SEMBOL: ${input.symbol}
PİYASA: ${input.market}
ZAMAN DİLİMİ: ${input.interval}

==================================================
KULLANICININ ÇİZDİĞİ FORMASYON
==================================================

${userDrawingBlock}

==================================================
KULLANICININ FORMASYONU NEDEN DÜŞÜNDÜĞÜ
==================================================

${userReason}

Bu gerekçeyi özellikle şu açılardan değerlendir:

- Kullanıcının teknik gözlemleri verilen verilerle uyuşuyor mu?
- Kullanıcının bahsettiği destek/direnç veya fiyat yapısı gerçekten
  mevcut analizde destekleniyor mu?
- Kullanıcının bahsettiği indikatörler gerçekten aynı yönde mi?
- Kullanıcı haberden bahsediyorsa verilen haberler bunu destekliyor mu?
- Gerekçe ile çizilen formasyon arasında çelişki var mı?
- Gerekçenin hangi kısmı güçlü?
- Gerekçenin hangi kısmı eksik veya hatalı?

==================================================
MEVCUT AI ANALİZİ
==================================================

${analysisBlock}

==================================================
İLGİLİ HABERLER
==================================================

${newsBlock}

==================================================
GÖREV
==================================================

Aşağıdaki konuları değerlendir:

1. Kullanıcının çizimi hangi formasyona veya yapıya
   daha çok benziyor?

2. Kullanıcının çizimi mevcut fiyat yapısıyla ne kadar
   uyumlu?

3. Kullanıcının çizimi AI'nın mevcut formasyonuyla
   ne kadar uyumlu?

4. AI formasyonu mevcut teknik verilerle ne kadar uyumlu?

5. Kullanıcı çiziminin güçlü tarafları neler?

6. Kullanıcı çiziminin zayıf veya eksik tarafları neler?

7. Kullanıcının yazdığı gerekçe teknik verilerle ne kadar
   uyuşuyor?

8. Kullanıcının gerekçesinde doğru olan noktalar neler?

9. Kullanıcının gerekçesinde eksik veya çelişkili noktalar neler?

10. RSI, MACD, EMA, Bollinger, ADX ve hacim kullanıcı
    çizimini destekliyor mu?

11. Hacim şu anda formasyonu teyit ediyor mu?
    Özellikle 1.5x ortalama hacim eşiğini dikkate al.

12. Haberler kullanıcı formasyonunu destekliyor mu,
    zayıflatıyor mu veya nötr mü?

13. Haberler AI formasyonunu destekliyor mu,
    zayıflatıyor mu veya nötr mü?

14. Kullanıcı formasyonu ile AI formasyonu arasındaki
    temel fark nedir?

15. Hangi teknik şart gerçekleşirse mevcut yapı
    daha güçlü teyit kazanır?

16. Hangi durumda mevcut senaryo geçersiz hale gelir?

==================================================
JSON
==================================================

{
  "userFormation": {
    "name": "kullanıcı çiziminin formasyon/yapı adı",
    "direction": "yükseliş|düşüş|yatay|belirsiz",
    "compatibilityScore": 0,
    "explanation": "kullanıcı çiziminin teknik yapıya ve kullanıcının gerekçesine uyumunu açıkla",
    "strengths": [
      "güçlü taraf 1",
      "güçlü taraf 2"
    ],
    "weaknesses": [
      "zayıf taraf 1",
      "zayıf taraf 2"
    ]
  },

  "aiFormation": {
    "name": "mevcut AI formasyonunun adı",
    "direction": "yükseliş|düşüş|yatay|belirsiz",
    "compatibilityScore": 0,
    "explanation": "mevcut AI formasyonunun teknik verilerle uyumunu açıkla"
  },

  "comparison": {
    "summary": "iki formasyonun karşılaştırması",
    "alignment": "uyumlu|kısmen uyumlu|uyumsuz",
    "technicalReasons": [
      "karşılaştırma nedeni 1",
      "karşılaştırma nedeni 2",
      "karşılaştırma nedeni 3"
    ]
  },

  "indicatorAssessment": {
    "direction": "yükseliş|düşüş|kararsız",
    "summary": "indikatörlerin birlikte değerlendirmesi",
    "supportingIndicators": [
      "destekleyen indikatör 1",
      "destekleyen indikatör 2"
    ],
    "conflictingIndicators": [
      "çelişen indikatör 1",
      "çelişen indikatör 2"
    ]
  },

  "volumeAssessment": {
    "ratio": 0,
    "confirmed": false,
    "summary": "hacim teyidini açıkla"
  },

  "newsAssessment": {
    "direction": "yukarı|aşağı|yatay|belirsiz",
    "strength": "yüksek|orta|düşük|belirsiz",
    "alignment": "destekliyor|zayıflatıyor|nötr|belirsiz",
    "summary": "haber etkisini açıkla",
    "drivers": [
      "haber nedeni 1",
      "haber nedeni 2"
    ]
  },

  "finalAssessment": "kullanıcı çizimi, kullanıcı gerekçesi ile AI formasyonunun teknik karşılaştırmasının genel sonucu",

  "riskNote": "teknik riskler ve senaryonun geçersiz olabileceği durum"
}

Sayısal skorlar 0 ile 100 arasında olmalıdır.
volumeAssessment.ratio gerçek hacim oranı olmalıdır.
Uydurma haber veya teknik veri ekleme.
`,
    },
  ]);

  /*
   * Gateway başarılı JSON döndürdüyse bile güvenlik için
   * değerleri normalize ediyoruz.
   */

  return {
    userFormation: {
      name: cleanText(
        response?.userFormation?.name,
        "Kullanıcı çizimi",
      ),
      direction: normalizeDirection(
        response?.userFormation?.direction,
      ),
      compatibilityScore: clampScore(
        response?.userFormation?.compatibilityScore,
      ),
      explanation: cleanText(
        response?.userFormation?.explanation,
        "Kullanıcı çiziminin teknik uyumu değerlendirilemedi.",
      ),
      strengths: cleanStringArray(
        response?.userFormation?.strengths,
      ),
      weaknesses: cleanStringArray(
        response?.userFormation?.weaknesses,
      ),
    },

    aiFormation: {
      name: cleanText(
        response?.aiFormation?.name,
        input.analysis?.pattern?.name ??
          "AI formasyonu",
      ),
      direction: normalizeDirection(
        response?.aiFormation?.direction ??
          input.analysis?.pattern?.bias,
      ),
      compatibilityScore: clampScore(
        response?.aiFormation?.compatibilityScore ??
          input.analysis?.pattern?.confidence,
      ),
      explanation: cleanText(
        response?.aiFormation?.explanation,
        "AI formasyonunun teknik uyumu değerlendirilemedi.",
      ),
    },

    comparison: {
      summary: cleanText(
        response?.comparison?.summary,
        "Formasyon karşılaştırması yapılamadı.",
      ),
      alignment: normalizeComparisonAlignment(
        response?.comparison?.alignment,
      ),
      technicalReasons: cleanStringArray(
        response?.comparison?.technicalReasons,
      ),
    },

    indicatorAssessment: {
      direction: normalizeIndicatorDirection(
        response?.indicatorAssessment?.direction ??
          input.analysis?.indicatorAnalysis?.direction,
      ),
      summary: cleanText(
        response?.indicatorAssessment?.summary,
        input.analysis?.indicatorAnalysis?.summary ??
          "İndikatör değerlendirmesi bulunamadı.",
      ),
      supportingIndicators: cleanStringArray(
        response?.indicatorAssessment?.supportingIndicators,
        input.analysis?.indicatorAnalysis?.reasons ?? [],
      ),
      conflictingIndicators: cleanStringArray(
        response?.indicatorAssessment?.conflictingIndicators,
      ),
    },

    volumeAssessment: {
      ratio: Number.isFinite(
        Number(response?.volumeAssessment?.ratio),
      )
        ? Number(response.volumeAssessment.ratio)
        : Number(
            input.analysis?.indicatorValues?.volumeRatio ??
              0,
          ),
      confirmed:
        Boolean(response?.volumeAssessment?.confirmed) ||
        Number(
          input.analysis?.indicatorValues?.volumeRatio ?? 0,
        ) >= 1.5,
      summary: cleanText(
        response?.volumeAssessment?.summary,
        "Hacim değerlendirmesi bulunamadı.",
      ),
    },

    newsAssessment: {
      direction: normalizeNewsDirection(
        response?.newsAssessment?.direction ??
          input.analysis?.newsEffect?.direction,
      ),
      strength: normalizeNewsStrength(
        response?.newsAssessment?.strength ??
          input.analysis?.newsEffect?.strength,
      ),
      alignment: normalizeAlignment(
        response?.newsAssessment?.alignment ??
          input.analysis?.newsEffect?.alignment,
      ),
      summary: cleanText(
        response?.newsAssessment?.summary,
        input.analysis?.newsEffect?.summary ??
          "Haber değerlendirmesi bulunamadı.",
      ),
      drivers: cleanStringArray(
        response?.newsAssessment?.drivers,
        input.analysis?.newsEffect?.drivers ?? [],
      ),
    },

    finalAssessment: cleanText(
      response?.finalAssessment,
      "Formasyon karşılaştırması tamamlandı.",
    ),

    riskNote: cleanText(
      response?.riskNote,
      "Bu değerlendirme teknik analiz içindir ve yatırım tavsiyesi değildir.",
    ),
  };
}