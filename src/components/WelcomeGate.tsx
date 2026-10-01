import { Link } from "@tanstack/react-router";
import { MarketTicker } from "./MarketTicker";

/**
 * Candlestick silüeti — arka planda soluk mum grafiği çizer.
 * Statik SVG, çok performanslı.
 */
function CandleSilhouette() {
  // Sabit mumlar (yükseklik ve renk önceden belirlenmiş)
  const candles = [
    { x: 20, open: 60, close: 20, high: 10, low: 75, up: true },
    { x: 60, open: 30, close: 55, high: 20, low: 65, up: false },
    { x: 100, open: 55, close: 25, high: 15, low: 70, up: true },
    { x: 140, open: 25, close: 45, high: 15, low: 60, up: false },
    { x: 180, open: 45, close: 15, high: 5, low: 55, up: true },
    { x: 220, open: 15, close: 40, high: 10, low: 55, up: false },
    { x: 260, open: 40, close: 20, high: 15, low: 50, up: true },
    { x: 300, open: 20, close: 50, high: 10, low: 60, up: false },
    { x: 340, open: 50, close: 30, high: 20, low: 65, up: true },
    { x: 380, open: 30, close: 55, high: 15, low: 70, up: false },
    { x: 420, open: 55, close: 35, high: 20, low: 75, up: true },
    { x: 460, open: 35, close: 60, high: 25, low: 80, up: false },
    { x: 500, open: 60, close: 40, high: 30, low: 85, up: true },
    { x: 540, open: 40, close: 65, high: 25, low: 90, up: false },
    { x: 580, open: 65, close: 45, high: 35, low: 95, up: true },
  ];

  return (
    <svg
      className="welcome-candle-silhouette"
      viewBox="0 0 620 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {candles.map((c, i) => {
        const bodyTop = Math.min(c.open, c.close);
        const bodyHeight = Math.abs(c.close - c.open);
        return (
          <g key={i} opacity="0.5">
            {/* Fitil (wick) */}
            <line
              x1={c.x + 8}
              y1={c.high}
              x2={c.x + 8}
              y2={c.low}
              stroke={c.up ? "oklch(0.72 0.17 152)" : "oklch(0.63 0.2 22)"}
              strokeWidth="1"
            />
            {/* Gövde (body) */}
            <rect
              x={c.x}
              y={bodyTop}
              width="16"
              height={Math.max(bodyHeight, 2)}
              fill={c.up ? "oklch(0.72 0.17 152)" : "oklch(0.63 0.2 22)"}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function WelcomeGate() {
  return (
    <div className="welcome-gate">
      {/* Üstte kayan ticker */}
      <MarketTicker />

      {/* Orta alan */}
      <div className="welcome-center">
        {/* Arka planda candlestick silüeti */}
        <div className="welcome-bg">
          <CandleSilhouette />
        </div>

        {/* Grid deseni (CSS ile) */}
        <div className="welcome-grid" aria-hidden="true" />

        {/* Ana içerik */}
        <div className="welcome-content">
          <h1 className="welcome-title">
            Formasyon AI
          </h1>

          <p className="welcome-subtitle">
            Kripto ve borsa analizinde
            <br />
            yapay zeka çağı.
          </p>

          <div className="welcome-buttons">
            <Link to="/auth" className="welcome-btn welcome-btn-secondary">
              🔐 Giriş Yap
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              className="welcome-btn welcome-btn-primary"
            >
              ✨ Ücretsiz Kayıt Ol
            </Link>
          </div>
        </div>

        {/* Alt yasal uyarı (kayarak gelir) */}
        <div className="welcome-disclaimer">
          ⚠️ Bu platformdaki analiz, sinyal ve yorumlar{" "}
          <strong>yatırım tavsiyesi değildir</strong>. Kripto ve hisse
          yatırımları yüksek risk içerir. Tüm alım-satım kararları ve
          sonuçları <strong>kullanıcıya aittir</strong>. Formasyon AI,
          oluşabilecek zararlardan sorumlu tutulamaz.
        </div>
      </div>
    </div>
  );
}