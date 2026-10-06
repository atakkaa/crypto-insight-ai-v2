import { callAiJson } from "./ai-gateway.server";
import { buildTechnicalEvidence } from "./technical-analysis.server";
import { detectFormations } from "./formation-engine.server";
import type {
  ChartAnalysis,
  NewsContextItem,
  IndicatorValues,
  IndicatorSeries,
  IndicatorAnalysis,
} from "./analysis-types";

export type AnalyzeCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | undefined;
};

// ============================================================
// TEKNİK İNDİKATÖR HESAPLAMA FONKSİYONLARI
// ============================================================

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];

  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  let ema = values[0] ?? 0;
  result.push(ema);

  for (let i = 1; i < values.length; i++) {
    const currentValue = values[i] ?? ema;

    ema =
      (currentValue - ema) * multiplier + ema;

    result.push(ema);
  }

  return result;
}

function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);

    const average =
      slice.reduce((sum, value) => sum + value, 0) /
      slice.length;

    result.push(average);
  }

  return result;
}

function calculateRSI(
  values: number[],
  period = 14,
): number[] {
  if (values.length === 0) return [];

  const result: number[] = new Array(values.length).fill(50);

  if (values.length < 2) return result;

  let gainSum = 0;
  let lossSum = 0;

  const initialPeriod = Math.min(
    period,
    values.length - 1,
  );

  for (let i = 1; i <= initialPeriod; i++) {
    const currentValue = values[i] ?? 0;
    const previousValue = values[i - 1] ?? 0;

    const change = currentValue - previousValue;

    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum += Math.abs(change);
    }
  }

  let averageGain =
    gainSum / initialPeriod;

  let averageLoss =
    lossSum / initialPeriod;

  const firstReadyIndex = initialPeriod;

  for (
    let i = firstReadyIndex;
    i < values.length;
    i++
  ) {
    if (i > firstReadyIndex) {
      const currentValue = values[i] ?? 0;
      const previousValue = values[i - 1] ?? 0;

      const change =
        currentValue - previousValue;

      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);

      averageGain =
        (averageGain * (period - 1) + gain) /
        period;

      averageLoss =
        (averageLoss * (period - 1) + loss) /
        period;
    }

    if (averageLoss === 0) {
      result[i] = 100;
    } else {
      const rs = averageGain / averageLoss;

      result[i] =
        100 - 100 / (1 + rs);
    }
  }

  const firstValue =
    result[firstReadyIndex] ?? 50;

  for (
    let i = 0;
    i < firstReadyIndex;
    i++
  ) {
    result[i] = firstValue;
  }

  return result;
}

function calculateMACD(values: number[]) {
  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);

  const macd: number[] = values.map(
    (_, index) => {
      const fastEma = ema12[index] ?? 0;
      const slowEma = ema26[index] ?? 0;

      return fastEma - slowEma;
    },
  );

  const signal = calculateEMA(macd, 9);

  const histogram = macd.map(
    (value, index) => {
      const signalValue = signal[index] ?? 0;

      return value - signalValue;
    },
  );

  return {
    macd,
    signal,
    histogram,
  };
}

function calculateBollinger(
  values: number[],
  period = 20,
  standardDeviationMultiplier = 2,
) {
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);

    const average =
      slice.reduce((sum, value) => sum + value, 0) /
      slice.length;

    const variance =
      slice.reduce(
        (sum, value) =>
          sum + Math.pow(value - average, 2),
        0,
      ) / slice.length;

    const standardDeviation = Math.sqrt(variance);

    middle.push(average);

    upper.push(
      average +
        standardDeviationMultiplier * standardDeviation,
    );

    lower.push(
      average -
        standardDeviationMultiplier * standardDeviation,
    );
  }

  return {
    middle,
    upper,
    lower,
  };
}

// ============================================================
// ADX
// ============================================================

