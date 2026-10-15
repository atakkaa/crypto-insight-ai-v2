// src/components/FormationProjectionModal.tsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// ==========================================================
// TİPLER
// ==========================================================

type ConditionItem = {
  label: string;
  met: boolean;
  current: string;
};

type FutureFormation = {
  name: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  probability: number;
  time_estimate: string;
  target: number | null;
  target_percent: number | null;
  conditions: ConditionItem[];
};

type NewsEffect = {
  count: number;
  sentiment: number;
  sentiment_label: string;
  items: Array<{
    title: string;
    source: string;
    sentiment: "pozitif" | "negatif" | "nötr";
    score: number;
  }>;
};

type ProjectionData = {
  success: boolean;
  market: string;
  symbol: string;
  interval: string;
  has_formation: boolean;
  message?: string;
  current_price?: number;
  formation?: {
    name: string;
    bias: "yükseliş" | "düşüş" | "nötr";
    quality: number;
    completion: number;
    support: number | null;
    resistance: number | null;
    target: number | null;
    invalidation: number | null;
  };
  scenarios?: {
    bull: { probability: number; target: number; target_percent: number; trigger: string };
    base: { probability: number; target: number; target_percent: number; trigger: string };
    bear: { probability: number; target: number; target_percent: number; trigger: string };
  };
  future_formations?: FutureFormation[];
  indicators?: {
    rsi: number;
    macd_histogram: number;
    volume_ratio: number;
    volume_trend: "up" | "down" | "stable";
    atr: number;
  };
  news_effect?: NewsEffect;
  similar_past?: {
    count: number;
    wins: number;
    losses: number;
    success_rate: number;
    avg_win: number;
    avg_loss: number;
  };
  reasoning?: string[];
};

// ==========================================================
// MODAL
// ==========================================================

