// src/lib/formation-engine.server.ts
// Formasyon motoru — Kalite puanlı versiyon
// Yanlış çizimleri eler, doğruları geçirir.

import type {
  PatternLine,
  TechnicalEvidence,
} from "./analysis-types";

// =====================================================
// TİPLER
// =====================================================

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
  /** Kalite puanı (0-100). Yüksekse formasyon güvenilir. */
  qualityScore: number;
  /** Kalite kriterlerinin detayı */
  qualityBreakdown: {
    structuralClarity: number;
    touchCount: number;
    trendAlignment: number;
  };
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

// =====================================================
// YARDIMCILAR
// =====================================================

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentDifference(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 100;
  return Math.abs((a - b) / b) * 100;
}

function linearSlope(points: Point[]): number {
  if (points.length < 2) return 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.index - first.index;
  if (dx === 0) return 0;
  return (last.price - first.price) / dx;
}

function predictLine(points: Point[], index: number): number {
  if (points.length < 2) return points[0]?.price ?? 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.index - first.index;
  if (dx === 0) return first.price;
  const slope = (last.price - first.price) / dx;
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
    points: points.map((p) => ({ index: p.index, price: p.price })),
  };
}

// =====================================================
// KALİTE PUANI FONKSİYONLARI
// =====================================================

/**
 * Yapısal Netlik (Structural Clarity)
 *
 * Formasyonun kaç mum üzerinde oluştuğunu ve
 * swing noktalarının sapmasını ölçer.
 *
 * Yüksek puan = net, belirgin formasyon
 * Düşük puan = gürültülü, belirsiz formasyon
 */
function calculateStructuralClarity(
  relevantSwings: SwingPoint[],
  allCandlesCount: number,
): number {
  if (relevantSwings.length < 2) return 30;

  // 1. Formasyonun kapsadığı mum sayısı
  const firstIndex = relevantSwings[0]!.index;
  const lastIndex = relevantSwings[relevantSwings.length - 1]!.index;
  const span = lastIndex - firstIndex;

  // Formasyon en az 15 mum, ideal 40+ mum olmalı
  const spanScore = clamp((span / 40) * 100, 0, 100);

  // 2. Swing noktaları arasındaki ortalama mesafe
  const gaps: number[] = [];
  for (let i = 1; i < relevantSwings.length; i++) {
    const prev = relevantSwings[i - 1]!;
    const curr = relevantSwings[i]!;
    gaps.push(curr.index - prev.index);
  }

  const avgGap = average(gaps);
  const gapVariance = gaps.length > 1
    ? average(gaps.map((g) => Math.abs(g - avgGap)))
    : 0;
  const gapScore = clamp(100 - gapVariance * 5, 0, 100);

  // 3. Fiyat sapması
  const prices = relevantSwings.map((s) => s.price);
  const avgPrice = average(prices);
  const priceDeviations = prices.map((p) => percentDifference(p, avgPrice));
  const avgDeviation = average(priceDeviations);
  const priceScore = clamp(100 - avgDeviation * 20, 0, 100);

  // Ağırlıklı toplam
  const clarity = spanScore * 0.3 + gapScore * 0.3 + priceScore * 0.4;

  // Kısa formasyonlara hafif ceza
  const lengthPenalty = allCandlesCount < 50 ? 0.85 : 1;

  return clamp(clarity * lengthPenalty, 0, 100);
}

/**
 * Temas Sayısı (Touch Count)
 *
 * Formasyonun çizgilerine kaç kez temas edildiğini ölçer.
 * Ne kadar çok temas, o kadar güvenilir formasyon.
 */
function calculateTouchCount(
  highs: SwingPoint[],
  lows: SwingPoint[],
  resistanceLevel?: number | null,
  supportLevel?: number | null,
): number {
  if (highs.length + lows.length < 2) return 30;

  let totalTouches = 0;

  // Dirence yakın tepeler
  if (resistanceLevel != null && Number.isFinite(resistanceLevel)) {
    const resistanceTouches = highs.filter(
      (h) => percentDifference(h.price, resistanceLevel) <= 1.5,
    ).length;
    totalTouches += resistanceTouches;
  } else {
    totalTouches += highs.length;
  }

  // Desteğe yakın dipler
  if (supportLevel != null && Number.isFinite(supportLevel)) {
    const supportTouches = lows.filter(
      (l) => percentDifference(l.price, supportLevel) <= 1.5,
    ).length;
    totalTouches += supportTouches;
  } else {
    totalTouches += lows.length;
  }

  // 2 temas = 50 puan, 4 temas = 80 puan, 6+ temas = 100 puan
  const touchScore = clamp(
    totalTouches <= 2
      ? 40 + (totalTouches - 1) * 15
      : 55 + (totalTouches - 2) * 11.25,
    0,
    100,
  );

  return touchScore;
}

