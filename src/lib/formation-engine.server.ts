import type {
  PatternLine,
  TechnicalEvidence,
} from "./analysis-types";

export type FormationEngineCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FormationCandidate = {
  name: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  score: number;
  lines: PatternLine[];
  breakoutStatus:
    | "yukarı kırılım"
    | "aşağı kırılım"
    | "kırılım yok";
  support: number | null;
  resistance: number | null;
  neckline: number | null;
  target: number | null;
  invalidation: number | null;
  reasons: string[];
};

export type FormationEngineResult = {
  primary: FormationCandidate | null;
  candidates: FormationCandidate[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
};

type SwingPoint = {
  index: number;
  price: number;
  time: number;
};

type Point = {
  index: number;
  price: number;
};

function finite(value: unknown): number | null {
  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentDifference(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return 100;
  }

  return Math.abs((a - b) / b) * 100;
}

function linearSlope(points: Point[]): number {
  if (points.length < 2) {
    return 0;
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;

  const dx = last.index - first.index;

  if (dx === 0) {
    return 0;
  }

  return (last.price - first.price) / dx;
}

function predictLine(
  points: Point[],
  index: number,
): number {
  if (points.length < 2) {
    return points[0]?.price ?? 0;
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;

  const dx = last.index - first.index;

  if (dx === 0) {
    return first.price;
  }

  const slope =
    (last.price - first.price) / dx;

  return first.price + slope * (index - first.index);
}

function toPatternLine(
  label: string,
  kind: PatternLine["kind"],
  points: Point[],
): PatternLine {
  return {
    label,
    kind,
    points: points.map((point) => ({
      index: point.index,
      price: point.price,
    })),
  };
}

/**
 * Yerel swing tepe/diplerini bulur.
 *
 * Çok küçük gürültüleri formasyon olarak kabul etmemek için
 * komşuluk penceresi kullanılır.
 */
function detectSwingPoints(
  candles: FormationEngineCandle[],
): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  if (candles.length < 15) {
    return { highs, lows };
  }

  const window = Math.max(
    2,
    Math.min(
      5,
      Math.floor(candles.length / 35),
    ),
  );

  for (
    let i = window;
    i < candles.length - window;
    i += 1
  ) {
    const candle = candles[i];

    if (!candle) {
      continue;
    }

    let isHigh = true;
    let isLow = true;

    for (
      let j = i - window;
      j <= i + window;
      j += 1
    ) {
      if (j === i) {
        continue;
      }

      const other = candles[j];

      if (!other) {
        continue;
      }

      if (other.high > candle.high) {
        isHigh = false;
      }

      if (other.low < candle.low) {
        isLow = false;
      }

      if (!isHigh && !isLow) {
        break;
      }
    }

    if (isHigh) {
      highs.push({
        index: i,
        price: candle.high,
        time: candle.time,
      });
    }

    if (isLow) {
      lows.push({
        index: i,
        price: candle.low,
        time: candle.time,
      });
    }
  }

  return {
    highs: highs.slice(-12),
    lows: lows.slice(-12),
  };
}

function buildCandidate(
  candidate: FormationCandidate,
): FormationCandidate {
  return {
    ...candidate,
    score: Math.round(
      clamp(candidate.score),
    ),
  };
}

/**
 * Yükselen üçgen:
 * direnç yataya yakın,
 * dipler yükseliyor.
 */
function detectAscendingTriangle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) {
    return null;
  }

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const resistance =
    average(h.map((p) => p.price));

  const highDeviation =
    average(
      h.map((p) =>
        percentDifference(
          p.price,
          resistance,
        ),
      ),
    );

  const lowSlope = linearSlope(l);
  const highSlope = linearSlope(h);

  const range =
    Math.max(...h.map((p) => p.price)) -
    Math.min(...l.map((p) => p.price));

  if (range <= 0) {
    return null;
  }

  const normalizedLowSlope =
    lowSlope / range;

  const horizontalResistance =
    highDeviation <= 1.8 &&
    Math.abs(highSlope) / range < 0.0015;

  const risingLows =
    normalizedLowSlope > 0.001;

  if (!horizontalResistance || !risingLows) {
    return null;
  }

  const score =
    55 +
    Math.min(20, (2 - highDeviation) * 8) +
    Math.min(20, normalizedLowSlope * 8000);

  const target =
    resistance + range * 0.85;

  const breakout =
    currentPrice > resistance
      ? "yukarı kırılım"
      : "kırılım yok";

  return buildCandidate({
    name: "Yükselen Üçgen",
    bias: "yükseliş",
    score,
    lines: [
      toPatternLine(
        "Yatay Direnç",
        "direnç",
        h,
      ),
      toPatternLine(
        "Yükselen Destek",
        "trend",
        l,
      ),
    ],
    breakoutStatus: breakout,
    support: l.at(-1)?.price ?? null,
    resistance,
    neckline: resistance,
    target,
    invalidation: l.at(-1)?.price ?? null,
    reasons: [
      "Tepe noktaları aynı direnç bölgesinde toplanıyor.",
      "Dip noktaları kademeli olarak yükseliyor.",
      "Fiyat hareketi daralan bir yapı oluşturuyor.",
    ],
  });
}

