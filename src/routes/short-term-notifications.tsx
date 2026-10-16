import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ShortTermNotificationDetailModal } from "@/components/ShortTermNotificationDetailModal";
import { MobileNav } from "@/components/MobileNav";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/hooks/useConfirm";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
  fetchShortTermNotifications,
  markAllShortTermNotificationsRead,
  markShortTermNotificationRead,
  clearAllShortTermNotifications,
  subscribeToShortTermNotifications,
  type ShortTermNotification,
} from "@/lib/notifications";

export const Route = createFileRoute("/short-term-notifications")({
  head: () => ({
    meta: [{ title: "Kısa Vadeli Bildirimler — AE Analiz" }],
  }),
  component: ShortTermNotificationsPage,
});

function ShortTermNotificationsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const confirm = useConfirm();

  const [notifications, setNotifications] = useState<ShortTermNotification[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [biasFilter, setBiasFilter] = useState<"all" | "yükseliş" | "düşüş">(
    "all",
  );
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7days">(
    "all",
  );
  const [timeframeFilter, setTimeframeFilter] = useState<
    "all" | "15m" | "1h" | "4h" | "1d"
  >("all");
  const [detailNotification, setDetailNotification] =
    useState<ShortTermNotification | null>(null);

  // 1. İlk yüklemede bildirimleri çek
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchShortTermNotifications(user.id, 500).then((data) => {
      setNotifications(data);
      setLoading(false);
    });
  }, [user, authLoading]);

  // 2. Realtime: yeni bildirim gelince state'e ekle
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToShortTermNotifications(user.id, (n) => {
      setNotifications((prev) => {
        if (prev.some((x) => x.id === n.id)) return prev;
        return [n, ...prev];
      });
    });

    return unsubscribe;
  }, [user]);

  // ✅ YENİ: Pull-to-refresh
  const pullToRefresh = usePullToRefresh({
    threshold: 80,
    enabled: Boolean(user),
    onRefresh: async () => {
      if (!user) return;
      const data = await fetchShortTermNotifications(user.id, 500);
      setNotifications(data);
      toast.success("Yenilendi");
    },
  });

  // 3. Filtreleme
  const filtered = useMemo(() => {
    let list = notifications;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.symbol.toLowerCase().includes(q) ||
          n.pattern_name.toLowerCase().includes(q),
      );
    }

    if (biasFilter !== "all") {
      list = list.filter((n) => n.pattern_bias === biasFilter);
    }

    if (timeframeFilter !== "all") {
      list = list.filter((n) => n.timeframe === timeframeFilter);
    }

    if (dateFilter === "today") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      list = list.filter(
        (n) => new Date(n.created_at).getTime() >= startOfDay.getTime(),
      );
    } else if (dateFilter === "7days") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(
        (n) => new Date(n.created_at).getTime() >= sevenDaysAgo,
      );
    }

    return list;
  }, [notifications, search, biasFilter, dateFilter, timeframeFilter]);

  // 4. İstatistikler
  const stats = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter((n) => !n.read).length;
    const bullish = notifications.filter(
      (n) => n.pattern_bias === "yükseliş",
    ).length;
    const bearish = notifications.filter(
      (n) => n.pattern_bias === "düşüş",
    ).length;
    const tf15m = notifications.filter((n) => n.timeframe === "15m").length;
    const tf1h = notifications.filter((n) => n.timeframe === "1h").length;
    const tf4h = notifications.filter((n) => n.timeframe === "4h").length;
    const tf1d = notifications.filter((n) => n.timeframe === "1d").length;
    return { total, unread, bullish, bearish, tf15m, tf1h, tf4h, tf1d };
  }, [notifications]);

  // 5. Bildirime tıklama
  async function handleNotificationClick(n: ShortTermNotification) {
    if (!n.read) {
      await markShortTermNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
    }
    setDetailNotification(n);
  }

  // 6. Tümünü okundu işaretle
  async function handleMarkAllRead() {
    if (!user) return;
    await markAllShortTermNotificationsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("Tüm kısa vadeli bildirimler okundu olarak işaretlendi.");
  }

  // 7. Tümünü temizle
  async function handleClearAll() {
    if (!user) return;

    const ok = await confirm({
      title: "Tüm Bildirimleri Temizle",
      message:
        "Tüm kısa vadeli bildirimleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      confirmText: "Hepsini Sil",
      cancelText: "Vazgeç",
      variant: "destructive",
    });
    if (!ok) return;

    await clearAllShortTermNotifications(user.id);
    setNotifications([]);
    toast.success("Tüm kısa vadeli bildirimler temizlendi.");
  }

  // 8. Auth loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  // 9. Giriş yok
  if (!user) {
    return (
      <div className="min-h-screen pb-24 lg:pb-0">
        <div className="lg:hidden">
          <MobileNav onOpenSymbol={() => {}} />
        </div>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="panel max-w-md p-6 text-center">
            <p className="text-3xl">🔒</p>
            <h1 className="mt-3 text-lg font-bold">Giriş Yapmanız Gerekiyor</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kısa vadeli bildirimleri görmek için giriş yapın.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Giriş Yap
            </Link>
            <Link
              to="/"
              className="mt-2 block text-xs text-muted-foreground hover:text-foreground"
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      {/* ✅ YENİ: Pull-to-refresh göstergesi (mobilde) */}
      <div className="lg:hidden">
        <PullToRefreshIndicator
          pullDistance={pullToRefresh.pullDistance}
          isPulling={pullToRefresh.isPulling}
          isRefreshing={pullToRefresh.isRefreshing}
        />
      </div>

      {/* ========== MOBİL HEADER ========== */}
      <div className="lg:hidden">
        <MobileNav
          onOpenSymbol={(m, s) => {
            void navigate({
              to: "/",
              search: { m: m as any, s } as any,
            });
          }}
        />
      </div>

      {/* ========== MASAÜSTÜ HEADER ========== */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="num text-sm font-bold uppercase tracking-[0.2em] text-primary"
          >
            AE Analiz
          </Link>
          <nav className="flex gap-2 text-xs">
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Grafik
            </Link>
            <Link
              to="/coins"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
            >
              Liste
            </Link>
            <span className="rounded-md bg-amber-500/15 px-3 py-1.5 font-bold text-amber-500">
              📉 Kısa Vadeli
            </span>
          </nav>
          <div className="ml-auto text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-3 px-3 py-4 sm:space-y-4 sm:px-4 sm:py-6">
        {/* BAŞLIK */}
        <section className="panel p-3 sm:p-5">
          <h1 className="text-lg font-bold sm:text-xl">
            📉 Kısa Vadeli Bildirimler
          </h1>
          <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
            Premium üyeler için 20-30 mumluk formasyon bildirimleri. Detaylı
            analiz için bir karta tıklayın.
          </p>

          {/* İSTATİSTİKLER — MOBİLDE 2 SÜTUN */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-2.5 sm:p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                Toplam
              </p>
              <p className="num mt-1 text-xl font-bold sm:text-2xl">
                {stats.total}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5 sm:p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                Okunmamış
              </p>
              <p className="num mt-1 text-xl font-bold text-amber-500 sm:text-2xl">
                {stats.unread}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5 sm:p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                🟢 Yükseliş
              </p>
              <p className="num mt-1 text-xl font-bold text-bull sm:text-2xl">
                {stats.bullish}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-2.5 sm:p-3">
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                🔴 Düşüş
              </p>
              <p className="num mt-1 text-xl font-bold text-bear sm:text-2xl">
                {stats.bearish}
              </p>
            </div>
          </div>

          {/* ZAMAN DİLİMİ İSTATİSTİKLERİ — MOBİLDE 4 SÜTUN KÜÇÜK */}
          <div className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-3 sm:gap-2">
            <div className="rounded-md border border-border/60 bg-secondary/30 p-1.5 text-center sm:p-2">
              <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                15dk
              </p>
              <p className="num text-xs font-bold text-amber-500 sm:text-sm">
                {stats.tf15m}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-1.5 text-center sm:p-2">
              <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                1sa
              </p>
              <p className="num text-xs font-bold text-amber-500 sm:text-sm">
                {stats.tf1h}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-1.5 text-center sm:p-2">
              <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                4sa
              </p>
              <p className="num text-xs font-bold text-amber-500 sm:text-sm">
                {stats.tf4h}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-secondary/30 p-1.5 text-center sm:p-2">
              <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                1g
              </p>
              <p className="num text-xs font-bold text-amber-500 sm:text-sm">
                {stats.tf1d}
              </p>
            </div>
          </div>

          {/* FİLTRELER — MOBİLDE ALTA ALTA */}
          <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sembol veya formasyon ara..."
              className="min-h-[44px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring sm:min-w-[200px] sm:flex-1"
            />
            <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2">
              <select
                value={timeframeFilter}
                onChange={(e) =>
                  setTimeframeFilter(e.target.value as typeof timeframeFilter)
                }
                className="min-h-[44px] rounded-md border border-input bg-card px-2 py-1.5 text-[11px] font-bold outline-none sm:min-h-0 sm:px-3 sm:py-2 sm:text-xs"
              >
                <option value="all">Tüm TF</option>
                <option value="15m">15dk</option>
                <option value="1h">1sa</option>
                <option value="4h">4sa</option>
                <option value="1d">1g</option>
              </select>
              <select
                value={biasFilter}
                onChange={(e) =>
                  setBiasFilter(e.target.value as typeof biasFilter)
                }
                className="min-h-[44px] rounded-md border border-input bg-card px-2 py-1.5 text-[11px] font-bold outline-none sm:min-h-0 sm:px-3 sm:py-2 sm:text-xs"
              >
                <option value="all">Tüm Yön</option>
                <option value="yükseliş">🟢 AL</option>
                <option value="düşüş">🔴 SAT</option>
              </select>
              <select
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(e.target.value as typeof dateFilter)
                }
                className="min-h-[44px] rounded-md border border-input bg-card px-2 py-1.5 text-[11px] font-bold outline-none sm:min-h-0 sm:px-3 sm:py-2 sm:text-xs"
              >
                <option value="all">Tüm Zaman</option>
                <option value="today">Bugün</option>
                <option value="7days">7 Gün</option>
              </select>
            </div>
          </div>

          {/* AKSİYONLAR */}
          {notifications.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="min-h-[40px] rounded-md border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-secondary sm:text-xs"
              >
                ✅ Okundu
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="min-h-[40px] rounded-md border border-destructive/30 px-3 py-1.5 text-[11px] font-bold text-destructive hover:bg-destructive/10 sm:text-xs"
              >
                🗑️ Temizle
              </button>
            </div>
          )}
        </section>

        {/* BİLDİRİM LİSTESİ */}
        <section className="panel">
          {loading ? (
            <SkeletonList count={5} variant="row" />
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center sm:p-8">
              <p className="text-3xl sm:text-4xl">📭</p>
              <p className="mt-3 text-sm font-bold">Bildirim bulunamadı</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {notifications.length === 0
                  ? "Henüz kısa vadeli bildiriminiz yok."
                  : "Arama veya filtre kriterlerinize uygun bildirim yok."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((n) => {
                const biasEmoji = n.pattern_bias === "yükseliş" ? "🟢" : "🔴";
                const biasColor =
                  n.pattern_bias === "yükseliş" ? "text-bull" : "text-bear";
                const tfLabel = n.timeframe ? n.timeframe.toUpperCase() : "1H";
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleNotificationClick(n)}
                    className={`w-full p-3 text-left transition-colors hover:bg-secondary/40 sm:p-4 ${
                      !n.read ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500 sm:px-2 sm:text-[10px]">
                          📉 {tfLabel}
                        </span>
                        <span className={`num text-sm font-bold ${biasColor}`}>
                          {biasEmoji}{" "}
                          {n.symbol
                            .replace(/USDT$/, "")
                            .replace(/\.(IS|US)$/, "")}
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-bold sm:px-2 sm:text-[10px]">
                          {n.pattern_name}
                        </span>
                        {!n.read && (
                          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            YENİ
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground sm:text-[10px]">
                        {new Date(n.created_at).toLocaleString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs font-bold sm:mt-2 sm:text-sm">
                      {biasEmoji} {n.pattern_name} · {n.pattern_bias}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground sm:text-xs sm:leading-5">
                      Güven: %{n.confidence} · Skor: {n.signal_score}/100
                    </p>

                    {(n.entry != null ||
                      n.target != null ||
                      n.stop != null) && (
                      <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs sm:gap-2">
                        {n.entry != null && (
                          <div className="rounded border border-border/60 bg-secondary/30 p-1.5 sm:p-2">
                            <p className="text-[9px] text-muted-foreground">
                              Giriş
                            </p>
                            <p className="num text-[11px] font-bold sm:text-xs">
                              {n.entry.toFixed(4)}
                            </p>
                          </div>
                        )}
                        {n.target != null && (
                          <div className="rounded border border-border/60 bg-secondary/30 p-1.5 sm:p-2">
                            <p className="text-[9px] text-muted-foreground">
                              Hedef
                            </p>
                            <p className="num text-[11px] font-bold text-bull sm:text-xs">
                              {n.target.toFixed(4)}
                            </p>
                          </div>
                        )}
                        {n.stop != null && (
                          <div className="rounded border border-border/60 bg-secondary/30 p-1.5 sm:p-2">
                            <p className="text-[9px] text-muted-foreground">
                              Stop
                            </p>
                            <p className="num text-[11px] font-bold text-bear sm:text-xs">
                              {n.stop.toFixed(4)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {n.fear_greed != null && (
                      <p className="mt-1.5 text-[9px] text-muted-foreground sm:mt-2 sm:text-[10px]">
                        😱 F&G:{" "}
                        <span className="num font-bold">{n.fear_greed}</span>
                      </p>
                    )}

                    {n.reason && (
                      <p className="mt-1 text-[10px] italic leading-4 text-muted-foreground/80 sm:text-[11px]">
                        {n.reason.slice(0, 150)}
                        {n.reason.length > 150 ? "..." : ""}
                      </p>
                    )}

                    <p className="mt-1.5 text-[9px] font-bold text-amber-500 sm:mt-2 sm:text-[10px]">
                      👁️ Detaylar için tıkla →
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <p className="pb-4 text-center text-[10px] text-muted-foreground sm:text-[11px]">
          Sadece Premium/Trial/Admin için kısa vadeli formasyon bildirimleri.
        </p>
      </main>

      {/* DETAY MODAL */}
      <ShortTermNotificationDetailModal
        notification={detailNotification}
        onClose={() => setDetailNotification(null)}
        onOpenSymbol={(m, s) => {
          void navigate({
            to: "/",
            search: { m: m as any, s } as any,
          });
        }}
      />
    </div>
  );
}