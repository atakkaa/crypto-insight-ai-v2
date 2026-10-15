// src/components/CandleChart.tsx
import {
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import { toast } from "sonner";

import {
  detectPatternsOnSvg,
  loadYoloModel,
  type YoloDetection,
} from "@/lib/yolo-vision";

type Props = {
  candles: any[];
  lines?: any[];
  patternName?: string | undefined;
  userLines?: TradingViewLine[];
  onUserDrawingChange?: (lines: TradingViewLine[]) => void;
  onDrawingModeChange?: (active: boolean) => void;
  onEvaluateFormation?: (lines: TradingViewLine[]) => void;
  onRequestClearDrawings?: () => void;
};

export type TradingViewLine = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

const W = 1000;
const H = 420;
const PAD_R = 62;
const PAD_B = 24;
const PAD_T = 14;

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

function fmt(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  }
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toPrecision(4);
}

export function CandleChart({
  candles: initialCandles,
  lines: initialLines,
  patternName: initialPatternName,
  userLines,
  onUserDrawingChange,
  onDrawingModeChange,
  onEvaluateFormation,
  onRequestClearDrawings,
}: Props) {
  /* ============================================================
     KULLANICI ÇİZİM DURUMU
     ============================================================ */
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [trendLines, setTrendLines] = useState<TradingViewLine[]>(userLines ?? []);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);

  /* ============================================================
     ZOOM & PAN DURUMU
     ============================================================ */
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [showZoomBadge, setShowZoomBadge] = useState(false);

  const touchRef = useRef<{
    startDistance: number;
    startZoom: number;
    startPanX: number;
    startPanOffset: number;
    startCenterX: number;
    isPinching: boolean;
    isPanning: boolean;
    lastTapTime: number;
    lastTapX: number;
  }>({
    startDistance: 0,
    startZoom: 1,
    startPanX: 0,
    startPanOffset: 0,
    startCenterX: 0,
    isPinching: false,
    isPanning: false,
    lastTapTime: 0,
    lastTapX: 0,
  });

  /* ============================================================
     YOLO AI DURUMU
     ============================================================ */
  const [yoloLoading, setYoloLoading] = useState(false);
  const [yoloDetecting, setYoloDetecting] = useState(false);
  const [yoloDetections, setYoloDetections] = useState<YoloDetection[]>([]);
  const [showYoloResults, setShowYoloResults] = useState(false);

  /* ============================================================
     CALLBACK REF'LERİ
     ============================================================ */
  const onUserDrawingChangeRef = useRef(onUserDrawingChange);
  const onDrawingModeChangeRef = useRef(onDrawingModeChange);
  const onEvaluateFormationRef = useRef(onEvaluateFormation);

  useEffect(() => {
    onUserDrawingChangeRef.current = onUserDrawingChange;
  }, [onUserDrawingChange]);

  useEffect(() => {
    onDrawingModeChangeRef.current = onDrawingModeChange;
  }, [onDrawingModeChange]);

  useEffect(() => {
    onEvaluateFormationRef.current = onEvaluateFormation;
  }, [onEvaluateFormation]);

  const previousUserLinesRef = useRef<TradingViewLine[] | undefined>(userLines);

  useEffect(() => {
    const previousLines = previousUserLinesRef.current;
    const nextLines = userLines ?? [];
    setTrendLines(nextLines);

    const sameDrawingSession =
      previousLines !== undefined &&
      nextLines.length >= previousLines.length &&
      previousLines.every((oldLine, index) => {
        const nextLine = nextLines[index];
        return (
          nextLine?.start.x === oldLine.start.x &&
          nextLine?.start.y === oldLine.start.y &&
          nextLine?.end.x === oldLine.end.x &&
          nextLine?.end.y === oldLine.end.y
        );
      });

    if (!sameDrawingSession) {
      setStartPoint(null);
      setPreviewPoint(null);
    }
    previousUserLinesRef.current = userLines;
  }, [userLines]);

  /* ============================================================
     GRAFİK VERİLERİ
     ============================================================ */
  const currentCandles = initialCandles ?? [];
  const currentLines = initialLines ?? [];
  const currentPatternName = initialPatternName;
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    onUserDrawingChangeRef.current?.(trendLines);
  }, [trendLines]);

  /* ============================================================
     GRAFİK GEOMETRİSİ
     ============================================================ */
  const geo = useMemo(() => {
    if (currentCandles.length === 0) return null;
    const prices: number[] = [];
    for (const c of currentCandles) {
      if (Number.isFinite(c.high)) prices.push(Number(c.high));
      if (Number.isFinite(c.low)) prices.push(Number(c.low));
    }
    for (const line of currentLines) {
      for (const p of line.points ?? []) {
        if (Number.isFinite(p.price)) prices.push(Number(p.price));
      }
    }
    if (prices.length === 0) return null;

    let min = Math.min(...prices);
    let max = Math.max(...prices);
    const pad = (max - min) * 0.06 || max * 0.01 || 1;
    min -= pad;
    max += pad;

    const plotW = W - PAD_R;
    const plotH = H - PAD_B - PAD_T;
    const step = plotW / currentCandles.length;
    const x = (index: number) => index * step + step / 2;
    const y = (price: number) => PAD_T + ((max - price) / (max - min)) * plotH;

    return { min, max, step, x, y };
  }, [currentCandles, currentLines]);

  /* ============================================================
     ZOOM & PAN HESAPLAMASI
     ============================================================ */
  const viewState = useMemo(() => {
    const total = currentCandles.length;
    if (total === 0) {
      return { visibleStart: 0, visibleEnd: 0, visibleCount: 0 };
    }
    const visibleCount = Math.max(5, Math.floor(total / zoom));
    const maxStart = Math.max(0, total - visibleCount);
    const visibleStart = Math.max(0, Math.min(maxStart, panOffset));
    const visibleEnd = visibleStart + visibleCount;

    return { visibleStart, visibleEnd, visibleCount };
  }, [currentCandles.length, zoom, panOffset]);

  /* ============================================================
     SVG KOORDİNATLARI
     ============================================================ */
  const getSvgCoordinates = (e: any) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    const clientY = e.touches ? e.touches[0]?.clientY : e.clientY;
    if (typeof clientX !== "number" || typeof clientY !== "number") return null;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  /* ============================================================
     GRAFİĞE TIKLAMA
     ============================================================ */
  const handleChartClick = (e: any) => {
    if (!isDrawingMode) return;
    e.preventDefault();
    e.stopPropagation();
    const coords = getSvgCoordinates(e);
    if (!coords) return;

    if (!startPoint) {
      setStartPoint(coords);
      setPreviewPoint(coords);
      return;
    }

    const newLine: TradingViewLine = { start: startPoint, end: coords };
    setTrendLines((prev) => [...prev, newLine]);
    setStartPoint(null);
    setPreviewPoint(null);
  };

  const handleChartMouseMove = (e: any) => {
    if (!isDrawingMode || !startPoint) return;
    const coords = getSvgCoordinates(e);
    if (coords) setPreviewPoint(coords);
  };

  /* ============================================================
     TOUCH HANDLERS
     ============================================================ */

  // React.Touch tipini kullan — React'in kendi tipi
  function getTouchDistance(t1: React.Touch, t2: React.Touch): number {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (isDrawingMode) return;

    const t = touchRef.current;
    const touch0 = e.touches[0];
    const touch1 = e.touches[1];

    if (e.touches.length === 2 && touch0 && touch1) {
      t.isPinching = true;
      t.isPanning = false;
      t.startDistance = getTouchDistance(touch0, touch1);
      t.startZoom = zoom;
      t.startCenterX = (touch0.clientX + touch1.clientX) / 2;
      t.startPanOffset = panOffset;
    } else if (e.touches.length === 1 && touch0) {
      const now = Date.now();
      const tapX = touch0.clientX;

      if (now - t.lastTapTime < 300 && Math.abs(tapX - t.lastTapX) < 30) {
        setZoom((prev) => (prev > 1 ? 1 : 2.5));
        setShowZoomBadge(true);
        setTimeout(() => setShowZoomBadge(false), 1500);
        t.lastTapTime = 0;
        return;
      }

      t.lastTapTime = now;
      t.lastTapX = tapX;
      t.isPanning = true;
      t.isPinching = false;
      t.startPanX = touch0.clientX;
      t.startPanOffset = panOffset;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (isDrawingMode) return;

    const t = touchRef.current;
    const touch0 = e.touches[0];
    const touch1 = e.touches[1];

    if (
      t.isPinching &&
      e.touches.length === 2 &&
      touch0 &&
      touch1 &&
      t.startDistance > 0
    ) {
      e.preventDefault();
      const newDistance = getTouchDistance(touch0, touch1);
      const ratio = newDistance / t.startDistance;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, t.startZoom * ratio),
      );
      setZoom(newZoom);
      setShowZoomBadge(true);
    } else if (t.isPanning && e.touches.length === 1 && touch0) {
      const dx = touch0.clientX - t.startPanX;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;

      const pxPerIndex = rect.width / viewState.visibleCount;
      const indexDelta = -Math.round(dx / pxPerIndex);
      const total = currentCandles.length;
      const maxStart = Math.max(0, total - viewState.visibleCount);
      const newOffset = Math.max(
        0,
        Math.min(maxStart, t.startPanOffset + indexDelta),
      );
      setPanOffset(newOffset);
    }
  };

  const handleTouchEnd = () => {
    const t = touchRef.current;
    t.isPinching = false;
    t.isPanning = false;
    t.startDistance = 0;
    setTimeout(() => setShowZoomBadge(false), 1200);
  };

  /* ============================================================
     MOUSE WHEEL ZOOM
     ============================================================ */
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (isDrawingMode) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
    setZoom(newZoom);
    setShowZoomBadge(true);
    setTimeout(() => setShowZoomBadge(false), 1200);
  };

  /* ============================================================
     ZOOM SIFIRLA
     ============================================================ */
  const resetZoom = () => {
    setZoom(1);
    setPanOffset(0);
    setShowZoomBadge(false);
  };

  const toggleDrawingMode = () => {
    const nextMode = !isDrawingMode;
    setIsDrawingMode(nextMode);
    onDrawingModeChangeRef.current?.(nextMode);
    setStartPoint(null);
    setPreviewPoint(null);
  };

  const clearDrawings = () => {
    if (onRequestClearDrawings) {
      onRequestClearDrawings();
      return;
    }
    setTrendLines([]);
    setStartPoint(null);
    setPreviewPoint(null);
  };

  /* ============================================================
     YOLO AI FORMASYON TESPİTİ
     ============================================================ */
  async function handleYoloDetect() {
    if (!svgRef.current) {
      toast.error("Grafik SVG bulunamadı");
      return;
    }

    setYoloLoading(true);
    setYoloDetecting(true);
    setShowYoloResults(true);

    try {
      await loadYoloModel();
      const results = await detectPatternsOnSvg(svgRef.current, 0.4);
      setYoloDetections(results);

      if (results.length === 0) {
        toast.info("Formasyon tespit edilemedi");
      } else {
        toast.success(`${results.length} formasyon tespit edildi`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Formasyon tespiti sırasında hata oluştu");
    } finally {
      setYoloLoading(false);
      setYoloDetecting(false);
    }
  }

  function clearYoloResults() {
    setYoloDetections([]);
    setShowYoloResults(false);
  }

  /* ============================================================
     GRAFİK VERİSİ YOK
     ============================================================ */
  if (!geo) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        Grafik verisi yükleniyor...
      </div>
    );
  }

  const { min, max, y } = geo;

  const visibleCandles = currentCandles.slice(
    viewState.visibleStart,
    viewState.visibleEnd,
  );

  const visibleStep = (W - PAD_R) / Math.max(1, visibleCandles.length);
  const x = (i: number) => i * visibleStep + visibleStep / 2;

  const gridPrices = Array.from(
    { length: 5 },
    (_, i) => min + ((max - min) * i) / 4,
  );
  const bodyW = Math.max(1.2, visibleStep * 0.62);

  return (
    <div className="relative flex w-full flex-col gap-4">
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
        <button
          type="button"
          onClick={toggleDrawingMode}
          className={`flex min-h-[36px] items-center gap-2 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            isDrawingMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          📉{" "}
          <span className="hidden sm:inline">
            {isDrawingMode
              ? "Çizim Modu: Aktif (Grafiğe Tıkla)"
              : "TradingView Çizgisi Çek"}
          </span>
          <span className="sm:hidden">
            {isDrawingMode ? "Çizim Aktif" : "Çizim"}
          </span>
        </button>

        {isDrawingMode && trendLines.length > 0 && (
          <button
            type="button"
            onClick={() => onEvaluateFormationRef.current?.(trendLines)}
            className="flex min-h-[36px] items-center gap-2 rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            🤖 Değerlendir
          </button>
        )}

        {startPoint && (
          <span className="animate-pulse text-xs font-medium text-amber-500">
            📍 Bitiş noktası seç...
          </span>
        )}

        {(trendLines.length > 0 || startPoint) && (
          <button
            type="button"
            onClick={clearDrawings}
            className="min-h-[36px] rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive"
          >
            🗑️ <span className="hidden sm:inline">Temizle</span>
          </button>
        )}

        {(zoom > 1 || panOffset > 0) && (
          <button
            type="button"
            onClick={resetZoom}
            className="min-h-[36px] rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
          >
            🔄 <span className="hidden sm:inline">Sıfırla</span>
          </button>
        )}

        {currentPatternName && (
          <span className="hidden text-[11px] text-muted-foreground lg:inline">
            AI: {currentPatternName}
          </span>
        )}

        <button
          type="button"
          onClick={() => void handleYoloDetect()}
          disabled={yoloLoading || yoloDetecting}
          className="ml-auto flex min-h-[36px] items-center gap-2 rounded-md border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-400 hover:bg-purple-500/20 disabled:opacity-50"
        >
          {yoloLoading
            ? "⏳ Model yükleniyor..."
            : yoloDetecting
              ? "🔍 Taranıyor..."
              : "🤖 AI Tespit"}
        </button>

        {yoloDetections.length > 0 && (
          <button
            type="button"
            onClick={clearYoloResults}
            className="min-h-[36px] rounded-md border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            🗑️
          </button>
        )}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none bg-black"
          style={{
            cursor: isDrawingMode ? "crosshair" : "grab",
            touchAction: isDrawingMode ? "none" : "none",
          }}
          role="img"
          aria-label="Mum fiyat grafiği"
          onClick={handleChartClick}
          onMouseMove={handleChartMouseMove}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <rect x={0} y={0} width={W} height={H} fill="#000000" />

          {gridPrices.map((p) => (
            <g key={p}>
              <line
                x1={0}
                x2={W - PAD_R}
                y1={y(p)}
                y2={y(p)}
                stroke="var(--color-grid)"
                strokeWidth={1}
              />
              <text
                x={W - PAD_R + 8}
                y={y(p) + 4}
                className="num"
                fontSize={11}
                fill="var(--color-muted-foreground)"
              >
                {fmt(p)}
              </text>
            </g>
          ))}

          {visibleCandles.map((c, i) => {
            const open = Number(c.open);
            const close = Number(c.close);
            const high = Number(c.high);
            const low = Number(c.low);
            const up = close >= open;
            const color = up ? "var(--color-bull)" : "var(--color-bear)";
            const actualIndex = viewState.visibleStart + i;

            return (
              <g key={`${c.time}-${actualIndex}`}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(high)}
                  y2={y(low)}
                  stroke={color}
                  strokeWidth={1}
                />
                <rect
                  x={x(i) - bodyW / 2}
                  y={y(Math.max(open, close))}
                  width={bodyW}
                  height={Math.max(
                    1,
                    y(Math.min(open, close)) - y(Math.max(open, close)),
                  )}
                  fill={color}
                  opacity={0.9}
                />
              </g>
            );
          })}

          {currentLines.map((line, li) => {
            // Tip tanımlı ara dizi
            const rawPts: Array<{ px: number; py: number }> = [];

            for (const p of line.points ?? []) {
              if (!p || !Number.isFinite(p.price) || !Number.isFinite(p.index)) {
                continue;
              }
              const idx = Math.round(p.index);
              if (
                idx < viewState.visibleStart ||
                idx >= viewState.visibleEnd
              ) {
                continue;
              }
              rawPts.push({
                px: Number(x(idx - viewState.visibleStart)),
                py: Number(y(p.price)),
              });
            }

            if (rawPts.length < 2) return null;

            const stroke =
              line.kind === "destek"
                ? "var(--color-bull)"
                : line.kind === "direnç"
                  ? "var(--color-bear)"
                  : line.kind === "hedef"
                    ? "var(--color-accent)"
                    : "var(--color-primary)";

            const lastPt = rawPts[rawPts.length - 1];

            return (
              <g key={`${line.label ?? "ai-line"}-${li}`}>
                <polyline
                  points={rawPts
                    .map((p: { px: number; py: number }) => `${p.px},${p.py}`)
                    .join(" ")}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray={line.kind === "hedef" ? "6 5" : ""}
                  opacity={0.95}
                />
                {lastPt && (
                  <text
                    x={Math.min(lastPt.px + 6, W - PAD_R - 90)}
                    y={lastPt.py - 6}
                    fontSize={11}
                    fill={stroke}
                    className="num"
                  >
                    {line.label}
                  </text>
                )}
              </g>
            );
          })}

          {trendLines.map((line, index) => (
            <g key={`user-trend-${index}`}>
              <line
                x1={line.start.x}
                y1={line.start.y}
                x2={line.end.x}
                y2={line.end.y}
                stroke="#22c55e"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <circle
                cx={line.start.x}
                cy={line.start.y}
                r={4}
                fill="#ffffff"
                stroke="#22c55e"
                strokeWidth={1.5}
              />
              <circle
                cx={line.end.x}
                cy={line.end.y}
                r={4}
                fill="#ffffff"
                stroke="#22c55e"
                strokeWidth={1.5}
              />
            </g>
          ))}

          {startPoint && previewPoint && (
            <g>
              <line
                x1={startPoint.x}
                y1={startPoint.y}
                x2={previewPoint.x}
                y2={previewPoint.y}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              <circle cx={startPoint.x} cy={startPoint.y} r={4} fill="#3b82f6" />
              <circle cx={previewPoint.x} cy={previewPoint.y} r={3} fill="#3b82f6" />
            </g>
          )}

          {showYoloResults &&
            yoloDetections.map((det, idx) => {
              const boxX = det.x1 * W;
              const boxY = det.y1 * H;
              const boxW = (det.x2 - det.x1) * W;
              const boxH = (det.y2 - det.y1) * H;

              const color =
                det.bias === "yükseliş"
                  ? "#22c55e"
                  : det.bias === "düşüş"
                    ? "#ef4444"
                    : "#a855f7";

              return (
                <g key={`yolo-${idx}`}>
                  <rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    opacity={0.9}
                  />
                  <rect
                    x={boxX}
                    y={boxY - 20}
                    width={Math.min(boxW, 200)}
                    height={20}
                    fill={color}
                    opacity={0.9}
                  />
                  <text
                    x={boxX + 6}
                    y={boxY - 6}
                    fontSize={11}
                    fill="#ffffff"
                    fontWeight="bold"
                  >
                    {det.classNameTr} %{(det.confidence * 100).toFixed(0)}
                  </text>
                </g>
              );
            })}
        </svg>

        {showZoomBadge && zoom !== 1 && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-background/90 px-2 py-1 text-xs font-bold text-primary backdrop-blur">
            🔍 {zoom.toFixed(1)}x
          </div>
        )}

        {zoom > 1 && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur">
            👆 Kaydırarak gez
          </div>
        )}
      </div>

      {showYoloResults && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
              🤖 YOLOv8 AI Formasyon Tespit Sonuçları
            </p>
            <span className="text-[9px] text-muted-foreground">
              {yoloDetections.length} sonuç
            </span>
          </div>

          {yoloLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Model yükleniyor... (ilk seferde 10-20 saniye sürebilir)
            </p>
          ) : yoloDetections.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Bu grafikte geçerli bir formasyon tespit edilemedi.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {yoloDetections.map((det, idx) => {
                const biasEmoji =
                  det.bias === "yükseliş"
                    ? "🟢"
                    : det.bias === "düşüş"
                      ? "🔴"
                      : "⚪";
                const biasColor =
                  det.bias === "yükseliş"
                    ? "text-bull"
                    : det.bias === "düşüş"
                      ? "text-bear"
                      : "text-muted-foreground";

                return (
                  <div
                    key={idx}
                    className="rounded-md border border-border/60 bg-card p-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`font-bold ${biasColor}`}>
                        {biasEmoji} {det.classNameTr}
                      </span>
                      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-400">
                        %{(det.confidence * 100).toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Yön: <span className={biasColor}>{det.bias}</span>
                      <span className="ml-2 opacity-60">
                        ({det.className})
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}