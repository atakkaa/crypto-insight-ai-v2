import type {
  IndicatorValues,
  TechnicalEvidence,
  TechnicalLevel,
} from "./analysis-types";

export type TechnicalCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | undefined;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function percentageDifference(
  a: number,
  b: number,
): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return 0;
  }

  return Math.abs((a - b) / b) * 100;
}

function findPivotLevels(
  candles: TechnicalCandle[],
): {
  supports: number[];
  resistances: number[];
} {
  const supports: number[] = [];
  const resistances: number[] = [];

  /*
   * Son fiyat yapısına daha fazla ağırlık vermek için
   * son 120 mumu kullanıyoruz.
   */
  const start = Math.max(2, candles.length - 120);

  for (let i = start; i < candles.length - 2; i++) {
    const current = candles[i];
    const left1 = candles[i - 1];
    const left2 = candles[i - 2];
    const right1 = candles[i + 1];
    const right2 = candles[i + 2];

    if (!current || !left1 || !left2 || !right1 || !right2) {
      continue;
    }

    const isPivotLow =
      current.low <= left1.low &&
      current.low <= left2.low &&
      current.low <= right1.low &&
      current.low <= right2.low;

    const isPivotHigh =
      current.high >= left1.high &&
      current.high >= left2.high &&
      current.high >= right1.high &&
      current.high >= right2.high;

    if (isPivotLow) {
      supports.push(current.low);
    }

    if (isPivotHigh) {
      resistances.push(current.high);
    }
  }

  return {
    supports,
    resistances,
  };
}

function clusterLevels(
  levels: number[],
  tolerancePercent = 0.75,
): number[] {
  const sorted = [...levels]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return [];
  }

  const clusters: number[][] = [];

  for (const level of sorted) {
    const lastCluster = clusters.at(-1);

    if (!lastCluster || lastCluster.length === 0) {
      clusters.push([level]);
      continue;
    }

    const clusterAverage = average(lastCluster);

    if (
      percentageDifference(
        level,
        clusterAverage,
      ) <= tolerancePercent
    ) {
      lastCluster.push(level);
    } else {
      clusters.push([level]);
    }
  }

  return clusters
    .map((cluster) => average(cluster))
    .filter((value) => Number.isFinite(value));
}

function getRecentPivotDirection(
  candles: TechnicalCandle[],
): {
  higherHighs: number;
  higherLows: number;
  lowerHighs: number;
  lowerLows: number;
} {
  const start = Math.max(2, candles.length - 100);

  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = start; i < candles.length - 2; i++) {
    const current = candles[i];
    const left1 = candles[i - 1];
    const left2 = candles[i - 2];
    const right1 = candles[i + 1];
    const right2 = candles[i + 2];

    if (!current || !left1 || !left2 || !right1 || !right2) {
      continue;
    }

    if (
      current.high >= left1.high &&
      current.high >= left2.high &&
      current.high >= right1.high &&
      current.high >= right2.high
    ) {
      highs.push(current.high);
    }

    if (
      current.low <= left1.low &&
      current.low <= left2.low &&
      current.low <= right1.low &&
      current.low <= right2.low
    ) {
      lows.push(current.low);
    }
  }

  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;

  for (let i = 1; i < highs.length; i++) {
    const previous = highs[i - 1];
    const current = highs[i];

    if (
      previous !== undefined &&
      current !== undefined
    ) {
      if (current > previous) {
        higherHighs++;
      } else if (current < previous) {
        lowerHighs++;
      }
    }
  }

  for (let i = 1; i < lows.length; i++) {
    const previous = lows[i - 1];
    const current = lows[i];

    if (
      previous !== undefined &&
      current !== undefined
    ) {
      if (current > previous) {
        higherLows++;
      } else if (current < previous) {
        lowerLows++;
      }
    }
  }

  return {
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
  };
}

