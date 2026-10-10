// src/lib/formation-engine.server.ts
// Formasyon motoru — Kalite puanlı versiyon v2
// 16 formasyon: Üçgenler, Çift Tepe/Dip, Kanal, OBO, TOBO, Çanak, Çanak-Kulp, Takozlar, Flamalar, Elmas

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
  qualityScore: number;
  qualityBreakdown: {
    structuralClarity: number;
    touchCount: number;
    trendAlignment: number;
  };
  lines: PatternLine[];
  breakoutStatus: "yukarı kırılım" | "aşağı kırılım" | "kırılım yok";
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

function calculateStructuralClarity(
  relevantSwings: SwingPoint[],
  allCandlesCount: number,
): number {
  if (relevantSwings.length < 2) return 30;

  const firstIndex = relevantSwings[0]!.index;
  const lastIndex = relevantSwings[relevantSwings.length - 1]!.index;
  const span = lastIndex - firstIndex;
  const spanScore = clamp((span / 40) * 100, 0, 100);

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

  const prices = relevantSwings.map((s) => s.price);
  const avgPrice = average(prices);
  const priceDeviations = prices.map((p) => percentDifference(p, avgPrice));
  const avgDeviation = average(priceDeviations);
  const priceScore = clamp(100 - avgDeviation * 20, 0, 100);

  const clarity = spanScore * 0.3 + gapScore * 0.3 + priceScore * 0.4;
  const lengthPenalty = allCandlesCount < 50 ? 0.85 : 1;

  return clamp(clarity * lengthPenalty, 0, 100);
}

function calculateTouchCount(
  highs: SwingPoint[],
  lows: SwingPoint[],
  resistanceLevel?: number | null,
  supportLevel?: number | null,
): number {
  if (highs.length + lows.length < 2) return 30;

  let totalTouches = 0;

  if (resistanceLevel != null && Number.isFinite(resistanceLevel)) {
    totalTouches += highs.filter(
      (h) => percentDifference(h.price, resistanceLevel) <= 1.5,
    ).length;
  } else {
    totalTouches += highs.length;
  }

  if (supportLevel != null && Number.isFinite(supportLevel)) {
    totalTouches += lows.filter(
      (l) => percentDifference(l.price, supportLevel) <= 1.5,
    ).length;
  } else {
    totalTouches += lows.length;
  }

  return clamp(
    totalTouches <= 2
      ? 40 + (totalTouches - 1) * 15
      : 55 + (totalTouches - 2) * 11.25,
    0,
    100,
  );
}

function calculateTrendAlignment(
  formationBias: "yükseliş" | "düşüş" | "nötr",
  technicalEvidence?: TechnicalEvidence | null,
): number {
  if (!technicalEvidence) return 50;
  const alignment = technicalEvidence.alignment;
  if (formationBias === "nötr") return 50;

  if (formationBias === "yükseliş") {
    if (alignment === "yükseliş destekli") {
      return clamp(70 + (technicalEvidence.alignmentScore - 65) * 1.5, 50, 100);
    }
    if (alignment === "düşüş destekli") return 30;
    return 50;
  }

  if (formationBias === "düşüş") {
    if (alignment === "düşüş destekli") {
      return clamp(70 + (35 - technicalEvidence.alignmentScore) * 1.5, 50, 100);
    }
    if (alignment === "yükseliş destekli") return 30;
    return 50;
  }

  return 50;
}