/**
 * Alçalan üçgen:
 * destek yataya yakın,
 * tepeler düşüyor.
 */
function detectDescendingTriangle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) {
    return null;
  }

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const support =
    average(l.map((p) => p.price));

  const lowDeviation =
    average(
      l.map((p) =>
        percentDifference(
          p.price,
          support,
        ),
      ),
    );

  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);

  const range =
    Math.max(...h.map((p) => p.price)) -
    Math.min(...l.map((p) => p.price));

  if (range <= 0) {
    return null;
  }

  const normalizedHighSlope =
    highSlope / range;

  const horizontalSupport =
    lowDeviation <= 1.8 &&
    Math.abs(lowSlope) / range < 0.0015;

  const fallingHighs =
    normalizedHighSlope < -0.001;

  if (!horizontalSupport || !fallingHighs) {
    return null;
  }

  const score =
    55 +
    Math.min(20, (2 - lowDeviation) * 8) +
    Math.min(
      20,
      Math.abs(normalizedHighSlope) * 8000,
    );

  const target =
    support - range * 0.85;

  const breakout =
    currentPrice < support
      ? "aşağı kırılım"
      : "kırılım yok";

  return buildCandidate({
    name: "Alçalan Üçgen",
    bias: "düşüş",
    score,
    lines: [
      toPatternLine(
        "Alçalan Direnç",
        "trend",
        h,
      ),
      toPatternLine(
        "Yatay Destek",
        "destek",
        l,
      ),
    ],
    breakoutStatus: breakout,
    support,
    resistance: h.at(-1)?.price ?? null,
    neckline: support,
    target,
    invalidation: h.at(-1)?.price ?? null,
    reasons: [
      "Dip noktaları aynı destek bölgesinde toplanıyor.",
      "Tepe noktaları kademeli olarak düşüyor.",
      "Fiyat hareketi aşağı doğru daralan bir yapı oluşturuyor.",
    ],
  });
}

/**
 * Simetrik üçgen:
 * tepeler düşüyor,
 * dipler yükseliyor.
 */