function calculateADX(
  candles: AnalyzeCandle[],
  period = 14,
): number[] {
  const length = candles.length;

  if (length === 0) return [];

  const tr = new Array<number>(length).fill(0);
  const plusDM = new Array<number>(length).fill(0);
  const minusDM = new Array<number>(length).fill(0);

  for (let i = 1; i < length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    if (!current || !previous) {
      continue;
    }

    const highLow =
      current.high - current.low;

    const highPreviousClose = Math.abs(
      current.high - previous.close,
    );

    const lowPreviousClose = Math.abs(
      current.low - previous.close,
    );

    tr[i] = Math.max(
      highLow,
      highPreviousClose,
      lowPreviousClose,
    );

    const upwardMovement =
      current.high - previous.high;

    const downwardMovement =
      previous.low - current.low;

    if (
      upwardMovement > downwardMovement &&
      upwardMovement > 0
    ) {
      plusDM[i] = upwardMovement;
    }

    if (
      downwardMovement > upwardMovement &&
      downwardMovement > 0
    ) {
      minusDM[i] = downwardMovement;
    }
  }

  const adx = new Array<number>(length).fill(0);

  for (let i = 0; i < length; i++) {
    if (i < period) {
      adx[i] = 0;
      continue;
    }

    const start = Math.max(
      1,
      i - period + 1,
    );

    const trSlice = tr.slice(
      start,
      i + 1,
    );

    const plusSlice = plusDM.slice(
      start,
      i + 1,
    );

    const minusSlice = minusDM.slice(
      start,
      i + 1,
    );

    const averageTR =
      trSlice.reduce(
        (sum, value) => sum + value,
        0,
      ) / trSlice.length;

    const averagePlusDM =
      plusSlice.reduce(
        (sum, value) => sum + value,
        0,
      ) / plusSlice.length;

    const averageMinusDM =
      minusSlice.reduce(
        (sum, value) => sum + value,
        0,
      ) / minusSlice.length;

    if (averageTR === 0) {
      adx[i] = 0;
      continue;
    }

    const plusDI =
      (averagePlusDM / averageTR) * 100;

    const minusDI =
      (averageMinusDM / averageTR) * 100;

    const denominator =
      plusDI + minusDI;

    if (denominator === 0) {
      adx[i] = 0;
      continue;
    }

    const dx =
      (Math.abs(
        plusDI - minusDI,
      ) / denominator) *
      100;

    const dxValues: number[] = [];

    for (
      let j = Math.max(period, i - period + 1);
      j <= i;
      j++
    ) {
      const trStart = Math.max(
        1,
        j - period + 1,
      );

      const trPart = tr.slice(
        trStart,
        j + 1,
      );

      const plusPart = plusDM.slice(
        trStart,
        j + 1,
      );

      const minusPart = minusDM.slice(
        trStart,
        j + 1,
      );

      const trAvg =
        trPart.reduce(
          (sum, value) => sum + value,
          0,
        ) / trPart.length;

      if (trAvg === 0) {
        continue;
      }

      const plusAvg =
        plusPart.reduce(
          (sum, value) => sum + value,
          0,
        ) / plusPart.length;

      const minusAvg =
        minusPart.reduce(
          (sum, value) => sum + value,
          0,
        ) / minusPart.length;

      const pdi =
        (plusAvg / trAvg) * 100;

      const mdi =
        (minusAvg / trAvg) * 100;

      if (pdi + mdi === 0) {
        continue;
      }

      dxValues.push(
        (Math.abs(pdi - mdi) /
          (pdi + mdi)) *
          100,
      );
    }

    adx[i] =
      dxValues.length > 0
        ? dxValues.reduce(
            (sum, value) => sum + value,
            0,
          ) / dxValues.length
        : dx;
  }

  const firstValidIndex = Math.min(
    period,
    length - 1,
  );

  const firstValidValue =
    adx.find(
      (value, index) =>
        index >= firstValidIndex &&
        value > 0,
    ) ?? 0;

  for (
    let i = 0;
    i < firstValidIndex;
    i++
  ) {
    adx[i] = firstValidValue;
  }

  return adx;
}

// ============================================================
// TÜM İNDİKATÖRLERİ HESAPLA
// ============================================================

function calculateIndicatorData(
  candles: AnalyzeCandle[],
): {
  values: IndicatorValues;
  series: IndicatorSeries;
} {
  const closes = candles.map((c) => c.close);

  const volumes = candles.map(
    (c) => c.volume ?? 0,
  );

  const rsi = calculateRSI(closes, 14);

  const {
    macd,
    signal: macdSignal,
    histogram: macdHistogram,
  } = calculateMACD(closes);

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  const bollinger = calculateBollinger(
    closes,
    20,
    2,
  );

  const adx = calculateADX(candles, 14);

  const averageVolume = calculateSMA(
    volumes,
    20,
  );

  const lastIndex = candles.length - 1;

  const currentVolume =
    volumes[lastIndex] ?? 0;

  const currentAverageVolume =
    averageVolume[lastIndex] ?? 0;

  const volumeRatio =
    currentAverageVolume > 0
      ? currentVolume / currentAverageVolume
      : 0;

  const values: IndicatorValues = {
    rsi: rsi[lastIndex] ?? 50,

    macd: macd[lastIndex] ?? 0,

    macdSignal:
      macdSignal[lastIndex] ?? 0,

    macdHistogram:
      macdHistogram[lastIndex] ?? 0,

    ema20:
      ema20[lastIndex] ?? 0,

    ema50:
      ema50[lastIndex] ?? 0,

    ema200:
      ema200[lastIndex] ?? 0,

    bollingerUpper:
      bollinger.upper[lastIndex] ?? 0,

    bollingerMiddle:
      bollinger.middle[lastIndex] ?? 0,

    bollingerLower:
      bollinger.lower[lastIndex] ?? 0,

    adx:
      adx[lastIndex] ?? 0,

    volume: currentVolume,

    averageVolume: currentAverageVolume,

    volumeRatio,
  };

  const makeSeries = (
    source: number[],
  ) =>
    source.map((value, index) => ({
      index,
      time: candles[index]?.time ?? 0,
      value,
    }));

  const series: IndicatorSeries = {
    rsi: makeSeries(rsi),

    macd: makeSeries(macd),

    macdSignal: makeSeries(macdSignal),

    macdHistogram: makeSeries(
      macdHistogram,
    ),

    ema20: makeSeries(ema20),

    ema50: makeSeries(ema50),

    ema200: makeSeries(ema200),

    bollingerUpper: makeSeries(
      bollinger.upper,
    ),

    bollingerMiddle: makeSeries(
      bollinger.middle,
    ),

    bollingerLower: makeSeries(
      bollinger.lower,
    ),

    adx: makeSeries(adx),

    volume: makeSeries(volumes),

    averageVolume: makeSeries(
      averageVolume,
    ),
  };

  return {
    values,
    series,
  };
}

// ============================================================
// FORMASYON TAMAMLANMASI + HACİM TEYİDİ
// ============================================================

function getLinePriceAtIndex(
  line: { points: Array<{ index: number; price: number }> },
  targetIndex: number,
): number | null {
  const points = line.points;

  if (points.length === 0) return null;

  if (points.length === 1) {
    return points[0]?.price ?? null;
  }

  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) return null;

  if (last.index === first.index) {
    return last.price;
  }

  const ratio =
    (targetIndex - first.index) /
    (last.index - first.index);

  return (
    first.price +
    (last.price - first.price) * ratio
  );
}