function calculateQualityScore(
  structuralClarity: number,
  touchCount: number,
  trendAlignment: number,
): { total: number; breakdown: { structuralClarity: number; touchCount: number; trendAlignment: number } } {
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
// MEVCUT FORMASYONLAR (7 ADET)
// =====================================================

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
  const highDeviation = average(h.map((p) => percentDifference(p.price, resistance)));
  const lowSlope = linearSlope(l);
  const highSlope = linearSlope(h);
  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));
  if (range <= 0) return null;
  const normalizedLowSlope = lowSlope / range;
  const horizontalResistance = highDeviation <= 1.8 && Math.abs(highSlope) / range < 0.0015;
  const risingLows = normalizedLowSlope > 0.001;
  if (!horizontalResistance || !risingLows) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, resistance, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(55 + Math.min(20, (2 - highDeviation) * 8) + Math.min(20, normalizedLowSlope * 8000) + (quality.total - 60) * 0.5);
  const target = resistance + range * 0.85;
  const breakout = currentPrice > resistance ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "Yükselen Üçgen", bias: "yükseliş", score: Math.round(score), qualityScore: quality.total, qualityBreakdown: quality.breakdown,
    lines: [toPatternLine("Yatay Direnç", "direnç", h), toPatternLine("Yükselen Destek", "trend", l)],
    breakoutStatus: breakout, support: l.at(-1)?.price ?? null, resistance, neckline: resistance, target,
    invalidation: l.at(-1)?.price ?? null,
    reasons: ["Tepe noktaları aynı direnç bölgesinde toplanıyor.", "Dip noktaları kademeli olarak yükseliyor.", `Kalite: ${quality.total}/100.`],
  };
}

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
  const lowDeviation = average(l.map((p) => percentDifference(p.price, support)));
  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);
  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));
  if (range <= 0) return null;
  const normalizedHighSlope = highSlope / range;
  const horizontalSupport = lowDeviation <= 1.8 && Math.abs(lowSlope) / range < 0.0015;
  const fallingHighs = normalizedHighSlope < -0.001;
  if (!horizontalSupport || !fallingHighs) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, support);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(55 + Math.min(20, (2 - lowDeviation) * 8) + Math.min(20, Math.abs(normalizedHighSlope) * 8000) + (quality.total - 60) * 0.5);
  const target = support - range * 0.85;
  const breakout = currentPrice < support ? "aşağı kırılım" : "kırılım yok";

  return {
    name: "Alçalan Üçgen", bias: "düşüş", score: Math.round(score), qualityScore: quality.total, qualityBreakdown: quality.breakdown,
    lines: [toPatternLine("Alçalan Direnç", "trend", h), toPatternLine("Yatay Destek", "destek", l)],
    breakoutStatus: breakout, support, resistance: h.at(-1)?.price ?? null, neckline: support, target,
    invalidation: h.at(-1)?.price ?? null,
    reasons: ["Dip noktaları aynı destek bölgesinde toplanıyor.", "Tepe noktaları kademeli olarak düşüyor.", `Kalite: ${quality.total}/100.`],
  };
}

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

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment("nötr", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(55 + Math.min(30, convergence * 20) + (quality.total - 60) * 0.5);
  const upperLine = predictLine(h, highs.at(-1)?.index ?? 0);
  const lowerLine = predictLine(l, lows.at(-1)?.index ?? 0);
  let breakout: "yukarı kırılım" | "aşağı kırılım" | "kırılım yok" = "kırılım yok";
  if (currentPrice > upperLine) breakout = "yukarı kırılım";
  else if (currentPrice < lowerLine) breakout = "aşağı kırılım";

  return {
    name: "Simetrik Üçgen", bias: "nötr", score: Math.round(score), qualityScore: quality.total, qualityBreakdown: quality.breakdown,
    lines: [toPatternLine("Üst Trend", "direnç", h), toPatternLine("Alt Trend", "destek", l)],
    breakoutStatus: breakout, support: l.at(-1)?.price ?? null, resistance: h.at(-1)?.price ?? null, neckline: null,
    target: breakout === "yukarı kırılım" ? upperLine + range * 0.8 : breakout === "aşağı kırılım" ? lowerLine - range * 0.8 : null,
    invalidation: null,
    reasons: ["Tepe noktaları aşağı eğimli.", "Dip noktaları yukarı eğimli.", `Kalite: ${quality.total}/100.`],
  };
}

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
  const betweenLows = lows.filter((low) => low.index > first.index && low.index < second.index);
  if (betweenLows.length === 0) return null;
  const neckline = Math.min(...betweenLows.map((p) => p.price));
  const height = average([first.price, second.price]) - neckline;
  if (height <= 0) return null;

  const relevantSwings = [first, ...betweenLows, second];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount([first, second], betweenLows, null, neckline);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(65 + Math.min(25, (2.5 - similarity) * 8) + (quality.total - 60) * 0.5);

  return {
    name: "Çift Tepe", bias: "düşüş", score: Math.round(score), qualityScore: quality.total, qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Tepe 1 - Tepe 2", "direnç", [{ index: first.index, price: first.price }, { index: second.index, price: second.price }]),
      toPatternLine("Boyun Çizgisi", "boyun", betweenLows.slice(-2)),
    ],
    breakoutStatus: currentPrice < neckline ? "aşağı kırılım" : "kırılım yok",
    support: neckline, resistance: Math.max(first.price, second.price), neckline, target: neckline - height,
    invalidation: Math.max(first.price, second.price),
    reasons: [`İki tepe arasındaki fiyat farkı yaklaşık %${similarity.toFixed(2)}.`, "İki tepe arasında belirgin bir geri çekilme bulunuyor.", `Kalite: ${quality.total}/100.`],
  };
}

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
  const betweenHighs = highs.filter((high) => high.index > first.index && high.index < second.index);
  if (betweenHighs.length === 0) return null;
  const neckline = Math.max(...betweenHighs.map((p) => p.price));
  const height = neckline - average([first.price, second.price]);
  if (height <= 0) return null;

  const relevantSwings = [first, ...betweenHighs, second];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount(betweenHighs, [first, second], neckline, null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(65 + Math.min(25, (2.5 - similarity) * 8) + (quality.total - 60) * 0.5);

  return {
    name: "Çift Dip", bias: "yükseliş", score: Math.round(score), qualityScore: quality.total, qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Dip 1 - Dip 2", "destek", [{ index: first.index, price: first.price }, { index: second.index, price: second.price }]),
      toPatternLine("Boyun Çizgisi", "boyun", betweenHighs.slice(-2)),
    ],
    breakoutStatus: currentPrice > neckline ? "yukarı kırılım" : "kırılım yok",
    support: Math.min(first.price, second.price), resistance: neckline, neckline, target: neckline + height,
    invalidation: Math.min(first.price, second.price),
    reasons: [`İki dip arasındaki fiyat farkı yaklaşık %${similarity.toFixed(2)}.`, "İki dip arasında belirgin bir tepki yükselişi bulunuyor.", `Kalite: ${quality.total}/100.`],
  };
}

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
  const averagePrice = average([...h.map((p) => p.price), ...l.map((p) => p.price)]);
  if (averagePrice <= 0) return null;
  const normalizedHighSlope = highSlope / averagePrice;
  const normalizedLowSlope = lowSlope / averagePrice;
  const sameDirection = normalizedHighSlope * normalizedLowSlope > 0;
  if (!sameDirection) return null;
  const slopeDifference = Math.abs(normalizedHighSlope - normalizedLowSlope);
  if (slopeDifference > 0.01) return null;
  const bullish = normalizedHighSlope > 0;
  const formationBias: "yükseliş" | "düşüş" = bullish ? "yükseliş" : "düşüş";

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment(formationBias, technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(58 + Math.min(30, Math.max(0, 1 - slopeDifference * 100) * 30) + (quality.total - 60) * 0.5);

  return {
    name: bullish ? "Yükselen Kanal" : "Düşen Kanal", bias: formationBias, score: Math.round(score), qualityScore: quality.total, qualityBreakdown: quality.breakdown,
    lines: [toPatternLine("Üst Kanal", "direnç", h), toPatternLine("Alt Kanal", "destek", l)],
    breakoutStatus: "kırılım yok", support: l.at(-1)?.price ?? null, resistance: h.at(-1)?.price ?? null, neckline: null, target: null, invalidation: null,
    reasons: [bullish ? "Tepe ve dipler birlikte yükseliyor." : "Tepe ve dipler birlikte düşüyor.", "Üst ve alt fiyat hareketleri benzer eğime sahip.", `Kalite: ${quality.total}/100.`],
  };
}