function detectSymmetricalTriangle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) {
    return null;
  }

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const range =
    Math.max(...h.map((p) => p.price)) -
    Math.min(...l.map((p) => p.price));

  if (range <= 0) {
    return null;
  }

  const highSlope =
    linearSlope(h) / range;

  const lowSlope =
    linearSlope(l) / range;

  if (
    highSlope >= -0.001 ||
    lowSlope <= 0.001
  ) {
    return null;
  }

  const convergence =
    Math.min(
      1,
      Math.abs(highSlope) /
        Math.max(lowSlope, 0.000001),
    );

  const score =
    55 +
    Math.min(30, convergence * 20);

  const upperLine =
    predictLine(h, highs.at(-1)?.index ?? 0);

  const lowerLine =
    predictLine(l, lows.at(-1)?.index ?? 0);

  let breakout:
    | "yukarı kırılım"
    | "aşağı kırılım"
    | "kırılım yok" = "kırılım yok";

  if (currentPrice > upperLine) {
    breakout = "yukarı kırılım";
  } else if (currentPrice < lowerLine) {
    breakout = "aşağı kırılım";
  }

  return buildCandidate({
    name: "Simetrik Üçgen",
    bias: "nötr",
    score,
    lines: [
      toPatternLine(
        "Üst Trend",
        "direnç",
        h,
      ),
      toPatternLine(
        "Alt Trend",
        "destek",
        l,
      ),
    ],
    breakoutStatus: breakout,
    support: l.at(-1)?.price ?? null,
    resistance: h.at(-1)?.price ?? null,
    neckline: null,
    target:
      breakout === "yukarı kırılım"
        ? upperLine + range * 0.8
        : breakout === "aşağı kırılım"
          ? lowerLine - range * 0.8
          : null,
    invalidation: null,
    reasons: [
      "Tepe noktaları aşağı eğimli.",
      "Dip noktaları yukarı eğimli.",
      "Üst ve alt trend çizgileri birbirine yaklaşıyor.",
    ],
  });
}

/**
 * Çift tepe.
 */
function detectDoubleTop(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 1) {
    return null;
  }

  const first = highs.at(-2);
  const second = highs.at(-1);

  if (!first || !second) {
    return null;
  }

  if (
    second.index - first.index < 4
  ) {
    return null;
  }

  const similarity =
    percentDifference(
      first.price,
      second.price,
    );

  if (similarity > 2.5) {
    return null;
  }

  const betweenLows = lows.filter(
    (low) =>
      low.index > first.index &&
      low.index < second.index,
  );

  if (betweenLows.length === 0) {
    return null;
  }

  const neckline =
    Math.min(
      ...betweenLows.map(
        (point) => point.price,
      ),
    );

  const height =
    average([
      first.price,
      second.price,
    ]) - neckline;

  if (height <= 0) {
    return null;
  }

  const score =
    65 +
    Math.min(
      25,
      (2.5 - similarity) * 8,
    );

  return buildCandidate({
    name: "Çift Tepe",
    bias: "düşüş",
    score,
    lines: [
      toPatternLine(
        "Tepe 1 - Tepe 2",
        "direnç",
        [
          {
            index: first.index,
            price: first.price,
          },
          {
            index: second.index,
            price: second.price,
          },
        ],
      ),
      toPatternLine(
        "Boyun Çizgisi",
        "boyun",
        betweenLows.slice(-2),
      ),
    ],
    breakoutStatus:
      currentPrice < neckline
        ? "aşağı kırılım"
        : "kırılım yok",
    support: neckline,
    resistance:
      Math.max(
        first.price,
        second.price,
      ),
    neckline,
    target:
      neckline - height,
    invalidation:
      Math.max(
        first.price,
        second.price,
      ),
    reasons: [
      `İki tepe arasındaki fiyat farkı yaklaşık %${similarity.toFixed(2)}.`,
      "İki tepe arasında belirgin bir geri çekilme bulunuyor.",
      "Boyun çizgisi iki tepe arasındaki dip bölgesinden çıkarıldı.",
    ],
  });
}

/**
 * Çift dip.
 */
