import { NotificationDetailModal } from "@/components/NotificationDetailModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  clearAllNotifications,
  subscribeToNotifications,
  formatNotificationTitle,
  severityEmoji,
  severityColorClass,
  type Notification,
} from "@/lib/notifications";
import { filterNotificationWithYolo } from "@/lib/notification-yolo-filter";

type Props = {
  onOpenSymbol: (market: string, symbol: string) => void;
};

// =====================================================
// KAR/ZARAR PROJEKSİYONU — YARDIMCILAR
// =====================================================
function parseTargetInfo(targetStr: string | null | undefined): { percent: number } | null {
  if (!targetStr) return null;
  const match = targetStr.match(/\(([+-]?[\d.]+)%\)/);
  if (!match || !match[1]) return null;
  return { percent: parseFloat(match[1]) };
}

function parseStopInfo(stopStr: string | null | undefined): { percent: number } | null {
  if (!stopStr) return null;
  const match = stopStr.match(/\(([+-]?[\d.]+)%\)/);
  if (!match || !match[1]) return null;
  return { percent: parseFloat(match[1]) };
}

// SAT sinyali mi kontrol et (başlık, mesaj veya data)
function isSellSignal(n: Notification): boolean {
  const data = n.data as Record<string, unknown> | undefined;
  const direction = data && typeof data["direction"] === "string" ? data["direction"] : "";
  
  // Mesajda "SAT" var mı?
  if (typeof n.message === "string" && n.message.includes("SAT")) return true;
  // Başlıkta "SAT" var mı?
  if (typeof n.title === "string" && n.title.includes("SAT")) return true;
  // Data'da direction bearish mi?
  if (direction === "bearish") return true;
  
  return false;
}