function calculateFormationAlert(
  result: ChartAnalysis,
  candles: AnalyzeCandle[],
  indicatorValues: IndicatorValues,
) {
  const pattern = result.pattern;
  const lastCandle = candles[candles.length - 1];

  const currentIndex = Math.max(
    0,
    candles.length - 1,
  );

  if (!lastCandle) {
    return {
      formationCompleted: false,
      volumeConfirmed: false,
      triggered: false,
      signal: "BEKLE" as const,
      message: "Yeterli güncel mum verisi bulunamadı.",
      reason: "Formasyon ve hacim teyidi hesaplanamadı.",
    };
  }

  const confidence =
    Number.isFinite(pattern.confidence)
      ? pattern.confidence
      : 0;

  // Çok düşük güvenli veya nötr formasyonlarda
  // otomatik alarm üretmiyoruz.
  if (
    pattern.bias === "nötr" ||
    confidence < 70 ||
    pattern.lines.length === 0
  ) {
    return {
      formationCompleted: false,
      volumeConfirmed: false,
      triggered: false,
      signal: "BEKLE" as const,
      message: "Formasyon henüz alarm için yeterince teyitli değil.",
      reason:
        "Formasyon yönü nötr olabilir veya formasyon güven skoru %70'in altında olabilir.",
    };
  }

  const relevantKinds =
    pattern.bias === "yükseliş"
      ? ["direnç", "boyun"]
      : ["destek", "boyun"];

  const relevantLines = pattern.lines.filter(
    (line) =>
      relevantKinds.includes(line.kind),
  );

  if (relevantLines.length === 0) {
    return {
      formationCompleted: false,
      volumeConfirmed: false,
      triggered: false,
      signal: "BEKLE" as const,
      message:
        "Formasyon için kırılım seviyesi bulunamadı.",
      reason:
        "AI formasyon çizgileri içinde gerekli destek/direnç veya boyun çizgisi yok.",
    };
  }

  const levels = relevantLines
    .map((line) =>
      getLinePriceAtIndex(
        line,
        currentIndex,
      ),
    )
    .filter(
      (value): value is number =>
        value !== null &&
        Number.isFinite(value),
    );

  if (levels.length === 0) {
    return {
      formationCompleted: false,
      volumeConfirmed: false,
      triggered: false,
      signal: "BEKLE" as const,
      message:
        "Formasyon kırılım seviyesi hesaplanamadı.",
      reason:
        "Formasyon çizgilerinin güncel fiyat seviyesine izdüşümü bulunamadı.",
    };
  }

  const currentClose = lastCandle.close;

  const breakoutLevel =
    pattern.bias === "yükseliş"
      ? Math.max(...levels)
      : Math.min(...levels);

  const formationCompleted =
    pattern.bias === "yükseliş"
      ? currentClose > breakoutLevel
      : currentClose < breakoutLevel;

  // Hacim teyidi: mevcut hacim, 20 mumluk ortalamanın
  // en az 1.5 katı olmalı.
  const volumeConfirmed =
    indicatorValues.volumeRatio >= 1.5;

  const triggered =
    formationCompleted &&
    volumeConfirmed;

  const signal =
    triggered
      ? pattern.bias === "yükseliş"
        ? "AL"
        : "SAT"
      : "BEKLE";

  let message =
    "Formasyon tamamlanması için kırılım bekleniyor.";

  if (formationCompleted && !volumeConfirmed) {
    message =
      "Formasyon kırılımı oluştu ancak hacim henüz yeterli teyit vermiyor.";
  } else if (triggered) {
    message =
      pattern.bias === "yükseliş"
        ? "Yükseliş formasyonu tamamlandı ve hacim kırılımı teyit ediyor."
        : "Düşüş formasyonu tamamlandı ve hacim kırılımı teyit ediyor.";
  }

  const reason =
    `Formasyon: ${pattern.name}. ` +
    `Güven: %${confidence.toFixed(0)}. ` +
    `Kırılım seviyesi: ${breakoutLevel}. ` +
    `Kapanış: ${currentClose}. ` +
    `Hacim / ortalama hacim: ${(
      indicatorValues.volumeRatio * 100
    ).toFixed(0)}%. ` +
    `Hacim teyidi için eşik: %150.`;

  return {
    formationCompleted,
    volumeConfirmed,
    triggered,
    signal,
    message,
    reason,
  };
}

// ============================================================
// ANA AI ANALİZİ
// ============================================================