export function FormationProjectionModal({
  market,
  symbol,
  interval,
  onClose,
}: {
  market: string;
  symbol: string;
  interval: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("market", market);
    params.set("symbol", symbol);
    params.set("interval", interval);

    fetch(`/api/formation-projection?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json.error ?? "Yüklenemedi");
        } else {
          setData(json);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Bağlantı hatası");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [market, symbol, interval]);

  // ESC ile kapat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // 🔒 Body scroll kilidi
  useEffect(() => {
    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  if (typeof document === "undefined") return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      style={{ touchAction: "none" }}
    >
      <div
        className="flex h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: "auto" }}
      >
        {/* BAŞLIK */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-secondary/30 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">
              🔮 Formasyon Gelecek Projeksiyonu
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {symbol} · {interval.toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-sm hover:bg-secondary"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* İÇERİK - SCROLL */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain p-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {loading && (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">Hesaplanıyor...</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-bold text-destructive">⚠️ {error}</p>
            </div>
          )}

          {data && !data.has_formation && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
              <p className="text-3xl">🔍</p>
              <p className="mt-2 text-sm font-bold text-amber-500">
                {data.message ?? "Formasyon tespit edilmedi"}
              </p>
              {data.indicators && (
                <div className="mt-3 flex justify-center gap-4 text-xs text-muted-foreground">
                  <span>RSI: {data.indicators.rsi}</span>
                  <span>Hacim: {data.indicators.volume_ratio}x</span>
                </div>
              )}
            </div>
          )}

          {data && data.has_formation && data.formation && (
            <div className="space-y-4">
              {/* 1. MEVCUT FORMASYON */}
              <div
                className={`rounded-lg border p-4 ${
                  data.formation.bias === "yükseliş"
                    ? "border-bull/40 bg-bull/5"
                    : data.formation.bias === "düşüş"
                      ? "border-bear/40 bg-bear/5"
                      : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Mevcut Formasyon
                    </p>
                    <p className="mt-0.5 text-base font-bold">
                      {data.formation.name}
                    </p>
                    <p className="mt-0.5 text-xs">
                      <span
                        className={
                          data.formation.bias === "yükseliş"
                            ? "font-bold text-bull"
                            : data.formation.bias === "düşüş"
                              ? "font-bold text-bear"
                              : "font-bold text-muted-foreground"
                        }
                      >
                        {data.formation.bias === "yükseliş"
                          ? "🟢 AL"
                          : data.formation.bias === "düşüş"
                            ? "🔴 SAT"
                            : "⚪ NÖTR"}
                      </span>
                      <span className="mx-2 text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        Kalite: {data.formation.quality}/100
                      </span>
                    </p>
                  </div>
                  <span
                    className={`num rounded-md px-3 py-1.5 text-sm font-bold ${
                      data.formation.bias === "yükseliş"
                        ? "bg-bull text-bull-foreground"
                        : data.formation.bias === "düşüş"
                          ? "bg-bear text-bear-foreground"
                          : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {data.current_price}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tamamlanma</span>
                    <span className="num font-bold">
                      {data.formation.completion}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full transition-all ${
                        data.formation.bias === "yükseliş"
                          ? "bg-bull"
                          : data.formation.bias === "düşüş"
                            ? "bg-bear"
                            : "bg-primary"
                      }`}
                      style={{ width: `${data.formation.completion}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. SENARYOLAR */}
              {data.scenarios && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    🎯 Kısa Vadeli Senaryolar
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ScenarioCard
                      type="bull"
                      probability={data.scenarios.bull.probability}
                      target={data.scenarios.bull.target}
                      targetPercent={data.scenarios.bull.target_percent}
                      trigger={data.scenarios.bull.trigger}
                    />
                    <ScenarioCard
                      type="base"
                      probability={data.scenarios.base.probability}
                      target={data.scenarios.base.target}
                      targetPercent={data.scenarios.base.target_percent}
                      trigger={data.scenarios.base.trigger}
                    />
                    <ScenarioCard
                      type="bear"
                      probability={data.scenarios.bear.probability}
                      target={data.scenarios.bear.target}
                      targetPercent={data.scenarios.bear.target_percent}
                      trigger={data.scenarios.bear.trigger}
                    />
                  </div>
                </div>
              )}

              {/* 3. FORMASYON DÖNÜŞÜM */}
              {data.future_formations && data.future_formations.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-purple-400">
                    🔄 Formasyon Dönüşüm Analizi
                  </p>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    Bu formasyonun ilerleyen günlerde dönüşebileceği formasyonlar
                  </p>
                  <div className="space-y-3">
                    {data.future_formations.map((ff) => (
                      <FutureFormationCard key={ff.name} formation={ff} />
                    ))}
                  </div>
                </div>
              )}

              {/* 4. GÖSTERGELER */}
              {data.indicators && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    📊 Göstergeler
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <IndicatorBox
                      label="RSI"
                      value={data.indicators.rsi.toString()}
                      color={
                        data.indicators.rsi >= 70
                          ? "text-bear"
                          : data.indicators.rsi <= 30
                            ? "text-bull"
                            : "text-foreground"
                      }
                    />
                    <IndicatorBox
                      label="MACD"
                      value={data.indicators.macd_histogram.toFixed(4)}
                      color={
                        data.indicators.macd_histogram > 0
                          ? "text-bull"
                          : "text-bear"
                      }
                    />
                    <IndicatorBox
                      label="Hacim"
                      value={`${data.indicators.volume_ratio}x`}
                      color={
                        data.indicators.volume_trend === "up"
                          ? "text-bull"
                          : data.indicators.volume_trend === "down"
                            ? "text-bear"
                            : "text-muted-foreground"
                      }
                    />
                    <IndicatorBox
                      label="ATR"
                      value={data.indicators.atr.toFixed(4)}
                      color="text-muted-foreground"
                    />
                  </div>
                </div>
              )}

              {/* 5. HABER ETKİSİ */}
              {data.news_effect && data.news_effect.count > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    📰 Haber Etkisi ({data.news_effect.count} haber, son 48 saat)
                  </p>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Toplam Sentiment
                      </span>
                      <span
                        className={`num text-sm font-bold ${
                          data.news_effect.sentiment > 15
                            ? "text-bull"
                            : data.news_effect.sentiment < -15
                              ? "text-bear"
                              : "text-muted-foreground"
                        }`}
                      >
                        {data.news_effect.sentiment >= 0 ? "+" : ""}
                        {data.news_effect.sentiment} (
                        {data.news_effect.sentiment_label})
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {data.news_effect.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 border-t border-border/50 pt-2 text-[11px] first:border-0 first:pt-0"
                        >
                          <span
                            className={`mt-0.5 ${
                              item.sentiment === "pozitif"
                                ? "text-bull"
                                : item.sentiment === "negatif"
                                  ? "text-bear"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {item.sentiment === "pozitif"
                              ? "🟢"
                              : item.sentiment === "negatif"
                                ? "🔴"
                                : "⚪"}
                          </span>
                          <div className="flex-1">
                            <p className="font-semibold">{item.title}</p>
                            <p className="text-muted-foreground">
                              {item.source} · Skor: {item.score >= 0 ? "+" : ""}
                              {item.score}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 6. BENZER GEÇMİŞ */}
              {data.similar_past && data.similar_past.count > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    📚 Benzer Geçmiş ({data.similar_past.count} kez, son 6 ay)
                  </p>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Başarı Oranı
                        </p>
                        <p
                          className={`num mt-1 text-base font-bold ${
                            data.similar_past.success_rate >= 60
                              ? "text-bull"
                              : data.similar_past.success_rate >= 40
                                ? "text-amber-500"
                                : "text-bear"
                          }`}
                        >
                          %{data.similar_past.success_rate}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Kazanç / Kayıp
                        </p>
                        <p className="num mt-1 text-base font-bold">
                          <span className="text-bull">
                            {data.similar_past.wins}W
                          </span>
                          <span className="mx-1 text-muted-foreground">/</span>
                          <span className="text-bear">
                            {data.similar_past.losses}L
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Ort. Kazanç
                        </p>
                        <p className="num mt-1 text-base font-bold text-bull">
                          +{data.similar_past.avg_win}%
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          Ort. Kayıp
                        </p>
                        <p className="num mt-1 text-base font-bold text-bear">
                          {data.similar_past.avg_loss}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 7. GEREKÇELER */}
              {data.reasoning && data.reasoning.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    💡 Analiz
                  </p>
                  <ul className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-xs">
                    {data.reasoning.map((r, i) => (
                      <li key={i} className="flex gap-2 text-muted-foreground">
                        <span>•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* UYARI */}
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[10px] text-amber-500">
                  ⚠️ Bu projeksiyon olasılık tahminidir. Yatırım tavsiyesi
                  değildir.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ALT BUTON — MOBİLDE KOLAY KAPATMA */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-secondary/30 p-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
          >
            ❌ Kapat
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ==========================================================
// FORMASYON DÖNÜŞÜM KARTI
// ==========================================================

function FutureFormationCard({ formation }: { formation: FutureFormation }) {
  const config = {
    yükseliş: {
      emoji: "🟢",
      borderCls: "border-bull/40",
      bgCls: "bg-bull/5",
      textCls: "text-bull",
    },
    düşüş: {
      emoji: "🔴",
      borderCls: "border-bear/40",
      bgCls: "bg-bear/5",
      textCls: "text-bear",
    },
    nötr: {
      emoji: "⚪",
      borderCls: "border-border",
      bgCls: "bg-card",
      textCls: "text-muted-foreground",
    },
  }[formation.bias];

  const metCount = formation.conditions.filter((c) => c.met).length;
  const totalCount = formation.conditions.length;
  const progress = Math.round((metCount / totalCount) * 100);

  return (
    <div className={`rounded-lg border ${config.borderCls} ${config.bgCls} p-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-bold ${config.textCls}`}>
            {config.emoji} {formation.name}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Süre: {formation.time_estimate}
            {formation.target && ` · Hedef: ${formation.target}`}
            {formation.target_percent !== null && (
              <span className={`ml-1 ${config.textCls}`}>
                ({formation.target_percent >= 0 ? "+" : ""}
                {formation.target_percent}%)
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="num text-lg font-bold">{formation.probability}%</p>
          <p className="text-[9px] text-muted-foreground">olasılık</p>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Koşullar</span>
          <span className="num font-bold">
            {metCount}/{totalCount} ({progress}%)
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full transition-all ${
              progress >= 75
                ? "bg-bull"
                : progress >= 50
                  ? "bg-amber-500"
                  : "bg-bear"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {formation.conditions.map((c, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md bg-background/50 p-2 text-[10px]"
          >
            <span className="mt-0.5">{c.met ? "✅" : "❌"}</span>
            <div className="flex-1">
              <p
                className={
                  c.met ? "text-foreground" : "text-muted-foreground"
                }
              >
                {c.label}
              </p>
              <p className="text-[9px] text-muted-foreground">
                Şu an: {c.current}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================================
// SENARYO KARTI
// ==========================================================

function ScenarioCard({
  type,
  probability,
  target,
  targetPercent,
  trigger,
}: {
  type: "bull" | "base" | "bear";
  probability: number;
  target: number;
  targetPercent: number;
  trigger: string;
}) {
  const config = {
    bull: {
      emoji: "🟢",
      label: "Bull Case",
      borderCls: "border-bull/40",
      bgCls: "bg-bull/5",
      textCls: "text-bull",
    },
    base: {
      emoji: "🟡",
      label: "Base Case",
      borderCls: "border-amber-500/40",
      bgCls: "bg-amber-500/5",
      textCls: "text-amber-500",
    },
    bear: {
      emoji: "🔴",
      label: "Bear Case",
      borderCls: "border-bear/40",
      bgCls: "bg-bear/5",
      textCls: "text-bear",
    },
  }[type];

  return (
    <div
      className={`rounded-lg border ${config.borderCls} ${config.bgCls} p-3`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold ${config.textCls}`}>
          {config.emoji} {config.label}
        </p>
        <span className="num text-sm font-bold">{probability}%</span>
      </div>

      <div className="mt-2">
        <p className="text-[10px] text-muted-foreground">Hedef</p>
        <p className="num text-sm font-bold">{target}</p>
        <p className={`num text-xs ${config.textCls}`}>
          {targetPercent >= 0 ? "+" : ""}
          {targetPercent}%
        </p>
      </div>

      <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
        {trigger}
      </p>
    </div>
  );
}

// ==========================================================
// GÖSTERGE KUTUSU
// ==========================================================

function IndicatorBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`num mt-1 text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}