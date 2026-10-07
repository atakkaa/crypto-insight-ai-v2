import { useEffect } from "react";

import type { ShortTermNotification } from "@/lib/notifications";

type Props = {
  notification: ShortTermNotification | null;
  onClose: () => void;
  onOpenSymbol?: (market: string, symbol: string) => void;
};

export function ShortTermNotificationDetailModal({
  notification,
  onClose,
  onOpenSymbol,
}: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (notification) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
    return undefined;
  }, [notification, onClose]);

  if (!notification) return null;

  const n = notification;

  const biasEmoji = n.pattern_bias === "yükseliş" ? "🟢" : n.pattern_bias === "düşüş" ? "🔴" : "⚪";
  const biasColor = n.pattern_bias === "yükseliş" ? "text-bull" : n.pattern_bias === "düşüş" ? "text-bear" : "text-muted-foreground";
  const biasLabel = n.pattern_bias === "yükseliş" ? "YÜKSELİŞ" : n.pattern_bias === "düşüş" ? "DÜŞÜŞ" : "NÖTR";
  const isMulti = n.timeframe === "multi";
  const tfLabel = n.timeframe ? n.timeframe.toUpperCase() : "1H";

  const fearGreedLabel = (() => {
    const v = n.fear_greed;
    if (v == null) return null;
    if (v <= 24) return "😱 Aşırı Korku";
    if (v <= 44) return "😰 Korku";
    if (v <= 55) return "😐 Nötr";
    if (v <= 74) return "🤑 Açgözlülük";
    return "🚀 Aşırı Açgözlülük";
  })();

  const reasonLower = (n.reason ?? "").toLowerCase();
  const rsiMatch = reasonLower.match(/rsi[:\s]+([\d.]+)/);
  const macdMatch = reasonLower.match(/macd[:\s]+([-\d.]+)/);
  const volumeMatch = reasonLower.match(/hacim[:\s]+%?([\d.]+)/);

  const rsiValue = rsiMatch?.[1];
  const macdValue = macdMatch?.[1];
  const volumeValue = volumeMatch?.[1];

  const riskPercent =
    n.entry != null && n.stop != null && n.entry !== 0
      ? ((n.stop - n.entry) / n.entry) * 100
      : null;
  const rewardPercent =
    n.entry != null && n.target != null && n.entry !== 0
      ? ((n.target - n.entry) / n.entry) * 100
      : null;
  const riskReward =
    riskPercent != null && rewardPercent != null && riskPercent !== 0
      ? Math.abs(rewardPercent / riskPercent)
      : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* BAŞLIK */}
        <div className="flex items-start justify-between gap-3 border-b border-border bg-secondary/30 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                isMulti
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-amber-500/15 text-amber-500"
              }`}>
                {isMulti ? "🔀 ÇOKLU ZAMAN DİLİMİ" : `📉 KISA VADELİ (${tfLabel})`}
              </span>
              <span className={`rounded bg-secondary px-2 py-0.5 text-[10px] font-bold ${biasColor}`}>
                {biasEmoji} {biasLabel}
              </span>
              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold">
                Güven: %{n.confidence}
              </span>
            </div>
            <h2 className="num mt-2 text-lg font-bold">
              {n.symbol.replace(/USDT$/, "").replace(/\.(IS|US)$/, "")}
            </h2>
            <p className={`mt-1 text-xs font-semibold ${biasColor}`}>
              {biasEmoji} {n.pattern_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* İÇERİK */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {/* ÇOKLU ZAMAN DİLİMİ KARŞILAŞTIRMASI */}
          {n.multi_tf_commentary && (
            <section className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                🔀 Çoklu Zaman Dilimi Karşılaştırması
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground/90 font-sans">
                {n.multi_tf_commentary}
              </pre>
            </section>
          )}

          {/* FORMASYON ÖZET */}
          <section className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              🎯 Formasyon Detayı
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border/60 bg-secondary/30 p-2">
                <p className="text-[9px] text-muted-foreground">Formasyon</p>
                <p className="font-bold">{n.pattern_name}</p>
              </div>
              <div className="rounded border border-border/60 bg-secondary/30 p-2">
                <p className="text-[9px] text-muted-foreground">Yön</p>
                <p className={`font-bold ${biasColor}`}>{biasEmoji} {n.pattern_bias}</p>
              </div>
              <div className="rounded border border-border/60 bg-secondary/30 p-2">
                <p className="text-[9px] text-muted-foreground">Güven Skoru</p>
                <p className="font-bold">%{n.confidence}</p>
              </div>
              <div className="rounded border border-border/60 bg-secondary/30 p-2">
                <p className="text-[9px] text-muted-foreground">Sinyal Skoru</p>
                <p className="font-bold">{n.signal_score}/100</p>
              </div>
            </div>
          </section>

          {/* POZİSYON */}
          {(n.entry != null || n.target != null || n.stop != null) && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                💰 Pozisyon Önerisi
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {n.entry != null && (
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-[9px] text-muted-foreground">Giriş</p>
                    <p className="num font-bold">{n.entry.toFixed(4)}</p>
                  </div>
                )}
                {n.target != null && (
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-[9px] text-muted-foreground">Hedef</p>
                    <p className="num font-bold text-bull">{n.target.toFixed(4)}</p>
                    {rewardPercent != null && (
                      <p className="text-[9px] text-bull">
                        +{rewardPercent.toFixed(2)}%
                      </p>
                    )}
                  </div>
                )}
                {n.stop != null && (
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-[9px] text-muted-foreground">Stop</p>
                    <p className="num font-bold text-bear">{n.stop.toFixed(4)}</p>
                    {riskPercent != null && (
                      <p className="text-[9px] text-bear">
                        {riskPercent.toFixed(2)}%
                      </p>
                    )}
                  </div>
                )}
              </div>
              {riskReward != null && (
                <div className="mt-2 rounded border border-border/60 bg-secondary/20 p-2 text-xs">
                  <span className="text-muted-foreground">Risk/Ödül: </span>
                  <span className="font-bold">1:{riskReward.toFixed(2)}</span>
                </div>
              )}
            </section>
          )}

          {/* İNDİKATÖRLER */}
          {(rsiValue || macdValue || volumeValue) && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                📊 Teknik İndikatörler
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {rsiValue && (
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-[9px] text-muted-foreground">RSI</p>
                    <p className="num font-bold">{rsiValue}</p>
                  </div>
                )}
                {macdValue && (
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-[9px] text-muted-foreground">MACD</p>
                    <p className="num font-bold">{macdValue}</p>
                  </div>
                )}
                {volumeValue && (
                  <div className="rounded border border-border/60 bg-secondary/30 p-2">
                    <p className="text-[9px] text-muted-foreground">Hacim</p>
                    <p className="num font-bold">{volumeValue}%</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* FEAR & GREED */}
          {n.fear_greed != null && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                😱 Piyasa Duyarlılığı
              </p>
              <p className="mt-2 text-xs">
                Fear & Greed: <span className="num font-bold">{n.fear_greed}</span>{" "}
                {fearGreedLabel && <span>({fearGreedLabel})</span>}
              </p>
            </section>
          )}

          {/* GEREKÇE */}
          {n.reason && (
            <section className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                📝 Sinyal Gerekçesi
              </p>
              <p className="mt-2 text-xs italic leading-5">{n.reason}</p>
            </section>
          )}

          {/* TARİH */}
          <p className="text-center text-[10px] text-muted-foreground">
            {new Date(n.created_at).toLocaleString("tr-TR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* AKSIYONLAR */}
        <div className="flex items-center gap-2 border-t border-border bg-secondary/30 p-3">
          {onOpenSymbol && (
            <button
              type="button"
              onClick={() => {
                onOpenSymbol(n.market, n.symbol);
                onClose();
              }}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              🚀 Coin Detayına Git
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary"
          >
            ❌ Kapat
          </button>
        </div>
      </div>
    </div>
  );
}