function detectDoubleBottom(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
): FormationCandidate | null {
  if (lows.length < 2 || highs.length < 1) {
    return null;
  }

  const first = lows.at(-2);
  const second = lows.at(-1);

  if (!first || !second) {
    return null;
  }

  if (
    second.index - first.index < 4
  ) {
    return null;
  }

  const similarity =
    percentDifference(
      first.price,
      second.price,
    );

  if (similarity > 2.5) {
    return null;
  }

  const betweenHighs = highs.filter(
    (high) =>
      high.index > first.index &&
      high.index < second.index,
  );

  if (betweenHighs.length === 0) {
    return null;
  }

  const neckline =
    Math.max(
      ...betweenHighs.map(
        (point) => point.price,
      ),
    );

  const height =
    neckline -
    average([
      first.price,
      second.price,
    ]);

  if (height <= 0) {
    return null;
  }

  const score =
    65 +
    Math.min(
      25,
      (2.5 - similarity) * 8,
    );

  return buildCandidate({
    name: "Çift Dip",
    bias: "yükseliş",
    score,
    lines: [
      toPatternLine(
        "Dip 1 - Dip 2",
        "destek",
        [
          {
            index: first.index,
            price: first.price,
          },
          {
            index: second.index,
            price: second.price,
          },
        ],
      ),
      toPatternLine(
        "Boyun Çizgisi",
        "boyun",
        betweenHighs.slice(-2),
      ),
    ],
    breakoutStatus:
      currentPrice > neckline
        ? "yukarı kırılım"
        : "kırılım yok",
    support:
      Math.min(
        first.price,
        second.price,
      ),
    resistance: neckline,
    neckline,
    target:
      neckline + height,
    invalidation:
      Math.min(
        first.price,
        second.price,
      ),
    reasons: [
      `İki dip arasındaki fiyat farkı yaklaşık %${similarity.toFixed(2)}.`,
      "İki dip arasında belirgin bir tepki yükselişi bulunuyor.",
      "Boyun çizgisi iki dip arasındaki tepe bölgesinden çıkarıldı.",
    ],
  });
}

/**
 * Yükselen / düşen kanal.
 */
function detectChannel(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) {
    return null;
  }

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);

  const averagePrice =
    average([
      ...h.map((p) => p.price),
      ...l.map((p) => p.price),
    ]);

  if (averagePrice <= 0) {
    return null;
  }

  const normalizedHighSlope =
    highSlope / averagePrice;

  const normalizedLowSlope =
    lowSlope / averagePrice;

  const sameDirection =
    normalizedHighSlope *
      normalizedLowSlope >
    0;

  if (!sameDirection) {
    return null;
  }

  const slopeDifference =
    Math.abs(
      normalizedHighSlope -
        normalizedLowSlope,
    );

  if (slopeDifference > 0.01) {
    return null;
  }

  const bullish =
    normalizedHighSlope > 0;

  const score =
    58 +
    Math.min(
      30,
      Math.max(
        0,
        1 - slopeDifference * 100,
      ) * 30,
    );

  return buildCandidate({
    name: bullish
      ? "Yükselen Kanal"
      : "Düşen Kanal",
    bias: bullish
      ? "yükseliş"
      : "düşüş",
    score,
    lines: [
      toPatternLine(
        "Üst Kanal",
        "direnç",
        h,
      ),
      toPatternLine(
        "Alt Kanal",
        "destek",
        l,
      ),
    ],
    breakoutStatus: "kırılım yok",
    support: l.at(-1)?.price ?? null,
    resistance: h.at(-1)?.price ?? null,
    neckline: null,
    target: null,
    invalidation: null,
    reasons: [
      bullish
        ? "Tepe ve dipler birlikte yükseliyor."
        : "Tepe ve dipler birlikte düşüyor.",
      "Üst ve alt fiyat hareketleri benzer eğime sahip.",
      "Fiyat paralel bir kanal içinde hareket ediyor.",
    ],
  });
}

function choosePrimary(
  candidates: FormationCandidate[],
): FormationCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort(
    (a, b) => {
      const breakoutBonusA =
        a.breakoutStatus === "kırılım yok"
          ? 0
          : 8;

      const breakoutBonusB =
        b.breakoutStatus === "kırılım yok"
          ? 0
          : 8;

      return (
        b.score +
        breakoutBonusB -
        (a.score + breakoutBonusA)
      );
    },
  )[0] ?? null;
}

