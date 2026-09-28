// src/components/CandleChart.tsx
import {
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";

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
  start: {
    x: number;
    y: number;
  };
  end: {
    x: number;
    y: number;
  };
};

const W = 1000;
const H = 420;

const PAD_R = 62;
const PAD_B = 24;
const PAD_T = 14;

function fmt(value: number) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("tr-TR", {
      maximumFractionDigits: 2,
    });
  }

  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }

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
  /*
   * ============================================================
   * KULLANICI ÇİZİM DURUMU
   * ============================================================
   */

  const [isDrawingMode, setIsDrawingMode] =
    useState(false);

  const [trendLines, setTrendLines] =
    useState<TradingViewLine[]>(userLines ?? []);

  const [startPoint, setStartPoint] =
    useState<{
      x: number;
      y: number;
    } | null>(null);

  const [previewPoint, setPreviewPoint] =
    useState<{
      x: number;
      y: number;
    } | null>(null);

  /*
   * ============================================================
   * CALLBACK REF'LERİ
   *
   * Parent component her render olduğunda callback referansı
   * değişebilir.
   *
   * Bunun çizim durumunu etkilemesini istemiyoruz.
   * ============================================================
   */

  const onUserDrawingChangeRef =
    useRef(onUserDrawingChange);

  const onDrawingModeChangeRef =
    useRef(onDrawingModeChange);

  const onEvaluateFormationRef =
    useRef(onEvaluateFormation);

  useEffect(() => {
    onUserDrawingChangeRef.current =
      onUserDrawingChange;
  }, [onUserDrawingChange]);

  useEffect(() => {
    onDrawingModeChangeRef.current =
      onDrawingModeChange;
  }, [onDrawingModeChange]);

  useEffect(() => {
    onEvaluateFormationRef.current =
      onEvaluateFormation;
  }, [onEvaluateFormation]);

  /*
   * Parent'tan gelen userLines değiştiğinde çizimleri senkronize ediyoruz.
   *
   * ÖNEMLİ:
   * Aynı asset üzerinde yeni bir çizgi eklendiğinde userLines değişir.
   * Bu durumda çizim modu KAPANMAMALI; kullanıcı formasyonu
   * tamamlayana kadar arka arkaya çizgi çizebilmeli.
   *
   * Asset/timeframe değişiminde ise parent yeni çizim listesini gönderir.
   * O durumda yarım kalan çizim noktasını temizliyoruz.
   */
  const previousUserLinesRef = useRef<TradingViewLine[] | undefined>(
    userLines,
  );

  useEffect(() => {
    const previousLines = previousUserLinesRef.current;
    const nextLines = userLines ?? [];

    setTrendLines(nextLines);

    /*
     * Eğer gelen liste mevcut listenin devamıysa bu,
     * kullanıcının aynı asset üzerinde yeni çizgi eklediği anlamına gelir.
     * Çizim modunu açık bırak.
     *
     * Liste tamamen farklıysa asset/timeframe değişimi gibi davranıp
     * yarım kalan başlangıç noktasını temizle.
     */
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

  /*
   * ============================================================
   * GRAFİK VERİLERİ
   *
   * Artık bunları local state'e kopyalamıyoruz.
   *
   * Böylece parent yeniden render olduğunda:
   *
   * ❌ çizim modu kapanmaz
   * ❌ kullanıcı çizgileri silinmez
   * ❌ değerlendirme paneli kapanmaz
   *
   * ============================================================
   */

  const currentCandles =
    initialCandles ?? [];

  const currentLines =
    initialLines ?? [];

  const currentPatternName =
    initialPatternName;

  const svgRef =
    useRef<SVGSVGElement | null>(null);

  /*
   * ============================================================
   * KULLANICI ÇİZİMLERİNİ PARENT'A BİLDİR
   * ============================================================
   */

  useEffect(() => {
    onUserDrawingChangeRef.current?.(
      trendLines,
    );
  }, [trendLines]);

  /*
   * ============================================================
   * GRAFİK GEOMETRİSİ
   * ============================================================
   */

  const geo = useMemo(() => {
    if (currentCandles.length === 0) {
      return null;
    }

    const prices: number[] = [];

    for (const c of currentCandles) {
      if (Number.isFinite(c.high)) {
        prices.push(Number(c.high));
      }

      if (Number.isFinite(c.low)) {
        prices.push(Number(c.low));
      }
    }

    for (const line of currentLines) {
      for (const p of line.points ?? []) {
        if (Number.isFinite(p.price)) {
          prices.push(Number(p.price));
        }
      }
    }

    if (prices.length === 0) {
      return null;
    }

    let min = Math.min(...prices);
    let max = Math.max(...prices);

    const pad =
      (max - min) * 0.06 ||
      max * 0.01 ||
      1;

    min -= pad;
    max += pad;

    const plotW =
      W - PAD_R;

    const plotH =
      H - PAD_B - PAD_T;

    const step =
      plotW / currentCandles.length;

    const x = (index: number) =>
      index * step + step / 2;

    const y = (price: number) =>
      PAD_T +
      ((max - price) /
        (max - min)) *
        plotH;

    return {
      min,
      max,
      step,
      x,
      y,
    };
  }, [
    currentCandles,
    currentLines,
  ]);

  /*
   * ============================================================
   * SVG KOORDİNATLARI
   * ============================================================
   */

  const getSvgCoordinates = (
    e: any,
  ) => {
    if (!svgRef.current) {
      return null;
    }

    const rect =
      svgRef.current.getBoundingClientRect();

    const clientX = e.touches
      ? e.touches[0]?.clientX
      : e.clientX;

    const clientY = e.touches
      ? e.touches[0]?.clientY
      : e.clientY;

    if (
      typeof clientX !== "number" ||
      typeof clientY !== "number"
    ) {
      return null;
    }

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return null;
    }

    return {
      x:
        ((clientX - rect.left) /
          rect.width) *
        W,

      y:
        ((clientY - rect.top) /
          rect.height) *
        H,
    };
  };

  /*
   * ============================================================
   * GRAFİĞE TIKLAMA
   * ============================================================
   */

  const handleChartClick = (
    e: any,
  ) => {
    if (!isDrawingMode) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const coords =
      getSvgCoordinates(e);

    if (!coords) {
      return;
    }

    /*
     * İlk nokta
     */
    if (!startPoint) {
      setStartPoint(coords);
      setPreviewPoint(coords);
      return;
    }

    /*
     * İkinci nokta
     *
     * Çizgi tamamlanıyor.
     */
    const newLine: TradingViewLine = {
      start: startPoint,
      end: coords,
    };

    setTrendLines(
      (prev) => [
        ...prev,
        newLine,
      ],
    );

    setStartPoint(null);
    setPreviewPoint(null);
  };

  /*
   * ============================================================
   * ÇİZİM ÖNİZLEMESİ
   * ============================================================
   */

  const handleChartMouseMove = (
    e: any,
  ) => {
    if (
      !isDrawingMode ||
      !startPoint
    ) {
      return;
    }

    const coords =
      getSvgCoordinates(e);

    if (coords) {
      setPreviewPoint(coords);
    }
  };

  /*
   * ============================================================
   * TRADINGVIEW ÇİZİM MODU
   *
   * ÖNEMLİ:
   *
   * Burada sadece kullanıcı butona bastığında mod değişiyor.
   *
   * Parent render olduğunda,
   * callback değiştiğinde veya grafik yeniden çizildiğinde
   * mod KAPATILMIYOR.
   * ============================================================
   */

  const toggleDrawingMode = () => {
    const nextMode =
      !isDrawingMode;

    setIsDrawingMode(
      nextMode,
    );

    onDrawingModeChangeRef.current?.(
      nextMode,
    );

    /*
     * Yeni çizim başlatırken
     * yarım kalmış başlangıç noktasını temizle.
     *
     * Daha önce çizilmiş çizgilere dokunma.
     */
    setStartPoint(null);
    setPreviewPoint(null);
  };

  /*
   * ============================================================
   * ÇİZİMLERİ TEMİZLE
   * ============================================================
   */

  const clearDrawings = () => {
    if (onRequestClearDrawings) {
      onRequestClearDrawings();
      return;
    }
    setTrendLines([]);
    setStartPoint(null);
    setPreviewPoint(null);
  };

  /*
   * ============================================================
   * GRAFİK VERİSİ YOK
   * ============================================================
   */

  if (!geo) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        Grafik verisi yükleniyor...
      </div>
    );
  }

  const {
    min,
    max,
    step,
    x,
    y,
  } = geo;

  const gridPrices =
    Array.from(
      { length: 5 },
      (_, i) =>
        min +
        ((max - min) * i) /
          4,
    );

  const bodyW =
    Math.max(
      1.2,
      step * 0.62,
    );

  /*
   * ============================================================
   * GRAFİK
   * ============================================================
   */

  return (
    <div className="relative w-full flex flex-col gap-4">

      {/* ======================================================
          TRADINGVIEW KONTROLLERİ
          ====================================================== */}

      <div className="flex flex-wrap items-center gap-2 p-2 bg-background border rounded-lg shadow-sm w-fit">

        {/* ====================================================
            TRADINGVIEW ÇİZGİSİ
            ==================================================== */}

        <button
          type="button"
          onClick={
            toggleDrawingMode
          }
          className={`flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            isDrawingMode
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          📉{" "}

          {isDrawingMode
            ? "Çizim Modu: Aktif (Grafiğe Tıkla)"
            : "TradingView Çizgisi Çek"}
        </button>

        {/* ====================================================
            FORMASYONU DEĞERLENDİR
           
            SADECE:
            - çizim modu aktifse
            - en az 1 çizgi varsa
           
            görünür.
            ==================================================== */}

        {isDrawingMode &&
          trendLines.length >
            0 && (
            <button
              type="button"
              onClick={() =>
                onEvaluateFormationRef.current?.(
                  trendLines,
                )
              }
              className="flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-md bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              🤖 Formasyonu Değerlendir
            </button>
          )}

        {/* ====================================================
            İLK NOKTA SEÇİLDİ
            ==================================================== */}

        {startPoint && (
          <span className="text-xs text-amber-500 animate-pulse font-medium">
            📍 Bitiş noktası seç...
          </span>
        )}

        {/* ====================================================
            ÇİZİMLERİ TEMİZLE
            ==================================================== */}

        {(trendLines.length >
          0 ||
          startPoint) && (
          <button
            type="button"
            onClick={
              clearDrawings
            }
            className="px-3 py-1 text-xs font-medium rounded-md bg-destructive/10 text-destructive border border-destructive/20"
          >
            🗑️ Çizgileri Temizle
          </button>
        )}

        {/* ====================================================
            AI FORMASYON ADI
            ==================================================== */}

        {currentPatternName && (
          <span className="hidden text-[11px] text-muted-foreground lg:inline">
            AI:{" "}
            {currentPatternName}
          </span>
        )}
      </div>

      {/* ======================================================
          FİYAT GRAFİĞİ
          ====================================================== */}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{
          cursor:
            isDrawingMode
              ? "crosshair"
              : "default",

          touchAction:
            isDrawingMode
              ? "none"
              : "auto",
        }}
        role="img"
        aria-label="Mum fiyat grafiği"
        onClick={
          handleChartClick
        }
        onMouseMove={
          handleChartMouseMove
        }
      >

        {/* ====================================================
            GRID
            ==================================================== */}

        {gridPrices.map(
          (p) => (
            <g key={p}>
              <line
                x1={0}
                x2={
                  W - PAD_R
                }
                y1={y(p)}
                y2={y(p)}
                stroke="var(--color-grid)"
                strokeWidth={1}
              />

              <text
                x={
                  W -
                  PAD_R +
                  8
                }
                y={
                  y(p) + 4
                }
                className="num"
                fontSize={11}
                fill="var(--color-muted-foreground)"
              >
                {fmt(p)}
              </text>
            </g>
          ),
        )}

        {/* ====================================================
            MUM ÇUBUKLARI
            ==================================================== */}

        {currentCandles.map(
          (c, i) => {
            const open =
              Number(c.open);

            const close =
              Number(c.close);

            const high =
              Number(c.high);

            const low =
              Number(c.low);

            const up =
              close >= open;

            const color = up
              ? "var(--color-bull)"
              : "var(--color-bear)";

            return (
              <g
                key={`${c.time}-${i}`}
              >
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(high)}
                  y2={y(low)}
                  stroke={color}
                  strokeWidth={1}
                />

                <rect
                  x={
                    x(i) -
                    bodyW / 2
                  }
                  y={y(
                    Math.max(
                      open,
                      close,
                    ),
                  )}
                  width={bodyW}
                  height={Math.max(
                    1,
                    y(
                      Math.min(
                        open,
                        close,
                      ),
                    ) -
                      y(
                        Math.max(
                          open,
                          close,
                        ),
                      ),
                  )}
                  fill={color}
                  opacity={0.9}
                />
              </g>
            );
          },
        )}

        {/* ====================================================
            AI'NIN MEVCUT FORMASYON ÇİZGİLERİ
           
            BURASI DEĞİŞTİRİLMEDİ.
            ==================================================== */}

        {currentLines.map(
          (
            line,
            li,
          ) => {
            const pts = (
              line.points ??
              []
            )
              .filter(
                (p: any) =>
                  p &&
                  Number.isFinite(
                    p.price,
                  ) &&
                  Number.isFinite(
                    p.index,
                  ),
              )
              .map(
                (p: any) => ({
                  px: Number(
                    x(
                      Math.max(
                        0,
                        Math.min(
                          currentCandles.length -
                            1,
                          Math.round(
                            p.index,
                          ),
                        ),
                      ),
                    ),
                  ),

                  py: Number(
                    y(
                      p.price,
                    ),
                  ),
                }),
              );

            if (
              pts.length <
              2
            ) {
              return null;
            }

            const stroke =
              line.kind ===
              "destek"
                ? "var(--color-bull)"
                : line.kind ===
                    "direnç"
                  ? "var(--color-bear)"
                  : line.kind ===
                      "hedef"
                    ? "var(--color-accent)"
                    : "var(--color-primary)";

            const lastPt =
              pts[
                pts.length - 1
              ];

            return (
              <g
                key={`${line.label ?? "ai-line"}-${li}`}
              >
                <polyline
                  points={pts
                    .map(
                      (
                        p: {
                          px: number;
                          py: number;
                        },
                      ) =>
                        `${p.px},${p.py}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray={
                    line.kind ===
                    "hedef"
                      ? "6 5"
                      : ""
                  }
                  opacity={0.95}
                />

                {lastPt && (
                  <text
                    x={Math.min(
                      lastPt.px +
                        6,
                      W -
                        PAD_R -
                        90,
                    )}
                    y={
                      lastPt.py -
                      6
                    }
                    fontSize={11}
                    fill={stroke}
                    className="num"
                  >
                    {
                      line.label
                    }
                  </text>
                )}
              </g>
            );
          },
        )}

        {/* ====================================================
            KULLANICI ÇİZGİLERİ
            ==================================================== */}

        {trendLines.map(
          (
            line,
            index,
          ) => (
            <g
              key={`user-trend-${index}`}
            >
              <line
                x1={
                  line.start.x
                }
                y1={
                  line.start.y
                }
                x2={
                  line.end.x
                }
                y2={
                  line.end.y
                }
                stroke="#22c55e"
                strokeWidth={2.5}
                strokeLinecap="round"
              />

              <circle
                cx={
                  line.start.x
                }
                cy={
                  line.start.y
                }
                r={4}
                fill="#ffffff"
                stroke="#22c55e"
                strokeWidth={1.5}
              />

              <circle
                cx={
                  line.end.x
                }
                cy={
                  line.end.y
                }
                r={4}
                fill="#ffffff"
                stroke="#22c55e"
                strokeWidth={1.5}
              />
            </g>
          ),
        )}

        {/* ====================================================
            ÇİZİM ÖNİZLEMESİ
            ==================================================== */}

        {startPoint &&
          previewPoint && (
            <g>
              <line
                x1={
                  startPoint.x
                }
                y1={
                  startPoint.y
                }
                x2={
                  previewPoint.x
                }
                y2={
                  previewPoint.y
                }
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="4 4"
              />

              <circle
                cx={
                  startPoint.x
                }
                cy={
                  startPoint.y
                }
                r={4}
                fill="#3b82f6"
              />

              <circle
                cx={
                  previewPoint.x
                }
                cy={
                  previewPoint.y
                }
                r={3}
                fill="#3b82f6"
              />
            </g>
          )}
      </svg>
    </div>
  );
}