export function NotificationBell({ onOpenSymbol }: Props) {
  const { user } = useAuth();
  const confirm = useConfirm();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [detailNotification, setDetailNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // --- 1. İlk yüklemede geçmiş bildirimleri çek ---
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    void fetchNotifications(user.id, 100).then((data) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [user]);

  // --- 2. Realtime: yeni bildirim gelince YOLO ile filtrele ---
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToNotifications(user.id, (n) => {
      const data = n.data as Record<string, unknown> | undefined;
      const motorPatternName =
        (data && typeof data["pattern"] === "string" ? (data["pattern"] as string) : "") ||
        (data && typeof data["pattern_name"] === "string" ? (data["pattern_name"] as string) : "") ||
        (typeof n.title === "string" ? n.title : "") ||
        "";

      void (async () => {
        let yoloAllowed = true;

        if (motorPatternName) {
          const result = await filterNotificationWithYolo(motorPatternName);
          yoloAllowed = result.allowed;

          if (!yoloAllowed) {
            console.log(
              `🤖 YOLO reddetti: ${motorPatternName} (${result.reason}) — bildirim gösterilmedi`,
            );
            return;
          }
        }

        setNotifications((prev) => {
          if (prev.some((x) => x.id === n.id)) return prev;
          return [n, ...prev].slice(0, 100);
        });

        const title = formatNotificationTitle(n);
        if (n.priority) {
          toast.warning(title, { description: n.message.slice(0, 150) });
        } else {
          toast.info(title, { description: n.message.slice(0, 150) });
        }

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          window.Notification.permission === "granted"
        ) {
          new window.Notification(title, {
            body: n.message.slice(0, 200),
            tag: n.event_key ?? n.id,
          });
        }
      })();
    });

    return unsubscribe;
  }, [user]);

  // --- 3. Panel dışına tıklanınca kapat ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- 4. Okunmamış sayı ---
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  // --- 5. Bildirime tıklama ---
  async function handleNotificationClick(n: Notification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
    }
    setDetailNotification(n);
  }

  // --- 6. Tümünü okundu işaretle ---
  async function handleMarkAllRead() {
    if (!user) return;
    await markAllNotificationsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Tüm bildirimler okundu olarak işaretlendi.");
  }

  // --- 7. Tümünü temizle ---
  async function handleClearAll() {
    if (!user) return;

    // ✅ YENİ: Custom confirm modal
    const ok = await confirm({
      title: "Tüm Bildirimleri Temizle",
      message:
        "Tüm bildirimleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      confirmText: "Hepsini Sil",
      cancelText: "Vazgeç",
      variant: "destructive",
    });
    if (!ok) return;

    await clearAllNotifications(user.id);
    setNotifications([]);
    toast.success("Tüm bildirimler temizlendi.");
  }

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`relative rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
            unreadCount > 0
              ? "border-primary/50 text-primary"
              : "border-border text-muted-foreground hover:bg-secondary"
          }`}
          title="Bildirimler"
          aria-label="Bildirimler"
        >
          🔔
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="fixed inset-x-2 top-16 z-[90] max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-[420px]">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div>
                <h3 className="text-sm font-bold">🔔 BİLDİRİMLER</h3>
                <p className="text-[10px] text-muted-foreground">
                  {unreadCount > 0 ? `${unreadCount} okunmamış` : "Tümü okundu"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                ✕
              </button>
            </div>

            {notifications.length > 0 && (
              <div className="flex gap-2 border-b border-border p-2">
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="flex-1 rounded-md border border-border px-2 py-1.5 text-[10px] font-bold hover:bg-secondary"
                >
                  TÜMÜNÜ OKUNDU İŞARETLE
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearAll()}
                  className="flex-1 rounded-md border border-destructive/30 px-2 py-1.5 text-[10px] font-bold text-destructive hover:bg-destructive/10"
                >
                  TEMİZLE
                </button>
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Bildirimler yükleniyor...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Henüz bildiriminiz yok.
                  <br />
                  <span className="text-[10px]">
                    Öncelikli varlıklarınız taranıyor. Önemli gelişmeler burada
                    görünecek.
                  </span>
                </div>
              ) : (
                notifications.map((n) => {
                  const targetInfo = parseTargetInfo(n.ai_target);
                  const stopInfo = parseStopInfo(n.ai_stop_loss);
                  const isSell = isSellSignal(n);

                  // SAT sinyali için yön ters
                  const targetReturn = isSell
                    ? -(targetInfo?.percent ?? 0)
                    : targetInfo?.percent ?? 0;
                  const stopReturn = isSell
                    ? -(stopInfo?.percent ?? 0)
                    : stopInfo?.percent ?? 0;

                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void handleNotificationClick(n)}
                      className={`w-full border-b border-border p-3 text-left transition-colors hover:bg-secondary/60 ${
                        !n.read ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {n.priority && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">
                              ⭐ ÖNCELİKLİ
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${severityColorClass(
                              n.severity,
                            )}`}
                          >
                            {severityEmoji(n.severity)}{" "}
                            {n.severity === "kritik"
                              ? "KRİTİK"
                              : n.severity === "önemli"
                                ? "ÖNEMLİ"
                                : "DİKKAT"}
                          </span>
                          <span className="num text-xs font-bold">
                            {n.symbol.replace(/\.(IS|US)$/, "").replace(/USDT$/, "")}
                          </span>
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(n.created_at).toLocaleString("tr-TR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                          {!n.read && (
                            <span className="ml-2 font-bold text-primary">• YENİ</span>
                          )}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-bold">{n.title}</p>

                      {/* FORMASYON KALİTE PUANI */}
                      {n.quality_score != null && n.quality_score > 0 && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            Formasyon Kalitesi:
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              n.quality_score >= 85
                                ? "bg-emerald-500/15 text-emerald-500"
                                : n.quality_score >= 75
                                  ? "bg-blue-500/15 text-blue-400"
                                  : n.quality_score >= 70
                                    ? "bg-amber-500/15 text-amber-500"
                                    : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            %{n.quality_score}
                          </span>
                        </div>
                      )}

                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                        {n.message.slice(0, 200)}
                        {n.message.length > 200 ? "..." : ""}
                      </p>

                      {n.reason && (
                        <p className="mt-1 text-[10px] italic leading-4 text-muted-foreground/80">
                          {n.reason.slice(0, 150)}
                          {n.reason.length > 150 ? "..." : ""}
                        </p>
                      )}

                      {/* GİRİŞ / HEDEF / STOP / R/R */}
                      {(n.ai_entry_zone || n.ai_target || n.ai_stop_loss || n.ai_risk_reward) && (
                        <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-border/60 bg-secondary/30 p-2 text-[10px]">
                          {n.ai_entry_zone && (
                            <div className="flex items-center gap-1">
                              <span>💰</span>
                              <span className="text-muted-foreground">Giriş:</span>
                              <span className="num font-bold">{n.ai_entry_zone}</span>
                            </div>
                          )}
                          {n.ai_target && (
                            <div className="flex items-center gap-1">
                              <span>🎯</span>
                              <span className="text-muted-foreground">Hedef:</span>
                              <span className="num font-bold text-bull">{n.ai_target}</span>
                            </div>
                          )}
                          {n.ai_stop_loss && (
                            <div className="flex items-center gap-1">
                              <span>🛑</span>
                              <span className="text-muted-foreground">Stop:</span>
                              <span className="num font-bold text-bear">{n.ai_stop_loss}</span>
                            </div>
                          )}
                          {n.ai_risk_reward && (
                            <div className="flex items-center gap-1">
                              <span>⚖️</span>
                              <span className="text-muted-foreground">R/R:</span>
                              <span className="num font-bold">{n.ai_risk_reward}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* KAR/ZARAR PROJEKSİYONU ($100) */}
                      {(targetInfo || stopInfo) && (
                        <div className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[10px]">
                          <p className="text-[9px] font-bold text-emerald-400 mb-1">
                            💰 $100 YATIRIM İÇİN PROJEKSİYON{" "}
                            {isSell ? "(KISA)" : "(UZUN)"}
                          </p>
                          <div className="space-y-0.5">
                            {targetInfo && (
                              <div
                                className={`flex justify-between ${
                                  targetReturn >= 0 ? "text-bull" : "text-bear"
                                }`}
                              >
                                <span>🎯 Hedef gerçekleşirse:</span>
                                <span className="font-bold">
                                  ${(100 + targetReturn).toFixed(2)} (
                                  {targetReturn >= 0 ? "+" : ""}
                                  {targetReturn.toFixed(2)}%)
                                </span>
                              </div>
                            )}
                            {stopInfo && (
                              <div
                                className={`flex justify-between ${
                                  stopReturn >= 0 ? "text-bull" : "text-bear"
                                }`}
                              >
                                <span>🛑 Stop olursa:</span>
                                <span className="font-bold">
                                  ${(100 + stopReturn).toFixed(2)} (
                                  {stopReturn >= 0 ? "+" : ""}
                                  {stopReturn.toFixed(2)}%)
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="mt-1.5 text-[8px] italic text-muted-foreground/70 border-t border-emerald-500/20 pt-1">
                            ⚠️ Yatırım tavsiyesi değildir. Geçmiş performans gelecek
                            performansı garanti etmez.
                          </p>
                        </div>
                      )}

                      {(n.ai_support || n.ai_resistance) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-secondary/20 px-2 py-1 text-[10px]">
                          <span>📊</span>
                          {n.ai_resistance && (
                            <span className="text-bear">
                              Direnç:{" "}
                              <span className="num font-bold">{n.ai_resistance}</span>
                            </span>
                          )}
                          {n.ai_support && (
                            <span className="text-bull">
                              Destek:{" "}
                              <span className="num font-bold">{n.ai_support}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {n.fear_greed != null && (
                        <div className="mt-1 flex items-center gap-2 rounded-md border border-border/60 bg-secondary/20 px-2 py-1 text-[10px]">
                          <span>😱</span>
                          <span className="text-muted-foreground">Piyasa:</span>
                          <span className="num font-bold">
                            {n.fear_greed}{" "}
                            {n.fear_greed <= 24
                              ? "(Aşırı Korku)"
                              : n.fear_greed <= 44
                                ? "(Korku)"
                                : n.fear_greed <= 55
                                  ? "(Nötr)"
                                  : n.fear_greed <= 74
                                    ? "(Açgözlülük)"
                                    : "(Aşırı Açgözlülük)"}
                          </span>
                        </div>
                      )}

                      <p className="mt-2 text-[9px] font-bold text-primary">
                        👁️ Detay için tıkla →
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <NotificationDetailModal
        notification={detailNotification}
        onClose={() => setDetailNotification(null)}
        onOpenSymbol={onOpenSymbol}
      />
    </>
  );
}