/**
 * Trend Uyumu (Trend Alignment)
 *
 * Formasyonun yönü ile teknik göstergelerin yönü uyumlu mu?
 * Zaten mevcut sistemde technicalEvidence.alignment var,
 * onu kullanıyoruz.
 */
function calculateTrendAlignment(
  formationBias: "yükseliş" | "düşüş" | "nötr",
  technicalEvidence?: TechnicalEvidence | null,
): number {
  if (!technicalEvidence) return 50;

  const alignment = technicalEvidence.alignment;

  // Nötr formasyon için her zaman 50
  if (formationBias === "nötr") return 50;

  // Yükseliş formasyonu
  if (formationBias === "yükseliş") {
    if (alignment === "yükseliş destekli") {
      // Teknik uyum skoru ne kadar yüksekse puan o kadar artar
      return clamp(70 + (technicalEvidence.alignmentScore - 65) * 1.5, 50, 100);
    }
    if (alignment === "düşüş destekli") return 30;
    return 50;
  }

  // Düşüş formasyonu
  if (formationBias === "düşüş") {
    if (alignment === "düşüş destekli") {
      return clamp(70 + (35 - technicalEvidence.alignmentScore) * 1.5, 50, 100);
    }
    if (alignment === "yükseliş destekli") return 30;
    return 50;
  }

  return 50;
}

/**
 * Toplam Kalite Puanı
 *
 * 3 kriterin ağırlıklı ortalaması:
 * - Yapısal Netlik: %40
 * - Temas Sayısı: %30
 * - Trend Uyumu: %30
 */
function calculateQualityScore(
  structuralClarity: number,
  touchCount: number,
  trendAlignment: number,
): {
  total: number;
  breakdown: {
    structuralClarity: number;
    touchCount: number;
    trendAlignment: number;
  };
} {
  const total =
    structuralClarity * 0.4 +
    touchCount * 0.3 +
    trendAlignment * 0.3;

  return {
    total: Math.round(clamp(total, 0, 100)),
    breakdown: {
      structuralClarity: Math.round(structuralClarity),
      touchCount: Math.round(touchCount),
      trendAlignment: Math.round(trendAlignment),
    },
  };
}

// =====================================================
// SWING NOKTALARI
// =====================================================

function detectSwingPoints(
  candles: FormationEngineCandle[],
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  if (candles.length < 15) return { highs, lows };

  const window = Math.max(
    2,
    Math.min(5, Math.floor(candles.length / 35)),
  );

  for (let i = window; i < candles.length - window; i += 1) {
    const candle = candles[i];
    if (!candle) continue;

    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      const other = candles[j];
      if (!other) continue;
      if (other.high > candle.high) isHigh = false;
      if (other.low < candle.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) highs.push({ index: i, price: candle.high, time: candle.time });
    if (isLow) lows.push({ index: i, price: candle.low, time: candle.time });
  }

  return { highs: highs.slice(-12), lows: lows.slice(-12) };
}

// =====================================================
// FORMASYON TESPİT FONKSİYONLARI
// (Kalite puanı ile güncellendi)
// =====================================================

/**
 * Yükselen Üçgen
 */
function detectAscendingTriangle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) return null;

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const resistance = average(h.map((p) => p.price));
  const highDeviation = average(
    h.map((p) => percentDifference(p.price, resistance)),
  );

  const lowSlope = linearSlope(l);
  const highSlope = linearSlope(h);
  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));

  if (range <= 0) return null;

  const normalizedLowSlope = lowSlope / range;
  const horizontalResistance =
    highDeviation <= 1.8 && Math.abs(highSlope) / range < 0.0015;
  const risingLows = normalizedLowSlope > 0.001;

  if (!horizontalResistance || !risingLows) return null;

  // ===== KALİTE PUANI =====
  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, resistance, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);

  // Eşik altındaysa reddet
  if (quality.total < 60) return null;

  const score = clamp(
    55 +
    Math.min(20, (2 - highDeviation) * 8) +
    Math.min(20, normalizedLowSlope * 8000) +
    (quality.total - 60) * 0.5, // kalite bonusu
  );

  const target = resistance + range * 0.85;
  const breakout = currentPrice > resistance ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "Yükselen Üçgen",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Yatay Direnç", "direnç", h),
      toPatternLine("Yükselen Destek", "trend", l),
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
      `Kalite: ${quality.total}/100 (netlik: ${quality.breakdown.structuralClarity}, temas: ${quality.breakdown.touchCount}, trend: ${quality.breakdown.trendAlignment}).`,
    ],
  };
}