// =====================================================
// YENİ FORMASYONLAR — OBO VE TOBO
// =====================================================

/**
 * OBO (Omuz-Baş-Omuz) — Düşüş formasyonu
 * 
 * Geometri: 3 tepe. Ortadaki (baş) en yüksek, yanlardaki (omuzlar) daha düşük ve eşit seviyede.
 * Boyun çizgisi: İki omuz arasındaki dipleri birleştiren çizgi.
 */
function detectHeadAndShoulders(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 2) return null;

  const h = highs.slice(-5);
  if (h.length < 3) return null;

  // Son 3 tepeyi al
  const lastThree = h.slice(-3);
  const leftShoulder = lastThree[0]!;
  const head = lastThree[1]!;
  const rightShoulder = lastThree[2]!;

  // Baş, omuzlardan yüksek olmalı
  if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) return null;

  // Omuzlar eşit seviyede olmalı (%3 tolerans)
  const shoulderSimilarity = percentDifference(leftShoulder.price, rightShoulder.price);
  if (shoulderSimilarity > 3) return null;

  // Sol omuz ile baş arasında dip olmalı
  const leftNecklinePoints = lows.filter(
    (low) => low.index > leftShoulder.index && low.index < head.index,
  );
  const rightNecklinePoints = lows.filter(
    (low) => low.index > head.index && low.index < rightShoulder.index,
  );

  if (leftNecklinePoints.length === 0 || rightNecklinePoints.length === 0) return null;

  const leftNeckline = Math.min(...leftNecklinePoints.map((p) => p.price));
  const rightNeckline = Math.min(...rightNecklinePoints.map((p) => p.price));
  const neckline = (leftNeckline + rightNeckline) / 2;

  const height = head.price - neckline;
  if (height <= 0) return null;

  const relevantSwings = [leftShoulder, ...leftNecklinePoints, head, ...rightNecklinePoints, rightShoulder];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount([leftShoulder, head, rightShoulder], [...leftNecklinePoints, ...rightNecklinePoints], null, neckline);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    70 +
    Math.min(15, (3 - shoulderSimilarity) * 4) +
    (quality.total - 60) * 0.5,
  );

  const target = neckline - height;
  const breakout = currentPrice < neckline ? "aşağı kırılım" : "kırılım yok";

  return {
    name: "OBO (Omuz-Baş-Omuz)",
    bias: "düşüş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Sol Omuz", "direnç", [leftShoulder]),
      toPatternLine("Baş", "direnç", [head]),
      toPatternLine("Sağ Omuz", "direnç", [rightShoulder]),
      toPatternLine("Boyun Çizgisi", "boyun", [
        { index: leftNecklinePoints[0]!.index, price: leftNeckline },
        { index: rightNecklinePoints[rightNecklinePoints.length - 1]!.index, price: rightNeckline },
      ]),
    ],
    breakoutStatus: breakout,
    support: neckline,
    resistance: head.price,
    neckline,
    target,
    invalidation: head.price * 1.02,
    reasons: [
      `Baş (${head.price.toFixed(2)}) omuzlardan yüksek.`,
      `Omuzlar benzer seviyede (fark: %${shoulderSimilarity.toFixed(2)}).`,
      `Boyun çizgisi: ${neckline.toFixed(2)}.`,
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

/**
 * TOBO (Ters Omuz-Baş-Omuz) — Yükseliş formasyonu
 * 
 * Geometri: 3 dip. Ortadaki (baş) en düşük, yanlardaki (omuzlar) daha yüksek ve eşit seviyede.
 * Boyun çizgisi: İki omuz arasındaki tepeleri birleştiren çizgi.
 */
function detectInverseHeadAndShoulders(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (lows.length < 3 || highs.length < 2) return null;

  const l = lows.slice(-5);
  if (l.length < 3) return null;

  const lastThree = l.slice(-3);
  const leftShoulder = lastThree[0]!;
  const head = lastThree[1]!;
  const rightShoulder = lastThree[2]!;

  // Baş, omuzlardan düşük olmalı
  if (head.price >= leftShoulder.price || head.price >= rightShoulder.price) return null;

  // Omuzlar eşit seviyede olmalı (%3 tolerans)
  const shoulderSimilarity = percentDifference(leftShoulder.price, rightShoulder.price);
  if (shoulderSimilarity > 3) return null;

  // Sol omuz ile baş arasında tepe olmalı
  const leftNecklinePoints = highs.filter(
    (high) => high.index > leftShoulder.index && high.index < head.index,
  );
  const rightNecklinePoints = highs.filter(
    (high) => high.index > head.index && high.index < rightShoulder.index,
  );

  if (leftNecklinePoints.length === 0 || rightNecklinePoints.length === 0) return null;

  const leftNeckline = Math.max(...leftNecklinePoints.map((p) => p.price));
  const rightNeckline = Math.max(...rightNecklinePoints.map((p) => p.price));
  const neckline = (leftNeckline + rightNeckline) / 2;

  const height = neckline - head.price;
  if (height <= 0) return null;

  const relevantSwings = [leftShoulder, ...leftNecklinePoints, head, ...rightNecklinePoints, rightShoulder];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount([...leftNecklinePoints, ...rightNecklinePoints], [leftShoulder, head, rightShoulder], neckline, null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    70 +
    Math.min(15, (3 - shoulderSimilarity) * 4) +
    (quality.total - 60) * 0.5,
  );

  const target = neckline + height;
  const breakout = currentPrice > neckline ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "TOBO (Ters Omuz-Baş-Omuz)",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Sol Omuz", "destek", [leftShoulder]),
      toPatternLine("Baş", "destek", [head]),
      toPatternLine("Sağ Omuz", "destek", [rightShoulder]),
      toPatternLine("Boyun Çizgisi", "boyun", [
        { index: leftNecklinePoints[0]!.index, price: leftNeckline },
        { index: rightNecklinePoints[rightNecklinePoints.length - 1]!.index, price: rightNeckline },
      ]),
    ],
    breakoutStatus: breakout,
    support: head.price,
    resistance: neckline,
    neckline,
    target,
    invalidation: head.price * 0.98,
    reasons: [
      `Baş (${head.price.toFixed(2)}) omuzlardan düşük.`,
      `Omuzlar benzer seviyede (fark: %${shoulderSimilarity.toFixed(2)}).`,
      `Boyun çizgisi: ${neckline.toFixed(2)}.`,
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

// YENİ FORMASYONLAR — ÇANAK VE ÇANAK-KULP
// =====================================================

/**
 * Çanak (Cup) — Yükseliş formasyonu
 *
 * Geometri: "U" şeklinde yuvarlak dip.
 * Sol taraf yüksek, orta dip, sağ taraf yüksek (sol ile yakın seviye).
 * Boyun çizgisi: Sol ve sağ tarafların ortalama seviyesi.
 */
function detectCup(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 2 || lows.length < 2) return null;

  const h = highs.slice(-6);
  const l = lows.slice(-6);

  // En düşük dip (çanağın ortası)
  const cupBottom = l.reduce((min, p) => (p.price < min.price ? p : min), l[0]!);
  const bottomIdx = cupBottom.index;

  // Çanak öncesi ve sonrası tepeler
  const leftRim = h.find((p) => p.index < bottomIdx);
  const rightRim = h.find((p) => p.index > bottomIdx);

  if (!leftRim || !rightRim) return null;

  // Sol ve sağ kenar benzer seviyede olmalı (%5 tolerans)
  const rimSimilarity = percentDifference(leftRim.price, rightRim.price);
  if (rimSimilarity > 5) return null;

  // Çanak derinliği yeterli olmalı
  const rimAverage = (leftRim.price + rightRim.price) / 2;
  const depth = (rimAverage - cupBottom.price) / rimAverage;
  if (depth < 0.05 || depth > 0.5) return null;

  // Çanak genişliği yeterli olmalı (en az 15 mum)
  const cupWidth = rightRim.index - leftRim.index;
  if (cupWidth < 15) return null;

  const relevantSwings = [leftRim, cupBottom, rightRim];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount([leftRim, rightRim], [cupBottom], rimAverage, cupBottom.price);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    68 +
    Math.min(15, (5 - rimSimilarity) * 3) +
    (quality.total - 60) * 0.5,
  );

  const neckline = rimAverage;
  const target = neckline + (neckline - cupBottom.price);
  const breakout = currentPrice > neckline ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "Çanak",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Sol Kenar", "direnç", [leftRim]),
      toPatternLine("Çanak Dibi", "destek", [cupBottom]),
      toPatternLine("Sağ Kenar", "direnç", [rightRim]),
      toPatternLine("Boyun Çizgisi", "boyun", [
        { index: leftRim.index, price: neckline },
        { index: rightRim.index, price: neckline },
      ]),
    ],
    breakoutStatus: breakout,
    support: cupBottom.price,
    resistance: neckline,
    neckline,
    target,
    invalidation: cupBottom.price * 0.98,
    reasons: [
      `Çanak derinliği: %${(depth * 100).toFixed(1)}.`,
      `Çanak genişliği: ${cupWidth} mum.`,
      `Kenarlar benzer seviyede (fark: %${rimSimilarity.toFixed(2)}).`,
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

/**
 * Çanak-Kulp (Cup and Handle) — Yükseliş formasyonu
 *
 * Geometri: Çanak + çanağın sağ kenarından sonra küçük bir geri çekilme (kulp).
 * Kulp, çanağın sağ kenarının altına düşmemeli.
 */
function detectCupAndHandle(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) return null;

  const h = highs.slice(-8);
  const l = lows.slice(-8);

  // Çanak dibi
  const cupBottom = l.reduce((min, p) => (p.price < min.price ? p : min), l[0]!);
  const bottomIdx = cupBottom.index;

  // Çanak öncesi sol kenar
  const leftRim = h.find((p) => p.index < bottomIdx);
  // Çanak sonrası sağ kenar
  const rightRim = h.find((p) => p.index > bottomIdx);

  if (!leftRim || !rightRim) return null;

  // Sol ve sağ kenar benzer seviyede
  const rimSimilarity = percentDifference(leftRim.price, rightRim.price);
  if (rimSimilarity > 5) return null;

  // Çanak derinliği
  const rimAverage = (leftRim.price + rightRim.price) / 2;
  const depth = (rimAverage - cupBottom.price) / rimAverage;
  if (depth < 0.05 || depth > 0.5) return null;

  // Çanak genişliği
  const cupWidth = rightRim.index - leftRim.index;
  if (cupWidth < 15) return null;

  // Kulp: Sağ kenardan sonra küçük bir dip
  const handleLows = l.filter((p) => p.index > rightRim.index);
  if (handleLows.length === 0) return null;

  const handleBottom = handleLows.reduce(
    (min, p) => (p.price < min.price ? p : min),
    handleLows[0]!,
  );

  // Kulp, sağ kenarın %10'undan fazla düşmemeli
  const handleDepth = (rightRim.price - handleBottom.price) / rightRim.price;
  if (handleDepth > 0.15) return null;

  // Kulp, çanak dibinin altına düşmemeli
  if (handleBottom.price < cupBottom.price * 1.02) return null;

  const relevantSwings = [leftRim, cupBottom, rightRim, handleBottom];
  const structuralClarity = calculateStructuralClarity(relevantSwings, allCandlesCount);
  const touchCount = calculateTouchCount(
    [leftRim, rightRim],
    [cupBottom, handleBottom],
    rimAverage,
    cupBottom.price,
  );
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    72 +
    Math.min(15, (5 - rimSimilarity) * 3) +
    (quality.total - 60) * 0.5,
  );

  const neckline = rimAverage;
  const target = neckline + (neckline - cupBottom.price);
  const breakout = currentPrice > neckline ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "Çanak-Kulp",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Sol Kenar", "direnç", [leftRim]),
      toPatternLine("Çanak Dibi", "destek", [cupBottom]),
      toPatternLine("Sağ Kenar", "direnç", [rightRim]),
      toPatternLine("Kulp", "destek", [handleBottom]),
      toPatternLine("Boyun Çizgisi", "boyun", [
        { index: leftRim.index, price: neckline },
        { index: rightRim.index, price: neckline },
      ]),
    ],
    breakoutStatus: breakout,
    support: handleBottom.price,
    resistance: neckline,
    neckline,
    target,
    invalidation: handleBottom.price * 0.98,
    reasons: [
      `Çanak derinliği: %${(depth * 100).toFixed(1)}.`,
      `Kulp derinliği: %${(handleDepth * 100).toFixed(1)}.`,
      `Kenarlar benzer seviyede (fark: %${rimSimilarity.toFixed(2)}).`,
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

// =====================================================
// YENİ FORMASYONLAR — TAKOZLAR
// =====================================================

/**
 * Yükselen Takoz (Rising Wedge) — Düşüş formasyonu
 *
 * Geometri: Hem tepe hem dip noktaları yükseliyor.
 * Ama tepe çizgisi daha dik, dip çizgisi daha yatay.
 * İki çizgi birbirine yaklaşıyor (daralıyor).
 * Kırılım aşağı yönde olur.
 */
function detectRisingWedge(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) return null;

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);

  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));
  if (range <= 0) return null;

  const normalizedHighSlope = highSlope / range;
  const normalizedLowSlope = lowSlope / range;

  // İkisi de yükselmeli
  if (normalizedHighSlope <= 0.001 || normalizedLowSlope <= 0.001) return null;

  // Üst çizgi daha dik olmalı (daralma)
  if (normalizedHighSlope <= normalizedLowSlope) return null;

  // Diklik farkı yeterli olmalı
  const slopeDifference = normalizedHighSlope - normalizedLowSlope;
  if (slopeDifference < 0.001) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    62 +
    Math.min(25, slopeDifference * 8000) +
    (quality.total - 60) * 0.5,
  );

  const upperLine = predictLine(h, highs.at(-1)?.index ?? 0);
  const lowerLine = predictLine(l, lows.at(-1)?.index ?? 0);
  const target = lowerLine - (upperLine - lowerLine);
  const breakout = currentPrice < lowerLine ? "aşağı kırılım" : "kırılım yok";

  return {
    name: "Yükselen Takoz",
    bias: "düşüş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Üst Çizgi", "direnç", h),
      toPatternLine("Alt Çizgi", "destek", l),
    ],
    breakoutStatus: breakout,
    support: lowerLine,
    resistance: upperLine,
    neckline: lowerLine,
    target,
    invalidation: upperLine * 1.02,
    reasons: [
      "Tepe ve dipler birlikte yükseliyor.",
      "Üst çizgi alt çizgiden daha dik (daralma).",
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

/**
 * Alçalan Takoz (Falling Wedge) — Yükseliş formasyonu
 *
 * Geometri: Hem tepe hem dip noktaları düşüyor.
 * Ama dip çizgisi daha dik, tepe çizgisi daha yatay.
 * İki çizgi birbirine yaklaşıyor (daralıyor).
 * Kırılım yukarı yönde olur.
 */
function detectFallingWedge(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) return null;

  const h = highs.slice(-4);
  const l = lows.slice(-4);

  const highSlope = linearSlope(h);
  const lowSlope = linearSlope(l);

  const range = Math.max(...h.map((p) => p.price)) - Math.min(...l.map((p) => p.price));
  if (range <= 0) return null;

  const normalizedHighSlope = highSlope / range;
  const normalizedLowSlope = lowSlope / range;

  // İkisi de düşmeli
  if (normalizedHighSlope >= -0.001 || normalizedLowSlope >= -0.001) return null;

  // Alt çizgi daha dik olmalı (daralma)
  if (Math.abs(normalizedLowSlope) <= Math.abs(normalizedHighSlope)) return null;

  const slopeDifference = Math.abs(normalizedLowSlope) - Math.abs(normalizedHighSlope);
  if (slopeDifference < 0.001) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, h.at(-1)?.price ?? null, l.at(-1)?.price ?? null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    62 +
    Math.min(25, slopeDifference * 8000) +
    (quality.total - 60) * 0.5,
  );

  const upperLine = predictLine(h, highs.at(-1)?.index ?? 0);
  const lowerLine = predictLine(l, lows.at(-1)?.index ?? 0);
  const target = upperLine + (upperLine - lowerLine);
  const breakout = currentPrice > upperLine ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "Alçalan Takoz",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Üst Çizgi", "direnç", h),
      toPatternLine("Alt Çizgi", "destek", l),
    ],
    breakoutStatus: breakout,
    support: lowerLine,
    resistance: upperLine,
    neckline: upperLine,
    target,
    invalidation: lowerLine * 0.98,
    reasons: [
      "Tepe ve dipler birlikte düşüyor.",
      "Alt çizgi üst çizgiden daha dik (daralma).",
      `Kalite: ${quality.total}/100.`,
    ],
  };
}
// YENİ FORMASYONLAR — FLAMALAR
// =====================================================

