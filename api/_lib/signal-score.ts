// api/_lib/signal-score.ts — Sinyal skoru + spam filtresi

import type { NewsItem } from "./news";

// ==========================================================
// TİPLER
// ==========================================================

export type SignalScoreInput = {
  market: string;
  symbol: string;
  direction: "bullish" | "bearish" | "neutral";
  overallStrength: number;
  changePercent: number;
  indicators: Array<{
    name: string;
    value: string;
    direction: string;
    strength: number;
  }>;
  patterns: Array<{
    name: string;
    direction: string;
    confidence: number;
  }>;
  news: NewsItem[];
  isPriority?: boolean;
};

export type SignalScoreResult = {
  score: number;
  breakdown: {
    formation: number;
    indicator: number;
    news: number;
    volume: number;
    trend: number;
  };
  shouldNotify: boolean;
  reason: string;
  tier: "critical" | "important" | "watch" | "silent";
};

// ==========================================================
// YARDIMCILAR
// ==========================================================

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

// ==========================================================
// ANA SKOR FONKSİYONU
// ==========================================================

export function computeSignalScore(input: SignalScoreInput): SignalScoreResult {
  const {
    direction,
    indicators,
    patterns,
    news,
    changePercent,
    isPriority = false,
  } = input;

  // ------------------------------------------------------
  // 1. FORMASYON KATMANI (zorunlu)
  // ------------------------------------------------------
  const sameDirPatterns = patterns.filter((p) => p.direction === direction);
  const bestFormation = sameDirPatterns.reduce(
    (max, p) => Math.max(max, p.confidence),
    0,
  );

  if (sameDirPatterns.length === 0 || bestFormation < 60) {
    return {
      score: 0,
      breakdown: { formation: 0, indicator: 0, news: 0, volume: 0, trend: 0 },
      shouldNotify: false,
      reason: "Net formasyon yok veya zayıf (<60)",
      tier: "silent",
    };
  }

  const formationScore = clamp(bestFormation);

  // ------------------------------------------------------
  // 2. İNDİKATÖR UYUM KATMANI (zorunlu)
  // ------------------------------------------------------
  const sameDirIndicators = indicators.filter((i) => i.direction === direction);
  const indicatorCount = sameDirIndicators.length;

  if (indicatorCount < 2) {
    return {
      score: 0,
      breakdown: {
        formation: formationScore,
        indicator: indicatorCount * 20,
        news: 0,
        volume: 0,
        trend: 0,
      },
      shouldNotify: false,
      reason: `Yetersiz indikatör desteği (${indicatorCount}/2)`,
      tier: "silent",
    };
  }

  const avgIndicatorStrength =
    sameDirIndicators.reduce((a, b) => a + b.strength, 0) / indicatorCount;
  const indicatorScore = clamp(
    avgIndicatorStrength * 0.7 + Math.min(indicatorCount - 2, 2) * 15,
  );

  // ------------------------------------------------------
  // 3. HABER KATMANI (opsiyonel, bonus/ceza)
  // ------------------------------------------------------
  const avgNewsSentiment =
    news.length > 0
      ? news.reduce((a, b) => a + b.sentimentScore, 0) / news.length
      : 0;

  const newsSupports =
    (direction === "bullish" && avgNewsSentiment > 15) ||
    (direction === "bearish" && avgNewsSentiment < -15) ||
    (direction === "neutral" && Math.abs(avgNewsSentiment) < 15);

  const newsContradicts =
    (direction === "bullish" && avgNewsSentiment < -40) ||
    (direction === "bearish" && avgNewsSentiment > 40);

  let newsScore = 50;
  if (newsSupports) newsScore = clamp(50 + Math.abs(avgNewsSentiment) * 0.5);
  if (newsContradicts) newsScore = 20;
  if (news.length === 0) newsScore = 40;

  // ------------------------------------------------------
  // 4. HACİM KATMANI
  // ------------------------------------------------------
  const volumeIndicator = indicators.find((i) => i.name === "Hacim");
  const volumeScore = volumeIndicator ? clamp(volumeIndicator.strength) : 40;

  // ------------------------------------------------------
  // 5. TREND GÜCÜ (ADX)
  // ------------------------------------------------------
  const adxIndicator = indicators.find((i) => i.name === "ADX");
  const trendScore = adxIndicator
    ? clamp(Number(adxIndicator.value) * 1.5)
    : 40;

  // ------------------------------------------------------
  // AĞIRLIKLI TOPLAM
  // ------------------------------------------------------
  const rawScore =
    formationScore * 0.4 +
    indicatorScore * 0.25 +
    newsScore * 0.2 +
    volumeScore * 0.1 +
    trendScore * 0.05;

  // ------------------------------------------------------
  // CEZA / BONUS
  // ------------------------------------------------------
  let finalScore = rawScore;

  if (bestFormation >= 85) finalScore += 5;

  if (
    (direction === "bullish" && changePercent >= 3) ||
    (direction === "bearish" && changePercent <= -3)
  ) {
    finalScore += 3;
  }

  if (Math.abs(avgNewsSentiment) >= 40 && newsSupports) {
    finalScore += 5;
  }

  finalScore = clamp(Math.round(finalScore));

  // ------------------------------------------------------
  // EŞİKLER (priority varlıklara daha düşük eşik)
  // ------------------------------------------------------
  const thresholdCritical = 85;
  const thresholdImportant = isPriority ? 60 : 70;
  const thresholdWatch = isPriority ? 50 : 55;

  let tier: SignalScoreResult["tier"] = "silent";
  if (finalScore >= thresholdCritical) tier = "critical";
  else if (finalScore >= thresholdImportant) tier = "important";
  else if (finalScore >= thresholdWatch) tier = "watch";

  const shouldNotify = tier === "critical" || tier === "important";

  // ------------------------------------------------------
  // NEDEN GÖNDERİLDİ/GÖNDERİLMEDİ
  // ------------------------------------------------------
  let reason = "";
  if (shouldNotify) {
    const parts: string[] = [`Formasyon ${bestFormation}%`];
    parts.push(`${indicatorCount} indikatör uyumlu`);
    if (news.length > 0 && newsSupports)
      parts.push(`Haber ${avgNewsSentiment > 0 ? "olumlu" : "olumsuz"}`);
    else if (news.length === 0) parts.push("Haber yok");
    reason = parts.join(" + ");
  } else {
    reason = `Skor düşük (${finalScore}/${thresholdImportant})`;
  }

  return {
    score: finalScore,
    breakdown: {
      formation: Math.round(formationScore),
      indicator: Math.round(indicatorScore),
      news: Math.round(newsScore),
      volume: Math.round(volumeScore),
      trend: Math.round(trendScore),
    },
    shouldNotify,
    reason,
    tier,
  };
}