/**
 * Alçalan Üçgen
 */
function detectDescendingTriangle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) return null;

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const support = average(l.map((p) => p.price));
  const lowDeviation = average(
    l.map((p) => percentDifference(p.price, support)),
  );

  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);
  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));

  if (range <= 0) return null;

  const normalizedHighSlope = highSlope / range;
  const horizontalSupport =
    lowDeviation <= 1.8 && Math.abs(lowSlope) / range < 0.0015;
  const fallingHighs = normalizedHighSlope < -0.001;

  if (!horizontalSupport || !fallingHighs) return null;

  // ===== KALİTE PUANI =====
  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, support);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);

  if (quality.total < 60) return null;

  const score = clamp(
    55 +
    Math.min(20, (2 - lowDeviation) * 8) +
    Math.min(20, Math.abs(normalizedHighSlope) * 8000) +
    (quality.total - 60) * 0.5,
  );

  const target = support - range * 0.85;
  const breakout = currentPrice < support ? "aşağı kırılım" : "kırılım yok";

  return {
    name: "Alçalan Üçgen",
    bias: "düşüş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Alçalan Direnç", "trend", h),
      toPatternLine("Yatay Destek", "destek", l),
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
      `Kalite: ${quality.total}/100 (netlik: ${quality.breakdown.structuralClarity}, temas: ${quality.breakdown.touchCount}, trend: ${quality.breakdown.trendAlignment}).`,
    ],
  };
}

/**
 * Simetrik Üçgen
 */
function detectSymmetricalTriangle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) return null;

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));
  if (range <= 0) return null;

  const highSlope = linearSlope(h) / range;
  const lowSlope = linearSlope(l) / range;

  if (highSlope >= -0.001 || lowSlope <= 0.001) return null;

  const convergence = Math.min(1, Math.abs(highSlope) / Math.max(lowSlope, 0.000001));

  // ===== KALİTE PUANI =====
  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment("nötr", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);

  if (quality.total < 60) return null;

  const score = clamp(
    55 + Math.min(30, convergence * 20) + (quality.total - 60) * 0.5,
  );

  const upperLine = predictLine(h, highs.at(-1)?.index ?? 0);
  const lowerLine = predictLine(l, lows.at(-1)?.index ?? 0);

  let breakout: "yukarı kırılım" | "aşağı kırılım" | "kırılım yok" = "kırılım yok";
  if (currentPrice > upperLine) breakout = "yukarı kırılım";
  else if (currentPrice < lowerLine) breakout = "aşağı kırılım";

  return {
    name: "Simetrik Üçgen",
    bias: "nötr",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Üst Trend", "direnç", h),
      toPatternLine("Alt Trend", "destek", l),
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
      `Kalite: ${quality.total}/100 (netlik: ${quality.breakdown.structuralClarity}, temas: ${quality.breakdown.touchCount}, trend: ${quality.breakdown.trendAlignment}).`,
    ],
  };
}

/**
 * Çift Tepe
 */
function detectDoubleTop(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 1) return null;

  const first = highs.at(-2);
  const second = highs.at(-1);
  if (!first || !second) return null;
  if (second.index - first.index < 4) return null;

  const similarity = percentDifference(first.price, second.price);
  if (similarity > 2.5) return null;

  const betweenLows = lows.filter(
    (low) => low.index > first.index && low.index < second.index,
  );
  if (betweenLows.length === 0) return null;

  const neckline = Math.min(...betweenLows.map((p) => p.price));
  const height = average([first.price, second.price]) - neckline;
  if (height <= 0) return null;

  // ===== KALİTE PUANI =====
  const relevantSwings = [first, ...betweenLows, second];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount([first, second], betweenLows, null, neckline);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);

  if (quality.total < 60) return null;

  const score = clamp(
    65 + Math.min(25, (2.5 - similarity) * 8) + (quality.total - 60) * 0.5,
  );

  return {
    name: "Çift Tepe",
    bias: "düşüş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Tepe 1 - Tepe 2", "direnç", [
        { index: first.index, price: first.price },
        { index: second.index, price: second.price },
      ]),
      toPatternLine("Boyun Çizgisi", "boyun", betweenLows.slice(-2)),
    ],
    breakoutStatus: currentPrice < neckline ? "aşağı kırılım" : "kırılım yok",
    support: neckline,
    resistance: Math.max(first.price, second.price),
    neckline,
    target: neckline - height,
    invalidation: Math.max(first.price, second.price),
    reasons: [
      `İki tepe arasındaki fiyat farkı yaklaşık %${similarity.toFixed(2)}.`,
      "İki tepe arasında belirgin bir geri çekilme bulunuyor.",
      `Kalite: ${quality.total}/100 (netlik: ${quality.breakdown.structuralClarity}, temas: ${quality.breakdown.touchCount}, trend: ${quality.breakdown.trendAlignment}).`,
    ],
  };
}