/**
 * Ana formasyon motoru.
 *
 * Buradaki amaç doğrudan AL/SAT üretmek değildir.
 * Önce fiyat geometrisini ölçülebilir kanıta dönüştürür.
 */
export function detectFormations(
  candles: FormationEngineCandle[],
  technicalEvidence?: TechnicalEvidence | null,
): FormationEngineResult {
  const validCandles = candles.filter(
    (c) =>
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.high >= c.low,
  );

  if (validCandles.length < 30) {
    return {
      primary: null,
      candidates: [],
      swingHighs: [],
      swingLows: [],
    };
  }

  const recentStartIndex = Math.max(
    0,
    validCandles.length - 180,
  );

  const recent =
    validCandles.slice(recentStartIndex);

  const localSwings =
    detectSwingPoints(recent);

  // Formasyon motoru son 180 mum üzerinde çalışır.
  // Grafikte ise daha fazla mum gösterilebildiği için
  // swing indekslerini ana mum dizisine geri taşıyoruz.
  const swings = {
    highs: localSwings.highs.map((point) => ({
      ...point,
      index: point.index + recentStartIndex,
    })),
    lows: localSwings.lows.map((point) => ({
      ...point,
      index: point.index + recentStartIndex,
    })),
  };

  const currentPrice =
    recent.at(-1)?.close ?? 0;

  const candidates: FormationCandidate[] =
    [];

  const ascending =
    detectAscendingTriangle(
      swings.highs,
      swings.lows,
      currentPrice,
    );

  if (ascending) {
    candidates.push(ascending);
  }

  const descending =
    detectDescendingTriangle(
      swings.highs,
      swings.lows,
      currentPrice,
    );

  if (descending) {
    candidates.push(descending);
  }

  const symmetrical =
    detectSymmetricalTriangle(
      swings.highs,
      swings.lows,
      currentPrice,
    );

  if (symmetrical) {
    candidates.push(symmetrical);
  }

  const doubleTop =
    detectDoubleTop(
      swings.highs,
      swings.lows,
      currentPrice,
    );

  if (doubleTop) {
    candidates.push(doubleTop);
  }

  const doubleBottom =
    detectDoubleBottom(
      swings.highs,
      swings.lows,
      currentPrice,
    );

  if (doubleBottom) {
    candidates.push(doubleBottom);
  }

  const channel =
    detectChannel(
      swings.highs,
      swings.lows,
      currentPrice,
    );

  if (channel) {
    candidates.push(channel);
  }

  /*
   * Teknik motorun mevcut yön kanıtı ile
   * formasyon yönü birbirini destekliyorsa
   * küçük bir uyum bonusu veriyoruz.
   *
   * Bu bir başarı olasılığı değildir.
   */
  if (
    technicalEvidence &&
    candidates.length > 0
  ) {
    for (const candidate of candidates) {
      if (
        candidate.bias === "yükseliş" &&
        technicalEvidence.alignment ===
          "yükseliş destekli"
      ) {
        candidate.score = clamp(
          candidate.score + 5,
        );
        candidate.reasons.push(
          "Teknik göstergelerin genel yönü formasyonla uyumlu.",
        );
      }

      if (
        candidate.bias === "düşüş" &&
        technicalEvidence.alignment ===
          "düşüş destekli"
      ) {
        candidate.score = clamp(
          candidate.score + 5,
        );
        candidate.reasons.push(
          "Teknik göstergelerin genel yönü formasyonla uyumlu.",
        );
      }
    }
  }

  candidates.sort(
    (a, b) => b.score - a.score,
  );

  return {
    primary: choosePrimary(candidates),
    candidates: candidates.slice(0, 6),
    swingHighs: swings.highs,
    swingLows: swings.lows,
  };
}