function getTrendDirection(
  candles: TechnicalCandle[],
  indicators: IndicatorValues,
): {
  direction: "yükseliş" | "düşüş" | "yatay";
  strength: "güçlü" | "orta" | "zayıf";
} {
  const currentPrice =
    candles.at(-1)?.close ?? 0;

  const structure =
    getRecentPivotDirection(candles);

  let bullishPoints = 0;
  let bearishPoints = 0;

  if (currentPrice > indicators.ema20) {
    bullishPoints++;
  } else if (currentPrice < indicators.ema20) {
    bearishPoints++;
  }

  if (currentPrice > indicators.ema50) {
    bullishPoints++;
  } else if (currentPrice < indicators.ema50) {
    bearishPoints++;
  }

  if (currentPrice > indicators.ema200) {
    bullishPoints++;
  } else if (currentPrice < indicators.ema200) {
    bearishPoints++;
  }

  if (
    indicators.ema20 > indicators.ema50
  ) {
    bullishPoints++;
  } else if (
    indicators.ema20 < indicators.ema50
  ) {
    bearishPoints++;
  }

  if (
    structure.higherHighs >
      structure.lowerHighs &&
    structure.higherLows >
      structure.lowerLows
  ) {
    bullishPoints += 2;
  }

  if (
    structure.lowerHighs >
      structure.higherHighs &&
    structure.lowerLows >
      structure.higherLows
  ) {
    bearishPoints += 2;
  }

  const difference =
    Math.abs(
      bullishPoints - bearishPoints,
    );

  let direction:
    | "yükseliş"
    | "düşüş"
    | "yatay" = "yatay";

  if (bullishPoints > bearishPoints + 1) {
    direction = "yükseliş";
  } else if (bearishPoints > bullishPoints + 1) {
    direction = "düşüş";
  }

  let strength:
    | "güçlü"
    | "orta"
    | "zayıf" = "zayıf";

  if (difference >= 5) {
    strength = "güçlü";
  } else if (difference >= 3) {
    strength = "orta";
  }

  return {
    direction,
    strength,
  };
}

function getMomentumDirection(
  indicators: IndicatorValues,
): "pozitif" | "negatif" | "karışık" {
  let positive = 0;
  let negative = 0;

  if (indicators.rsi > 50) {
    positive++;
  } else if (indicators.rsi < 50) {
    negative++;
  }

  if (indicators.macd > indicators.macdSignal) {
    positive++;
  } else {
    negative++;
  }

  if (indicators.macdHistogram > 0) {
    positive++;
  } else if (indicators.macdHistogram < 0) {
    negative++;
  }

  if (positive >= 2 && positive > negative) {
    return "pozitif";
  }

  if (negative >= 2 && negative > positive) {
    return "negatif";
  }

  return "karışık";
}

function getVolatilityState(
  candles: TechnicalCandle[],
  indicators: IndicatorValues,
): "düşük" | "normal" | "yüksek" {
  const price =
    candles.at(-1)?.close ?? 0;

  if (
    price <= 0 ||
    indicators.bollingerUpper <=
      indicators.bollingerLower
  ) {
    return "normal";
  }

  const bandWidth =
    (
      (indicators.bollingerUpper -
        indicators.bollingerLower) /
      price
    ) *
    100;

  if (bandWidth >= 8) {
    return "yüksek";
  }

  if (bandWidth <= 3) {
    return "düşük";
  }

  return "normal";
}

function getVolumeState(
  indicators: IndicatorValues,
): "güçlü" | "normal" | "zayıf" {
  if (indicators.volumeRatio >= 1.5) {
    return "güçlü";
  }

  if (indicators.volumeRatio >= 0.9) {
    return "normal";
  }

  return "zayıf";
}