/**
 * Çift Dip
 */
function detectDoubleBottom(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (lows.length < 2 || highs.length < 1) return null;

  const first = lows.at(-2);
  const second = lows.at(-1);
  if (!first || !second) return null;
  if (second.index - first.index < 4) return null;

  const similarity = percentDifference(first.price, second.price);
  if (similarity > 2.5) return null;

  const betweenHighs = highs.filter(
    (high) => high.index > first.index && high.index < second.index,
  );
  if (betweenHighs.length === 0) return null;

  const neckline = Math.max(...betweenHighs.map((p) => p.price));
  const height = neckline - average([first.price, second.price]);
  if (height <= 0) return null;

  // ===== KALİTE PUANI =====
  const relevantSwings = [first, ...betweenHighs, second];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount(betweenHighs, [first, second], neckline, null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);

  if (quality.total < 60) return null;

  const score = clamp(
    65 + Math.min(25, (2.5 - similarity) * 8) + (quality.total - 60) * 0.5,
  );

  return {
    name: "Çift Dip",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Dip 1 - Dip 2", "destek", [
        { index: first.index, price: first.price },
        { index: second.index, price: second.price },
      ]),
      toPatternLine("Boyun Çizgisi", "boyun", betweenHighs.slice(-2)),
    ],
    breakoutStatus: currentPrice > neckline ? "yukarı kırılım" : "kırılım yok",
    support: Math.min(first.price, second.price),
    resistance: neckline,
    neckline,
    target: neckline + height,
    invalidation: Math.min(first.price, second.price),
    reasons: [
      `İki dip arasındaki fiyat farkı yaklaşık %${similarity.toFixed(2)}.`,
      "İki dip arasında belirgin bir tepki yükselişi bulunuyor.",
      `Kalite: ${quality.total}/100 (netlik: ${quality.breakdown.structuralClarity}, temas: ${quality.breakdown.touchCount}, trend: ${quality.breakdown.trendAlignment}).`,
    ],
  };
}

/**
 * Yükselen/Düşen Kanal
 */
function detectChannel(
  highs: SwingPoint[],
  lows: SwingPoint[],
  _currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) return null;

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);

  const averagePrice = average([
    ...h.map((p) => p.price),
    ...l.map((p) => p.price),
  ]);

  if (averagePrice <= 0) return null;

  const normalizedHighSlope = highSlope / averagePrice;
  const normalizedLowSlope = lowSlope / averagePrice;

  const sameDirection = normalizedHighSlope * normalizedLowSlope > 0;
  if (!sameDirection) return null;

  const slopeDifference = Math.abs(normalizedHighSlope - normalizedLowSlope);
  if (slopeDifference > 0.01) return null;

  const bullish = normalizedHighSlope > 0;
  const formationBias: "yükseliş" | "düşüş" = bullish ? "yükseliş" : "düşüş";

  // ===== KALİTE PUANI =====
  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment(formationBias, technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);

  if (quality.total < 60) return null;

  const score = clamp(
    58 +
    Math.min(30, Math.max(0, 1 - slopeDifference * 100) * 30) +
    (quality.total - 60) * 0.5,
  );

  return {
    name: bullish ? "Yükselen Kanal" : "Düşen Kanal",
    bias: formationBias,
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Üst Kanal", "direnç", h),
      toPatternLine("Alt Kanal", "destek", l),
    ],
    breakoutStatus: "kırılım yok",
    support: l.at(-1)?.price ?? null,
    resistance: h.at(-1)?.price ?? null,
    neckline: null,
    target: null,
    invalidation: null,
    reasons: [
      bullish ? "Tepe ve dipler birlikte yükseliyor." : "Tepe ve dipler birlikte düşüyor.",
      "Üst ve alt fiyat hareketleri benzer eğime sahip.",
      `Kalite: ${quality.total}/100 (netlik: ${quality.breakdown.structuralClarity}, temas: ${quality.breakdown.touchCount}, trend: ${quality.breakdown.trendAlignment}).`,
    ],
  };
}