export async function runChartAnalysis(input: {
  symbol: string;
  market: string;
  interval: string;
  candles: AnalyzeCandle[];
  news?: NewsContextItem[] | undefined;
}): Promise<ChartAnalysis> {
  /*
   * EMA200 hesaplamasının daha sağlıklı olması için mümkün
   * olduğunca fazla mum kullanıyoruz.
   *
   * API'den maksimum 400 mum geldiği için son 400 mumu
   * kullanıyoruz.
   */
  const candles = input.candles.slice(-400);

  if (candles.length < 20) {
    throw new Error(
      "İndikatör analizi için yeterli mum verisi bulunamadı.",
    );
  }

  // ----------------------------------------------------------
  // 1. İNDİKATÖRLERİ HESAPLA
  // ----------------------------------------------------------

  const indicatorData =
    calculateIndicatorData(candles);

  const technicalEvidence =
    buildTechnicalEvidence(
      candles,
      indicatorData.values,
    );

  const formationEngine =
    detectFormations(
      candles.map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? 0,
      })),
      technicalEvidence,
    );

  // ----------------------------------------------------------
  // 2. AI'YA GÖNDERİLECEK MUM VERİSİ
  // ----------------------------------------------------------

  const analysisCandles =
    candles.slice(-180);

  const compact = analysisCandles
    .map(
      (c, i) =>
        `${i}|${new Date(c.time)
          .toISOString()
          .slice(0, 16)}|O${c.open}|H${c.high}|L${c.low}|C${c.close}|V${c.volume ?? 0}`,
    )
    .join("\n");

  // ----------------------------------------------------------
  // 3. HABERLER
  // ----------------------------------------------------------

  const news: NewsContextItem[] = input.news
    ? input.news.slice(0, 6)
    : [];

  const newsBlock =
    news.length > 0
      ? `
Bu sembolle ilgili güncel haberler
(tam metinlerden çıkarılmış etki notları):

${news
  .map(
    (n, i) =>
      `${i + 1}. [${n.source}] ${n.title}
   özet: ${n.summary}
   ayrıntı: ${n.detail}${
        n.direction
          ? `\n   beklenen yön: ${n.direction} (${
              n.strength ?? "?"
            }) — ${n.note ?? ""}`
          : ""
      }`,
  )
  .join("\n")}

`
      : `
Bu sembol için güncel haber bulunamadı;
sadece teknik veriye göre değerlendir.
`;

  // ----------------------------------------------------------
  // 4. İNDİKATÖR ÖZETİ
  // ----------------------------------------------------------

  const i = indicatorData.values;

  const indicatorBlock = `
GÜNCEL TEKNİK İNDİKATÖR DEĞERLERİ:

RSI (14): ${i.rsi.toFixed(2)}

MACD: ${i.macd.toFixed(6)}
MACD Signal: ${i.macdSignal.toFixed(6)}
MACD Histogram: ${i.macdHistogram.toFixed(6)}

EMA 20: ${i.ema20}
EMA 50: ${i.ema50}
EMA 200: ${i.ema200}

Bollinger Upper: ${i.bollingerUpper}
Bollinger Middle: ${i.bollingerMiddle}
Bollinger Lower: ${i.bollingerLower}

ADX (14): ${i.adx.toFixed(2)}

Güncel Hacim: ${i.volume}
20 Mum Ortalama Hacim: ${i.averageVolume}
Hacim / Ortalama Hacim: ${(
    i.volumeRatio * 100
  ).toFixed(2)}%

İndikatörleri yorumlarken sadece tek bir göstergeye
bakma. RSI, MACD, EMA'lar, Bollinger Bands, ADX ve
hacmi birlikte değerlendir.
`;

  // ----------------------------------------------------------
  // 4.1. FORMASYON MOTORU ÖZETİ
  // ----------------------------------------------------------

  const formationEngineBlock = `
KENDİ FORMASYON MOTORUMUZUN MATEMATİKSEL SONUCU:

Ana aday formasyon:
${
  formationEngine.primary
    ? `
Adı: ${formationEngine.primary.name}
Yön: ${formationEngine.primary.bias}
Uyumluluk skoru: %${formationEngine.primary.score}
Kırılım: ${formationEngine.primary.breakoutStatus}
Destek: ${formationEngine.primary.support ?? "yok"}
Direnç: ${formationEngine.primary.resistance ?? "yok"}
Boyun: ${formationEngine.primary.neckline ?? "yok"}
Hedef: ${formationEngine.primary.target ?? "yok"}
Geçersizlik seviyesi: ${
        formationEngine.primary.invalidation ?? "yok"
      }

Nedenler:
${formationEngine.primary.reasons
  .map((reason) => `- ${reason}`)
  .join("\n")}
