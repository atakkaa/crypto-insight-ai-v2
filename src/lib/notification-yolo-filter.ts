// src/lib/notification-yolo-filter.ts
// Bildirimleri YOLO ile filtreleyen katman.
// Sunucudan gelen bildirimleri tarayıcıda YOLO'ya sorar, onaylarsa gösterir.

import {
  detectPatternsOnSvg,
  loadYoloModel,
  type YoloDetection,
} from "./yolo-vision";

// =====================================================
// MOTOR İSMİ → YOLO SINIF EŞLEŞTİRME TABLOSU
// =====================================================

type PatternMatch = {
  motorNames: string[];
  yoloClassNames: string[];
};

const PATTERN_MATCH_TABLE: PatternMatch[] = [
  {
    motorNames: ["Çift Tepe", "M-Tepesi", "M Tepesi", "Double Top"],
    yoloClassNames: ["M_Head"],
  },
  {
    motorNames: ["Çift Dip", "W-Dibi", "W Dibi", "Double Bottom"],
    yoloClassNames: ["W_Bottom"],
  },
  {
    motorNames: [
      "Üçgen",
      "Yükselen Üçgen",
      "Alçalan Üçgen",
      "Simetrik Üçgen",
      "Triangle",
    ],
    yoloClassNames: ["Triangle"],
  },
  {
    motorNames: [
      "Kanal",
      "Yükselen Kanal",
      "Düşen Kanal",
      "Trend Çizgisi",
      "StockLine",
    ],
    yoloClassNames: ["StockLine"],
  },
  {
    motorNames: [
      "Omuz-Baş-Omuz",
      "OBO",
      "Head and Shoulders Top",
      "Ters Omuz-Baş-Omuz",
      "Ters OBO",
      "Head and Shoulders Bottom",
    ],
    yoloClassNames: [
      "Head and shoulders top",
      "Head and shoulders bottom",
    ],
  },
];

// =====================================================
// MOTOR İSMİNİ YOLO SINIFLARINA ÇEVİR
// =====================================================

function getYoloClassNamesForMotorName(motorName: string): string[] {
  const normalized = motorName.trim().toLowerCase();

  for (const entry of PATTERN_MATCH_TABLE) {
    const match = entry.motorNames.some(
      (name) => name.toLowerCase() === normalized,
    );
    if (match) return entry.yoloClassNames;
  }

  return [];
}

// =====================================================
// SVG CACHE (sayfadaki ana grafiği bul)
// =====================================================

let cachedSvg: SVGSVGElement | null = null;
let cachedSvgTimestamp = 0;
const SVG_CACHE_MS = 30_000;

function findChartSvg(): SVGSVGElement | null {
  if (typeof document === "undefined") return null;

  const now = Date.now();
  if (cachedSvg && now - cachedSvgTimestamp < SVG_CACHE_MS) {
    return cachedSvg;
  }

  const svgs = Array.from(document.querySelectorAll("svg[role='img']"));
  const chartSvg = svgs.find(
    (s) => s.getAttribute("aria-label") === "Mum fiyat grafiği",
  );

  if (chartSvg instanceof SVGSVGElement) {
    cachedSvg = chartSvg;
    cachedSvgTimestamp = now;
    return chartSvg;
  }

  return null;
}

// =====================================================
// ANA FONKSİYON: BİLDİRİMİ YOLO İLE FİLTRELE
// =====================================================

export type YoloFilterResult =
  | { allowed: true; reason: "yolo-onayladi"; detection?: YoloDetection }
  | { allowed: true; reason: "filtre-uygulanamadi" }
  | { allowed: true; reason: "eslesen-yolo-sinifi-yok" }
  | { allowed: false; reason: "yolo-reddetti"; motorName: string }
  | { allowed: false; reason: "model-yuklenemedi"; motorName: string };

export async function filterNotificationWithYolo(
  motorPatternName: string,
): Promise<YoloFilterResult> {
  const expectedYoloClasses = getYoloClassNamesForMotorName(motorPatternName);

  if (expectedYoloClasses.length === 0) {
    return { allowed: true, reason: "eslesen-yolo-sinifi-yok" };
  }

  const svg = findChartSvg();
  if (!svg) {
    return { allowed: true, reason: "filtre-uygulanamadi" };
  }

  try {
    const model = await loadYoloModel();
    if (!model) {
      return {
        allowed: false,
        reason: "model-yuklenemedi",
        motorName: motorPatternName,
      };
    }
  } catch {
    return {
      allowed: false,
      reason: "model-yuklenemedi",
      motorName: motorPatternName,
    };
  }

  try {
    const detections = await detectPatternsOnSvg(svg, 0.5);

    const matched = detections.find((det) =>
      expectedYoloClasses.includes(det.className),
    );

    if (matched) {
      return {
        allowed: true,
        reason: "yolo-onayladi",
        detection: matched,
      };
    }

    return {
      allowed: false,
      reason: "yolo-reddetti",
      motorName: motorPatternName,
    };
  } catch (error) {
    console.error("YOLO filtre hatası:", error);
    return { allowed: true, reason: "filtre-uygulanamadi" };
  }
}

// =====================================================
// İSTATİSTİK (opsiyonel)
// =====================================================

const filterStats = {
  total: 0,
  allowed: 0,
  rejected: 0,
  skipped: 0,
};

export function getYoloFilterStats() {
  return { ...filterStats };
}

export function resetYoloFilterStats() {
  filterStats.total = 0;
  filterStats.allowed = 0;
  filterStats.rejected = 0;
  filterStats.skipped = 0;
}

export function _trackFilterResult(allowed: boolean, skipped: boolean) {
  filterStats.total += 1;
  if (skipped) filterStats.skipped += 1;
  else if (allowed) filterStats.allowed += 1;
  else filterStats.rejected += 1;
}