/**
 * Boğa Flaması — Yükseliş formasyonu
 *
 * Geometri: Güçlü bir yükseliş (direk), ardından küçük bir konsolidasyon (flama).
 * Flama genelde aşağı eğimli paralel bir kanal gibi görünür.
 * Kırılım yukarı olur.
 */
function detectBullFlag(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) return null;

  const h = highs.slice(-6);
  const l = lows.slice(-6);

  // Flama öncesi güçlü yükseliş olmalı
  const firstLows = l.slice(0, Math.floor(l.length / 2));
  const lastHighs = h.slice(Math.floor(h.length / 2));

  if (firstLows.length === 0 || lastHighs.length === 0) return null;

  const basePrice = firstLows[0]!.price;
  const peakPrice = lastHighs[lastHighs.length - 1]!.price;
  const rise = (peakPrice - basePrice) / basePrice;
  if (rise < 0.03) return null;

  // Flama: son yarıdaki yüksek ve düşük noktalar hafif aşağı eğimli
  const flagHighs = h.slice(Math.floor(h.length / 2));
  const flagLows = l.slice(Math.floor(l.length / 2));

  if (flagHighs.length < 2 || flagLows.length < 2) return null;

  const flagHighSlope = linearSlope(flagHighs);
  const flagLowSlope = linearSlope(flagLows);

  // Flama hafif aşağı eğimli olmalı
  if (flagHighSlope > 0 || flagLowSlope > 0) return null;

  // Flama genişliği dar olmalı
  const flagRange = Math.max(...flagHighs.map((p) => p.price)) - Math.min(...flagLows.map((p) => p.price));
  const flagRangePercent = flagRange / basePrice;
  if (flagRangePercent > 0.08) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(flagHighs, flagLows, null, null);
  const trendAlignment = calculateTrendAlignment("yükseliş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    68 +
    Math.min(20, rise * 200) +
    (quality.total - 60) * 0.5,
  );

  const breakoutLevel = Math.max(...flagHighs.map((p) => p.price));
  const flagHeight = flagRange;
  const target = breakoutLevel + flagHeight;
  const breakout = currentPrice > breakoutLevel ? "yukarı kırılım" : "kırılım yok";

  return {
    name: "Boğa Flaması",
    bias: "yükseliş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Direk (Yükseliş)", "trend", [
        firstLows[0]!,
        lastHighs[lastHighs.length - 1]!,
      ]),
      toPatternLine("Flama Üst", "direnç", flagHighs),
      toPatternLine("Flama Alt", "destek", flagLows),
    ],
    breakoutStatus: breakout,
    support: Math.min(...flagLows.map((p) => p.price)),
    resistance: breakoutLevel,
    neckline: breakoutLevel,
    target,
    invalidation: Math.min(...flagLows.map((p) => p.price)) * 0.98,
    reasons: [
      `Öncesinde %${(rise * 100).toFixed(1)} yükseliş.`,
      "Konsolidasyon hafif aşağı eğimli.",
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

/**
 * Ayı Flaması — Düşüş formasyonu
 *
 * Geometri: Güçlü bir düşüş (direk), ardından küçük bir konsolidasyon (flama).
 * Flama genelde yukarı eğimli paralel bir kanal gibi görünür.
 * Kırılım aşağı olur.
 */
function detectBearFlag(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 3 || lows.length < 3) return null;

  const h = highs.slice(-6);
  const l = lows.slice(-6);

  // Flama öncesi güçlü düşüş olmalı
  const firstHighs = h.slice(0, Math.floor(h.length / 2));
  const lastLows = l.slice(Math.floor(l.length / 2));

  if (firstHighs.length === 0 || lastLows.length === 0) return null;

  const basePrice = firstHighs[0]!.price;
  const troughPrice = lastLows[lastLows.length - 1]!.price;
  const drop = (basePrice - troughPrice) / basePrice;
  if (drop < 0.03) return null;

  // Flama: son yarıdaki yüksek ve düşük noktalar hafif yukarı eğimli
  const flagHighs = h.slice(Math.floor(h.length / 2));
  const flagLows = l.slice(Math.floor(l.length / 2));

  if (flagHighs.length < 2 || flagLows.length < 2) return null;

  const flagHighSlope = linearSlope(flagHighs);
  const flagLowSlope = linearSlope(flagLows);

  // Flama hafif yukarı eğimli olmalı
  if (flagHighSlope < 0 || flagLowSlope < 0) return null;

  // Flama genişliği dar olmalı
  const flagRange = Math.max(...flagHighs.map((p) => p.price)) - Math.min(...flagLows.map((p) => p.price));
  const flagRangePercent = flagRange / basePrice;
  if (flagRangePercent > 0.08) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(flagHighs, flagLows, null, null);
  const trendAlignment = calculateTrendAlignment("düşüş", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    68 +
    Math.min(20, drop * 200) +
    (quality.total - 60) * 0.5,
  );

  const breakoutLevel = Math.min(...flagLows.map((p) => p.price));
  const flagHeight = flagRange;
  const target = breakoutLevel - flagHeight;
  const breakout = currentPrice < breakoutLevel ? "aşağı kırılım" : "kırılım yok";

  return {
    name: "Ayı Flaması",
    bias: "düşüş",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Direk (Düşüş)", "trend", [
        firstHighs[0]!,
        lastLows[lastLows.length - 1]!,
      ]),
      toPatternLine("Flama Üst", "direnç", flagHighs),
      toPatternLine("Flama Alt", "destek", flagLows),
    ],
    breakoutStatus: breakout,
    support: breakoutLevel,
    resistance: Math.max(...flagHighs.map((p) => p.price)),
    neckline: breakoutLevel,
    target,
    invalidation: Math.max(...flagHighs.map((p) => p.price)) * 1.02,
    reasons: [
      `Öncesinde %${(drop * 100).toFixed(1)} düşüş.`,
      "Konsolidasyon hafif yukarı eğimli.",
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

// =====================================================
// YENİ FORMASYONLAR — ELMAS
// =====================================================

/**
 * Elmas (Diamond) — Trend değişim formasyonu
 *
 * Geometri: Önce genişleyen (ıraksak), sonra daralan (yakınsak) bir yapı.
 * Genelde trendin zirvesinde/dibinde oluşur ve dönüş sinyali verir.
 */
function detectDiamond(
  highs: SwingPoint[],
  lows: SwingPoint[],
  currentPrice: number,
  allCandlesCount: number,
  technicalEvidence?: TechnicalEvidence | null,
): FormationCandidate | null {
  if (highs.length < 4 || lows.length < 4) return null;

  const h = highs.slice(-6);
  const l = lows.slice(-6);

  if (h.length < 4 || l.length < 4) return null;

  // İlk yarı: genişleme (highs artıyor, lows düşüyor)
  const firstHalfHighs = h.slice(0, Math.floor(h.length / 2));
  const firstHalfLows = l.slice(0, Math.floor(l.length / 2));
  const secondHalfHighs = h.slice(Math.floor(h.length / 2));
  const secondHalfLows = l.slice(Math.floor(l.length / 2));

  if (firstHalfHighs.length < 2 || firstHalfLows.length < 2) return null;
  if (secondHalfHighs.length < 2 || secondHalfLows.length < 2) return null;

  const firstHalfRange =
    Math.max(...firstHalfHighs.map((p) => p.price)) -
    Math.min(...firstHalfLows.map((p) => p.price));
  const secondHalfRange =
    Math.max(...secondHalfHighs.map((p) => p.price)) -
    Math.min(...secondHalfLows.map((p) => p.price));

  if (firstHalfRange <= 0 || secondHalfRange <= 0) return null;

  // İkinci yarı, ilk yarıdan küçük olmalı (daralma)
  if (secondHalfRange >= firstHalfRange * 0.85) return null;

  const allSwings = [...h, ...l];
  const structuralClarity = calculateStructuralClarity(allSwings, allCandlesCount);
  const touchCount = calculateTouchCount(h, l, null, null);
  const trendAlignment = calculateTrendAlignment("nötr", technicalEvidence);
  const quality = calculateQualityScore(structuralClarity, touchCount, trendAlignment);
  if (quality.total < 60) return null;

  const score = clamp(
    65 +
    Math.min(20, (1 - secondHalfRange / firstHalfRange) * 60) +
    (quality.total - 60) * 0.5,
  );

  const midHigh = Math.max(...h.map((p) => p.price));
  const midLow = Math.min(...l.map((p) => p.price));
  const middlePrice = (midHigh + midLow) / 2;

  let breakout: "yukarı kırılım" | "aşağı kırılım" | "kırılım yok" = "kırılım yok";
  if (currentPrice > midHigh) breakout = "yukarı kırılım";
  else if (currentPrice < midLow) breakout = "aşağı kırılım";

  return {
    name: "Elmas",
    bias: "nötr",
    score: Math.round(score),
    qualityScore: quality.total,
    qualityBreakdown: quality.breakdown,
    lines: [
      toPatternLine("Üst Sınır", "direnç", h),
      toPatternLine("Alt Sınır", "destek", l),
    ],
    breakoutStatus: breakout,
    support: midLow,
    resistance: midHigh,
    neckline: middlePrice,
    target: breakout === "yukarı kırılım" ? midHigh + (midHigh - midLow) : breakout === "aşağı kırılım" ? midLow - (midHigh - midLow) : null,
    invalidation: null,
    reasons: [
      "Önce genişleyen, sonra daralan yapı.",
      "Trend dönüşü sinyali.",
      `Kalite: ${quality.total}/100.`,
    ],
  };
}

// =====================================================
// ANA FONKSİYON
// =====================================================

function choosePrimary(candidates: FormationCandidate[]): FormationCandidate | null {
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const breakoutBonusA = a.breakoutStatus === "kırılım yok" ? 0 : 8;
    const breakoutBonusB = b.breakoutStatus === "kırılım yok" ? 0 : 8;
    const scoreA = a.qualityScore * 0.6 + (a.score + breakoutBonusA) * 0.4;
    const scoreB = b.qualityScore * 0.6 + (b.score + breakoutBonusB) * 0.4;
    return scoreB - scoreA;
  })[0] ?? null;
}

