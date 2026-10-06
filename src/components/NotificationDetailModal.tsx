import { useEffect } from "react";

import type { Notification } from "@/lib/notifications";

type Props = {
  notification: Notification | null;
  onClose: () => void;
  onOpenSymbol?: (market: string, symbol: string) => void;
};

export function NotificationDetailModal({
  notification,
  onClose,
  onOpenSymbol,
}: Props) {
  // ESC tuşuna basınca kapat
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

  // Aksiyon emojisi
  const actionEmoji =
    n.ai_action === "AL"
      ? "🟢"
      : n.ai_action === "SAT"
        ? "🔴"
        : n.ai_action === "BEKLE"
          ? "🟡"
          : "⚪";

  // Severity rengi
  const severityColor =
    n.severity === "kritik"
      ? "text-bear"
      : n.severity === "önemli"
        ? "text-warn"
        : "text-muted-foreground";

  // Tier etiketi
  const typeLabel = n.is_global
    ? "🌍 GLOBAL"
    : n.priority
      ? "⭐ ÖNCELİKLİ"
      : "📢 FAVORİ";

  // Fear & Greed yorumu
  const fearGreedLabel = (() => {
    const v = n.fear_greed;
    if (v == null) return null;
    if (v <= 24) return "😱 Aşırı Korku";
    if (v <= 44) return "😰 Korku";
    if (v <= 55) return "😐 Nötr";
    if (v <= 74) return "🤑 Açgözlülük";
    return "🚀 Aşırı Açgözlülük";
  })();

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
              <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                {typeLabel}
              </span>
              <span className={`rounded bg-secondary px-2 py-0.5 text-[10px] font-bold ${severityColor}`}>
                {n.severity === "kritik"
                  ? "🔴 KRİTİK"
                  : n.severity === "önemli"
                    ? "🟠 ÖNEMLİ"
                    : "🟡 DİKKAT"}
              </span>
              {n.signal_score != null && (
                <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold">
                  Skor: {n.signal_score}/100
                </span>
              )}
            </div>
            <h2 className="num mt-2 text-lg font-bold">
              {n.symbol.replace(/USDT$/, "").replace(/\.(IS|US)$/, "")}
            </h2>
            <p className={`mt-1 text-xs font-semibold ${severityColor}`}>
              {actionEmoji} {n.ai_action ?? "İZLE"} · {n.title}
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
          {/* AI ÖZET */}
          {n.ai_summary && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                💬 AI Yorumu
              </p>
              <p className="mt-2 text-sm leading-6">{n.ai_summary}</p>
            </section>
          )}

          {/* POZİSYON */}
          {(n.ai_entry_zone || n.ai_target || n.ai_stop_loss || n.ai_risk_reward) && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                🎯 Pozisyon Önerisi
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                {n.ai_entry_zone && (
                  <div className="flex items-center gap-1.5 rounded border border-border/60 bg-secondary/30 p-2">
                    <span>💰</span>
                    <div>
                      <p className="text-[9px] text-muted-foreground">Giriş</p>
                      <p className="num font-bold">{n.ai_entry_zone}</p>
                    </div>
                  </div>
                )}
                {n.ai_target && (
                  <div className="flex items-center gap-1.5 rounded border border-border/60 bg-secondary/30 p-2">
                    <span>🎯</span>
                    <div>
                      <p className="text-[9px] text-muted-foreground">Hedef</p>
                      <p className="num font-bold text-bull">{n.ai_target}</p>
                    </div>
                  </div>
                )}
                {n.ai_stop_loss && (
                  <div className="flex items-center gap-1.5 rounded border border-border/60 bg-secondary/30 p-2">
                    <span>🛑</span>
                    <div>
                      <p className="text-[9px] text-muted-foreground">Stop</p>
                      <p className="num font-bold text-bear">{n.ai_stop_loss}</p>
                    </div>
                  </div>
                )}
                {n.ai_risk_reward && (
                  <div className="flex items-center gap-1.5 rounded border border-border/60 bg-secondary/30 p-2">
                    <span>⚖️</span>
                    <div>
                      <p className="text-[9px] text-muted-foreground">R/R</p>
                      <p className="num font-bold">{n.ai_risk_reward}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* S/R */}
          {(n.ai_support || n.ai_resistance) && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                📊 Destek / Direnç
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {n.ai_resistance && (
                  <span className="rounded border border-bear/30 bg-bear/10 px-2 py-1 text-bear">
                    Direnç: <span className="num font-bold">{n.ai_resistance}</span>
                  </span>
                )}
                {n.ai_support && (
                  <span className="rounded border border-bull/30 bg-bull/10 px-2 py-1 text-bull">
                    Destek: <span className="num font-bold">{n.ai_support}</span>
                  </span>
                )}
              </div>
            </section>
          )}

          {/* TIMEFRAME */}
          {n.data && typeof n.data === "object" && (n.data as any).timeframe && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                📊 Zaman Dilimi Uyumu
              </p>
              <div className="mt-2 space-y-1 text-xs">
                {["h1", "h4", "d1"].map((tf) => {
                  const dir = (n.data as any).timeframe[tf];
                  const emoji = dir === "bullish" ? "🟢" : dir === "bearish" ? "🔴" : "⚪";
                  const label = tf === "h1" ? "1 saat" : tf === "h4" ? "4 saat" : "1 gün";
                  return (
                    <div key={tf} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span>{emoji} {dir}</span>
                    </div>
                  );
                })}
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

          {/* HABERLER */}
          {n.news_items && Array.isArray(n.news_items) && n.news_items.length > 0 && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                📰 Haberler ({n.news_items.length})
              </p>
              <div className="mt-2 space-y-2">
                {(n.news_items as any[]).slice(0, 5).map((news: any, i: number) => (
                  <div
                    key={i}
                    className="rounded border border-border/60 bg-secondary/20 p-2 text-xs"
                  >
                    <p className="font-semibold leading-5">{news.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{news.source}</span>
                      {news.sentiment && (
                        <span
                          className={
                            news.sentiment === "pozitif"
                              ? "text-bull"
                              : news.sentiment === "negatif"
                                ? "text-bear"
                                : ""
                          }
                        >
                          {news.sentiment} ({news.sentimentScore})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FORMATION + INDICATOR DETAY */}
          {n.data && typeof n.data === "object" && (
            <section className="rounded-lg border border-border bg-background/50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                🔍 Teknik Detaylar
              </p>
              {(n.data as any).patterns?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground">Formasyonlar</p>
                  <p className="text-xs">
                    {(n.data as any).patterns.map((p: any) => `${p.name} (%${p.confidence})`).join(", ")}
                  </p>
                </div>
              )}
              {(n.data as any).indicators?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground">İndikatörler</p>
                  <p className="text-xs">
                    {(n.data as any).indicators
                      .map((i: any) => `${i.name}: ${i.value} (${i.direction})`)
                      .join(", ")}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* REASON */}
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