`
    : "Henüz yeterli geometrik formasyon bulunamadı."
}

Diğer adaylar:
${
  formationEngine.candidates.length > 0
    ? formationEngine.candidates
        .map(
          (candidate, index) =>
            `${index + 1}. ${candidate.name} — yön: ${candidate.bias}, uyumluluk: %${candidate.score}, kırılım: ${candidate.breakoutStatus}`,
        )
        .join("\n")
    : "Başka aday bulunamadı."
}

Bu sonuç deterministik fiyat geometrisi hesabıdır.
Bunu başarı olasılığı olarak yorumlama.

Kendi formasyon sonucunu mum verileri,
teknik göstergeler ve haberlerle karşılaştır.

Eğer kendi motorumuz ile senin tespit ettiğin
formasyon farklıysa, bunu reasoning içinde belirt.
`;

  // ----------------------------------------------------------
  // 5. GEMINI ANALİZİ
  // ----------------------------------------------------------

  let result: ChartAnalysis;

  try {
    result = await callAiJson<ChartAnalysis>([
    {
      role: "system",
      content: `
Sen deneyimli bir teknik analiz uzmanısın.

Görevin:

1. Mum verilerinden klasik grafik formasyonlarını tespit etmek.
2. Formasyon için destek, direnç, trend, hedef veya boyun
   çizgilerini gerçek fiyat seviyeleriyle oluşturmak.
3. Formasyonu neden seçtiğini açıkça açıklamak.
4. RSI, MACD, EMA20, EMA50, EMA200, Bollinger Bands,
   ADX ve Volume göstergelerini birlikte değerlendirmek.
5. Varlığın teknik olarak neden yükseliş veya düşüş
   eğiliminde olabileceğini indikatörlerle gerekçelendirmek.
6. Hangi indikatörlerin aynı yönde sinyal verdiğini,
   hangilerinin çeliştiğini belirtmek.
7. Hacmin hareketi destekleyip desteklemediğini açıklamak.
8. ADX ile trendin güçlü veya zayıf olduğunu değerlendirmek.
9. RSI'ın aşırı alım/aşırı satım durumunu ve momentumunu
   değerlendirmek.
10. MACD ve histogramın momentum değişimini açıklamak.
11. Fiyatın EMA20, EMA50 ve EMA200'e göre konumunu
    yorumlamak.
12. Bollinger Bands üzerinde fiyatın konumunu ve
    olası sıkışma/genişleme durumunu değerlendirmek.
13. Haber etkisini teknik göstergelerle birlikte değerlendirmek.

ÖNEMLİ:

Tek bir indikatöre dayanarak kesin sonuç çıkarma.

"Kesin yükselеcek", "kesin düşecek" gibi ifadeler kullanma.

Bunun yerine:
- yükseliş senaryosu
- düşüş senaryosu
- kararsız / teyit bekleyen senaryo

şeklinde teknik değerlendirme yap.

TUTARLILIK KURALI (ÇOK ÖNEMLİ):

indicatorAnalysis.direction alanı ile 
indicatorAnalysis.summary ve indicatorAnalysis.combinedComment 
metinleri KESİNLİKLE aynı yönü göstermelidir.

- Eğer direction "yükseliş" ise, summary ve combinedComment 
  metinleri de yükseliş senaryosunu anlatmalıdır. 
  Metin içinde "düşüş" kelimesi geçmemelidir.

- Eğer direction "düşüş" ise, summary ve combinedComment 
  metinleri de düşüş senaryosunu anlatmalıdır. 
  Metin içinde "yükseliş" kelimesi geçmemelidir.

- Eğer direction "kararsız" ise, summary ve combinedComment 
  metinleri de kararsızlığı vurgulamalıdır.

Bu kurala uymayan cevaplar geçersiz sayılacaktır.

Analiz Türkçe olmalıdır.

Yatırım tavsiyesi verme.

Cevap SADECE geçerli JSON olmalıdır.
JSON dışında hiçbir açıklama yazma.
`,
    },

    {
      role: "user",
      content: `
Sembol: ${input.symbol}
Piyasa: ${input.market}
Zaman dilimi: ${input.interval}

MUM VERİLERİ
(index|zaman|açılış|yüksek|düşük|kapanış|hacim)

${compact}

${indicatorBlock}

${formationEngineBlock}

${newsBlock}

Aşağıdaki JSON şemasına birebir uy:

{
  "pattern": {
    "name": "formasyon adı",
    "bias": "yükseliş|düşüş|nötr",
    "confidence": 0,
    "lines": [
      {
        "label": "kısa etiket",
        "kind": "destek|direnç|trend|hedef|boyun",
        "points": [
          {
            "index": 0,
            "price": 0
          },
          {
            "index": 10,
            "price": 0
          }
        ]
      }
    ]
  },

  "reasoning": [
    "Formasyonu neden seçtiğini açıklayan madde 1",
    "Formasyonu neden seçtiğini açıklayan madde 2",
    "Formasyonu neden seçtiğini açıklayan madde 3",
    "Formasyonu neden seçtiğini açıklayan madde 4"
  ],

  "prediction": {
    "action": "AL|SAT|BEKLE",
    "entry": 0,
    "stop": 0,
    "targets": [0],
    "horizon": "örn. 1-3 gün",
    "riskNote": "kısa risk notu",
    "confidence": 0
  },

  "newsEffect": {
    "direction": "yukarı|aşağı|yatay",
    "strength": "yüksek|orta|düşük",
    "alignment": "destekliyor|çelişiyor|nötr",
    "summary": "haberlerin sembole etkisini 1-2 cümlede açıkla",
    "drivers": [
      "etkili haber / neden 1",
      "etkili haber / neden 2"
    ]
  },

  "indicatorValues": {
    "rsi": 0,
    "macd": 0,
    "macdSignal": 0,
    "macdHistogram": 0,
    "ema20": 0,
    "ema50": 0,
    "ema200": 0,
    "bollingerUpper": 0,
    "bollingerMiddle": 0,
    "bollingerLower": 0,
    "adx": 0,
    "volume": 0,
    "averageVolume": 0,
    "volumeRatio": 0
  },

  "indicatorAnalysis": {
    "direction": "yükseliş|düşüş|kararsız",
    "confidence": 0,

    "summary": "İndikatörlerin genel olarak ne söylediğini 2-3 cümleyle açıkla. Direction ile aynı yönü göster.",

    "reasons": [
      "RSI ve momentum gerekçesi",
      "MACD gerekçesi",
      "EMA trend gerekçesi",
      "Bollinger gerekçesi",
      "ADX ve hacim gerekçesi"
    ],

    "rsiComment": "RSI'ın mevcut durumunu ve bunun yükseliş/düşüş senaryosuna etkisini açıkla.",

    "macdComment": "MACD, Signal ve Histogram durumunu ve momentum açısından anlamını açıkla.",

    "emaComment": "Fiyatın EMA20, EMA50 ve EMA200'e göre konumunu ve trend açısından anlamını açıkla.",

    "bollingerComment": "Fiyatın Bollinger bantlarına göre konumunu ve volatilite/sıkışma durumunu açıkla.",

    "adxComment": "ADX değerinin trend gücü açısından ne söylediğini açıkla.",

    "volumeComment": "Mevcut hacmin 20 mumluk ortalama hacme göre durumunu ve fiyat hareketini destekleyip desteklemediğini açıkla.",

    "combinedComment": "TÜM indikatörleri birlikte değerlendir. Varlığın neden yükseliş, düşüş veya kararsız senaryoda olduğunu teknik gerekçelerle Türkçe açıkla. İndikatörlerin birbirini teyit edip etmediğini özellikle belirt.",

    "riskNote": "İndikatörlerin oluşturduğu teknik riskleri ve hangi durumda senaryonun geçersiz olabileceğini açıkla."
  }
}

Kurallar:

- confidence değerleri 0 ile 100 arasında olsun.
- pattern.lines en az 2, en fazla 5 çizgi içersin.
- Çizgi noktalarının index değerleri 0-${analysisCandles.length - 1}
  arasında olmalı.
- Çizgi fiyatları gerçek fiyat seviyelerinde olmalı.
- entry, stop ve targets gerçek fiyat seviyeleri olmalı.
- Haber yoksa newsEffect null olabilir.
- indicatorValues alanındaki değerleri verilen gerçek
  hesaplamalarla uyumlu tut.
- indicatorAnalysis kesin fiyat tahmini değil,
  teknik senaryo açıklaması olmalıdır.
- İndikatörler birbirleriyle çelişiyorsa bunu açıkça belirt.
- indicatorAnalysis.direction, summary ve combinedComment 
  alanları AYNI YÖNÜ göstermelidir.
`,
    },
  ]);
  } catch (error) {
    // AI kotası/gateway geçici olarak kullanılamasa bile
    // deterministik teknik ve formasyon motorunun sonucu
    // grafiğe gönderilmeye devam eder.
    const primary = formationEngine.primary;
    const fallbackLines = primary?.lines ?? [];
    const fallbackName = primary?.name ?? "Formasyon tespit edilmedi";
    const fallbackBias = primary?.bias ?? "nötr";
    const fallbackConfidence = primary?.score ?? 0;

    const fallbackReasoning = [
      "AI açıklama katmanı şu anda kullanılamıyor; aşağıdaki sonuç deterministik teknik/formasyon motorundan geliyor.",
      technicalEvidence.summary,
      ...(primary?.reasons ?? [
        "Mevcut mum geometrisinde yeterli formasyon adayı bulunamadı.",
      ]),
    ].filter(Boolean);

    result = {
      pattern: {
        name: fallbackName,
        bias: fallbackBias,
        confidence: fallbackConfidence,
        lines: fallbackLines,
      },
      reasoning: fallbackReasoning,
      prediction: {
        action: "BEKLE",
        entry: technicalEvidence.currentPrice ?? null,
        stop: primary?.invalidation ?? null,
        targets: primary?.target != null ? [primary.target] : [],
        horizon: "Teknik teyit bekleniyor",
        riskNote:
          "AI açıklaması kullanılamıyor. Bu sonuç deterministik teknik/formasyon hesaplamasıdır; yatırım tavsiyesi değildir.",
        confidence: fallbackConfidence,
      },
      newsEffect: null,
      indicatorValues: indicatorData.values,
      indicatorSeries: indicatorData.series,
      indicatorAnalysis: null,
    };

    void error;
  }


  // ----------------------------------------------------------
  // 5.1. FORMASYON ÇİZGİLERİNİN KAYNAĞINI SABİTLE
  // ----------------------------------------------------------
  // Formasyon çizgileri Gemini tarafından çizilmez.
  // Ana kaynak her zaman deterministik formation-engine olur.
  // Böylece AI başarılı olsa bile kendi çizgilerini grafiğe
  // dayatamaz; AI yalnızca yorum katmanı olarak kalır.
  // AI başarısızsa da aynı motor sonucu kullanılmaya devam eder.

  const motorPrimary = formationEngine.primary;
  const motorLines = motorPrimary?.lines ?? [];

  result.pattern = {
    ...result.pattern,
    name: motorPrimary?.name ?? "Formasyon tespit edilmedi",
    bias: motorPrimary?.bias ?? "nötr",
    confidence: motorPrimary?.score ?? 0,
    lines: motorLines,
  };

  // ----------------------------------------------------------
  // 6. FORMASYON + HACİM UYARISI
  // ----------------------------------------------------------

  /*
   * Alarmın kritik kısmını Gemini'ye bırakmıyoruz.
   * Formasyonun kırılımı ve hacim teyidi burada,
   * gerçek hesaplanan veriler üzerinden deterministik
   * olarak kontrol ediliyor.
   *
   * Böylece:
   * - yükseliş formasyonu + yukarı kırılım + güçlü hacim = AL
   * - düşüş formasyonu + aşağı kırılım + güçlü hacim = SAT
   * - hacim yetersizse = BEKLE
   */

  const formationAlert =
    calculateFormationAlert(
      result,
      analysisCandles,
      indicatorData.values,
    );

  (
    result as ChartAnalysis & {
      formationAlert?: typeof formationAlert;
    }
  ).formationAlert = formationAlert;

  // ----------------------------------------------------------
  // 7. FRONTEND GRAFİĞİ İÇİN HESAPLANMIŞ SERİLERİ KORU
  // ----------------------------------------------------------

  /*
   * Gemini'nin indicatorValues değerlerini değiştirmesine
   * güvenmek yerine gerçek hesaplanan değerleri kullanıyoruz.
   *
   * Böylece ekrandaki indikatör grafikleri ile AI'ya gönderilen
   * veriler aynı matematiksel kaynaktan gelir.
   */

  result.indicatorValues =
    indicatorData.values;

  result.indicatorSeries =
    indicatorData.series;

  result.technicalEvidence =
    technicalEvidence;

  result.formationEngine =
    formationEngine;

  // ----------------------------------------------------------
  // 8. AI indicatorAnalysis GELMEDİYSE GÜVENLİ FALLBACK
  // ----------------------------------------------------------

  if (!result.indicatorAnalysis) {
    const currentPrice =
      candles[candles.length - 1]?.close ?? 0;

    let direction:
      | "yükseliş"
      | "düşüş"
      | "kararsız" = "kararsız";

    let confidence = 50;

    const bullishSignals = [
      i.rsi > 50,
      i.macdHistogram > 0,
      currentPrice > i.ema20,
      currentPrice > i.ema50,
      currentPrice > i.ema200,
      i.volumeRatio >= 1,
    ].filter(Boolean).length;

    const bearishSignals = [
      i.rsi < 50,
      i.macdHistogram < 0,
      currentPrice < i.ema20,
      currentPrice < i.ema50,
      currentPrice < i.ema200,
      i.volumeRatio >= 1,
    ].filter(Boolean).length;

    if (bullishSignals >= 4) {
      direction = "yükseliş";
      confidence = Math.min(
        90,
        50 + bullishSignals * 6,
      );
    } else if (bearishSignals >= 4) {
      direction = "düşüş";
      confidence = Math.min(
        90,
        50 + bearishSignals * 6,
      );
    }

    const fallback: IndicatorAnalysis = {
      direction,

      confidence,

      summary:
        "İndikatörler birlikte değerlendirildiğinde teknik görünüm " +
        `${direction} senaryosuna işaret ediyor. ` +
        "Göstergeler arasında teyit ve çelişki noktaları birlikte değerlendirilmelidir.",

      reasons: [
        `RSI: ${i.rsi.toFixed(2)}`,
        `MACD Histogram: ${i.macdHistogram.toFixed(6)}`,
        `EMA20: ${i.ema20.toFixed(2)}, EMA50: ${i.ema50.toFixed(2)}, EMA200: ${i.ema200.toFixed(2)}`,
        `ADX: ${i.adx.toFixed(2)}`,
        `Hacim / Ortalama Hacim: ${(i.volumeRatio * 100).toFixed(0)}%`,
      ],

      rsiComment:
        `RSI ${i.rsi.toFixed(2)} seviyesinde. ` +
        (i.rsi >= 70
          ? "Aşırı alım bölgesinde."
          : i.rsi <= 30
            ? "Aşırı satım bölgesinde."
            : i.rsi >= 50
              ? "50 seviyesinin üzerinde ve momentum pozitif."
              : "50 seviyesinin altında ve momentum zayıf."),

      macdComment:
        i.macdHistogram >= 0
          ? "MACD histogramı pozitif; momentum tarafında yükseliş yönlü baskı bulunuyor."
          : "MACD histogramı negatif; momentum tarafında düşüş yönlü baskı bulunuyor.",

      emaComment:
        currentPrice > i.ema20 &&
        currentPrice > i.ema50 &&
        currentPrice > i.ema200
          ? "Fiyat EMA20, EMA50 ve EMA200 üzerinde; trend yapısı teknik olarak pozitif."
          : currentPrice < i.ema20 &&
              currentPrice < i.ema50 &&
              currentPrice < i.ema200
            ? "Fiyat EMA20, EMA50 ve EMA200 altında; trend yapısı teknik olarak negatif."
            : "Fiyat EMA seviyeleri arasında; trend görünümü karışık.",

      bollingerComment:
        currentPrice > i.bollingerUpper
          ? "Fiyat Bollinger üst bandının üzerinde; güçlü momentumla birlikte aşırı uzama riski takip edilmeli."
          : currentPrice < i.bollingerLower
            ? "Fiyat Bollinger alt bandının altında; satış baskısı güçlü ancak tepki ihtimali takip edilmeli."
            : "Fiyat Bollinger bantları içinde hareket ediyor.",

      adxComment:
        i.adx >= 25
          ? `ADX ${i.adx.toFixed(2)} seviyesinde; trend gücü belirgin.`
          : `ADX ${i.adx.toFixed(2)} seviyesinde; trend gücü sınırlı.`,

      volumeComment:
        i.volumeRatio >= 1
          ? `Hacim ortalamanın %${(
              i.volumeRatio * 100
            ).toFixed(0)} seviyesinde ve fiyat hareketini destekliyor olabilir.`
          : `Hacim ortalamanın %${(
              i.volumeRatio * 100
            ).toFixed(0)} seviyesinde; hareketin hacim teyidi zayıf.`,

      combinedComment:
        "RSI, MACD, EMA, Bollinger Bands, ADX ve hacim birlikte değerlendirilmelidir. " +
        `Mevcut hesaplamalara göre teknik görünüm ${direction} yönünde değerlendiriliyor; ` +
        "ancak göstergelerin tamamı aynı yönde sinyal vermiyorsa teyit beklemek gerekir.",

      riskNote:
        "Bu değerlendirme teknik göstergelere dayalı senaryodur. " +
        "Ani haber akışı, yüksek volatilite ve hacim değişimleri teknik görünümü değiştirebilir.",
    };

    result.indicatorAnalysis = fallback;
  }

  // ----------------------------------------------------------
  // 8.1. AI ÇIKTI TUTARLILIK KONTROLÜ (GUARD)
  // ----------------------------------------------------------
  // AI, direction="yükseliş" derken summary metninde "düşüş"
  // yazmış olabilir. Bu durumda güvenli fallback'e geçilir.
  // Böylece rozet ile metin arasındaki çelişki engellenir.

  if (result.indicatorAnalysis) {
    const dir = result.indicatorAnalysis.direction;
    const summaryLower = result.indicatorAnalysis.summary.toLowerCase();
    const combinedLower = result.indicatorAnalysis.combinedComment.toLowerCase();

    const hasYukselis = summaryLower.includes("yükseliş") || combinedLower.includes("yükseliş");
    const hasDusus = summaryLower.includes("düşüş") || combinedLower.includes("düşüş");

    let conflict = false;

    if (dir === "yükseliş" && hasDusus && !hasYukselis) conflict = true;
    if (dir === "düşüş" && hasYukselis && !hasDusus) conflict = true;

    if (conflict) {
      console.warn(
        `⚠️ AI tutarsızlığı tespit edildi: direction=${dir}, summary çelişkili. Fallback devreye giriyor.`,
      );
      result.indicatorAnalysis = null;
    }
  }

  // Tutarsızlık tespit edildiyse (veya AI analizi yoksa),
  // yeniden güvenli fallback üret.
  if (!result.indicatorAnalysis) {
    const currentPrice =
      candles[candles.length - 1]?.close ?? 0;

    let direction:
      | "yükseliş"
      | "düşüş"
      | "kararsız" = "kararsız";

    let confidence = 50;

    const bullishSignals = [
      i.rsi > 50,
      i.macdHistogram > 0,
      currentPrice > i.ema20,
      currentPrice > i.ema50,
      currentPrice > i.ema200,
      i.volumeRatio >= 1,
    ].filter(Boolean).length;

    const bearishSignals = [
      i.rsi < 50,
      i.macdHistogram < 0,
      currentPrice < i.ema20,
      currentPrice < i.ema50,
      currentPrice < i.ema200,
      i.volumeRatio >= 1,
    ].filter(Boolean).length;

    if (bullishSignals >= 4) {
      direction = "yükseliş";
      confidence = Math.min(90, 50 + bullishSignals * 6);
    } else if (bearishSignals >= 4) {
      direction = "düşüş";
      confidence = Math.min(90, 50 + bearishSignals * 6);
    }

    result.indicatorAnalysis = {
      direction,
      confidence,
      summary:
        "İndikatörler birlikte değerlendirildiğinde teknik görünüm " +
        `${direction} senaryosuna işaret ediyor. ` +
        "Göstergeler arasında teyit ve çelişki noktaları birlikte değerlendirilmelidir.",
      reasons: [
        `RSI: ${i.rsi.toFixed(2)}`,
        `MACD Histogram: ${i.macdHistogram.toFixed(6)}`,
        `EMA20: ${i.ema20.toFixed(2)}, EMA50: ${i.ema50.toFixed(2)}, EMA200: ${i.ema200.toFixed(2)}`,
        `ADX: ${i.adx.toFixed(2)}`,
        `Hacim / Ortalama Hacim: ${(i.volumeRatio * 100).toFixed(0)}%`,
      ],
      rsiComment:
        `RSI ${i.rsi.toFixed(2)} seviyesinde. ` +
        (i.rsi >= 70
          ? "Aşırı alım bölgesinde."
          : i.rsi <= 30
            ? "Aşırı satım bölgesinde."
            : i.rsi >= 50
              ? "50 seviyesinin üzerinde ve momentum pozitif."
              : "50 seviyesinin altında ve momentum zayıf."),
      macdComment:
        i.macdHistogram >= 0
          ? "MACD histogramı pozitif; momentum tarafında yükseliş yönlü baskı bulunuyor."
          : "MACD histogramı negatif; momentum tarafında düşüş yönlü baskı bulunuyor.",
      emaComment:
        currentPrice > i.ema20 &&
        currentPrice > i.ema50 &&
        currentPrice > i.ema200
          ? "Fiyat EMA20, EMA50 ve EMA200 üzerinde; trend yapısı teknik olarak pozitif."
          : currentPrice < i.ema20 &&
              currentPrice < i.ema50 &&
              currentPrice < i.ema200
            ? "Fiyat EMA20, EMA50 ve EMA200 altında; trend yapısı teknik olarak negatif."
            : "Fiyat EMA seviyeleri arasında; trend görünümü karışık.",
      bollingerComment:
        currentPrice > i.bollingerUpper
          ? "Fiyat Bollinger üst bandının üzerinde; güçlü momentumla birlikte aşırı uzama riski takip edilmeli."
          : currentPrice < i.bollingerLower
            ? "Fiyat Bollinger alt bandının altında; satış baskısı güçlü ancak tepki ihtimali takip edilmeli."
            : "Fiyat Bollinger bantları içinde hareket ediyor.",
      adxComment:
        i.adx >= 25
          ? `ADX ${i.adx.toFixed(2)} seviyesinde; trend gücü belirgin.`
          : `ADX ${i.adx.toFixed(2)} seviyesinde; trend gücü sınırlı.`,
      volumeComment:
        i.volumeRatio >= 1
          ? `Hacim ortalamanın %${(i.volumeRatio * 100).toFixed(0)} seviyesinde ve fiyat hareketini destekliyor olabilir.`
          : `Hacim ortalamanın %${(i.volumeRatio * 100).toFixed(0)} seviyesinde; hareketin hacim teyidi zayıf.`,
      combinedComment:
        "RSI, MACD, EMA, Bollinger Bands, ADX ve hacim birlikte değerlendirilmelidir. " +
        `Mevcut hesaplamalara göre teknik görünüm ${direction} yönünde değerlendiriliyor; ` +
        "ancak göstergelerin tamamı aynı yönde sinyal vermiyorsa teyit beklemek gerekir.",
      riskNote:
        "Bu değerlendirme teknik göstergelere dayalı senaryodur. " +
        "Ani haber akışı, yüksek volatilite ve hacim değişimleri teknik görünümü değiştirebilir.",
    };
  }

  return result;
}