/**
 * Ana formasyon motoru — 16 formasyonlu versiyon
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

  // 1-7: MEVCUT FORMASYONLAR
  const ascending = detectAscendingTriangle(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (ascending) candidates.push(ascending);

  const descending = detectDescendingTriangle(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (descending) candidates.push(descending);

  const symmetrical = detectSymmetricalTriangle(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (symmetrical) candidates.push(symmetrical);

  const doubleTop = detectDoubleTop(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (doubleTop) candidates.push(doubleTop);

  const doubleBottom = detectDoubleBottom(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (doubleBottom) candidates.push(doubleBottom);

  const channel = detectChannel(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (channel) candidates.push(channel);

  // 8-16: YENİ FORMASYONLAR
  const obo = detectHeadAndShoulders(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (obo) candidates.push(obo);

  const tobo = detectInverseHeadAndShoulders(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (tobo) candidates.push(tobo);

  const cup = detectCup(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (cup) candidates.push(cup);

  const cupAndHandle = detectCupAndHandle(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (cupAndHandle) candidates.push(cupAndHandle);

  const risingWedge = detectRisingWedge(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (risingWedge) candidates.push(risingWedge);

  const fallingWedge = detectFallingWedge(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (fallingWedge) candidates.push(fallingWedge);

  const bullFlag = detectBullFlag(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (bullFlag) candidates.push(bullFlag);

  const bearFlag = detectBearFlag(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (bearFlag) candidates.push(bearFlag);

  const diamond = detectDiamond(swings.highs, swings.lows, currentPrice, allCandlesCount, technicalEvidence);
  if (diamond) candidates.push(diamond);

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
    candidates: candidates.slice(0, 8),
    swingHighs: swings.highs,
    swingLows: swings.lows,
  };
}

// =====================================================
// YARDIMCI: EŞİK KONTROLÜ
// =====================================================

/**
 * Bir formasyonun bildirim için yeterli kalitede olup olmadığını kontrol eder.
 */
export function isFormationNotifiable(
  candidate: FormationCandidate,
  signalScore?: number,
): boolean {
  if (candidate.qualityScore >= 75) return true;
  if (candidate.qualityScore >= 70) return true;
  if (candidate.qualityScore >= 60) {
    if (signalScore != null && signalScore >= 80) return true;
    return false;
  }
  return false;
}