// =====================================================
// ANA FONKSİYON
// =====================================================

function choosePrimary(
  candidates: FormationCandidate[],
): FormationCandidate | null {
  if (candidates.length === 0) return null;

  // Önce kalite puanına göre sırala, sonra skora
  return [...candidates].sort((a, b) => {
    const breakoutBonusA = a.breakoutStatus === "kırılım yok" ? 0 : 8;
    const breakoutBonusB = b.breakoutStatus === "kırılım yok" ? 0 : 8;

    // Kalite puanı öncelikli (%60), skor ikincil (%40)
    const scoreA = a.qualityScore * 0.6 + (a.score + breakoutBonusA) * 0.4;
    const scoreB = b.qualityScore * 0.6 + (b.score + breakoutBonusB) * 0.4;

    return scoreB - scoreA;
  })[0] ?? null;
}

/**
 * Ana formasyon motoru — Kalite puanlı
 *
 * Yanlış formasyonları eler, doğruları geçirir.
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

  const recentStartIndex = Math.max(0, validCandles.length - 180);
  const recent = validCandles.slice(recentStartIndex);

  const localSwings = detectSwingPoints(recent);

  const swings = {
    highs: localSwings.highs.map((p) => ({
      ...p,
      index: p.index + recentStartIndex,
    })),
    lows: localSwings.lows.map((p) => ({
      ...p,
      index: p.index + recentStartIndex,
    })),
  };

  const currentPrice = recent.at(-1)?.close ?? 0;
  const allCandlesCount = validCandles.length;
  const candidates: FormationCandidate[] = [];

  // Tüm formasyonları dene
  const ascending = detectAscendingTriangle(
    swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence,
  );
  if (ascending) candidates.push(ascending);

  const descending = detectDescendingTriangle(
    swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence,
  );
  if (descending) candidates.push(descending);

  const symmetrical = detectSymmetricalTriangle(
    swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence,
  );
  if (symmetrical) candidates.push(symmetrical);

  const doubleTop = detectDoubleTop(
    swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence,
  );
  if (doubleTop) candidates.push(doubleTop);

  const doubleBottom = detectDoubleBottom(
    swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence,
  );
  if (doubleBottom) candidates.push(doubleBottom);

  const channel = detectChannel(
    swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence,
  );
  if (channel) candidates.push(channel);

  // Kalite puanına göre sırala
  candidates.sort((a, b) => {
    const breakoutBonusA = a.breakoutStatus === "kırılım yok" ? 0 : 5;
    const breakoutBonusB = b.breakoutStatus === "kırılım yok" ? 0 : 5;
    const scoreA = a.qualityScore * 0.6 + (a.score + breakoutBonusA) * 0.4;
    const scoreB = b.qualityScore * 0.6 + (b.score + breakoutBonusB) * 0.4;
    return scoreB - scoreA;
  });

  return {
    primary: choosePrimary(candidates),
    candidates: candidates.slice(0, 6),
    swingHighs: swings.highs,
    swingLows: swings.lows,
  };
}

// =====================================================
// YARDIMCI: EŞİK KONTROLÜ
// =====================================================

/**
 * Bir formasyonun bildirim için yeterli kalitede olup olmadığını kontrol eder.
 *
 * @param candidate - Formasyon
 * @param signalScore - Toplam sinyal skoru (indikatör + haber + hacim)
 * @returns true ise bildirime değer
 */
export function isFormationNotifiable(
  candidate: FormationCandidate,
  signalScore?: number,
): boolean {
  // Kural 1: Kalite ≥ 75 → Kesin geç
  if (candidate.qualityScore >= 75) return true;

  // Kural 2: Kalite ≥ 70 → Geç
  if (candidate.qualityScore >= 70) return true;

  // Kural 3: Kalite 60-70 → Sadece sinyal skoru yüksekse geç
  if (candidate.qualityScore >= 60) {
    if (signalScore != null && signalScore >= 80) return true;
    return false;
  }

  // Kural 4: Kalite < 60 → Asla geçme
  return false;
}