function buildLevels(
  candles: TechnicalCandle[],
  currentPrice: number,
): {
  support: TechnicalLevel[];
  resistance: TechnicalLevel[];
} {
  const pivots = findPivotLevels(candles);

  const supports = clusterLevels(
    pivots.supports,
  );

  const resistances = clusterLevels(
    pivots.resistances,
  );

  const support = supports
    .filter((level) => level < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .map((price) => ({
      price,
      distancePercent:
        percentageDifference(
          currentPrice,
          price,
        ),
    }));

  const resistance = resistances
    .filter((level) => level > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, 5)
    .map((price) => ({
      price,
      distancePercent:
        percentageDifference(
          currentPrice,
          price,
        ),
    }));

  return {
    support,
    resistance,
  };
}

function getBreakoutStatus(
  currentPrice: number,
  support: TechnicalLevel[],
  resistance: TechnicalLevel[],
  indicators: IndicatorValues,
): "yukarı kırılım" | "aşağı kırılım" | "kırılım yok" {
  const nearestResistance =
    resistance[0]?.price ?? null;

  const nearestSupport =
    support[0]?.price ?? null;

  /*
   * Çok küçük fiyat farklarını kırılım kabul etmiyoruz.
   */
  const breakoutBuffer = 0.0025;

  if (
    nearestResistance !== null &&
    currentPrice >
      nearestResistance *
        (1 + breakoutBuffer)
  ) {
    return "yukarı kırılım";
  }

  if (
    nearestSupport !== null &&
    currentPrice <
      nearestSupport *
        (1 - breakoutBuffer)
  ) {
    return "aşağı kırılım";
  }

  return "kırılım yok";
}

export function buildTechnicalEvidence(
  candles: TechnicalCandle[],
  indicators: IndicatorValues,
): TechnicalEvidence {
  const currentPrice =
    candles.at(-1)?.close ?? 0;

  const trend =
    getTrendDirection(
      candles,
      indicators,
    );

  const momentum =
    getMomentumDirection(
      indicators,
    );

  const volatility =
    getVolatilityState(
      candles,
      indicators,
    );

  const volume =
    getVolumeState(
      indicators,
    );

  const levels =
    buildLevels(
      candles,
      currentPrice,
    );

  const breakout =
    getBreakoutStatus(
      currentPrice,
      levels.support,
      levels.resistance,
      indicators,
    );

  const bullishFactors: string[] = [];
  const bearishFactors: string[] = [];
  const neutralFactors: string[] = [];

  /*
   * TREND
   */
  if (trend.direction === "yükseliş") {
    bullishFactors.push(
      `Trend yapısı yükseliş yönünde (${trend.strength}).`,
    );
  } else if (trend.direction === "düşüş") {
    bearishFactors.push(
      `Trend yapısı düşüş yönünde (${trend.strength}).`,
    );
  } else {
    neutralFactors.push(
      "Trend yapısı net bir yön göstermiyor.",
    );
  }

  /*
   * EMA
   */
  if (
    currentPrice > indicators.ema20 &&
    currentPrice > indicators.ema50 &&
    currentPrice > indicators.ema200
  ) {
    bullishFactors.push(
      "Fiyat EMA20, EMA50 ve EMA200 üzerinde.",
    );
  } else if (
    currentPrice < indicators.ema20 &&
    currentPrice < indicators.ema50 &&
    currentPrice < indicators.ema200
  ) {
    bearishFactors.push(
      "Fiyat EMA20, EMA50 ve EMA200 altında.",
    );
  } else {
    neutralFactors.push(
      "Fiyat EMA seviyeleri arasında karışık konumda.",
    );
  }

  /*
   * MOMENTUM
   */
  if (momentum === "pozitif") {
    bullishFactors.push(
      "RSI/MACD momentum bileşimi pozitif.",
    );
  } else if (momentum === "negatif") {
    bearishFactors.push(
      "RSI/MACD momentum bileşimi negatif.",
    );
  } else {
    neutralFactors.push(
      "Momentum göstergeleri tam olarak aynı yönde değil.",
    );
  }

  /*
   * RSI
   */
  if (
    indicators.rsi >= 50 &&
    indicators.rsi < 70
  ) {
    bullishFactors.push(
      `RSI ${indicators.rsi.toFixed(1)} ile pozitif momentum bölgesinde.`,
    );
  } else if (
    indicators.rsi < 50
  ) {
    bearishFactors.push(
      `RSI ${indicators.rsi.toFixed(1)} ile 50 seviyesinin altında.`,
    );
  } else if (
    indicators.rsi >= 70
  ) {
    neutralFactors.push(
      `RSI ${indicators.rsi.toFixed(1)}; momentum güçlü ancak aşırı alım riski var.`,
    );
  }

  /*
   * ADX
   */
  if (indicators.adx >= 25) {
    if (trend.direction === "yükseliş") {
      bullishFactors.push(
        `ADX ${indicators.adx.toFixed(1)}; yükseliş trendinin gücü belirgin.`,
      );
    } else if (
      trend.direction === "düşüş"
    ) {
      bearishFactors.push(
        `ADX ${indicators.adx.toFixed(1)}; düşüş trendinin gücü belirgin.`,
      );
    } else {
      neutralFactors.push(
        `ADX ${indicators.adx.toFixed(1)}; trend güçlü fakat yön net değil.`,
      );
    }
  } else {
    neutralFactors.push(
      `ADX ${indicators.adx.toFixed(1)}; trend gücü sınırlı.`,
    );
  }

  /*
   * HACİM
   */
  if (volume === "güçlü") {
    if (
      trend.direction === "yükseliş"
    ) {
      bullishFactors.push(
        `Hacim ortalamanın ${(indicators.volumeRatio * 100).toFixed(0)}% seviyesinde.`,
      );
    } else if (
      trend.direction === "düşüş"
    ) {
      bearishFactors.push(
        `Hacim ortalamanın ${(indicators.volumeRatio * 100).toFixed(0)}% seviyesinde.`,
      );
    } else {
      neutralFactors.push(
        "Hacim güçlü fakat fiyat yönü net değil.",
      );
    }
  } else if (volume === "zayıf") {
    neutralFactors.push(
      `Hacim ortalamanın ${(indicators.volumeRatio * 100).toFixed(0)}% seviyesinde; hareketin teyidi zayıf.`,
    );
  }

  /*
   * KIRILIM
   */
  if (breakout === "yukarı kırılım") {
    bullishFactors.push(
      "En yakın direnç seviyesi yukarı kırılmış görünüyor.",
    );
  } else if (
    breakout === "aşağı kırılım"
  ) {
    bearishFactors.push(
      "En yakın destek seviyesi aşağı kırılmış görünüyor.",
    );
  }

  /*
   * TEKNİK UYUM SKORU
   *
   * Bu bir kazanç / başarı ihtimali değildir.
   * Sadece mevcut teknik göstergelerin aynı
   * senaryoyu ne kadar desteklediğini ölçer.
   */
  let score = 50;

  score +=
    bullishFactors.length * 6;

  score -=
    bearishFactors.length * 6;

  if (
    trend.direction === "yükseliş"
  ) {
    score += 8;
  } else if (
    trend.direction === "düşüş"
  ) {
    score -= 8;
  }

  if (momentum === "pozitif") {
    score += 6;
  } else if (
    momentum === "negatif"
  ) {
    score -= 6;
  }

  if (indicators.adx < 20) {
    score = 50 + (score - 50) * 0.6;
  }

  if (volume === "zayıf") {
    score = 50 + (score - 50) * 0.75;
  }

  score = Math.round(
    clamp(score, 0, 100),
  );

  let alignment:
    | "yükseliş destekli"
    | "düşüş destekli"
    | "karışık" = "karışık";

  if (score >= 65) {
    alignment = "yükseliş destekli";
  } else if (score <= 35) {
    alignment = "düşüş destekli";
  }

  const summary =
    `Trend: ${trend.direction} (${trend.strength}). ` +
    `Momentum: ${momentum}. ` +
    `Volatilite: ${volatility}. ` +
    `Hacim: ${volume}. ` +
    `Kırılım: ${breakout}. ` +
    `Teknik uyum skoru: %${score}.`;

  return {
    currentPrice: safeNumber(
      currentPrice,
    ),

    trendDirection:
      trend.direction,

    trendStrength:
      trend.strength,

    momentumDirection:
      momentum,

    volatilityState:
      volatility,

    volumeState:
      volume,

    breakoutStatus:
      breakout,

    supportLevels:
      levels.support,

    resistanceLevels:
      levels.resistance,

    nearestSupport:
      levels.support[0]?.price ??
      null,

    nearestResistance:
      levels.resistance[0]?.price ??
      null,

    alignmentScore: score,

    alignment,

    bullishFactors,

    bearishFactors,

    neutralFactors,

    summary,
  };
}